// app/api/stocklist/route.ts
import { NextResponse } from 'next/server'
import {
  getStock, getProducts, getLocationTree, getRentalLogs,
  getTransferLogs, getProductCategories, getIAMSProperty, getDevices
} from '@/lib/db'

export async function GET() {
  const stock       = getStock()
  const products    = getProducts()
  const locations   = getLocationTree()
  const rentals     = getRentalLogs()
  const transfers   = getTransferLogs()
  const categories  = getProductCategories()
  const iams        = getIAMSProperty()
  const devices     = getDevices()

  // ★ 只回傳在庫且未報廢
  const filteredStock = stock.filter(s => s.currentStatus === 'in_stock' && !s.discarded)

  return NextResponse.json({
    stock: filteredStock,
    products, locations, rentals, transfers, categories, iams, devices
  })
}
