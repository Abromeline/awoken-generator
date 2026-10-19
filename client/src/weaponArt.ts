/**
 * THE RUNIC WEAPONS (Nigel, 2026-10-19): the Tender's own hand,
 * chosen with his class at Lv 3 — it floats at his side like an
 * Awokin and lunges on its own at what comes within its reach.
 *
 * The swords wear the game's own drawn blade (the Written Light
 * blade glyph — Nigel's sword, by his word). Spear, arrow and
 * shield are plain first sketches in the same ink, drawn on a
 * canvas at first load in the proving-ground demo's manner,
 * awaiting his hand. The arrow is a LONE arrow — no bow; it
 * hangs in the air and flies itself (Nigel, 2026-10-19).
 */
import bladeGlyph from "./assets/glyphs/blade.png";

export type WeaponKey = "swordshield" | "sword" | "spear" | "arrow";

export const WEAPON_ORDER: WeaponKey[] = ["swordshield", "sword", "spear", "arrow"];

export const WEAPONS: Record<WeaponKey, { name: string; die: number; note: string; blurb: string }> = {
  swordshield: {
    name: "Sword & Shield",
    die: 6,
    note: "+3 AC",
    blurb: "A blade to answer and a wall to stand behind — the hand that holds the line.",
  },
  sword: {
    name: "Sword",
    die: 10,
    note: "+1 AC",
    blurb: "The plain road: one bright edge, swung with everything behind it.",
  },
  spear: {
    name: "Spear",
    die: 6,
    note: "+1 range",
    blurb: "It strikes from a step farther back, where the dark must stretch to touch you.",
  },
  arrow: {
    name: "Arrow",
    die: 4,
    note: "range 4",
    blurb: "A single arrow that hangs in the air and flies itself at your foes.",
  },
};

/** The demo's ink pot: draw on an offscreen canvas, keep the
 *  data-URL. Browser only — module init in a document-less
 *  context (a stray server import) yields empty strings. */
function inkCanvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (!g) return "";
  draw(g);
  return c.toDataURL();
}

const SPEAR_IMG = inkCanvas(90, 150, (g) => {
  g.strokeStyle = "#a8823f"; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.moveTo(45, 40); g.lineTo(45, 142); g.stroke();
  g.strokeStyle = "rgba(60,40,10,.55)"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(47.5, 42); g.lineTo(47.5, 140); g.stroke();
  g.fillStyle = "#ffe9ad"; g.strokeStyle = "#8a6d35"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(45, 2); g.lineTo(57, 26); g.lineTo(45, 42); g.lineTo(33, 26); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "rgba(138,109,53,.8)"; g.beginPath(); g.moveTo(45, 6); g.lineTo(45, 38); g.stroke();
  g.strokeStyle = "#ffd977"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(38, 58); g.lineTo(52, 66); g.stroke();
  g.beginPath(); g.moveTo(52, 58); g.lineTo(38, 66); g.stroke();
});

/** A LONE ARROW, angled up-right as if already loosed — the
 *  arrow the demo laid across its bow, drawn by itself and
 *  larger: shaft, leaf head, fletching, one gold rune tick. */
const ARROW_IMG = inkCanvas(150, 110, (g) => {
  g.translate(75, 55); g.rotate(-Math.PI / 6); g.lineCap = "round";
  // The shaft, with its grain line.
  g.strokeStyle = "#e8dcc3"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-64, 0); g.lineTo(38, 0); g.stroke();
  g.strokeStyle = "rgba(60,40,10,.5)"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-62, 2.2); g.lineTo(36, 2.2); g.stroke();
  // The leaf head.
  g.fillStyle = "#ffe9ad"; g.strokeStyle = "#8a6d35"; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(30, 0); g.quadraticCurveTo(46, -10, 70, 0);
  g.quadraticCurveTo(46, 10, 30, 0); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "rgba(138,109,53,.8)"; g.beginPath(); g.moveTo(36, 0); g.lineTo(64, 0); g.stroke();
  // The fletching — two violet feathers at the tail.
  g.strokeStyle = "#b48be8"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-38, 0); g.lineTo(-60, -14); g.stroke();
  g.beginPath(); g.moveTo(-38, 0); g.lineTo(-60, 14); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-46, 0); g.lineTo(-62, -9); g.stroke();
  g.beginPath(); g.moveTo(-46, 0); g.lineTo(-62, 9); g.stroke();
  // One gold rune tick, mid-shaft — the mark that lets it fly itself.
  g.strokeStyle = "#ffd977"; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(-4, -8); g.lineTo(5, 0); g.lineTo(-4, 8); g.stroke();
});

const SHIELD_IMG = inkCanvas(100, 112, (g) => {
  g.fillStyle = "rgba(232,220,195,.07)"; g.strokeStyle = "#e8dcc3"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(50, 4); g.lineTo(92, 14); g.lineTo(92, 52);
  g.quadraticCurveTo(92, 88, 50, 107); g.quadraticCurveTo(8, 88, 8, 52);
  g.lineTo(8, 14); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = "rgba(216,178,92,.75)"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(50, 13); g.lineTo(83, 21); g.lineTo(83, 52);
  g.quadraticCurveTo(83, 81, 50, 97); g.quadraticCurveTo(17, 81, 17, 52);
  g.lineTo(17, 21); g.closePath(); g.stroke();
  g.strokeStyle = "#ffd977"; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(50, 34); g.lineTo(64, 52); g.lineTo(50, 70); g.lineTo(36, 52); g.closePath(); g.stroke();
  g.fillStyle = "#ffd977"; g.beginPath(); g.arc(50, 52, 3.4, 0, 7); g.fill();
});

/** The weapon's picture: the game's own blade glyph for the two
 *  swords, the ink sketches for spear and the lone arrow. */
export function weaponImg(key: WeaponKey): string {
  switch (key) {
    case "swordshield":
    case "sword":
      return bladeGlyph;
    case "spear":
      return SPEAR_IMG;
    case "arrow":
      return ARROW_IMG;
  }
}

/** The shield that rides opposite the Sword & Shield. */
export function shieldImg(): string {
  return SHIELD_IMG;
}
