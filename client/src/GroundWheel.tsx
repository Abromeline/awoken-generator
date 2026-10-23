// THE GROUND'S WHEEL, RESTORED (Nigel, 2026-10-20): the
// radial from the Proving Ground (client/public/
// spell-preview.html — the agreed design of record) carried
// whole onto the game's two grounds. Six branches stand on
// the outer ring of the zodiac wheel; the chosen branch's
// entries fan across the inner ring; the Ability's Weapon
// opens as a sub-ring in the same fan while the Ability disc
// stays lit — and the Ability's Attune (2026-10-21) opens
// the same way, its five elements on the inner ring; a ✦
// hub closes; a caption line speaks beneath.
// This component draws the FORM only — geometry, glyphs,
// dress and gesture are the Ground's own, in screen pixels
// (branches r100 at 48px, entries r58 at 42px, hub 44px,
// guide rings at r100 / r58 / r29) — and each surface feeds
// it its real entries and its real acts. An entry may be
// CLICKED (its act) or DRAGGED onto the hotbar to key it,
// as the Ground teaches; the pin badge keys it by tap, as
// the game's belt has always allowed.

import { useState, type PointerEvent as ReactPointerEvent } from "react";

export type WheelTabId = "spell" | "ward" | "rune" | "binding" | "awoken" | "ability" | "weapon" | "attune";

/** The Ground's line glyphs, path for path (its GLYPHS table):
 *  simple strokes in currentColor on a 24-box. */
const SIGIL_MARKUP: Record<string, string> = {
  spell: "<path d=\"M12 2.5 L15 9.5 L12 20 L9 9.5 Z\"/><path d=\"M4.5 4.5 L7.5 7.5 M19.5 4.5 L16.5 7.5\"/>",
  ward: "<path d=\"M4.5 20.5 V10.5 M12 20.5 V7 M19.5 20.5 V10.5\"/><path d=\"M3 10.5 Q12 2.8 21 10.5\"/>",
  rune: "<path d=\"M9 3 V21\"/><path d=\"M9 6.5 L16.5 10 L9 13.5\"/><path d=\"M9 13.5 L16.5 17 L9 20.5\"/>",
  binding: "<circle cx=\"8.8\" cy=\"12\" r=\"4.4\"/><circle cx=\"15.2\" cy=\"12\" r=\"4.4\"/>",
  awo: "<circle cx=\"12\" cy=\"7.2\" r=\"3.1\"/><path d=\"M5.2 20.2 Q12 12.2 18.8 20.2\"/>",
  ability: "<path d=\"M5.5 4 L18 16.5 M18.5 4 L6 16.5\"/><path d=\"M15.2 16.8 L17.8 19.4 M8.8 16.8 L6.2 19.4\"/>",
  weapon: "<path d=\"M6 18 L17 7\"/><path d=\"M14.5 3.5 H20.5 V9.5\"/><path d=\"M9 15 L12 18\"/>",
  swordshield: "<path d=\"M12 3 L19 5 V11 C19 16 16 19.5 12 21 C8 19.5 5 16 5 11 V5 Z\"/><path d=\"M12 6.8 V16.8 M8.8 10.2 H15.2\"/>",
  sword: "<path d=\"M5.5 18.5 L16.5 7.5\"/><path d=\"M14 3.5 H20.5 V10\"/><path d=\"M8.5 14.5 L12.5 18.5\"/>",
  spear: "<path d=\"M4 20 L15.5 8.5\"/><path d=\"M15.5 8.5 L20.5 2.5 L21 8 L15.5 12.5 Z\"/>",
  arrow: "<path d=\"M3 12 H19\"/><path d=\"M14.5 5.5 L20.5 12 L14.5 18.5\"/><path d=\"M3.5 12 L7.5 7.5 M3.5 12 L7.5 16.5\"/>",
  manifest: "<path d=\"M7 20.5 V9.5\"/><path d=\"M7 9.5 L4.6 6 H9.4 Z\"/><path d=\"M12 21.5 V7\"/><path d=\"M12 7 L9.6 3.5 H14.4 Z\"/><path d=\"M17 20.5 V9.5\"/><path d=\"M17 9.5 L14.6 6 H19.4 Z\"/>",
  heal: "<circle cx=\"12\" cy=\"12\" r=\"8.4\"/><path d=\"M12 7.8 V16.2 M7.8 12 H16.2\"/>",
};

export function WheelSigil({ id, size = 24 }: { id: string; size?: number }) {
  const m = SIGIL_MARKUP[id];
  if (!m) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ pointerEvents: "none" }} dangerouslySetInnerHTML={{ __html: m }} />
  );
}

