// app/(protected)/admin/layout.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // ⬇️ 這裡要先 await
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    redirect(`/account?next=${encodeURIComponent("/admin")}`);
  }

  // 需要角色限制就開啟
  // if (payload.role !== "admin") {
  //   redirect("/");
  // }

  return <>{children}</>;
}
