// pages/ProductGallery/components/CategoryFilter.tsx
"use client";
import React from "react";
import { ProductCategory } from "@/lib/types";

export default function CategoryFilter({
  categories, selected, onChange,
}: {
  categories: ProductCategory[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
      <div className="flex flex-wrap gap-2">
        {categories
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label key={c.id} className="inline-flex items-center space-x-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? selected.filter(id => id !== c.id) : [...selected, c.id])}
                  className="form-checkbox h-4 w-4 text-indigo-600"
                />
                <span className="text-gray-700 dark:text-gray-300">{c.name}</span>
              </label>
            );
          })}
      </div>
    </div>
  );
}
