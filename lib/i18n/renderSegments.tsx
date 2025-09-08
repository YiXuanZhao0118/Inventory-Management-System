// lib/i18n/renderSegments.tsx
import React from "react";

type Segment =
  | string
  | { type: "code"; var?: string; text?: string };

export function renderSegments(
  segments: Segment[] | string,
  values: Record<string, React.ReactNode> = {}
): React.ReactNode {
  if (typeof segments === "string") return segments;
  return segments.map((seg, i) => {
    if (typeof seg === "string") return <React.Fragment key={i}>{seg}</React.Fragment>;
    if (seg.type === "code") {
      const content = seg.var ? values[seg.var] : seg.text ?? "";
      return <code key={i}>{content}</code>;
    }
    return null;
  });
}
