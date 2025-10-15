// app/products/page.tsx
import ProductPage from "@/features/Product";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <ProductPage />
    </div>
  );
}
