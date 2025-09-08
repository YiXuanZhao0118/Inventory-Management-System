
// pages/LocationPickerLocationPicker.tsx
'use client';

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { ChevronDown, ChevronRight } from "lucide-react";
import { fetcher } from '@/services/apiClient';

export interface LocationNode {
  id: string;
  label: string;
  children?: LocationNode[];
}

interface LocationPickerProps {
  value: string;                // the selected locationId
  onChange: (v: string) => void; // returns the selected locationId
  treeKey?: string;             // default "locationTree"
  exclude?: string[];           // list of ids to exclude
}

export function LocationPicker({
  value,
  onChange,
  treeKey = "locationTree",
  exclude = [],
}: LocationPickerProps) {
  // fetch the nested location tree
  const { data: rawTree = [], mutate } = useSWR<LocationNode[]>(
    "/api/locations",
    fetcher
  );

  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  // re-fetch when an external event signals the tree was updated
  useEffect(() => {
    const handler = () => mutate();
    window.addEventListener("locationTreeUpdated", handler);
    return () => window.removeEventListener("locationTreeUpdated", handler);
  }, [mutate]);

  if (!rawTree.length) {
    return <div className="p-2 text-gray-500">No locations available</div>;
  }

  const toggle = (key: string) =>
    setOpenSet(s => {
      const copy = new Set(s);
      copy.has(key) ? copy.delete(key) : copy.add(key);
      return copy;
    });

  const renderNodes = (nodes: LocationNode[], depth = 0): React.ReactNode =>
    nodes.map(n => {
      const hasChildren = Array.isArray(n.children) && n.children.length > 0;
      const isOpen = openSet.has(n.id);
      const disabled = exclude.includes(n.id);

      return (
        <div key={n.id} style={{ marginLeft: depth * 16 }} className="mb-1">
          <div className="flex items-center space-x-1">
            {hasChildren ? (
              <button onClick={() => toggle(n.id)} className="p-1">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            <button
              onClick={() => {
                if (hasChildren) {
                  toggle(n.id);
                } else if (!disabled) {
                  onChange(n.id);
                }
              }}
              className={`flex-1 text-left px-1 ${
                value === n.id
                  ? "font-semibold text-sky-600"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {n.label}
            </button>
          </div>
          {hasChildren && isOpen && renderNodes(n.children!, depth + 1)}
        </div>
      );
    });

  return (
    <div className="border rounded p-2 max-h-64 overflow-auto">
      {renderNodes(rawTree)}
    </div>
  );
}
