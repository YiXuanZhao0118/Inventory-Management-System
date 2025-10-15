// app/short-term/page.tsx
import ShortTerm from "@/features/short-term";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-6">
      <ShortTerm />
    </div>
  );
}
