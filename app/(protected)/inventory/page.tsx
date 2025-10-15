// app/(protected)/inventory/page.tsx
import { Suspense } from "react";
import Inventory from "@/features/Inventory"; // 這個元件內用到 useSearchParams()

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4">Loading inventory…</div>}>
      <Inventory />
    </Suspense>
  );
}
