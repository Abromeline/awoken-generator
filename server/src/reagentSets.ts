/* ── REAGENT EMPOWERMENT (Nigel, 2026-10-25 10:22; wired
 * 2026-10-25 on his live report of the same evening:
 * "reagents are not being counted towards spells or
 * consumed") ────────────────────────────────────────────
 * THE LAW (his words): "cast consume reagents. though
 * reagents only empower spell casting. if a caster has
 * all reagents for a spell it costs 50% less energy and
 * consumes the reagents instead. reagents also give the
 * caster +2 casting success. if all for the spell are
 * present."
 *
 * So: reagents NEVER gate a cast. Without the working's
 * full set, the cast is exactly the cast it has always
 * been — full price, nothing consumed, no bonus. With
 * the full set held at the cast, the cast is empowered:
 * half the energy, the set consumed, +2 on the casting
 * roll. The set is consumed when the cast is MADE —
 * fizzle or standing alike; the set powered the attempt,
 * and a fizzle's refunds (the Witch's miscast mercy, the
 * star's mercy) reckon against the energy actually
 * charged, as they already do everywhere.
 *
 * THE SETS are the per-page lines of record
 * (~/workspace/spellbook-design/reagent-list-of-record.md,
 * set by Nigel 2026-10-25 10:37 from the Homage Book),
 * transcribed below by the working's key in the book —
 * quantities included. A page the record left blank
 * carries NO set here: Twin Standard, Star Engine,
 * Beacon and Black Gate stand in the book with no line,
 * and no line is invented for them.
 *
 * THE NAMED READINGS this wiring stands on (each flagged
 * in the build report for Nigel's striking):
 *   · SCOPE — every working WITH a line of record is
 *     empowered by it: spells, runes and wards alike,
 *     because their pages carry the lines. (The ruling's
 *     own word was "spells".)
 *   · ROUNDING — the halved price rounds UP to the whole
 *     point (empoweredCastPrice): the Tender never gains
 *     from rounding.
 *   · THE WITCH'S COMPOSITION — the halving is read off
 *     the cast's FINAL charged energy, after her company
 *     price has computed hers (the cast doors apply
 *     empoweredCastPrice to the price the Witch's gift
 *     already reckoned); her fizzle refunds reckon
 *     against the charged figure, untouched.
 *   · THE COIL LINE STANDS UNSPENT — the record carries
 *     a line for "Coil" (Tidewater ×1, Sky Salt ×1) AND
 *     names "Winged Coil" among the five blank pages.
 *     The book holds ONE coil working, filed under the
 *     Winged Coil's own root ("The Winged Coil"), so no
 *     set is attached to the coil's key here: a page the
 *     record named blank does not gain a line by a
 *     keeper's hand. The "Coil" line waits for Nigel's
 *     word on which page it belongs to.
 *   · RUNE SHATTER'S STREAM — the empowerment halves
 *     the cast's charge at the cast door, as for every
 *     working. A held Shatter's per-second stream ticks
 *     are the standing working's own reckoning in the
 *     settle (actions.ts), not the cast's price, and are
 *     NOT halved here.
 *
 * The counting and the spending read the caster's own
 * inventory (tender_inventory) — the one pouch. The
 * Rune Shard line reads the standing shard stack, as
 * reagentItemKey rules everywhere (drops.ts). */
import { sqlite } from "./store.js";
import { REAGENTS, reagentItemKey } from "./drops.js";

export interface ReagentSetLine { reagent: string; qty: number }

/** THE LINES OF RECORD, by the working's key in the
 *  book, in the record's own order. Pages with no line
 *  (the five blanks among them) are absent — absence IS
 *  the law for them. */
