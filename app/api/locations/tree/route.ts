//app\api\locations\tree\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROOT_LOCATION_ID, UUID_RE } from "@/src/lib/config";

export const dynamic = "force-dynamic";

type NodeIn = { id: string; label: string; children?: NodeIn[] };

const err = (code: string, message: string, status = 400) =>
  NextResponse.json({ ok: false, code, message }, { status });

/* ---------- Helpers ---------- */
function buildTree(rows: { id: string; label: string; parentId: string | null }[]): NodeIn[] {
  const byId = new Map<string, NodeIn>();
  const roots: NodeIn[] = [];
  rows.forEach((r) => byId.set(r.id, { id: r.id, label: r.label, children: [] }));
  rows.forEach((r) => {
    const n = byId.get(r.id)!;
    if (!r.parentId) {
      roots.push(n);
    } else {
      const p = byId.get(r.parentId);
      if (p) {
        p.children = p.children || [];
        p.children!.push(n);
      } else {
        roots.push(n); // broken parent → treat as root
      }
    }
  });
  // 不顯示 ROOT 的 children（顯示層面），真正限制由 POST 驗證把關
  const stripRootChildren = (ns: NodeIn[]): NodeIn[] =>
    ns.map((n) =>
      n.id === ROOT_LOCATION_ID
        ? { id: n.id, label: n.label }
        : { id: n.id, label: n.label, ...(n.children?.length ? { children: stripRootChildren(n.children) } : {}) }
    );
  return stripRootChildren(roots);
}

function flatten(nodes: NodeIn[], parentId: string | null = null, out: any[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, label: n.label, parentId });
    if (n.children?.length) flatten(n.children, n.id, out);
  }
  return out as { id: string; label: string; parentId: string | null }[];
}

/* ---------- GET ---------- */
export async function GET() {
  const rows = await prisma.location.findMany({
    select: { id: true, label: true, parentId: true },
    orderBy: [{ label: "asc" }],
  });
  const tree = buildTree(rows.map((r) => ({ id: r.id, label: r.label, parentId: r.parentId })));
  return NextResponse.json({ tree });
}

/* ---------- POST (save tree) ---------- */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return err("BAD_JSON", "Invalid JSON");
  }
  const tree = (body?.tree ?? []) as NodeIn[];

  // 基礎驗證：UUID、label 唯一、ID 唯一
  const flatNew = flatten(tree);
  const labels = new Set<string>();
  const ids = new Set<string>();

  for (const n of flatNew) {
    if (!UUID_RE.test(n.id)) return err("BAD_ID", `Invalid UUID: ${n.id}`);
    if (labels.has(n.label)) return err("LABEL_NOT_UNIQUE", `Duplicated label: ${n.label}`);
    labels.add(n.label);
    if (ids.has(n.id)) return err("ID_NOT_UNIQUE", `Duplicated id: ${n.id}`);
    ids.add(n.id);
  }

  // ROOT 必須存在、位於 root、且不可有子層
  const hasRoot = flatNew.some((n) => n.id === ROOT_LOCATION_ID);
  if (!hasRoot) return err("CONTAINER_REQUIRED", "Container Area must exist");
  const rootAtTop = flatNew.find((n) => n.id === ROOT_LOCATION_ID)?.parentId == null;
  if (!rootAtTop) return err("CONTAINER_MUST_BE_ROOT", "Container Area must be root");

  const rootNode = tree.find((n) => n.id === ROOT_LOCATION_ID);
  if (rootNode && rootNode.children && rootNode.children.length > 0) {
    return err("CONTAINER_NO_CHILDREN", "Container Area cannot have children");
  }

  // 現有資料 & 哪些位置有庫存
  const [rows, used] = await Promise.all([
    prisma.location.findMany({ select: { id: true, label: true, parentId: true } }),
    prisma.stock.groupBy({ by: ["locationId"], where: { discarded: false }, _count: { _all: true } }),
  ]);
  const oldById = new Map(rows.map((r) => [r.id, r]));
  const usedSet = new Set(used.map((u) => u.locationId));

  // 葉節點規則：有庫存的節點在新樹中必須是葉節點
  const newChildrenById = new Map<string, number>();
  for (const n of flatNew) newChildrenById.set(n.id, 0);
  for (const n of flatNew) {
    if (n.parentId) newChildrenById.set(n.parentId, (newChildrenById.get(n.parentId) ?? 0) + 1);
  }
  const leafViolations = [...usedSet].filter((id) => (newChildrenById.get(id) ?? 0) > 0);
  if (leafViolations.length) {
    return err("LEAF_RULE_VIOLATION", `Non-leaf nodes with stock: ${leafViolations.join(",")}`);
  }

  // 有庫存的節點不得變更 parentId
  const parentChangedBlocked: string[] = [];
  for (const n of flatNew) {
    if (!usedSet.has(n.id)) continue;
    const old = oldById.get(n.id);
    if (!old) continue;
    const oldPid = old.parentId ?? null;
    const newPid = n.parentId ?? null;
    if (oldPid !== newPid) parentChangedBlocked.push(n.id);
  }
  if (parentChangedBlocked.length) {
    return err("PARENT_CHANGE_BLOCKED", `Parent change blocked for: ${parentChangedBlocked.join(",")}`);
  }

  // 刪除檢查：欲刪的節點或其子孫若有庫存 → 禁止
  const newIdSet = new Set(flatNew.map((n) => n.id));
  const toDelete = rows.filter((r) => !newIdSet.has(r.id)).map((r) => r.id);
  if (toDelete.includes(ROOT_LOCATION_ID)) {
    return err("CONTAINER_REQUIRED", "Container Area cannot be deleted");
  }
  if (toDelete.length > 0) {
    const childrenMap = new Map<string, string[]>();
    rows.forEach((r) => {
      if (r.parentId) {
        childrenMap.set(r.parentId, [...(childrenMap.get(r.parentId) ?? []), r.id]);
      }
    });
    const subHasStock = (id: string): boolean => {
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (usedSet.has(cur)) return true;
        (childrenMap.get(cur) ?? []).forEach((c) => stack.push(c));
      }
      return false;
    };
    for (const id of toDelete) {
      if (subHasStock(id)) {
        return err("DELETE_BLOCKED_STOCK", `Cannot delete: ${id} (has stock in subtree)`);
      }
    }
  }

  // 套用變更（transaction）
  const ops: any[] = [];

  // 更新/新增
  for (const n of flatNew) {
    const exists = oldById.has(n.id);
    if (exists) {
      const old = oldById.get(n.id)!;
      if (old.label !== n.label || (old.parentId ?? null) !== (n.parentId ?? null)) {
        // ROOT 不能有 parent
        if (n.id === ROOT_LOCATION_ID && n.parentId !== null) {
          return err("CONTAINER_MUST_BE_ROOT", "Container Area must be root");
        }
        ops.push(
          prisma.location.update({
            where: { id: n.id },
            data: { label: n.label, parentId: n.parentId },
          })
        );
      }
    } else {
      // 新增節點：id 必須為 UUID（前端已用 crypto.randomUUID）
      ops.push(
        prisma.location.create({
          data: { id: n.id, label: n.label, parentId: n.parentId },
        })
      );
    }
  }

  // 刪除（已確保不違規）
  for (const id of toDelete) {
    ops.push(prisma.location.delete({ where: { id } }));
  }

  await prisma.$transaction(ops);

  return NextResponse.json({ ok: true });
}
