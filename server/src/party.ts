import { sqlite } from "./store.js";
import { companyCapFor } from "./skills.js";

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
 * THE WIDTH IS THE BAND LAW (the Keeper's pencil, standing
 * until Nigel rules otherwise): party size = the Travelling
 * Company's numbers — companyCapFor: three at Lv 1–2, four
 * at Lv 3–5, the true five from Lv 6, and the Muster clauses
 * (the Escort, the Pennant, the Retinue, the Whole Muster)
 * raising it toward 15 where the tree grants them. No second
 * table of numbers lives here.
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

/** How wide this Tender's party stands — the band law itself. */
export function partyCapFor(ownerKey: string | null | undefined, tenderLevel?: number | null): number {
  return companyCapFor(ownerKey, tenderLevel);
}

export type PartyAddResult = { ok: true } | { ok: false; reason: string };

/**
 * Add a creature of the Tender's own roster to the party.
 * The refusal is whole and spoken plainly: not theirs,
 * already standing in the party, or the party full at the
 * band law's width. Nothing is written on a refusal.
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
  const cap = partyCapFor(ownerKey, tenderLevel);
  if (partyIdsFor(ownerKey).length >= cap) {
    return {
      ok: false,
      reason: `Your party stands full — ${cap} strong. Levels widen it (three at Lv 1, four at Lv 3, the true five at Lv 6), and the Muster roads widen it further. Return a member to the deck to make room.`,
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
