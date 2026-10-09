// LAW: No Awoken on the field shall bear a background.
// This is the ONLY component for rendering Awoken on tiles.
// It stacks body → arms → aura → head. Background is NEVER included.

import { useMemo } from "react";
import type { Awakened } from "./api";

interface Props {
  awoken: Awakened;
  assets: { sourceId: string; name: string; imageUrl: string; category: string }[];
  x: number;
  y: number;
  width: number;
  height: number;
  showFieldBornMarker?: boolean;
}

export default function FieldAwoken({ awoken, assets, x, y, width, height, showFieldBornMarker = true }: Props) {
  const assetMap = useMemo(() => {
    const m = new Map<string, string>();
    assets.forEach(a => m.set(a.sourceId, a.imageUrl));
    return m;
  }, [assets]);
  const assetCatMap = useMemo(() => {
    const m = new Map<string, string>();
    assets.forEach(a => m.set(a.sourceId, (a.category || "").toLowerCase().trim()));
    return m;
  }, [assets]);

  // LAW: filter out background. Always. No exceptions.
  // Backgrounds are locked to card art ONLY. Never on the field.
  // Check BOTH layer category AND asset category (catches miscategorized pieces).
  const layers = awoken.layers
    .filter(l => {
      const cat = (l.category || "").toLowerCase().trim();
      const assetCat = assetCatMap.get(l.source_id) || "";
      const name = (l.name || "").toLowerCase();
      const combined = cat + " " + assetCat + " " + name;
      // Block anything background-like by category OR name
      if (combined.includes("background")) return false;
      if (combined.includes("backdrop")) return false;
      const words = combined.split(/[^a-z]+/);
      if (words.includes("bg")) return false;
      if (words.includes("scene")) return false;
      if (words.includes("scenery")) return false;
      return true;
    })
    .sort((a, b) => {
      const order = ["body", "arms", "aura", "head"];
      return order.indexOf(a.category) - order.indexOf(b.category);
    });

  return (
    <g>
      {layers.map((l, i) => {
        const url = assetMap.get(l.source_id);
        if (!url) return null;
        return <image key={i} href={url} x={x} y={y} width={width} height={height} preserveAspectRatio="xMidYMid meet" />;
      })}
      {showFieldBornMarker && awoken.field_born === 1 && (
        <g transform={`translate(${x + width - 10}, ${y + 4})`}>
          <circle r="8" fill="#1a1a1a" stroke="#b89b5e" strokeWidth="1.5" />
          <text textAnchor="middle" dy="4" fontSize="10" fill="#b89b5e">🌳</text>
        </g>
      )}
    </g>
  );
}
