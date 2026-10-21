import { sqlite } from "./store.js";
import { fxSum, partyLevelFor } from "./skills.js";

/**
 * THE PARTY (Nigel, 2026-10-20 13:35 — the March Orders +
 * Party ruling; built 2026-10-21). The membership ledger:
 * one row in tender_party per Awokin standing in a Tender's
 * party. Membership is a fact about the Tender and the
 * creature, independent of either ground — a member stands
 * in the party on the Zodiac tab and follows its Tender;
 * an Awokin given orders leaves the party (the order roads
 * on both grounds call removePartyMember). The deck hosts
 * the whole roster; the party is drawn from it.
 *
 * THE WIDTH IS THE PARTY LEVEL'S RECKONING (Nigel,
 * 2026-10-21 11:41, corrected 11:42 — "party starts at 3.
 * + 1 every 3 levels plus skills bonus"; this replaced
 * build 1's band-law pencil the same morning): the party
 * level is a SKILL — the Party stars on the Zodiac, bought
 * with ordinary skill points, each star one level — and the
 * spots are reckoned exactly as: 3 to start, +1 for every
 * 3 party levels, plus the skills bonus (the Muster
 * clauses: the Escort, the Pennant, the Retinue, the Whole
 * Muster, as they already stand summed in skills.ts). The
 * Table's standing-band cap (companyCapFor) is a different
 * count and keeps its own law; only the party's width
 * changed its source. partyCapFor's shape did not change —
 * every reader from build 1 and build 2 reads this same
 * function.
 *
 * These primitives run on the raw handle, synchronously —
 * the Table's state builder reads membership inside its
 * per-seat payload, where nothing is awaited.
 */

/** The party's member creature ids, in the order they joined. */
export function partyIdsFor(ownerKey: string | null | undefined): number[] {
  if (!ownerKey) return [];
  const rows = sqlite.prepare(
    "SELECT awakened_id FROM tender_party WHERE owner_key = ? ORDER BY added_at ASC, awakened_id ASC",
  ).all(ownerKey) as { awakened_id: number }[];
  return rows.map(r => r.awakened_id);
}

export function isPartyMember(ownerKey: string | null | undefined, awakenedId: number): boolean {
  if (!ownerKey || !awakenedId) return false;
  const row = sqlite.prepare(
    "SELECT 1 AS one FROM tender_party WHERE owner_key = ? AND awakened_id = ?",
  ).get(ownerKey, awakenedId) as { one: number } | undefined;
  return !!row;
}

/** The party's width, reckoned in its parts — the one
 *  formula, named in plain words wherever a player sees it:
 *  3 spots to start, +1 for every 3 party levels, plus the
 *  Muster stars' bonus. */
export interface PartyCount { base: number; partyLevel: number; levelBonus: number; musterBonus: number; cap: number }
export function partyCountFor(ownerKey: string | null | undefined): PartyCount {
  const partyLevel = partyLevelFor(ownerKey);
  const levelBonus = Math.floor(partyLevel / 3);
  const musterBonus = fxSum(ownerKey, "company");
  return { base: 3, partyLevel, levelBonus, musterBonus, cap: 3 + levelBonus + musterBonus };
}

/** How wide this Tender's party stands. The tenderLevel
 *  argument stands in the signature because every reader
 *  was built passing it; the reckoning itself no longer
 *  reads the Tender's level — the party level is its own
 *  skill (Nigel, 2026-10-21). */
export function partyCapFor(ownerKey: string | null | undefined, _tenderLevel?: number | null): number {
  return partyCountFor(ownerKey).cap;
}

export type PartyAddResult = { ok: true } | { ok: false; reason: string };

/**
 * Add a creature of the Tender's own roster to the party.
 * The refusal is whole and spoken plainly: not theirs,
 * already standing in the party, or the party full at the
 * reckoned width. Nothing is written on a refusal.
 */
export function tryAddPartyMember(ownerKey: string, awakenedId: number, tenderLevel?: number | null): PartyAddResult {
  const aw = sqlite.prepare("SELECT name, owner_key FROM awakened WHERE id = ?")
    .get(awakenedId) as { name: string; owner_key: string | null } | undefined;
  if (!aw || aw.owner_key !== ownerKey) {
    return { ok: false, reason: "That Awokin is not yours to add to your party." };
  }
  if (isPartyMember(ownerKey, awakenedId)) {
    return { ok: false, reason: `${aw.name} already stands in your party.` };
  }
  const count = partyCountFor(ownerKey);
  if (partyIdsFor(ownerKey).length >= count.cap) {
    return {
      ok: false,
      reason: `Your party stands full — ${count.cap} strong. The spots are reckoned: 3 to start, +1 for every 3 party levels (your Party skill stands at level ${count.partyLevel}, +${count.levelBonus}), +${count.musterBonus} from your Muster stars. Raise the Party skill on the Zodiac, or return a member to the deck to make room.`,
    };
  }
  sqlite.prepare("INSERT INTO tender_party (owner_key, awakened_id, added_at) VALUES (?, ?, ?)")
    .run(ownerKey, awakenedId, Date.now());
  return { ok: true };
}

/**
 * Take a creature out of the party — back to the deck when
 * benched, or out under orders when an order road calls.
 * Returns true when a membership actually stood to remove.
 */
export function removePartyMember(ownerKey: string | null | undefined, awakenedId: number): boolean {
  if (!ownerKey || !awakenedId) return false;
  const r = sqlite.prepare("DELETE FROM tender_party WHERE owner_key = ? AND awakened_id = ?")
    .run(ownerKey, awakenedId);
  return r.changes > 0;
}
