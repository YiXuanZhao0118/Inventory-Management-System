// app/products/page.tsx
import LongTermPage from "@/features/long-term";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-4">
      <LongTermPage />
    </div>
  );
}
