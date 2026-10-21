/**
 * Tender class art — the five Written Light classes as walking
 * figures (Nigel's sprite trials, 2026-10-19). The Warden (hood,
 * ward-staff, shield), the Runewright (the great brim, the face
 * lost in its shadow, the glyph-banner on his back), and the
 * Binder (antler-crowned shaman, healing staff — he binds wounds
 * and spirits, never ropes: Nigel's ruling). Frames are cut from
 * the masters' sprite sheets and downscaled to the Table's stage.
 * Directions borrow where a sheet ran thin: the Binder's west is
 * his east mirrored (flip), as the dark's art is mirrored.
 *
 * THE RUN-RIGHT REPAIR (Nigel's report, 2026-10-20 — "characters
 * on table are also missing their animation to run right"): on
 * the Table's isometric lattice, rightward travel rides the NE
 * road, and NE was a single frame for the Runewright and the
 * Binder — a statue gliding. The Runewright's own sheet held the
 * cure all along: frames 49–52 are his back-stride up-right row,
 * imported but never wired; they are his NE now. His NW and the
 * Binder's NE/NW borrow the east cycle (NW mirrored), the same
 * bargain the cast table makes — his sheet keeps only one true
 * cell for each of those roads (Runewright 64, Binder 43/44),
 * and a borrowed cycle beats a statue. The Warden's NE/NW are
 * true pairs and stand as they were.
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

import wardenCastS1 from "./assets/tenders/warden-cast-s-1.png";
import wardenCastS2 from "./assets/tenders/warden-cast-s-2.png";
import wardenCastS3 from "./assets/tenders/warden-cast-s-3.png";
import wardenCastS4 from "./assets/tenders/warden-cast-s-4.png";
import wardenCastE1 from "./assets/tenders/warden-cast-e-1.png";
import wardenCastE2 from "./assets/tenders/warden-cast-e-2.png";
import wardenCastE3 from "./assets/tenders/warden-cast-e-3.png";
import wardenCastE4 from "./assets/tenders/warden-cast-e-4.png";
import wardenCastN1 from "./assets/tenders/warden-cast-n-1.png";
import wardenCastN2 from "./assets/tenders/warden-cast-n-2.png";
import wardenCastN3 from "./assets/tenders/warden-cast-n-3.png";
import wardenCastN4 from "./assets/tenders/warden-cast-n-4.png";
import runewrightCastS1 from "./assets/tenders/runewright-cast-s-1.png";
import runewrightCastS2 from "./assets/tenders/runewright-cast-s-2.png";
import runewrightCastS3 from "./assets/tenders/runewright-cast-s-3.png";
import runewrightCastS4 from "./assets/tenders/runewright-cast-s-4.png";
import runewrightCastE1 from "./assets/tenders/runewright-cast-e-1.png";
import runewrightCastE2 from "./assets/tenders/runewright-cast-e-2.png";
import runewrightCastE3 from "./assets/tenders/runewright-cast-e-3.png";
import runewrightCastE4 from "./assets/tenders/runewright-cast-e-4.png";
import runewrightCastN1 from "./assets/tenders/runewright-cast-n-1.png";
import runewrightCastN2 from "./assets/tenders/runewright-cast-n-2.png";
import runewrightCastN3 from "./assets/tenders/runewright-cast-n-3.png";
import runewrightCastN4 from "./assets/tenders/runewright-cast-n-4.png";
import binderCastS1 from "./assets/tenders/binder-cast-s-1.png";
import binderCastS2 from "./assets/tenders/binder-cast-s-2.png";
import binderCastS3 from "./assets/tenders/binder-cast-s-3.png";
import binderCastS4 from "./assets/tenders/binder-cast-s-4.png";
import binderCastE1 from "./assets/tenders/binder-cast-e-1.png";
import binderCastE2 from "./assets/tenders/binder-cast-e-2.png";
import binderCastE3 from "./assets/tenders/binder-cast-e-3.png";
import binderCastE4 from "./assets/tenders/binder-cast-e-4.png";
import binderCastN1 from "./assets/tenders/binder-cast-n-1.png";
import binderCastN2 from "./assets/tenders/binder-cast-n-2.png";
import binderCastN3 from "./assets/tenders/binder-cast-n-3.png";
import binderCastN4 from "./assets/tenders/binder-cast-n-4.png";

import witch01 from "./assets/tenders/witch-01.png";
import witch02 from "./assets/tenders/witch-02.png";
import witch03 from "./assets/tenders/witch-03.png";
import witch04 from "./assets/tenders/witch-04.png";
import witch05 from "./assets/tenders/witch-05.png";
import witch06 from "./assets/tenders/witch-06.png";
import witch07 from "./assets/tenders/witch-07.png";
import witch08 from "./assets/tenders/witch-08.png";
import witch09 from "./assets/tenders/witch-09.png";
import witch10 from "./assets/tenders/witch-10.png";
import witch11 from "./assets/tenders/witch-11.png";
import witch12 from "./assets/tenders/witch-12.png";
import witch13 from "./assets/tenders/witch-13.png";
import witch14 from "./assets/tenders/witch-14.png";
import witch15 from "./assets/tenders/witch-15.png";
import witch16 from "./assets/tenders/witch-16.png";
import witch17 from "./assets/tenders/witch-17.png";
import witch18 from "./assets/tenders/witch-18.png";
import witch19 from "./assets/tenders/witch-19.png";
import witch20 from "./assets/tenders/witch-20.png";
import witch21 from "./assets/tenders/witch-21.png";
import witch22 from "./assets/tenders/witch-22.png";
import witch23 from "./assets/tenders/witch-23.png";
import witch24 from "./assets/tenders/witch-24.png";
import sage01 from "./assets/tenders/sage-01.png";
import sage02 from "./assets/tenders/sage-02.png";
import sage03 from "./assets/tenders/sage-03.png";
import sage04 from "./assets/tenders/sage-04.png";
import sage05 from "./assets/tenders/sage-05.png";
import sage06 from "./assets/tenders/sage-06.png";
import sage07 from "./assets/tenders/sage-07.png";
import sage08 from "./assets/tenders/sage-08.png";
import sage09 from "./assets/tenders/sage-09.png";
import sage10 from "./assets/tenders/sage-10.png";
import sage11 from "./assets/tenders/sage-11.png";
import sage12 from "./assets/tenders/sage-12.png";
import sage13 from "./assets/tenders/sage-13.png";
import sage14 from "./assets/tenders/sage-14.png";
import sage15 from "./assets/tenders/sage-15.png";
import sage16 from "./assets/tenders/sage-16.png";
import sage17 from "./assets/tenders/sage-17.png";
import sage18 from "./assets/tenders/sage-18.png";
import sage19 from "./assets/tenders/sage-19.png";
import sage20 from "./assets/tenders/sage-20.png";
import sage21 from "./assets/tenders/sage-21.png";
import sage22 from "./assets/tenders/sage-22.png";
import sage23 from "./assets/tenders/sage-23.png";
import sage24 from "./assets/tenders/sage-24.png";
import witchCastS1 from "./assets/tenders/witch-cast-s-1.png";
import witchCastS2 from "./assets/tenders/witch-cast-s-2.png";
import witchCastS3 from "./assets/tenders/witch-cast-s-3.png";
import witchCastS4 from "./assets/tenders/witch-cast-s-4.png";
import witchCastE1 from "./assets/tenders/witch-cast-e-1.png";
import witchCastE2 from "./assets/tenders/witch-cast-e-2.png";
import witchCastE3 from "./assets/tenders/witch-cast-e-3.png";
import witchCastE4 from "./assets/tenders/witch-cast-e-4.png";
import witchCastN1 from "./assets/tenders/witch-cast-n-1.png";
import witchCastN2 from "./assets/tenders/witch-cast-n-2.png";
import witchCastN3 from "./assets/tenders/witch-cast-n-3.png";
import witchCastN4 from "./assets/tenders/witch-cast-n-4.png";
import sageCastS1 from "./assets/tenders/sage-cast-s-1.png";
import sageCastS2 from "./assets/tenders/sage-cast-s-2.png";
import sageCastS3 from "./assets/tenders/sage-cast-s-3.png";
import sageCastS4 from "./assets/tenders/sage-cast-s-4.png";
import sageCastE1 from "./assets/tenders/sage-cast-e-1.png";
import sageCastE2 from "./assets/tenders/sage-cast-e-2.png";
import sageCastE3 from "./assets/tenders/sage-cast-e-3.png";
import sageCastE4 from "./assets/tenders/sage-cast-e-4.png";
import sageCastN1 from "./assets/tenders/sage-cast-n-1.png";
import sageCastN2 from "./assets/tenders/sage-cast-n-2.png";
import sageCastN3 from "./assets/tenders/sage-cast-n-3.png";
import sageCastN4 from "./assets/tenders/sage-cast-n-4.png";
export type TenderClassId = "warden" | "runewright" | "binder" | "witch" | "sage";
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
    id: "runewright", label: "Runewright", icon: "🪶", idle: runewright41, flip: { NW: true },
    dirs: {
      E: [runewright42, runewright43, runewright44], SE: [runewright57, runewright58, runewright59, runewright60], S: [runewright53, runewright54, runewright55, runewright56],
      SW: [runewright61, runewright62], W: [runewright45, runewright46], NW: [runewright42, runewright43, runewright44],
      N: [runewright47, runewright48], NE: [runewright49, runewright50, runewright51, runewright52],
    },
  },
  binder: {
    id: "binder", label: "Binder", icon: "🦌", idle: binder21, flip: { W: true, NW: true },
    dirs: {
      E: [binder22, binder23, binder24], SE: [binder37, binder38, binder39, binder40], S: [binder33, binder34, binder35, binder36],
      SW: [binder41, binder42], W: [binder22, binder23], NW: [binder22, binder23, binder24],
      N: [binder31, binder32], NE: [binder22, binder23, binder24],
    },
  },
  witch: {
    id: "witch", label: "Witch", icon: "🌿", idle: witch01, flip: { W: true },
    dirs: {
      E: [witch09, witch10, witch11, witch12, witch13, witch14, witch15, witch16], SE: [witch01, witch02, witch03, witch04, witch05, witch06, witch07, witch08], S: [witch01, witch02, witch03, witch04, witch05, witch06, witch07, witch08],
      SW: [witch01, witch02, witch03, witch04, witch05, witch06, witch07, witch08], W: [witch09, witch10], NW: [witch17, witch18, witch19, witch20, witch21, witch22, witch23, witch24],
      N: [witch17, witch18, witch19, witch20, witch21, witch22, witch23, witch24], NE: [witch17, witch18, witch19, witch20, witch21, witch22, witch23, witch24],
    },
  },
  sage: {
    id: "sage", label: "Sage", icon: "🐺", idle: sage01, flip: { W: true },
    dirs: {
      E: [sage09, sage10, sage11, sage12, sage13, sage14, sage15, sage16], SE: [sage01, sage02, sage03, sage04, sage05, sage06, sage07, sage08], S: [sage01, sage02, sage03, sage04, sage05, sage06, sage07, sage08],
      SW: [sage01, sage02, sage03, sage04, sage05, sage06, sage07, sage08], W: [sage09, sage10], NW: [sage17, sage18, sage19, sage20, sage21, sage22, sage23, sage24],
      N: [sage17, sage18, sage19, sage20, sage21, sage22, sage23, sage24], NE: [sage17, sage18, sage19, sage20, sage21, sage22, sage23, sage24],
    },
  },
};

export const TENDER_CLASS_ORDER: TenderClassId[] = ["warden", "runewright", "binder", "witch", "sage"];

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

/** CASTING (Nigel, 2026-10-19): each class casts true to its
 *  design — the Warden's glyph-staff flares, the Runewright's
 *  banner streams glyphs off his back, the Binder's ring-staff
 *  lights green-gold. Four beats (ready, raise, release,
 *  settle) in three facings; west is east mirrored, diagonals
 *  borrow the facing they lean toward. */
