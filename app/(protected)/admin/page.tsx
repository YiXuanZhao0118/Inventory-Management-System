// app/(protected)/admin/page.tsx
import Admin from "@/features/Admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return <Admin />;
}
