// LAW: No Awoken on the field shall bear a background or aura.
// This is the ONLY component for rendering Awoken on tiles.
// It stacks body → arms → head. Background and aura are NEVER included.
// (Auras are old uploads with baked-in grey backgrounds; they belong on cards only.)

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

  // LAW: filter out background AND aura. Always. No exceptions.
  // Backgrounds and auras are locked to card art ONLY. Never on the field.
  const layers = awoken.layers
    .filter(l => {
      const cat = (l.category || "").toLowerCase().trim();
      // Block background and aura by category
      if (cat === "background" || cat === "aura") return false;
      if (cat.includes("background") || cat.includes("aura")) return false;
      return true;
    })
    .sort((a, b) => {
      const order = ["body", "arms", "head"];
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
