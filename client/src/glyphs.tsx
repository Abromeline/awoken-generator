// The canonical element glyphs — Nigel's hand-drawn ink-wash SVG artwork
// (approved 2026-10-10). This module is the ONE source of truth for the
// glyph path data: the attunement meters (Territory), and the wake
// ceremony's corner burn (App) both render from here. Path data is
// verbatim from the original glyphs record; do not redraw.
//
// Each glyph is a small set of SVG nodes in a 60×24 viewBox: stroked
// paths (fill="none") plus occasional filled dots. `fill: "dot"` nodes
// take the dot color (a pale gold in the meters); `fill: "stroke"` nodes
// take the main stroke color.

export type GlyphElement = "tide" | "sky" | "stone" | "root" | "fire";

export type GlyphNode =
  | { kind: "path"; d: string; width?: number; opacity?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: "dot" | "stroke"; opacity?: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill: "dot" | "stroke"; opacity?: number; transform?: string };

export const glyphNodes: Record<GlyphElement, GlyphNode[]> = {
  tide: [
    { kind: "path", d: "M2,12 Q10,4 18,12 T34,12 T50,12", width: 1.5, opacity: 0.9 },
    { kind: "path", d: "M2,17 Q10,9 18,17 T34,17 T50,17", width: 1, opacity: 0.5 },
    { kind: "path", d: "M50,12 L60,12", width: 1.5 },
    { kind: "circle", cx: 50, cy: 12, r: 2, fill: "dot", opacity: 0.8 },
  ],
  sky: [
    { kind: "path", d: "M28,12 m-8,0 a8,8 0 1,1 8,8 a6,6 0 1,0 -6,-6 a4,4 0 1,1 4,4", width: 1.5, opacity: 0.9 },
    { kind: "path", d: "M36,12 Q44,12 50,12 L60,12", width: 1.5 },
    { kind: "circle", cx: 36, cy: 12, r: 1.5, fill: "dot", opacity: 0.8 },
  ],
  stone: [
    { kind: "path", d: "M6,18 L18,4 L26,12", width: 1.5, opacity: 0.9 },
    { kind: "path", d: "M18,4 L18,14 M12,11 L24,11", width: 0.8, opacity: 0.5 },
    { kind: "path", d: "M26,12 Q36,12 44,12 L60,12", width: 1.5 },
    { kind: "path", d: "M26,12 L32,18", width: 1, opacity: 0.4 },
  ],
  root: [
    { kind: "path", d: "M10,18 Q10,6 22,6 Q34,6 34,14", width: 1.5, opacity: 0.9 },
    { kind: "path", d: "M34,14 Q38,14 42,14 L60,14", width: 1.5 },
    { kind: "path", d: "M22,6 Q26,2 30,4", width: 1, opacity: 0.6 },
    { kind: "ellipse", cx: 30, cy: 4, rx: 3, ry: 1.5, fill: "stroke", opacity: 0.35, transform: "rotate(-25 30 4)" },
    { kind: "path", d: "M14,14 Q18,12 20,14", width: 0.8, opacity: 0.4 },
  ],
  fire: [
    { kind: "path", d: "M14,20 Q10,14 14,8 Q16,4 14,2 Q20,4 22,10 Q24,6 22,2 Q28,6 26,12 Q25,16 28,18 L60,18", width: 1.5, opacity: 0.9 },
    { kind: "path", d: "M18,20 Q16,16 18,12 Q20,14 19,17", width: 1, opacity: 0.6 },
    { kind: "path", d: "M28,18 L60,18", width: 1.5 },
    { kind: "circle", cx: 22, cy: 14, r: 1.5, fill: "stroke", opacity: 0.5 },
  ],
};

/** One element glyph, rendered from the canonical path data. Defaults
 *  match the attunement meters exactly (gold strokes, pale-gold dots,
 *  60×24); the ceremony passes elemental colors for both. */
export function ElementGlyph({
  element,
  color = "#d4af6a",
  dotColor = "#e8d5a0",
  className,
  width,
  height,
}: {
  element: GlyphElement;
  color?: string;
  dotColor?: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg className={className} viewBox="0 0 60 24" width={width} height={height} aria-hidden="true">
      {glyphNodes[element].map((node, i) => {
        if (node.kind === "path") {
          return <path key={i} d={node.d} fill="none" stroke={color} strokeWidth={node.width} opacity={node.opacity} />;
        }
        if (node.kind === "circle") {
          return <circle key={i} cx={node.cx} cy={node.cy} r={node.r} fill={node.fill === "dot" ? dotColor : color} opacity={node.opacity} />;
        }
        return <ellipse key={i} cx={node.cx} cy={node.cy} rx={node.rx} ry={node.ry} fill={node.fill === "dot" ? dotColor : color} opacity={node.opacity} transform={node.transform} />;
      })}
    </svg>
  );
}
