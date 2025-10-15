// app/page.tsx
import Link from "next/link";
import {
  Boxes,
  PackagePlus,
  ArrowLeftRight,
  Trash2,
  Clock,
  Tags,
  MapPin,
  FileDown,
  FileText,
  Timer,
  QrCode,
  HelpCircle,
} from "lucide-react";
import React from "react";

export default function Home() {
  type Feature = {
    title: string;
    desc: string;
    href?: string;
    // if omitted, we'll show a hint pill instead
    icon: React.ElementType;
    badge?: string;
    hint?: string;
  };
  const features: Feature[] = [
    {
      title: "Inventory",
      desc: "Browse by status (In-stock / Short-term / Long-term / Discarded). Switch between Aggregated and Individual views, search (auto-detects IAMS), multi-key sort, and client paging. Opens Transfers/Discard modals.",
      href: "/inventory",
      icon: Boxes,
      badge: "Core",
    },
    {
      title: "Transfers",
      desc: "Move items between locations (leaf-only target). Searchable leaf picker with keyboard nav, drag & drop from lists, apply a global target, server-side paging, and validation.",
      icon: ArrowLeftRight,
      hint: "Open from Inventory",
      badge: "Feature",
    },
    {
      title: "Discard",
      desc: "Select items to scrap with reason/operator. Handles PM (by stock) and Non-PM (quantities with caps). Shows live remaining, supports drag & drop, and posts to /api/inventory/discard.",
      icon: Trash2,
      hint: "Open from Inventory",
      badge: "Feature",
    },
    {
      title: "Add Stock",
      desc: "Add Property-managed items (1 per click) and Non-property items (with quantities). Drag & drop from searchable lists, review a confirmation, submit to /api/inventory/add.",
      href: "/inventory/add",
      icon: PackagePlus,
      badge: "Feature",
    },
    {
      title: "Long-term Loan / Return",
      desc: "Two tabs for borrowing and returning. Requires borrower / handler / due date, shows IAMS and locations, guards quantities, confirmation step, and endpoints under /api/rentals/long-term/*.",
      href: "/long-term",
      icon: Clock,
      badge: "Feature",
    },
    {
      title: "Short-term Loan",
      desc: "Scan a QR to auto-borrow with your device ID. Extend +3h, return in one tap, and see remaining time / IAMS / full location. Includes My Loans & All Active with paging.",
      href: "/short-term",
      icon: Timer,
      badge: "Feature",
    },
    {
      title: "Short-term QR Codes",
      desc: "Generate QR labels for property-managed stocks. Search & in-stock filter, choose QR size & Base Origin, responsive grid, and one-click PNG download with text.",
      href: "/short-term/qrcodes",
      icon: QrCode,
      badge: "QR",
    },
    {
      title: "Product Information · Datasheets",
      desc: "Upload, edit, and delete datasheets (PDF/images). Drag & drop to add, rename and reorder files, quick preview, and per-product coverage at a glance.",
      href: "/products-overview",
      icon: FileText,
      badge: "Datasheets",
    },
    {
      title: "Products",
      desc: "Add / edit / delete products with usage checks. Sorting & filtering, optional URL analyzer to pre-fill fields, and automatic image download attempts.",
      href: "/products",
      icon: Tags,
      badge: "Core",
    },
    {
      title: "Locations",
      desc: "Drag / indent / outdent with safeguards: root is locked, cannot move under root, and nodes with active stock cannot be deleted or become parents. Unique-name enforcement and usage badges.",
      href: "/locations",
      icon: MapPin,
      badge: "Core",
    },
    {
      title: "FAQs / Knowledge Base",
      desc: "Searchable Q&A with Markdown + KaTeX + code highlight. Card previews with auto-scroll, drag re-order, add/edit with image/video uploads and URL import.",
      href: "/FAQs",
      icon: HelpCircle,
      badge: "Help",
    },
    {
      title: "Data Import / Export",
      desc: "Download a JSON snapshot or import one and review a diff before applying. Designed to keep bulk operations safe.",
      href: "/admin",
      icon: FileDown,
      badge: "Database",
    },
  ];
  return (
    <div className="w-full px-6 py-8 space-y-8">
      
      <header className="space-y-2">
        
        <h1 className="text-3xl font-semibold tracking-tight">
          
          Lab330 Inventory
        </h1>
        <p className="text-sm text-gray-600">
          
          Manage products, locations, and stock. Import/export data safely with
          a diff preview.
        </p>
      </header>
      <section>
        
        <h2 className="text-lg font-medium mb-3">Feature Guide</h2>
        {/* Full width; 4 columns on large screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          
          {features.map(({ title, desc, href, icon: Icon, badge, hint }) => {
            const IconComp = (Icon ?? FileText) as React.ElementType;
            // fallback safety
            return (
              <div
                key={title}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow transition"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl p-2 bg-gray-100 dark:bg-gray-800">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    
                    <div className="flex items-center gap-2">
                      
                      <h3 className="font-semibold">{title}</h3>
                      {badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/10 text-indigo-700 dark:text-indigo-300">
                          
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      
                      {desc}
                    </p>
                    <div className="mt-3">
                      
                      {href ? (
                        <Link
                          href={href}
                          className="inline-flex items-center rounded-lg bg-black px-3 py-1.5 text-white text-sm hover:opacity-90"
                        >
                          
                          Open
                        </Link>
                      ) : (
                        hint && (
                          <span className="inline-flex items-center rounded-lg bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
                            
                            {hint}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
