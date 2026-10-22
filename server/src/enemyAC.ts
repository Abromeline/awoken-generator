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
 * on both grounds.
 *
 * This module stands alone (it imports only the store) so
 * both referees — actions.ts and table.ts, which import
 * each other — can read the law at module scope without a
 * circular-initialization hazard. */
import { sqlite } from "./store.js";

export const ENEMY_AC_BASE = 10;
export const ENEMY_ARMOR_DEFAULTS: Record<string, number> = { fray: 4, unraveler: 6, hollow: 5, tangle: 8 };

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
