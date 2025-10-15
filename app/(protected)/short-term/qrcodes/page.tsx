// app/short-term/page.tsx
import ShortTermQRCodesPage from "@/features/QRcode";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <ShortTermQRCodesPage />
    </div>
  );
}
