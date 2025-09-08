// app/add_inventory/page.tsx
import React, { Suspense } from 'react';
import AddStockPage from '@/features/AddStockPage';

export default function AddInventoryPage() {
  return (
    <Suspense fallback={<div>Loading inventory form…</div>}>
      <AddStockPage />
    </Suspense>
  );
}
