// app/api/rentals/rental/route.ts
import { NextResponse } from 'next/server'
import {
  getRentalLogs,
  saveRentalLogs,
  getStock,
  saveStock,
  getProductById,
  getProducts,
  getLocationLabelLink, // <-- use the new helper
} from '@/lib/db'
import { v4 as uuid } from 'uuid'

export async function GET(request: Request) {
  const stockItems = getStock()
  const products = getProducts()

  // 依你的需求：discarded == false && currentStatus == 'long_term'
  const filtered = stockItems.filter(
    s => !s.discarded && s.currentStatus === 'in_stock'
  )

  // 建個產品快取 map，避免頻繁搜尋
  const productMap = new Map(products.map(p => [p.id, p]))

  const nonPropertyManagedMap = new Map<
    string,
    {
      productId: string
      name: string
      brand: string
      model: string
      specifications: string
      price: number
      locationId: string
      locationLabelLink: string
      quantity: number
      isPropertyManaged: false
    }
  >()

  const propertyManaged: Array<{
    stockId: string
    name: string
    brand: string
    model: string
    specifications: string
    price: number
    locationLabelLink: string
    isPropertyManaged: true
  }> = []

  for (const s of filtered) {
    const product = productMap.get(s.productId)
    if (!product) continue

    const locationLabelLink = getLocationLabelLink(s.locationId)

    if (product.isPropertyManaged) {
      // true 輸出（逐筆）
      propertyManaged.push({
        stockId: s.id,
        name: product.name,
        brand: product.brand,
        model: product.model,
        specifications: product.specifications,
        price: product.price,
        locationLabelLink,
        isPropertyManaged: true
      })
    } else {
      // false 輸出（依 productId + locationId 匯總）
      const key = `${s.productId}::${s.locationId}`
      const existing = nonPropertyManagedMap.get(key)
      if (existing) {
        existing.quantity += 1
      } else {
        nonPropertyManagedMap.set(key, {
          productId: s.productId,
          name: product.name,
          brand: product.brand,
          model: product.model,
          specifications: product.specifications,
          price: product.price,
          locationId: s.locationId,
          locationLabelLink,
          quantity: 1,
          isPropertyManaged: false
        })
      }
    }
  }

  return NextResponse.json(
    {
      nonPropertyManaged: Array.from(nonPropertyManagedMap.values()),
      propertyManaged
    },
    { status: 200 }
  )
}

export async function POST(request: Request) {
  const body = await request.json()

  const logs = getRentalLogs()
  const stockItems = getStock()
  const newRecords: any[] = []

  // Case 1: single-stock rental (property-managed)
  if (body.stockId) {
    const {
      stockId,
      renter,
      borrower,
      loanType,
      loanDate,
      dueDate
    } = body

    if (
      !stockId ||
      !renter ||
      !borrower ||
      (loanType !== 'short_term' && loanType !== 'long_term') ||
      !loanDate ||
      !dueDate
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid fields for single-stock rental' },
        { status: 400 }
      )
    }

    const stock = stockItems.find(s => s.id === stockId)
    if (!stock) {
      return NextResponse.json({ error: 'Stock item not found' }, { status: 404 })
    }

    // prevent operations on discarded items
    if (stock.discarded) {
      return NextResponse.json(
        { error: 'This stock item has been discarded' },
        { status: 400 }
      )
    }

    // ensure it's in stock
    if (stock.currentStatus !== 'in_stock') {
      return NextResponse.json(
        { error: 'Stock item is not available for rental' },
        { status: 400 }
      )
    }

    const product = getProductById(stock.productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (!product.isPropertyManaged) {
      return NextResponse.json(
        { error: 'This product is not property-managed; use bulk rental endpoint' },
        { status: 400 }
      )
    }

    // update stock status
    stock.currentStatus = loanType
    saveStock(stockItems)

    // create rental record
    const record = {
      id: uuid(),
      stockId,
      productId: stock.productId,
      locationId: stock.locationId,
      renter,
      borrower,
      loanType,
      loanDate,
      dueDate,
      returnDate: null
    }
    newRecords.push(record)
  }
  // Case 2: bulk rental for non-property-managed
  else {
    const {
      productId,
      locationId,
      quantity,
      renter,
      borrower,
      loanType,
      loanDate,
      dueDate
    } = body

    if (
      !productId ||
      !locationId ||
      typeof quantity !== 'number' ||
      quantity < 1 ||
      !renter ||
      !borrower ||
      (loanType !== 'short_term' && loanType !== 'long_term') ||
      !loanDate ||
      !dueDate
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid fields for bulk rental' },
        { status: 400 }
      )
    }

    const product = getProductById(productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    if (product.isPropertyManaged) {
      return NextResponse.json(
        { error: 'This product is property-managed; use single-stock rental' },
        { status: 400 }
      )
    }

    // find available and non-discarded stock items
    const candidates = stockItems.filter(
      s =>
        s.productId === productId &&
        s.locationId === locationId &&
        s.currentStatus === 'in_stock' &&
        !s.discarded
    )
    if (candidates.length < quantity) {
      return NextResponse.json(
        {
          error: `Not enough stock items: requested ${quantity}, available ${candidates.length}`
        },
        { status: 400 }
      )
    }

    // take first N and update their status
    for (let i = 0; i < quantity; i++) {
      const s = candidates[i]
      s.currentStatus = loanType
      const record = {
        id: uuid(),
        stockId: s.id,
        productId,
        locationId,
        renter,
        borrower,
        loanType,
        loanDate,
        dueDate,
        returnDate: null
      }
      newRecords.push(record)
    }

    // persist updated statuses
    saveStock(stockItems)
  }

  // persist rental logs
  logs.push(...newRecords)
  saveRentalLogs(logs)

  return NextResponse.json(newRecords, { status: 201 })
}
