// app/layout.tsx
import "@/styles/globals.css";
import React, { Suspense } from "react";
import DeviceGate from "./_components/DeviceGate";
import { LanguageProvider } from "@/src/components/LanguageSwitcher";
import MaintenanceOverlay from "@/app/_components/system/MaintenanceOverlay";
import AppShell from "./_components/AppShell";

export const metadata = {
  title: "Lab330 Inventory",
  description: "Inventory Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="scroll-smooth">
      <body className="bg-gray-100 dark:bg-zinc-900 text-gray-800 dark:text-gray-100 min-h-screen">
        <LanguageProvider>
          <AppShell>
            <Suspense fallback={<div className="p-4">Loading…</div>}>
              {/* 裝置註冊交給既有的 DeviceGate */}
              <DeviceGate>{children}</DeviceGate>
            </Suspense>
          </AppShell>
          <MaintenanceOverlay />
        </LanguageProvider>
      </body>
    </html>
  );
}
