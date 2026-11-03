// ── SPELL POINTS, CONDENSED FROM SHADOW MATTER ──────────
// (Nigel, 2026-11-03 08:45 + 09:56)
//
// "I have access to all spells because I haven't been
// prompted to pick any. Spells should only be available if
// spell points have been spent to cast them." — and then
// the economy he ruled for earning them: "lets make shadow
// matter a resource that can be condensed into spell
// points. 1000 shadow matter is 1 spell point. unlocking
// spells cost 1. free 2. 500 shadow matter 3. 1,000 shadow
// matter 4. 2,000. 5. 5,000 6. 7,000 7. 10,000 8. 13,000
// 9. 16,000 etc."
//
// THE LAW AS BUILT:
//  · A page of the Grimoire is castable only once it stands
//    UNLOCKED for its Tender. Unlocking a page costs exactly
//    1 spell point, once, and stands forever (no release or
//    refund was ever ruled, and none is offered).
//  · Spell points are earned by CONDENSING Shadow Matter —
//    the hoard in tender_progress.shadow_matter, the same
//    stock the lighthouse drinks — into the Grimoire's vial.
//    Each successive point costs its rung of the ladder:
//    the FIRST point is FREE (it is simply granted — the
//    starting point of record), then 500, 1,000, 2,000,
//    5,000, 7,000, 10,000, 13,000, 16,000, and +3,000 per
//    point thereafter. (His "1000 shadow matter is 1 spell
//    point" names the exchange's scale; the ladder is the
//    price list he dictated with it.)
//  · Feeding the vial: one click feeds as much Shadow
//    Matter as the vial still needs toward the next rung,
//    or as much as the stock holds, whichever is less. What
//    is fed is COMMITTED — it stands in the vial across
//    sittings and is not refunded by closing the book. When
//    the vial reaches the rung, exactly that rung's price
//    is consumed, +1 point banks, the vial empties, and one
//    condensing record is written to the ledger.
//  · THE DOOR'S SPELL (ENTRANCE BUILD 1) stands outside
//    this whole economy: granted by the door's own record
//    (visitors.entrance_spell), castable without an unlock,
//    consuming no point, counting nowhere on the ladder.
//    The cast doors judge it before they ever reach here.
//  · No grandfathering: a Tender who cast freely before
//    this law (because no prompt ever stood) opens the book
//    to the same standing as anyone — the free first point
//    ready to spend, every page locked until unlocked.
//
// State: spell_point_state (points earned + the vial's
// fed standing), spell_unlocks (the pages woken — presence
// IS the unlock), spell_point_ledger (the written record:
// the free grant, one record per condensed milestone, one
// per unlock). All reckoning is server-side over the sync
// sqlite handle, in transactions — no client number is
// ever trusted, and a double-click or a re-read can never
// bank a point twice: the milestone is judged inside the
// same transaction that moves the matter.

import { sqlite } from "./store.js";

/** The ladder's named rungs: the price in Shadow Matter of
 *  the Nth spell point a Tender ever earns (1-based). The
 *  first point is free. Past the ninth the price climbs
 *  +3,000 a rung, as his "etc." directs. */
const LADDER_RUNGS: Record<number, number> = {
  1: 0,
  2: 500,
  3: 1000,
  4: 2000,
  5: 5000,
  6: 7000,
  7: 10000,
  8: 13000,
  9: 16000,
};

export function spellPointPriceFor(pointNumber: number): number {
  const n = Math.max(1, Math.floor(pointNumber));
  if (n <= 9) return LADDER_RUNGS[n];
  return 16000 + 3000 * (n - 9);
}

/** Shadow Matter is a REAL stock (the lighthouse drinks it
 *  in fractions); the vial's arithmetic carries a hair of
 *  tolerance so a milestone judged reached is reached. */
const EPS = 1e-6;

interface SpellPointStateRow { points_earned: number; vial_fed: number }

/** Lay the state row if it has never stood — the free first
 *  point is granted in the same breath, and the grant is
 *  written to the ledger exactly once (INSERT OR IGNORE is
 *  the guard; a second materialisation changes nothing). */
