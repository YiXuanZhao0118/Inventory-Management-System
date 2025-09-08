// lib/db.ts
export * from './db/database';
export * from './db/rentalLogs';
export * from './db/transferLogs';
export * from './db/productCategories';
export * from './db/iams';
export * from './db/devices';

import { v4 as uuid } from 'uuid'
import { getDatabase, saveDatabase, StockItem } from './db/database'


export function addStockItem(
  productId: string,
  locationId: string,
  createdAt: string
): StockItem {
  const db = getDatabase()

  const newItem: StockItem = {
    id: uuid(),
    productId,
    locationId,
    currentStatus: 'in_stock',
    createdAt,
    discarded: false,
    discardLog: null
  }

  db.stock.push(newItem)
  saveDatabase(db)
  return newItem
}

import { ProductItem } from './db/database';
import { getProducts } from './db/database';

export function getProductById(id: string): ProductItem | undefined {
  const products = getProducts();
  return products.find(p => p.id === id);
}

import { getLocationTree, type LocationNode } from './db/database'

const locationPathCache = new Map<string, string>()

function dfsFindPath(node: LocationNode, targetId: string, trail: string[]): string[] | null {
  const nextTrail = [...trail, node.label]
  if (node.id === targetId) return nextTrail
  if (!node.children || node.children.length === 0) return null
  for (const child of node.children) {
    const found = dfsFindPath(child, targetId, nextTrail)
    if (found) return found
  }
  return null
}

export function getLocationLabelLink(locationId: string): string {
  if (!locationId) return ''
  const cached = locationPathCache.get(locationId)
  if (cached) return cached

  const roots = getLocationTree()
  for (const root of roots) {
    const path = dfsFindPath(root, locationId, [])
    if (path) {
      const link = path.join(' > ')
      locationPathCache.set(locationId, link)
      return link
    }
  }
  return locationId
}