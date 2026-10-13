// The ONE canonical element palette — "the new scheme" (Nigel, 2026-10-13).
//
//   root  living green      tide  deep teal-blue     sky  pale violet-blue
//   stone warm amber-earth      fire  ember orange
//
// Every element color in the client traces to this module: card corner
// motifs, the wake ceremony's corner burn, attunement tags, the aspect
// celebration, and battle projectiles all read `elementPalette`, and CSS
// consumers read the --elem-* variables on :root (defaults in theme.css,
// overridden here whenever a palette is applied).
//
// The palette is theme-driven: App fetches the stored UI theme on boot
// (api.getUITheme — persisted server-side in ui_config by
// api.updateUITheme, edited in the UI Workspace's Elements section) and
// calls applyElementPalette; the static ELEMENT_SCHEME below is what
// renders before that fetch lands and what "Reset to scheme" restores.
// The server merges over its own copy of these defaults
// (DEFAULT_ELEMENT_COLORS in server/src/actions.ts) — keep the two in step.
import { useSyncExternalStore } from "react";

export type ElementName = "root" | "tide" | "sky" | "stone" | "fire";

export const ELEMENTS: ElementName[] = ["root", "tide", "sky", "stone", "fire"];

export const ELEMENT_SCHEME: Record<ElementName, string> = {
  root: "#6a8a4e",
  tide: "#4e8a9b",
  sky: "#8d9fd6",
  stone: "#9c7c4c",
  fire: "#b8542e",
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string) => HEX_COLOR.test(v);

/** The live palette. Mutated in place by applyElementPalette, so module
 *  references (e.g. App's exported `elementColors`) always read current
 *  values; React trees re-render via useElementPalette below. */
export const elementPalette: Record<ElementName, string> = { ...ELEMENT_SCHEME };

let version = 0;
const listeners = new Set<() => void>();

/** Merge valid hex values over the live palette, push the result to the
 *  :root --elem-* CSS variables, and notify subscribers. Invalid or absent
 *  values are ignored — the palette can never be left half-broken. */
export function applyElementPalette(partial?: Partial<Record<ElementName, string>> | null) {
  if (partial) {
    for (const key of ELEMENTS) {
      const v = partial[key];
      if (typeof v === "string" && isHexColor(v)) elementPalette[key] = v.toLowerCase();
    }
  }
  if (typeof document !== "undefined") {
    for (const key of ELEMENTS) {
      document.documentElement.style.setProperty(`--elem-${key}`, elementPalette[key]);
    }
  }
  version++;
  listeners.forEach((l) => l());
}

/** Subscribe a component to palette changes (theme load, workspace tweaks).
 *  Returns the live palette record. */
export function useElementPalette(): Record<ElementName, string> {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => version,
  );
  return elementPalette;
}