export interface TenderCastArt { S: string[]; E: string[]; N: string[] }
export const TENDER_CASTS: Record<TenderClassId, TenderCastArt> = {
  warden: {
    S: [wardenCastS1, wardenCastS2, wardenCastS3, wardenCastS4],
    E: [wardenCastE1, wardenCastE2, wardenCastE3, wardenCastE4],
    N: [wardenCastN1, wardenCastN2, wardenCastN3, wardenCastN4],
  },
  runewright: {
    S: [runewrightCastS1, runewrightCastS2, runewrightCastS3, runewrightCastS4],
    E: [runewrightCastE1, runewrightCastE2, runewrightCastE3, runewrightCastE4],
    N: [runewrightCastN1, runewrightCastN2, runewrightCastN3, runewrightCastN4],
  },
  binder: {
    S: [binderCastS1, binderCastS2, binderCastS3, binderCastS4],
    E: [binderCastE1, binderCastE2, binderCastE3, binderCastE4],
    N: [binderCastN1, binderCastN2, binderCastN3, binderCastN4],
  },
  witch: {
    S: [witchCastS1, witchCastS2, witchCastS3, witchCastS4],
    E: [witchCastE1, witchCastE2, witchCastE3, witchCastE4],
    N: [witchCastN1, witchCastN2, witchCastN3, witchCastN4],
  },
  sage: {
    S: [sageCastS1, sageCastS2, sageCastS3, sageCastS4],
    E: [sageCastE1, sageCastE2, sageCastE3, sageCastE4],
    N: [sageCastN1, sageCastN2, sageCastN3, sageCastN4],
  },
};
export const CAST_MS = 950;
const CAST_BEATS = [0, 160, 400, 680];
/** The casting frame at an elapsed moment, or null when the
 *  gesture has run its course. */
export function tenderCastPose(art: TenderClassArt, dir: TenderDir, elapsed: number): { src: string; flip: boolean } | null {
  if (elapsed < 0 || elapsed >= CAST_MS) return null;
  let beat = 0;
  for (let i = 0; i < CAST_BEATS.length; i++) if (elapsed >= CAST_BEATS[i]) beat = i;
  const cast = TENDER_CASTS[art.id];
  if (dir === "N" || dir === "NE" || dir === "NW") return { src: cast.N[beat], flip: false };
  if (dir === "E") return { src: cast.E[beat], flip: false };
  if (dir === "W") return { src: cast.E[beat], flip: true };
  return { src: cast.S[beat], flip: false };
}
