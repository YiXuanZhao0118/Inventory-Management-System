// app\(public)\account\page.tsx
import LoginPage from "@/features/LoginPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AccountPage() {
  return <LoginPage />;
}
