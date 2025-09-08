// app/api/transfers/route.ts
import { NextResponse } from 'next/server'
import {
  getStock,
  saveStock,
  getProductById,
  getTransferLogs,
  saveTransferLogs,
  // 👇 新增匯入
  getLocationTree,
  StockItem,
  TransferLog,
  // 若有導出型別可一起匯入（可選）
  // LocationNode
} from '@/lib/db'
import { v4 as uuid } from 'uuid'

// Helper to validate a single stock item (保持你原本的)
function validateStockItem(
  stockId: string,
  fromLocation: string,
  stockItems: StockItem[],
  errorPrefix: string
): StockItem {
  const stock = stockItems.find((s) => s.id === stockId)
  if (!stock) throw { status: 404, message: `${errorPrefix} ${stockId} not found` }
  if (stock.discarded) throw { status: 400, message: `${errorPrefix} ${stockId} is discarded` }
  if (stock.currentStatus !== 'in_stock')
    throw { status: 400, message: `${errorPrefix} ${stockId} is not in stock` }
  if (stock.locationId !== fromLocation)
    throw { status: 400, message: `${errorPrefix} ${stockId} is not at ${fromLocation}` }
  return stock
}

/** ---------- 這是給 pages/Transfers.tsx 用的 GET ---------- */
export async function GET() {
  try {
    const stock = getStock() as StockItem[]
    const locations = getLocationTree?.() ?? [] // 若你的 db 是 getLocations() 就改成對的函式

    // 建立 locationId -> path(labels[]) map
    const id2Path = new Map<string, string[]>()
    const dfs = (node: any, trail: string[]) => {
      const next = [...trail, node.label]
      id2Path.set(node.id, next)
      node.children?.forEach((c: any) => dfs(c, next))
    }
    locations.forEach((root: any) => dfs(root, []))

    // 僅挑可轉移的庫存
    const eligible = stock.filter(
      s => !s.discarded && s.currentStatus === 'in_stock'
    )

    // 分成：財產管理(逐一) / 非財產管理(聚合)
    type PMItem = {
      stockId: string
      product: { id: string; name: string; model: string; brand: string }
      locationId: string
      locationPath: string[]
    }
    type NonPMGroup = {
      productId: string
      product: { id: string; name: string; model: string; brand: string }
      locationId: string
      locationPath: string[]
      quantity: number
    }

    const pm: PMItem[] = []
    const nonMap = new Map<string, NonPMGroup>() // key = productId::locationId

    for (const s of eligible) {
      const p = getProductById(s.productId)
      if (!p) continue

      const locationPath = id2Path.get(s.locationId) ?? []

      if (p.isPropertyManaged) {
        pm.push({
          stockId: s.id,
          product: { id: p.id, name: p.name, model: p.model, brand: p.brand },
          locationId: s.locationId,
          locationPath,
        })
      } else {
        const key = `${p.id}::${s.locationId}`
        const g = nonMap.get(key)
        if (g) {
          g.quantity += 1
        } else {
          nonMap.set(key, {
            productId: p.id,
            product: { id: p.id, name: p.name, model: p.model, brand: p.brand },
            locationId: s.locationId,
            locationPath,
            quantity: 1,
          })
        }
      }
    }

    // 穩定排序（可選）
    pm.sort((a, b) => a.product.name.localeCompare(b.product.name))
    const nonPropertyManaged = Array.from(nonMap.values()).sort(
      (a, b) => a.product.name.localeCompare(b.product.name)
    )

    return NextResponse.json({
      propertyManaged: pm,
      nonPropertyManaged,
      locations, // 前端若需要整棵樹就用這個
    })
  } catch (err: any) {
    console.error('Transfers GET error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to load transfers data' }, { status: 500 })
  }
}

/** ---------- 你原本的 POST（原封不動） ---------- */
export async function POST(request: Request) {
  let transfers: any[]
  try {
    transfers = await request.json()
    if (!Array.isArray(transfers)) {
      throw { status: 400, message: 'Request body must be an array' }
    }
  } catch (err: any) {
    const status = err.status || 400
    console.error('Transfer error full:', err)
    return NextResponse.json(
      { error: err.message || 'Invalid JSON body' },
      { status }
    )
  }

  const stockItems: StockItem[] = getStock()
  let transferLogs: TransferLog[] = []
  try {
    transferLogs = getTransferLogs()
  } catch (err) {
    console.warn('No existing transfer logs or invalid JSON, initializing empty array.')
    transferLogs = []
  }
  const newLogs: TransferLog[] = []
  const now = new Date().toISOString()

  try {
    for (const item of transfers) {
      if ('stockId' in item) {
        // single transfer (property-managed)
        const { stockId, fromLocation, toLocation } = item as {
          stockId: string
          fromLocation: string
          toLocation: string
        }
        const stock = validateStockItem(stockId, fromLocation, stockItems, 'Stock')

        const product = getProductById(stock.productId)
        if (!product || !product.isPropertyManaged) {
          throw { status: 400, message: `Product ${stock.productId} is not property-managed` }
        }

        const logEntry: TransferLog = { id: uuid(), stockId, fromLocation, toLocation, date: now }
        newLogs.push(logEntry)
        stock.locationId = toLocation
      } else {
        // bulk transfer (non-property-managed)
        const { productId, quantity, fromLocation, toLocation } = item as {
          productId: string
          quantity: number
          fromLocation: string
          toLocation: string
        }
        if (!productId || typeof quantity !== 'number' || quantity < 1) {
          throw { status: 400, message: 'Invalid bulk transfer fields' }
        }

        const product = getProductById(productId)
        if (!product || product.isPropertyManaged) {
          throw { status: 400, message: `Product ${productId} invalid for bulk transfer` }
        }

        const candidates = stockItems.filter(
          (s) =>
            s.productId === productId &&
            s.locationId === fromLocation &&
            s.currentStatus === 'in_stock' &&
            !s.discarded
        )
        if (candidates.length < quantity) {
          throw { status: 400, message: `Not enough stock: requested ${quantity}, available ${candidates.length}` }
        }

        for (let i = 0; i < quantity; i++) {
          const s = candidates[i]
          const logEntry: TransferLog = { id: uuid(), stockId: s.id, fromLocation, toLocation, date: now }
          newLogs.push(logEntry)
          s.locationId = toLocation
        }
      }
    }

    saveStock(stockItems)
    saveTransferLogs([...transferLogs, ...newLogs])
    return NextResponse.json(newLogs, { status: 201 })
  } catch (err: any) {
    const status = err.status || 500
    console.error('Transfer error:', err.message || err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status })
  }
}
