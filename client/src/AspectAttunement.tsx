import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { ElementGlyph, type GlyphElement } from "./glyphs";

/** The Aspect Attunement panel — one panel, every screen
 *  (Nigel, 2026-10-17: its function lives on the front page
 *  too). Lifted out of Territory's body into its own module
 *  so the home screen and the land share the same panel,
 *  the same orbs, the same law. */

/** Aspect attunement panel: hand-drawn element glyphs flowing into meters. Toggled by dock button. */
export function AspectAttunement({ visible, onClose, tenderItems, placedIds, onUpdate, onApplyAspect, targetAwokenId, onDeepenAspect, onOpenZodiac }: { visible: boolean; onClose: () => void; tenderItems: any[]; placedIds: Set<number>; onUpdate: () => void; onApplyAspect: (aspect: any) => void; targetAwokenId?: number | null; onDeepenAspect?: (wornAspect: any) => void; onOpenZodiac?: () => void }) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  // Both hooks run on EVERY render, in this order — the panel
  // stays mounted in Territory with `visible` toggling, and a
  // hook after an early return made the first tap render more
  // hooks than the render before: React felled the whole tree
  // (the terrain map's black screen, 2026-10-18). The query
  // simply sleeps while the panel is closed.
  const { data } = useQuery({
    queryKey: ["aspectAttunement"],
    queryFn: () => api.getAspectAttunement(),
    enabled: visible,
    refetchInterval: 30000,
    staleTime: 0,
  });
  if (!visible) return null;
  if (!data) return null;

  const elements = [
    { id: "tide", label: "Tide" },
    { id: "sky", label: "Sky" },
    { id: "stone", label: "Stone" },
    { id: "root", label: "Root" },
  ];
  // Fire appears only after discovering the first spark
  const showFire = typeof window !== "undefined" && localStorage.getItem("awoken-fire-found") === "1";
  if (showFire) {
    elements.push({ id: "fire", label: "Fire" });
  }

  return (
    <div className="aspect-attunement celestial">
      <button className="aspect-close" onClick={onClose} title="Close">✕</button>
      <div className="celestial-title">Aspect Attunement</div>
      {elements.map(el => {
        const points = data.levels[el.id] ?? 0;
        const pct = Math.min(100, (points / data.threshold) * 100);
        const aspectCount = (data.inventory || []).filter((i: any) => i.element === el.id).length;
        const rate = (data.rates && data.rates[el.id]) || 0;
        return (
          <div key={el.id} className="celestial-row" title={`${el.label}: ${points.toFixed(1)}/${data.threshold} · +${rate}/hr`}>
            <ElementGlyph element={el.id as GlyphElement} className="glyph-svg" width={60} height={24} />
            <div className="celestial-track"><div className="celestial-progress" style={{ width: `${pct}%` }} /></div>
            <span className="celestial-rate" style={{ fontSize: 11, opacity: rate > 0 ? 0.95 : 0.45, minWidth: 52, textAlign: "right", color: "#e8d5a0" }}>{rate > 0 ? `+${rate}/hr` : "—"}</span>
            <button
              className="celestial-orb"
              title={`${aspectCount} ${el.label} aspects ready — tap, then tap an Awokin`}
              onClick={() => {
                const aspects = (data.inventory || []).filter((i: any) => i.element === el.id);
                if (aspects.length > 0) {
                  onApplyAspect(aspects[0]);
                }
              }}
              disabled={aspectCount === 0}
            >
              {aspectCount}
            </button>
          </div>
        );
      })}
      {targetAwokenId && onDeepenAspect && (() => {
        const wornEntry = (data.wornAspects || []).find((w: any) => w.awakenedId === targetAwokenId);
        if (!wornEntry) return null;
        return (
          <div style={{ marginTop: 10, borderTop: "1px solid rgba(232,213,160,0.25)", paddingTop: 8 }}>
            <div className="celestial-title" style={{ fontSize: 12 }}>Worn by {wornEntry.name} — tap an orb above: a new element stacks (up to 3); one already worn rises a level at the normal cost, if the pool can pay. Or deepen one here:</div>
            {wornEntry.aspects.map((wa: any) => {
              const pool = Math.floor((data.levels && data.levels[wa.element]) ?? 0);
              const maxed = (wa.level ?? 1) >= 4;
              const cost = wa.level ?? 1;
              const confirming = confirmKey === wa.key;
              return (
                <div key={wa.key} style={{ marginTop: 4 }}>
                  <div className="celestial-row">
                    <span style={{ fontSize: 12, color: "#e8d5a0", flex: 1 }}>{wa.name} · {wa.element} · Lv {wa.level}</span>
                    {!confirming && (
                      <button
                        className="abtn small"
                        disabled={maxed}
                        title={maxed ? "Already at max level" : `Raise ${wa.name} to Lv ${(wa.level ?? 1) + 1} — costs ${cost} ${wa.element} attunement point${cost > 1 ? "s" : ""} (the pool holds ${pool})`}
                        onClick={() => setConfirmKey(wa.key)}
                      >
                        {maxed ? "Max" : `Upgrade · ${cost} ${wa.element} pt${cost > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                  {confirming && !maxed && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0 2px", fontSize: 12, color: "#e8d5a0" }}>
                      <span style={{ flex: 1 }}>Raise {wa.name} to Lv {(wa.level ?? 1) + 1} for {cost} {wa.element} point{cost > 1 ? "s" : ""}? (Pool: {pool})</span>
                      <button className="abtn small" disabled={pool < cost} onClick={() => { setConfirmKey(null); onDeepenAspect(wa); }}>Confirm</button>
                      <button className="abtn small" onClick={() => setConfirmKey(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
      {onOpenZodiac && (
        <div style={{ marginTop: 12, borderTop: "1px solid rgba(232,213,160,0.25)", paddingTop: 10 }}>
          <button type="button" className="abtn" style={{ width: "100%" }} onClick={() => { onClose(); onOpenZodiac(); }}>
            <svg className="ink-glyph" viewBox="0 0 32 32"><path d="M16 27 V14"/><path d="M16 14 C13 11 10 10 7 10"/><path d="M16 12 C19 9 22 8 25 8"/><path d="M16 19 C13.5 17 11 16.5 8.5 16.5"/><path d="M16 18 C18.5 16 21 15.5 23.5 15.5"/><path d="M16 27 C14 25.5 12 25 10 25"/><path d="M16 27 C18 25.5 20 25 22 25"/><circle cx="16" cy="5.5" r="1.6"/></svg> The Skill Zodiac — spend your levels' points on the wheel
          </button>
        </div>
      )}
    </div>
  );
}
