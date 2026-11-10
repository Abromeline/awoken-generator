/* ── ENEMY AC (Nigel, 2026-10-22) ──────────────────────────
 * A hit is declared by d20 + attack or spell bonus against
 * the target's AC; only then is damage calculated, by the
 * AC ratio equation with the SAME AC as its armor term —
 * one number serves both ("damage is calculate by the ac
 * ratio equation after hit is declared"). An enemy's AC is
 * base 10 + its kind's AC bonus, and the bonus lives on the
 * enemy's workshop record — ui_config `enemy.<kind>.armor`,
 * edited beside its Power and HP — with these defaults as
 * the record's fallback. Every referee reads the record
 * through enemyACFor, so a workshop edit moves the target
 * on both grounds. (The defaults below carry Nigel's
 * ruling of 2026-10-22 16:49 — \"drop all enemy AC by 3\" —
 * read off the bonuses: the base stays 10 for all kinds,
 * so Fray +1 · Hollow +2 · Unraveler +3 · Tangle +5, and
 * the totals a player faces are 11 / 12 / 13 / 15.)
 *
 * This module stands alone (it imports only the store) so
 * both referees — actions.ts and table.ts, which import
 * each other — can read the law at module scope without a
 * circular-initialization hazard. */
import { sqlite } from "./store.js";

export const ENEMY_AC_BASE = 10;
export const ENEMY_ARMOR_DEFAULTS: Record<string, number> = { fray: 1, unraveler: 3, hollow: 2, tangle: 5 };

/** A dark kind's AC bonus as the workshop record holds it
 *  (the default above when the record is silent or garbled). */
export function enemyArmorBonus(kind: string): number {
  const def = ENEMY_ARMOR_DEFAULTS[kind] ?? 5;
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(`enemy.${kind}.armor`) as { value: string } | undefined;
    if (!row) return def;
    const v = JSON.parse(row.value);
    return typeof v === "number" && Number.isFinite(v) ? v : def;
  } catch { return def; }
}

/** A dark kind's full AC before wave/column scaling: the
 *  base 10 + its recorded bonus. */
export function enemyACFor(kind: string): number {
  return ENEMY_AC_BASE + enemyArmorBonus(kind);
}

/** THE DISTANCE TOLL (Nigel, 2026-11-10): "each hex beyond
 *  this first increases target ac by 1." An Awokin's ELEMENT
 *  strike pays for its reach: the target's AC rises by one
 *  for every whole hex of the strike's distance past the
 *  first. The raised number is the ONE number both masters
 *  read — the hit is declared against it (d20 + bonus) and
 *  the AC ratio equation then shaves by the SAME number as
 *  its armor term, exactly as the base AC has always served
 *  both. The toll is reckoned ONCE, here, and both referees
 *  (the homeland's Awoken Answer in actions.ts, the Table's
 *  strikeOnce in table.ts) read it through this one door —
 *  never a scattered addition at a roll site.
 *
 *  Who pays: ELEMENT strikes only, as spoken. The Tender's
 *  weapon shots (the arrow doubled to 8 like the rest) and
 *  the Tender's own casts pay nothing — their AC stands at
 *  the base. The distance arrives as WHOLE hexes: each
 *  ground counts the hexes between the hex the striker
 *  stands on and the hex the target stands on (the
 *  homeland rounds both stands to their hexes and reads
 *  its axial distance; the Table reads its hexDist) — the
 *  rounding here only guards a fractional caller. */
export function strikeTargetAcFor(baseAc: number, distanceHexes: number): number {
  return baseAc + Math.max(0, Math.round(distanceHexes) - 1);
}
