// app/api/discarded/route.ts
import { NextResponse } from 'next/server'
import {
  getStock,
  saveStock,
  getProductById,
  // ⬇️ 新增：給前端顯示用，跟 /api/stocklist 相同介面
  getProducts,
  getLocationTree,
  StockItem
} from '@/lib/db'

type LegacySingle = { stockId: string; reason: string; operator: string }
type LegacyBulk = {
  productId: string
  locationId: string
  currentStatus: 'in_stock' | 'short_term' | 'long_term'
  quantity: number
  reason: string
  operator: string
}
type NewSingle = { stockId: string }
type NewBulk = {
  productId: string
  locationId: string
  currentStatus: 'in_stock' | 'short_term' | 'long_term'
  quantity: number
}
type NewPayload = { reason: string; operator: string; items: Array<NewSingle | NewBulk> }

const VALID_STATUSES = new Set(['in_stock', 'short_term', 'long_term'])

export async function GET() {
  try {
    const stock = getStock() as StockItem[];
    const locations = getLocationTree?.() ?? [];

    // build locationId -> path
    const id2Path = new Map<string, string[]>();
    const dfs = (node: any, trail: string[]) => {
      const next = [...trail, node.label];
      id2Path.set(node.id, next);
      node.children?.forEach((c: any) => dfs(c, next));
    };
    locations.forEach((root: any) => dfs(root, []));

    // ✅ 正確加上括號，避免把 long_term（即便已報廢）撈進來
    const eligible = stock.filter(
      (s) => !s.discarded && (s.currentStatus === 'in_stock' || s.currentStatus === 'long_term')
    );

    // output shapes
    type PMItem = {
      stockId: string;
      product: { id: string; name: string; model: string; brand: string };
      locationId: string;
      locationPath: string[];
      currentStatus: string;
    };

    type NonPMGroup = {
      productId: string;
      product: { id: string; name: string; model: string; brand: string };
      locationId: string;
      locationPath: string[];
      quantity: number;
      currentStatus: string; // <= 關鍵：保留群組的狀態
    };

    const pm: PMItem[] = [];
    // ✅ key 加上 currentStatus，避免不同狀態被合併
    const nonMap = new Map<string, NonPMGroup>(); // key = productId::locationId::currentStatus

    for (const s of eligible) {
      const p = getProductById(s.productId);
      if (!p) continue;

      const locationPath = id2Path.get(s.locationId) ?? [];

      if (p.isPropertyManaged) {
        pm.push({
          stockId: s.id,
          product: { id: p.id, name: p.name, model: p.model, brand: p.brand },
          locationId: s.locationId,
          locationPath,
          currentStatus: s.currentStatus,
        });
      } else {
        const key = `${p.id}::${s.locationId}::${s.currentStatus}`; // ✅ 狀態也進 key
        const g = nonMap.get(key);
        if (g) {
          g.quantity += 1;
        } else {
          nonMap.set(key, {
            productId: p.id,
            product: { id: p.id, name: p.name, model: p.model, brand: p.brand },
            locationId: s.locationId,
            locationPath,
            quantity: 1,
            currentStatus: s.currentStatus,
          });
        }
      }
    }

    pm.sort((a, b) => a.product.name.localeCompare(b.product.name));
    const nonPropertyManaged = Array.from(nonMap.values()).sort((a, b) =>
      a.product.name.localeCompare(b.product.name)
    );

    return NextResponse.json({
      propertyManaged: pm,
      nonPropertyManaged,
      locations,
    });
  } catch (err: any) {
    console.error('Transfers GET error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to load transfers data' }, { status: 500 });
  }
}


export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const stockItems: StockItem[] = getStock()
  const now = new Date().toISOString()

  const processSingle = (item: { stockId: string }, reason: string, operator: string) => {
    const { stockId } = item
    if (!stockId || !reason || !operator) {
      throw { status: 400, message: 'Missing fields for single discard' }
    }
    const stock = stockItems.find((s) => s.id === stockId)
    if (!stock) throw { status: 404, message: `Stock ${stockId} not found` }
    if (stock.discarded) throw { status: 400, message: `Stock ${stockId} already discarded` }

    stock.discarded = true
    stock.currentStatus = 'discarded'
    stock.discardLog = { date: now, reason, operator }
  }

  const processBulk = (
    item: {
      productId: string
      locationId: string
      currentStatus: 'in_stock' | 'short_term' | 'long_term'
      quantity: number
    },
    reason: string,
    operator: string
  ) => {
    const { productId, locationId, currentStatus, quantity } = item
    if (
      !productId ||
      !locationId ||
      !currentStatus ||
      !VALID_STATUSES.has(currentStatus) ||
      typeof quantity !== 'number' ||
      quantity < 1 ||
      !reason ||
      !operator
    ) {
      throw { status: 400, message: 'Missing or invalid fields for bulk discard (requires currentStatus)' }
    }

    const product = getProductById(productId)
    if (!product || product.isPropertyManaged) {
      throw { status: 400, message: 'Use single discard for managed products' }
    }

    const candidates = stockItems.filter(
      (s) => s.productId === productId && s.locationId === locationId && s.currentStatus === currentStatus && !s.discarded
    )
    if (candidates.length < quantity) {
      throw { status: 400, message: `Not enough to discard: available ${candidates.length}` }
    }

    for (let i = 0; i < quantity; i++) {
      const s = candidates[i]
      s.discarded = true
      s.currentStatus = 'discarded'
      s.discardLog = { date: now, reason, operator }
    }
  }

  try {
    if (Array.isArray(body)) {
      // Legacy mode: array of items, each item must include its own reason/operator
      for (const item of body as Array<LegacySingle | LegacyBulk>) {
        if (item && typeof item === 'object' && 'stockId' in item) {
          const { stockId, reason, operator } = item as LegacySingle
          processSingle({ stockId }, reason, operator)
        } else if (item && typeof item === 'object') {
          const { productId, locationId, currentStatus, quantity, reason, operator } = item as LegacyBulk
          processBulk({ productId, locationId, currentStatus, quantity }, reason, operator)
        } else {
          throw { status: 400, message: 'Invalid item in array payload' }
        }
      }
    } else if (body && typeof body === 'object') {
      // New mode: { reason, operator, items: [...] }
      const { reason, operator, items } = body as NewPayload
      if (!reason || !operator || !Array.isArray(items) || items.length === 0) {
        throw { status: 400, message: 'Body must include { reason, operator, items: [...] }' }
      }

      for (const entry of items) {
        if (entry && typeof entry === 'object' && 'stockId' in entry) {
          processSingle({ stockId: (entry as NewSingle).stockId }, reason, operator)
        } else if (entry && typeof entry === 'object') {
          const { productId, locationId, currentStatus, quantity } = entry as NewBulk
          processBulk({ productId, locationId, currentStatus, quantity }, reason, operator)
        } else {
          throw { status: 400, message: 'Invalid item inside items[]' }
        }
      }
    } else {
      throw { status: 400, message: 'Body must be an array (legacy) or an object with items (new)' }
    }

    saveStock(stockItems)
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (e: any) {
    const status = e?.status || 500
    return NextResponse.json({ error: e?.message || 'Internal server error' }, { status })
  }
}