function ensureSpellPointState(ownerKey: string): SpellPointStateRow {
  const now = Date.now();
  const lay = sqlite.transaction(() => {
    const info = sqlite.prepare(
      "INSERT OR IGNORE INTO spell_point_state (owner_key, points_earned, vial_fed, updated_at) VALUES (?, 1, 0, ?)",
    ).run(ownerKey, now);
    if (info.changes > 0) {
      sqlite.prepare(
        "INSERT INTO spell_point_ledger (owner_key, kind, shadow_matter, spell_key, created_at) VALUES (?, 'free', 0, NULL, ?)",
      ).run(ownerKey, now);
    }
  });
  lay();
  const row = sqlite.prepare(
    "SELECT points_earned, vial_fed FROM spell_point_state WHERE owner_key = ?",
  ).get(ownerKey) as SpellPointStateRow;
  return { points_earned: row.points_earned, vial_fed: row.vial_fed };
}

/** The Shadow Matter the Tender's hoard holds right now —
 *  the same stock the lighthouse upkeep reads. */
export function shadowMatterHeld(ownerKey: string): number {
  const row = sqlite.prepare("SELECT shadow_matter AS shadow FROM tender_progress WHERE owner_key = ?")
    .get(ownerKey) as { shadow: number } | undefined;
  return Math.max(0, Number(row?.shadow) || 0);
}

/** The pages of the book this Tender has unlocked, in the
 *  order they were woken. */
export function unlockedSpellKeys(ownerKey: string): string[] {
  ensureSpellPointState(ownerKey);
  const rows = sqlite.prepare(
    "SELECT spell_key FROM spell_unlocks WHERE owner_key = ? ORDER BY unlocked_at ASC, spell_key ASC",
  ).all(ownerKey) as { spell_key: string }[];
  return rows.map((r) => r.spell_key);
}

/** Whether one page stands unlocked for this Tender — the
 *  question every cast door on both grounds asks. */
export function spellUnlocked(ownerKey: string, spellKey: string): boolean {
  ensureSpellPointState(ownerKey);
  const row = sqlite.prepare(
    "SELECT spell_key FROM spell_unlocks WHERE owner_key = ? AND spell_key = ?",
  ).get(ownerKey, spellKey);
  return !!row;
}

export interface SpellPointView {
  /** Points banked and unspent — the gold button's number. */
  available: number;
  /** Points ever earned (the free one + every condensed). */
  earned: number;
  /** Points ever spent on unlocks. */
  spent: number;
  /** The pages standing unlocked, in waking order. */
  unlocked: string[];
  /** Shadow Matter standing in the vial toward the next point. */
  vialFed: number;
  /** The next point's ladder price — the vial's size. */
  nextPrice: number;
  /** Which point the vial is filling (earned + 1). */
  nextPoint: number;
  /** The Shadow Matter stock the vial would drink from. */
  shadowMatter: number;
}

/** The whole standing, as the Grimoire serves it. */
export function spellPointView(ownerKey: string): SpellPointView {
  const state = ensureSpellPointState(ownerKey);
  const unlocked = unlockedSpellKeys(ownerKey);
  return {
    available: state.points_earned - unlocked.length,
    earned: state.points_earned,
    spent: unlocked.length,
    unlocked,
    vialFed: state.vial_fed,
    nextPrice: spellPointPriceFor(state.points_earned + 1),
    nextPoint: state.points_earned + 1,
    shadowMatter: shadowMatterHeld(ownerKey),
  };
}

export type FeedResult =
  | { ok: false; reason: string }
  | { ok: true; fed: number; condensed: boolean; view: SpellPointView };

/** FEED THE VIAL (one click): move as much Shadow Matter as
 *  the vial still needs toward the next rung — or as much
 *  as the stock holds, if less — out of the hoard and into
 *  the vial. Reaching the rung consumes exactly the rung's
 *  price, banks +1 point, empties the vial, and writes the
 *  milestone's one condensing record. The whole reckoning
 *  is one transaction: the stock, the vial, the banked
 *  point and the record can never disagree, and no second
 *  click can bank the same milestone twice. */
