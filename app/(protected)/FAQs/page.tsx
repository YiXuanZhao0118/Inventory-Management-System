// app\(protected)\FAQs\page.tsx
import QAPage from "@/features/QA";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <QAPage />
    </div>
  );
}
