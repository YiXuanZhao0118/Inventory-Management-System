// app/api/products/propertyManaged/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getProducts, saveProducts } from '@/lib/db';

export async function GET() {
  const products = getProducts();
  const propertyManagedProductIds = products.filter(p => p.isPropertyManaged).map(p => p.id);
  return NextResponse.json({ products, propertyManagedProductIds });
}

// 批次更新
export async function PUT(req: NextRequest) {
  try {
    const { propertyManagedProductIds } = await req.json();
    if (!Array.isArray(propertyManagedProductIds)) {
      return NextResponse.json({ error: 'propertyManagedProductIds must be an array' }, { status: 400 });
    }
    const set = new Set<string>(propertyManagedProductIds);
    const products = getProducts();
    const next = products.map(p => ({ ...p, isPropertyManaged: set.has(p.id) }));
    saveProducts(next);
    return NextResponse.json({ success: true });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'Update failed' }, { status: 400 });
  }
}

// 單筆切換（可選）
export async function PATCH(req: NextRequest) {
  try {
    const { id, isPropertyManaged } = await req.json();
    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const products = getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    products[idx].isPropertyManaged = !!isPropertyManaged;
    saveProducts(products);
    return NextResponse.json({ success: true, product: products[idx] });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'Patch failed' }, { status: 400 });
  }
}
