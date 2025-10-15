// app/products/page.tsx
import ProductsOverviewPage from "@/features/ProductGallery/products-overview";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <ProductsOverviewPage />
    </div>
  );
}
