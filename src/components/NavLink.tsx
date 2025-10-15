// components/NavLink.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

export default function NavLink({ href, children }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`nav-link ${
        isActive
          ? "bg-sky-300 text-white"
          : ""
      }`}
    >
      {children}
    </Link>
  );
}
