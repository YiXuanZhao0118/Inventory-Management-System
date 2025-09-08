// app/api/rentals/return/route.ts
import { NextResponse } from 'next/server'
import {
  getRentalLogs,
  saveRentalLogs,
  getStock,
  saveStock,
  getProductById,
  getLocationTree, // ← 需要從你的 lib/db 匯出
} from '@/lib/db'

// ---------- GET: list outstanding rentals (for ReturnPage) ----------
export async function GET() {
  const logs = getRentalLogs()
  const stockItems = getStock()
  const locationRoots = getLocationTree()

  // build a quick lookup for stock existence & discarded flag
  const stockMap = new Map(stockItems.map(s => [s.id, s]))

  // helper: resolve location path as labels array, e.g. ["Lab330","Optical Table","Master"]
  const dfsPath = (node: any, targetId: string, trail: string[]): string[] | null => {
    const next = [...trail, node.label]
    if (node.id === targetId) return next
    if (node.children) {
      for (const c of node.children) {
        const found = dfsPath(c, targetId, next)
        if (found) return found
      }
    }
    return null
  }
  const getLocationPath = (locationId: string): string[] => {
    for (const root of locationRoots) {
      const p = dfsPath(root, locationId, [])
      if (p) return p
    }
    return [locationId] // fallback
  }

  type PMItem = {
    id: string
    stockId: string
    product: { id: string; name: string; model: string; brand: string; spec: string }
    locationId: string
    locationPath: string[]
    renter: string
    borrower: string
    loanDate: string
    dueDate: string
    isPropertyManaged: true
    loanType: 'short_term' | 'long_term'
  }

  type NonPMItem = {
    // stockId is not used for non-PM; keep empty string for shape compatibility if you want
    stockId: string
    product: { id: string; name: string; model: string; brand: string; spec: string }
    locationId: string
    locationPath: string[]
    renter: string
    borrower: string
    loanDate: string
    dueDate: string
    qty: number
    isPropertyManaged: false
    loanType: 'short_term' | 'long_term'
  }

  const propertyManaged: PMItem[] = []
  const nonPMMap = new Map<
    string,
    NonPMItem
  >()

  for (const r of logs) {
    if (r.returnDate !== null) continue

    const product = getProductById(r.productId)
    if (!product) continue

    // ensure stock exists & not discarded (避免 POST 時才失敗)
    const s = stockMap.get(r.stockId)
    if (!s || s.discarded) continue

    const locationPath = getLocationPath(r.locationId)

    if (product.isPropertyManaged) {
      propertyManaged.push({
        id: r.id,
        stockId: r.stockId,
        product: {
          id: product.id,
          name: product.name,
          model: product.model,
          brand: product.brand,
          spec: product.specifications,
        },
        locationId: r.locationId,
        locationPath,
        renter: r.renter,
        borrower: r.borrower,
        loanDate: r.loanDate,
        dueDate: r.dueDate,
        isPropertyManaged: true,
        loanType: r.loanType,
      })
    } else {
      const key = `${r.productId}::${r.locationId}::${r.renter}::${r.borrower}::${r.loanType}`
      const exist = nonPMMap.get(key)
      if (exist) {
        exist.qty += 1
      } else {
        nonPMMap.set(key, {
          stockId: '', // not used on the UI for non-PM
          product: {
            id: product.id,
            name: product.name,
            model: product.model,
            brand: product.brand,
            spec: product.specifications,
          },
          locationId: r.locationId,
          locationPath,
          renter: r.renter,
          borrower: r.borrower,
          loanDate: r.loanDate,
          dueDate: r.dueDate,
          qty: 1,
          isPropertyManaged: false,
          loanType: r.loanType,
        })
      }
    }
  }

  return NextResponse.json({
    propertyManaged,
    nonPropertyManaged: Array.from(nonPMMap.values())
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const logs = getRentalLogs()
  const stockItems = getStock()
  const updatedRecords: typeof logs = []

  // Case 1: single‐item return for property‐managed products
  if (body.rentedItemId) {
    const { rentedItemId, returnDate } = body
    if (!rentedItemId || !returnDate) {
      return NextResponse.json({ error: 'Missing rentedItemId or returnDate' }, { status: 400 })
    }

    // find the rental record
    const record = logs.find(r => r.id === rentedItemId)
    if (!record) {
      return NextResponse.json({ error: 'Rental record not found' }, { status: 404 })
    }
    if (record.returnDate) {
      return NextResponse.json({ error: 'This rental has already been returned' }, { status: 400 })
    }

    // ensure this is a property‐managed product
    const product = getProductById(record.productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (!product.isPropertyManaged) {
      return NextResponse.json(
        { error: 'This product is not property‐managed; use bulk return' },
        { status: 400 }
      )
    }

    // find the stock item and prevent operations on discarded
    const stock = stockItems.find(s => s.id === record.stockId)
    if (!stock) {
      return NextResponse.json({ error: 'Stock item not found' }, { status: 404 })
    }
    if (stock.discarded) {
      return NextResponse.json({ error: 'Stock item has been discarded; cannot return' }, { status: 400 })
    }

    // mark return on the rental record
    record.returnDate = returnDate
    updatedRecords.push(record)

    // restore stock status
    stock.currentStatus = 'in_stock'
    saveStock(stockItems)
  }
  // Case 2: bulk return for non‐property‐managed products
  else {
    const {
      productId,
      locationId,
      quantity,
      renter,
      borrower,
      loanType,
      returnDate
    } = body

    if (
      !productId ||
      !locationId ||
      typeof quantity !== 'number' ||
      quantity < 1 ||
      !renter ||
      !borrower ||
      (loanType !== 'short_term' && loanType !== 'long_term') ||
      !returnDate
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid fields for bulk return' },
        { status: 400 }
      )
    }

    const product = getProductById(productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.isPropertyManaged) {
      return NextResponse.json(
        { error: 'This product is property‐managed; use single‐item return' },
        { status: 400 }
      )
    }

    // find matching outstanding rentals
    const candidates = logs.filter(r =>
      r.productId === productId &&
      r.locationId === locationId &&
      r.renter === renter &&
      r.borrower === borrower &&
      r.loanType === loanType &&
      r.returnDate === null
    )

    if (candidates.length < quantity) {
      return NextResponse.json(
        {
          error: `Not enough outstanding rentals: requested ${quantity}, available ${candidates.length}`
        },
        { status: 400 }
      )
    }

    // mark the first N as returned and restore their stock
    for (let i = 0; i < quantity; i++) {
      const rec = candidates[i]
      const stock = stockItems.find(s => s.id === rec.stockId)
      if (!stock) {
        return NextResponse.json({ error: `Stock item ${rec.stockId} not found` }, { status: 404 })
      }
      if (stock.discarded) {
        return NextResponse.json(
          { error: `Stock item ${rec.stockId} has been discarded; cannot return` },
          { status: 400 }
        )
      }

      rec.returnDate = returnDate
      updatedRecords.push(rec)

      // restore status
      stock.currentStatus = 'in_stock'
    }
    saveStock(stockItems)
  }

  saveRentalLogs(logs)
  return NextResponse.json(updatedRecords)
}