export function feedSpellVial(ownerKey: string): FeedResult {
  ensureSpellPointState(ownerKey);
  let fed = 0;
  let condensed = false;
  const run = sqlite.transaction(() => {
    const state = sqlite.prepare(
      "SELECT points_earned, vial_fed FROM spell_point_state WHERE owner_key = ?",
    ).get(ownerKey) as SpellPointStateRow;
    const price = spellPointPriceFor(state.points_earned + 1);
    const needed = price - state.vial_fed;
    const stock = shadowMatterHeld(ownerKey);
    if (needed <= EPS) {
      // The vial already stands at its rung (a breath from
      // a settle that banked it) — judge it condensed
      // without drinking anything more.
      sqlite.prepare(
        "UPDATE spell_point_state SET points_earned = points_earned + 1, vial_fed = 0, updated_at = ? WHERE owner_key = ?",
      ).run(Date.now(), ownerKey);
      sqlite.prepare(
        "INSERT INTO spell_point_ledger (owner_key, kind, shadow_matter, spell_key, created_at) VALUES (?, 'condense', ?, NULL, ?)",
      ).run(ownerKey, price, Date.now());
      condensed = true;
      return;
    }
    fed = Math.min(needed, stock);
    if (fed <= 0) return;
    sqlite.prepare(
      "UPDATE tender_progress SET shadow_matter = shadow_matter - ? WHERE owner_key = ?",
    ).run(fed, ownerKey);
    const vialNow = state.vial_fed + fed;
    if (vialNow >= price - EPS) {
      sqlite.prepare(
        "UPDATE spell_point_state SET points_earned = points_earned + 1, vial_fed = 0, updated_at = ? WHERE owner_key = ?",
      ).run(Date.now(), ownerKey);
      sqlite.prepare(
        "INSERT INTO spell_point_ledger (owner_key, kind, shadow_matter, spell_key, created_at) VALUES (?, 'condense', ?, NULL, ?)",
      ).run(ownerKey, price, Date.now());
      condensed = true;
    } else {
      sqlite.prepare(
        "UPDATE spell_point_state SET vial_fed = ?, updated_at = ? WHERE owner_key = ?",
      ).run(vialNow, Date.now(), ownerKey);
    }
  });
  run();
  if (fed <= 0 && !condensed) {
    return {
      ok: false,
      reason: "Your Shadow Matter stands empty — the vial has nothing to drink. Shadow Matter gathers where the dark is beaten back; the lighthouse's hoard is the vial's too.",
    };
  }
  return { ok: true, fed, condensed, view: spellPointView(ownerKey) };
}

export type UnlockResult =
  | { ok: false; reason: string }
  | { ok: true; already: boolean; view: SpellPointView };

/** UNLOCK A PAGE (one spell point): the page wakes for this
 *  Tender, permanently. Refused whole when no point stands
 *  ready; an already-woken page is answered as it stands,
 *  never charged twice. The caller (the book's door) has
 *  already judged the page is in the book. */
export function unlockSpell(ownerKey: string, spellKey: string): UnlockResult {
  ensureSpellPointState(ownerKey);
  let already = false;
  let refused = false;
  const run = sqlite.transaction(() => {
    const standing = sqlite.prepare(
      "SELECT spell_key FROM spell_unlocks WHERE owner_key = ? AND spell_key = ?",
    ).get(ownerKey, spellKey);
    if (standing) { already = true; return; }
    const state = sqlite.prepare(
      "SELECT points_earned FROM spell_point_state WHERE owner_key = ?",
    ).get(ownerKey) as { points_earned: number };
    const spent = (sqlite.prepare(
      "SELECT COUNT(*) AS n FROM spell_unlocks WHERE owner_key = ?",
    ).get(ownerKey) as { n: number }).n;
    if (state.points_earned - spent < 1) { refused = true; return; }
    sqlite.prepare(
      "INSERT INTO spell_unlocks (owner_key, spell_key, unlocked_at) VALUES (?, ?, ?)",
    ).run(ownerKey, spellKey, Date.now());
    sqlite.prepare(
      "INSERT INTO spell_point_ledger (owner_key, kind, shadow_matter, spell_key, created_at) VALUES (?, 'unlock', 0, ?, ?)",
    ).run(ownerKey, spellKey, Date.now());
  });
  run();
  if (refused) {
    return {
      ok: false,
      reason: "No spell point stands ready — condense Shadow Matter in the Grimoire's vial to earn one, then wake this page.",
    };
  }
  return { ok: true, already, view: spellPointView(ownerKey) };
}
