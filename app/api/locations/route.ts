// app/api/locations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ROOT_ID =
  process.env.ROOT_LOCATION_ID || process.env.NEXT_PUBLIC_ROOT_LOCATION_ID;

if (!ROOT_ID || !UUID_RE.test(ROOT_ID)) {
  console.warn(
    "[/api/locations] ROOT_LOCATION_ID 未設定或格式不是 UUID，請在 .env 設定 ROOT_LOCATION_ID / NEXT_PUBLIC_ROOT_LOCATION_ID"
  );
}

type DbLoc = { id: string; label: string; parentId: string | null };
type Node = { id?: string | null; label: string; children?: Node[] };

// -------- helpers --------
function makeTree(rows: DbLoc[]): Array<{ id: string; label: string; children?: any[] }> {
  const byId = new Map(rows.map(r => [r.id, { ...r, children: [] as any[] }]));
  const roots: any[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (!r.parentId || !byId.has(r.parentId)) {
      roots.push(node);
    } else {
      byId.get(r.parentId)!.children.push(node);
    }
  }
  // 讀取時：強制 ROOT 沒有 children（畫面上的「Container/Root」不能有子層）
  for (const n of roots) {
    if (n.id === ROOT_ID) n.children = undefined;
  }
  // 轉輕量結構
  const strip = (n: any): any =>
    n.children && n.children.length
      ? { id: n.id, label: n.label, children: n.children.map(strip) }
      : { id: n.id, label: n.label };
  return roots.map(strip);
}

function collectAllIds(nodes: Node[], acc = new Set<string>()) {
  for (const n of nodes) {
    if (n.id && UUID_RE.test(n.id)) acc.add(n.id);
    if (n.children?.length) collectAllIds(n.children, acc);
  }
  return acc;
}
function collectAllLabels(nodes: Node[], acc = new Set<string>()) {
  for (const n of nodes) {
    acc.add(n.label.trim());
    if (n.children?.length) collectAllLabels(n.children, acc);
  }
  return acc;
}
function walk(nodes: Node[], parentId: string | null, visit: (n: Node, parent: string | null) => void) {
  for (const n of nodes) {
    visit(n, parentId);
    if (n.children?.length) walk(n.children, (n.id as string) || "", visit);
  }
}

// -------- GET: 讀樹 --------
export async function GET() {
  // 確認 ROOT 存在；若不存在可自動補一個（也可改成直接報錯）
  let root = null as DbLoc | null;
  if (ROOT_ID && UUID_RE.test(ROOT_ID)) {
    root = await prisma.location.findUnique({ where: { id: ROOT_ID }, select: { id: true, label: true, parentId: true } });
    if (!root) {
      // 自動補一個 Root
      await prisma.location.create({
        data: { id: ROOT_ID, label: "Container Area", parentId: null },
      });
    }
  }

  const rows = (await prisma.location.findMany({
    select: { id: true, label: true, parentId: true },
    orderBy: [{ label: "asc" }],
  })) as DbLoc[];

  return NextResponse.json(makeTree(rows));
}

