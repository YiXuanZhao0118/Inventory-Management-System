// app/products/page.tsx
import QRPrintThisPage from "@/features/QRcode-Print";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <QRPrintThisPage />
    </div>
  );
}


