// app/api/db/route.ts
import { NextResponse } from 'next/server'

// 從你集中匯出的 db module
import {
  getStock,
  getProducts,
  getLocationTree,
  getRentalLogs,
  getTransferLogs,
  getProductCategories,
  getIAMSProperty,
  getDevices
} from '@/lib/db'

export async function GET() {
  // 同步讀取
  const stock = getStock()
  const products = getProducts()
  const locations = getLocationTree()
  const rentals = getRentalLogs()
  const transfers = getTransferLogs()
  const categories = getProductCategories()
  const iams = getIAMSProperty()
  const devices = getDevices()

  return NextResponse.json({
    stock,
    products,
    locations,
    rentals,
    transfers,
    categories,
    iams,
    devices
  })
}