// -------- POST: 存樹 --------
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const tree = (body?.tree ?? []) as Node[];

  // 1) ROOT 檢查
  if (!ROOT_ID || !UUID_RE.test(ROOT_ID)) {
    return NextResponse.json(
      { ok: false, code: "CONTAINER_REQUIRED", error: "ROOT_LOCATION_ID not set or invalid" },
      { status: 500 }
    );
  }
  // 必須包含 ROOT，且 ROOT 必須在最上層，且不得有 children
  const topHasRoot = tree.some(n => n.id === ROOT_ID);
  if (!topHasRoot) {
    return NextResponse.json({ ok: false, code: "CONTAINER_REQUIRED", error: "Root must be present at top level" }, { status: 400 });
  }
  const rootNode = tree.find(n => n.id === ROOT_ID)!;
  if (rootNode.children && rootNode.children.length) {
    return NextResponse.json({ ok: false, code: "CONTAINER_NO_CHILDREN", error: "Root cannot have children" }, { status: 400 });
  }

  // 2) label 全域不可重複（前端也有限制，再保險一層）
  const labels = collectAllLabels(tree);
  if (labels.size < (function count(n: Node[]): number { return n.reduce((s, v) => s + 1 + (v.children?.length ? count(v.children) : 0), 0); })(tree)) {
    return NextResponse.json({ ok: false, code: "DUPLICATED_LABEL", error: "Duplicate labels in tree" }, { status: 400 });
  }

  // 3) 取 DB 既有 locations 與庫存
  const dbLocs = await prisma.location.findMany({ select: { id: true, label: true, parentId: true } });
  const dbIds = new Set(dbLocs.map(l => l.id));

  // 子女 -> 父的關係，用於葉節點規則判定
  const payloadHasChildren = new Set<string>();
  walk(tree, null, (n, _p) => {
    if ((n.children?.length || 0) > 0 && n.id && UUID_RE.test(n.id)) payloadHasChildren.add(n.id);
  });

  // 4) 有庫存的節點必須是葉：查詢 payload 中「有 children 的 id」的庫存數
  if (payloadHasChildren.size) {
    const ids = Array.from(payloadHasChildren);
    const grouped = await prisma.stock.groupBy({
      by: ["locationId"],
      _count: { _all: true },
      where: { locationId: { in: ids } },
    });
    const offenders = grouped.filter(g => g._count._all > 0).map(g => g.locationId);
    if (offenders.length) {
      return NextResponse.json(
        { ok: false, code: "LEAF_RULE_VIOLATION", offenders },
        { status: 400 }
      );
    }
  }

  // 5) 計算刪除名單（DB 有但 payload 沒有）：禁止刪有庫存的
  const payloadIds = collectAllIds(tree); // 只有合法 UUID 才算
  const toDelete = Array.from(dbIds).filter(id => id !== ROOT_ID && !payloadIds.has(id));
  if (toDelete.length) {
    const grouped = await prisma.stock.groupBy({
      by: ["locationId"],
      _count: { _all: true },
      where: { locationId: { in: toDelete } },
    });
    if (grouped.length) {
      return NextResponse.json(
        { ok: false, code: "DELETE_BLOCKED_STOCK", offenders: grouped.map(g => g.locationId) },
        { status: 400 }
      );
    }
  }

  // 6) 寫入：逐層建立/更新（新節點可不帶 id 或帶非 UUID，會新建）
  //    注意：目前資料表沒有排序欄位，兄弟順序不會持久化；如需持久化請增加 position 欄位。
  const idMap = new Map<string, string>(); // 暫存：舊 id -> 真正 DB id（新建會回填）
  for (const l of dbLocs) idMap.set(l.id, l.id);

  const ensureNode = async (node: Node, parentId: string | null): Promise<string> => {
    // ROOT 強制 parentId = null
    if (node.id === ROOT_ID) parentId = null;

    // 既有合法 UUID 的情況：做 update（改 label 與 parentId）
    if (node.id && UUID_RE.test(node.id) && dbIds.has(node.id)) {
      await prisma.location.update({
        where: { id: node.id },
        data: { label: node.label, parentId },
      });
      return node.id;
    }

    // 否則：建立新節點
    const created = await prisma.location.create({
      data: { label: node.label, parentId },
      select: { id: true },
    });
    return created.id;
  };

  // 以 DFS 寫入，保證 parent 先有 id
  await prisma.$transaction(async (tx) => {
    // 先確保 ROOT 在最上層且無父
    await tx.location.update({ where: { id: ROOT_ID }, data: { parentId: null } });

    // 遞迴寫入
    const write = async (nodes: Node[], parentId: string | null) => {
      for (const n of nodes) {
        const realId = await tx.location
          .upsert({
            where: { id: (n.id && UUID_RE.test(n.id)) ? n.id : "00000000-0000-0000-0000-000000000000" }, // trick: 讓下面走 catch
            update: { label: n.label, parentId: n.id === ROOT_ID ? null : parentId },
            create: { label: n.label, parentId: n.id === ROOT_ID ? null : parentId },
            select: { id: true },
          })
          .catch(async () => {
            // id 無效或不存在 -> create
            const c = await tx.location.create({
              data: { label: n.label, parentId: n.id === ROOT_ID ? null : parentId },
              select: { id: true },
            });
            return c;
          });

        const id = realId.id;
        idMap.set(n.id || id, id);

        if (n.children?.length) {
          // 再寫入子節點
          await write(n.children, id === ROOT_ID ? null : id);
        }
      }
    };

    // 這裡只寫入「非空 children」的樹；ROOT 的 children 前面已經在驗證擋掉
    await write(tree, null);

    // 刪除 payload 以外的節點（且已確定沒庫存）
    if (toDelete.length) {
      await tx.location.deleteMany({ where: { id: { in: toDelete } } });
    }
  });

  return NextResponse.json({ ok: true });
}
