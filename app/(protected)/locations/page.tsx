// app\(protected)\locations\page.tsx
import LocationPage from "@/features/Location";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="space-y-4">
      <LocationPage />
    </div>
  );
}
