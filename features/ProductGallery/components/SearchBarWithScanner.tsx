//pages/ProductGallery/components/SearchBarWithScanner.tsx
"use client";
import React, { useState } from "react";
import QRScanner from "@/components/QRScanner";

export default function SearchBarWithScanner({
  value, onChange, placeholder, scanLabel, onScan,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  scanLabel?: string;
  onScan?: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <input
          type="text"
          className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow"
        >
          {scanLabel ?? "Scan"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl w-full max-w-md">
            <div className="h-64 rounded-lg bg-black overflow-hidden mb-4">
              <QRScanner
                onScan={(code) => {
                  onScan?.(code);
                  setOpen(false);
                }}
                onError={(err) => {
                  alert(err.message);
                  setOpen(false);
                }}
              />
            </div>
            <button
              className="mt-2 inline-block text-red-500 hover:underline"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