/** The six branches, in the Ground's order, standing from the
 *  top at sixty-degree steps: Spell, Ward, Rune, Binding,
 *  Awoken, Ability. */
export const WHEEL_CATS: { id: WheelTabId; label: string; sigil: string }[] = [
  { id: "spell", label: "Spell", sigil: "spell" },
  { id: "ward", label: "Ward", sigil: "ward" },
  { id: "rune", label: "Rune", sigil: "rune" },
  { id: "binding", label: "Binding", sigil: "binding" },
  { id: "awoken", label: "Awoken", sigil: "awo" },
  { id: "ability", label: "Ability", sigil: "ability" },
];

export interface WheelEntry {
  key: string;
  /** The face: the game's own art where it has some (the
   *  book's glyphs, the arsenal, a card's art). */
  img?: string | null;
  /** …or one of the Ground's line glyphs… */
  sigil?: string;
  /** …or the surface's own mark, where neither exists. */
  emoji?: string;
  label: string;
  locked?: boolean;
  /** Readied / chosen: the gold-lit dress. */
  lit?: boolean;
  /** The Ground's green state: the wielded weapon, the
   *  following companion. */
  summoned?: boolean;
  /** The hotbar key this entry's pin badge toggles. */
  pinKey?: string | null;
  /** The hotbar key a drag onto the belt keys (the Ground
   *  drags castings, abilities and Awokin — never weapons). */
  dragKey?: string | null;
  /** TAP-ONLY (Nigel, 2026-10-23 — the R6 in-wheel fix):
   *  this entry's press is a tap and nothing else. The drag
   *  reclassification can NEVER arm for it (pointer drift,
   *  however far, does not convert the press into a drag
   *  whose release would close the wheel without acting),
   *  and no pin badge is drawn for it, so nothing on or
   *  around the disc can eat its tap. Deck (reinforcement)
   *  entries carry this: for them the tap wins and the drag
   *  to the hotbar is gone, by Nigel's ruling. */
  tapOnly?: boolean;
  /** The act keeps the wheel open (a toggle worked through
   *  several entries, like Follow). */
  stayOpen?: boolean;
  /** A click turns the wheel to this ring instead of acting. */
  nav?: WheelTabId;
  act?: () => void;
}

function entryFace(e: WheelEntry) {
  if (e.img) return <img src={e.img} alt="" style={{ width: 30, height: 30 }} />;
  if (e.sigil) return <WheelSigil id={e.sigil} />;
  if (e.emoji) return <span style={{ pointerEvents: "none" }}>{e.emoji}</span>;
  return <span style={{ pointerEvents: "none" }}>✦</span>;
}

interface DiscDrag { entry: WheelEntry; x: number; y: number }