export const REAGENT_SETS: Record<string, readonly ReagentSetLine[]> = {
  // Shard Rain — Sky Salt ×2, Rune Shard ×1, Star Seed ×1
  shardrain: [
    { reagent: "sky-salt", qty: 2 },
    { reagent: "rune-shard", qty: 1 },
    { reagent: "star-seed", qty: 1 },
  ],
  // The Crown Shard — Star Seed ×2, Rune Shard ×2
  shard: [
    { reagent: "star-seed", qty: 2 },
    { reagent: "rune-shard", qty: 2 },
  ],
  // Bats — Shadow Matter (bottled) ×1, Hollow Silk ×1
  bats: [
    { reagent: "shadow-matter", qty: 1 },
    { reagent: "hollow-silk", qty: 1 },
  ],
  // Hold Rune — Rune Shard ×2, Stone Dust ×1
  holdrune: [
    { reagent: "rune-shard", qty: 2 },
    { reagent: "stone-dust", qty: 1 },
  ],
  // Rune Shatter — Rune Shard ×1, Ember Ash ×2
  shatter: [
    { reagent: "rune-shard", qty: 1 },
    { reagent: "ember-ash", qty: 2 },
  ],
  // Single Blade — Rune Shard ×1, Fray Ash ×1
  blade: [
    { reagent: "rune-shard", qty: 1 },
    { reagent: "fray-ash", qty: 1 },
  ],
  // Seal — Tidewater ×2, Moon Petal ×1
  seal: [
    { reagent: "tidewater", qty: 2 },
    { reagent: "moon-petal", qty: 1 },
  ],
  // Twin Trees — Root Sap ×2, Moon Petal ×1
  trees: [
    { reagent: "root-sap", qty: 2 },
    { reagent: "moon-petal", qty: 1 },
  ],
  // Lattice — Stone Dust ×2, Rune Shard ×1
  lattice: [
    { reagent: "stone-dust", qty: 2 },
    { reagent: "rune-shard", qty: 1 },
  ],
  // Springleaf — Root Sap ×1, Dream Shroom ×2
  springleaf: [
    { reagent: "root-sap", qty: 1 },
    { reagent: "dream-shroom", qty: 2 },
  ],
  // Bulwark — Stone Dust ×2, Ember Ash ×1
  bulwark: [
    { reagent: "stone-dust", qty: 2 },
    { reagent: "ember-ash", qty: 1 },
  ],
};

/** The empowerment's gift on the casting roll (the
 *  law's own figure: +2 casting success). */
export const REAGENT_EMPOWERMENT_BONUS = 2;

export interface ReagentEmpowerment {
  /** True when the page carries a line AND the caster
   *  holds every reagent of it, quantities included. */
  active: boolean;
  /** The set as inventory lines, in the record's order —
   *  the item key each reagent stacks under (the Rune
   *  Shard under its standing stack), its spoken name,
   *  and the quantity the cast consumes. Empty when the
   *  page carries no line at all. */
  lines: { itemKey: string; name: string; qty: number }[];
}

/** Count the caster's pouch against the working's line
 *  of record. A page with no line is never empowered;
 *  a partial set is no set — the cast stands unempowered
 *  and nothing is marked for spending. */
export function reagentEmpowermentFor(ownerKey: string, spellKey: string): ReagentEmpowerment {
  const set = REAGENT_SETS[spellKey];
  if (!set) return { active: false, lines: [] };
  const lines = set.map((l) => ({
    itemKey: reagentItemKey(l.reagent),
    name: REAGENTS.find((r) => r.key === l.reagent)?.name ?? l.reagent,
    qty: l.qty,
  }));
  for (const line of lines) {
    const row = sqlite.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?")
      .get(ownerKey, line.itemKey) as { qty: number } | undefined;
    if (!row || Number(row.qty) < line.qty) return { active: false, lines };
  }
  return { active: true, lines };
}

/** Spend the set out of the caster's pouch. Called only
 *  for an empowerment counted active at the same cast,
 *  at the moment the cast's charge lands; each line's
 *  spend is guarded by the quantity standing there, so
 *  a pouch that changed between the count and the
 *  charge can never be spent below zero. */
export function consumeReagentSet(ownerKey: string, lines: readonly { itemKey: string; qty: number }[]): void {
  const now = Date.now();
  for (const line of lines) {
    sqlite.prepare("UPDATE tender_inventory SET qty = qty - ?, updated_at = ? WHERE owner_key = ? AND item_key = ? AND qty >= ?")
      .run(line.qty, now, ownerKey, line.itemKey, line.qty);
  }
}

/** The empowered price of a cast: half its final
 *  reckoned price, rounded UP to the whole point — the
 *  Tender never gains from rounding. An unempowered
 *  cast's price passes through untouched. */
export function empoweredCastPrice(empowerment: { active: boolean }, price: number): number {
  return empowerment.active ? Math.ceil(price / 2) : price;
}
