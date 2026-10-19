/**
 * Tender class art — the three Written Light classes as walking
 * figures (Nigel's sprite trials, 2026-10-19). The Warden (hood,
 * ward-staff, shield), the Runewright (the great brim, the face
 * lost in its shadow, the glyph-banner on his back), and the
 * Binder (antler-crowned shaman, healing staff — he binds wounds
 * and spirits, never ropes: Nigel's ruling). Frames are cut from
 * the masters' sprite sheets and downscaled to the Table's stage.
 * Directions borrow where a sheet ran thin: the Binder's west is
 * his east mirrored (flip), as the dark's art is mirrored.
 */
import warden01 from "./assets/tenders/warden-01.png";
import warden02 from "./assets/tenders/warden-02.png";
import warden03 from "./assets/tenders/warden-03.png";
import warden04 from "./assets/tenders/warden-04.png";
import warden05 from "./assets/tenders/warden-05.png";
import warden06 from "./assets/tenders/warden-06.png";
import warden07 from "./assets/tenders/warden-07.png";
import warden08 from "./assets/tenders/warden-08.png";
import warden09 from "./assets/tenders/warden-09.png";
import warden10 from "./assets/tenders/warden-10.png";
import warden11 from "./assets/tenders/warden-11.png";
import warden12 from "./assets/tenders/warden-12.png";
import warden26 from "./assets/tenders/warden-26.png";
import warden27 from "./assets/tenders/warden-27.png";
import warden28 from "./assets/tenders/warden-28.png";
import warden29 from "./assets/tenders/warden-29.png";
import warden30 from "./assets/tenders/warden-30.png";
import warden31 from "./assets/tenders/warden-31.png";
import warden32 from "./assets/tenders/warden-32.png";
import warden34 from "./assets/tenders/warden-34.png";
import warden35 from "./assets/tenders/warden-35.png";
import warden36 from "./assets/tenders/warden-36.png";
import warden37 from "./assets/tenders/warden-37.png";
import runewright41 from "./assets/tenders/runewright-41.png";
import runewright42 from "./assets/tenders/runewright-42.png";
import runewright43 from "./assets/tenders/runewright-43.png";
import runewright44 from "./assets/tenders/runewright-44.png";
import runewright45 from "./assets/tenders/runewright-45.png";
import runewright46 from "./assets/tenders/runewright-46.png";
import runewright47 from "./assets/tenders/runewright-47.png";
import runewright48 from "./assets/tenders/runewright-48.png";
import runewright49 from "./assets/tenders/runewright-49.png";
import runewright50 from "./assets/tenders/runewright-50.png";
import runewright51 from "./assets/tenders/runewright-51.png";
import runewright52 from "./assets/tenders/runewright-52.png";
import runewright53 from "./assets/tenders/runewright-53.png";
import runewright54 from "./assets/tenders/runewright-54.png";
import runewright55 from "./assets/tenders/runewright-55.png";
import runewright56 from "./assets/tenders/runewright-56.png";
import runewright57 from "./assets/tenders/runewright-57.png";
import runewright58 from "./assets/tenders/runewright-58.png";
import runewright59 from "./assets/tenders/runewright-59.png";
import runewright60 from "./assets/tenders/runewright-60.png";
import runewright61 from "./assets/tenders/runewright-61.png";
import runewright62 from "./assets/tenders/runewright-62.png";
import runewright63 from "./assets/tenders/runewright-63.png";
import runewright64 from "./assets/tenders/runewright-64.png";
import binder21 from "./assets/tenders/binder-21.png";
import binder22 from "./assets/tenders/binder-22.png";
import binder23 from "./assets/tenders/binder-23.png";
import binder24 from "./assets/tenders/binder-24.png";
import binder31 from "./assets/tenders/binder-31.png";
import binder32 from "./assets/tenders/binder-32.png";
import binder33 from "./assets/tenders/binder-33.png";
import binder34 from "./assets/tenders/binder-34.png";
import binder35 from "./assets/tenders/binder-35.png";
import binder36 from "./assets/tenders/binder-36.png";
import binder37 from "./assets/tenders/binder-37.png";
import binder38 from "./assets/tenders/binder-38.png";
import binder39 from "./assets/tenders/binder-39.png";
import binder40 from "./assets/tenders/binder-40.png";
import binder41 from "./assets/tenders/binder-41.png";
import binder42 from "./assets/tenders/binder-42.png";
import binder43 from "./assets/tenders/binder-43.png";
import binder44 from "./assets/tenders/binder-44.png";

export type TenderClassId = "warden" | "runewright" | "binder";
export type TenderDir = "E" | "SE" | "S" | "SW" | "W" | "NW" | "N" | "NE";

export interface TenderClassArt {
  id: TenderClassId;
  label: string;
  icon: string;
  idle: string;
  dirs: Record<TenderDir, string[]>;
  /** Directions drawn mirrored (the art faces the other way). */
  flip: Partial<Record<TenderDir, boolean>>;
}

export const TENDER_CLASSES: Record<TenderClassId, TenderClassArt> = {
  warden: {
    id: "warden", label: "Warden", icon: "🛡️", idle: warden01, flip: {},
    dirs: {
      E: [warden02, warden08, warden11, warden12], SE: [warden29, warden30, warden31, warden32], S: [warden26, warden27, warden28],
      SW: [warden34, warden35], W: [warden05, warden06], NW: [warden04, warden37],
      N: [warden09, warden10, warden07], NE: [warden03, warden36],
    },
  },
  runewright: {
    id: "runewright", label: "Runewright", icon: "🪶", idle: runewright41, flip: {},
    dirs: {
      E: [runewright42, runewright43, runewright44], SE: [runewright57, runewright58, runewright59, runewright60], S: [runewright53, runewright54, runewright55, runewright56],
      SW: [runewright61, runewright62], W: [runewright45, runewright46], NW: [runewright64],
      N: [runewright47, runewright48], NE: [runewright63],
    },
  },
  binder: {
    id: "binder", label: "Binder", icon: "🦌", idle: binder21, flip: { W: true },
    dirs: {
      E: [binder22, binder23, binder24], SE: [binder37, binder38, binder39, binder40], S: [binder33, binder34, binder35, binder36],
      SW: [binder41, binder42], W: [binder22, binder23], NW: [binder44],
      N: [binder31, binder32], NE: [binder43],
    },
  },
};

export const TENDER_CLASS_ORDER: TenderClassId[] = ["warden", "runewright", "binder"];

/** The compass a stage-space stride (dx, dy) faces. The stage is
 *  isometric — its south is squashed — so the y is stretched back
 *  before the angle is read, as the running-ground demos proved. */
export function tenderDirOf(dx: number, dy: number): TenderDir {
  const a = Math.atan2(dy / 0.58, dx);
  const sector = Math.round(a / (Math.PI / 4));
  const dirs: TenderDir[] = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  return dirs[((sector % 8) + 8) % 8];
}

/** One frame of a class at a moment: standing reads the idle
 *  portrait; walking cycles the direction's strides by the clock. */
export function tenderPose(art: TenderClassArt, dir: TenderDir, walking: boolean, step: number): { src: string; flip: boolean } {
  if (!walking) return { src: art.idle, flip: false };
  const frames = art.dirs[dir];
  return { src: frames[step % frames.length], flip: !!art.flip[dir] };
}