function EntryDisc({ entry, radius, angDeg, size, pinnedKeys, onTogglePin, onDropKey, onTab, onClose, onDragState }: {
  entry: WheelEntry;
  radius: number;
  angDeg: number;
  size: number;
  pinnedKeys: string[];
  onTogglePin: (key: string) => void;
  onDropKey: (key: string) => void;
  onTab: (t: WheelTabId) => void;
  onClose: () => void;
  onDragState: (d: DiscDrag | null) => void;
}) {
  const a = (angDeg * Math.PI) / 180;
  const cls = "gw-disc"
    + (entry.locked ? " off" : "")
    + (entry.summoned ? " summoned" : "")
    + (entry.lit ? " lit" : "");
  // The Ground's gesture, whole: a press that travels keys
  // the entry to the belt if it lands on the hotbar; a press
  // that stays is a click — navigate, or act and close.
  const onPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let dragging = false;
    const move = (ev: PointerEvent) => {
      // A tapOnly entry never reclassifies: drift is still a tap.
      if (!entry.tapOnly && !dragging && entry.dragKey && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) dragging = true;
      if (dragging) onDragState({ entry, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (dragging) {
        onDragState(null);
        if (entry.dragKey) {
          const bar = document.querySelector("[data-groundwheel-hotbar]");
          if (bar) {
            const r = bar.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
              onDropKey(entry.dragKey);
            }
          }
        }
        onClose();
      } else if (entry.nav) {
        onTab(entry.nav);
      } else if (entry.act) {
        entry.act();
        if (!entry.stayOpen) onClose();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className={cls} role="button" aria-label={entry.label}
      style={{
        left: Math.cos(a) * radius, top: Math.sin(a) * radius, width: size, height: size,
        color: entry.locked ? "#6f6a5e" : undefined,
      }}
      onPointerDown={onPointerDown}>
      {entryFace(entry)}
      <small>{(entry.label + (entry.locked ? " · locked" : "")).split("✦").map((part, i) => i === 0 ? part : <span key={i}><span className="spark-glow">✦</span>{part}</span>)}</small>
      {entry.pinKey && !entry.tapOnly && (
        <span className={"gw-pin" + (pinnedKeys.includes(entry.pinKey) ? " on" : "")}
          role="button" aria-label={pinnedKeys.includes(entry.pinKey) ? "Loose from the hotbar" : "Key to the hotbar"}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
          onClick={(e) => { e.stopPropagation(); onTogglePin(entry.pinKey!); }}>
          {pinnedKeys.includes(entry.pinKey) ? "✓" : "＋"}
        </span>
      )}
    </div>
  );
}

export default function GroundWheel({ cx, cy, tab, onTab, entries, caption, pinnedKeys, onTogglePin, onDropKey, onClose, ordersMode, evenFan }: {
  cx: number;
  cy: number;
  tab: WheelTabId;
  onTab: (t: WheelTabId) => void;
  entries: WheelEntry[];
  caption: string;
  pinnedKeys: string[];
  onTogglePin: (key: string) => void;
  onDropKey: (key: string) => void;
  onClose: () => void;
  /** THE ORDERS WHEEL (Nigel, 2026-10-22 — the marching-
   *  orders spec, from the Proving Ground's proof): no
   *  branches — the entries themselves stand on the outer
   *  ring, spread evenly around the hub, one wheel for one
   *  Awokin or for a whole drag-chosen company. */
  ordersMode?: boolean;
  /** EVEN FAN (the R6 in-wheel fix): spread the entries
   *  evenly around the whole inner ring instead of the 52°
   *  fan, so a full window (company + six deck entries +
   *  the More step) never stacks one entry on another —
   *  the 52° fan repeats its spots every ~7 entries. The
   *  Awoken branch passes this; every other branch keeps
   *  the Ground's fan, untouched. */
  evenFan?: boolean;
}) {
  const [drag, setDrag] = useState<DiscDrag | null>(null);
  return (
    <>
      <div className="gw-catch" onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="gw-wheel" style={{ left: cx, top: cy }}>
        {/* The zodiac rings: three guide circles, six spokes,
            six dots on the outer ring — the Ground's own svg. */}
        <svg className="gw-rings" width={264} height={264} viewBox="-132 -132 264 264">
          <circle r={100} fill="none" stroke="rgba(216,178,92,.30)" strokeWidth={1} />
          <circle r={58} fill="none" stroke="rgba(216,178,92,.22)" strokeWidth={1} />
          <circle r={29} fill="none" stroke="rgba(216,178,92,.35)" strokeWidth={1} />
          {[0, 60, 120, 180, 240, 300].map(k => (
            <line key={`s${k}`} x1={0} y1={-29} x2={0} y2={-100} stroke="rgba(216,178,92,.20)" strokeWidth={1} transform={`rotate(${k})`} />
          ))}
          {[0, 60, 120, 180, 240, 300].map(k => (
            <circle key={`d${k}`} cx={0} cy={-100} r={1.6} fill="rgba(216,178,92,.5)" transform={`rotate(${k})`} />
          ))}
        </svg>
        {!ordersMode && WHEEL_CATS.map((c, i) => {
          const on = tab === c.id || ((tab === "weapon" || tab === "attune") && c.id === "ability");
          const a = ((-90 + i * 60) * Math.PI) / 180;
          return (
            <div key={c.id} className={"gw-disc cat" + (on ? " on" : "")} role="button" aria-label={c.label}
              style={{ left: Math.cos(a) * 100, top: Math.sin(a) * 100, width: 48, height: 48 }}
              onClick={() => onTab(c.id)}>
              <WheelSigil id={c.sigil} />
              <small>{c.label}</small>
            </div>
          );
        })}
        {entries.map((e, i) => {
          const ang = ordersMode
            ? -90 + i * (360 / Math.max(1, entries.length))
            : evenFan && entries.length > 1
              ? -90 + (i + 0.5) * (360 / entries.length)
              : entries.length === 1 ? -90 : -90 + (i - (entries.length - 1) / 2) * 52;
          return (
            <EntryDisc key={e.key} entry={e} radius={ordersMode ? 100 : 58} angDeg={ang} size={ordersMode ? 48 : 42}
              pinnedKeys={pinnedKeys} onTogglePin={onTogglePin} onDropKey={onDropKey}
              onTab={onTab} onClose={onClose} onDragState={setDrag} />
          );
        })}
        <div className="gw-hub" role="button" aria-label="Close the wheel" onClick={onClose}>✦</div>
        <div className="gw-caption">{caption}</div>
      </div>
      {drag && (
        <div className="gw-ghost" style={{ left: drag.x, top: drag.y }}>{entryFace(drag.entry)}</div>
      )}
    </>
  );
}
