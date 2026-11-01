// THE DOOR — ENTRANCE BUILD 1 (Nigel's build word, 2026-11-01:
// "Build the entrance now"; the design: five-minute-entrance-spec-
// 2026-10-31.md + the seven RULINGS of 2026-11-01).
//
// A NEW player's entrance on the homeland, in Nigel's order:
// sign in → account name → password → choose class → choose
// spell → choose favourite weapon → BOOM, three Awoken wake at
// once → onto the field, the three fielded beside them → light
// the beacon → begin play.
//
// This module is the door's ledger: the mark on the visitor
// record, the step the account stands on, the chosen starting
// spell, and the award pool. The door's ACTIONS live in
// actions.ts beside the machinery they reuse; this file only
// reads and writes the mark, through the same sqlite handle
// the choosing itself uses, so no reader can drift from it.
//
// LEGACY LAW: the mark is laid ONLY at claim time, ONLY when
// the claim asks for the door, and NEVER on an account that
// adopts an already-welcomed soft visitor's state (that
// visitor already walks the old road). Every account without
// the mark — Nigel, his uncle, grandfathered soft visitors,
// accounts mid-old-intro — keeps the old road exactly: the
// greeting auto-seed, choosing at 3 woken, credits as they
// stand. Nothing in this file is ever called for them except
// the readers, which answer "not the door" and change nothing.
import { sqlite } from "./store.js";

/** The steps of the door, in Nigel's order. `done` = the three
 *  have woken and the player stands on their land in ordinary
 *  play; the award road that pays out the pool is Build 2. */
export type EntranceStep = "class" | "spell" | "weapon" | "wake" | "done";
export const ENTRANCE_STEPS: EntranceStep[] = ["class", "spell", "weapon", "wake", "done"];

/** THE SPELL CHOICE (Nigel's ruling, 2026-11-01): exactly
 *  three, by his names — Bats, Shard Rain, and Rune Hold. The
 *  keys are the Grimoire's own page keys: "bats" (Bats),
 *  "shardrain" (Shard Rain), "holdrune" (the Hold Rune —
 *  Nigel's door name for it is Rune Hold). */
export const ENTRANCE_SPELL_KEYS = ["bats", "shardrain", "holdrune"] as const;
export type EntranceSpellKey = (typeof ENTRANCE_SPELL_KEYS)[number];
export const ENTRANCE_SPELL_NAMES: Record<EntranceSpellKey, string> = {
  bats: "Bats",
  shardrain: "Shard Rain",
  holdrune: "Rune Hold",
};

/** The original 20, held as the entrance account's AWARD POOL
 *  (Nigel's refinements, 2026-10-31): recorded as theirs at the
 *  door, 0 spendable — Build 2's tutorial sections pay them
 *  out, 5 at a time. The door's three stand ON TOP of the 20
 *  (his ruling, 2026-11-01), so the pool is the full 20. */
export const ENTRANCE_AWARD_POOL = 20;

export interface EntranceState {
  entrance: boolean;
  step: EntranceStep | null;
  spellKey: string | null;
  awardPool: number;
}

const NOT_ENTRANCE: EntranceState = { entrance: false, step: null, spellKey: null, awardPool: 0 };

type EntranceRow = {
  entrance: number;
  entrance_step: string | null;
  entrance_spell: string | null;
  entrance_award_pool: number;
} | undefined;

function rowFor(ownerKey: string): EntranceRow {
  try {
    return sqlite.prepare(
      "SELECT entrance, entrance_step, entrance_spell, entrance_award_pool FROM visitors WHERE visitor_id = ?",
    ).get(ownerKey) as EntranceRow;
  } catch {
    return undefined;
  }
}

/** The door's standing for one owner key. Legacy accounts and
 *  unknown keys answer NOT_ENTRANCE — the old road. */
export function entranceStateFor(ownerKey: string): EntranceState {
  const row = rowFor(ownerKey);
  if (!row || row.entrance !== 1) return { ...NOT_ENTRANCE };
  const step = ENTRANCE_STEPS.includes(row.entrance_step as EntranceStep)
    ? (row.entrance_step as EntranceStep)
    : null;
  return {
    entrance: true,
    step,
    spellKey: row.entrance_spell ?? null,
    awardPool: row.entrance_award_pool ?? 0,
  };
}

export function isEntranceAccount(ownerKey: string): boolean {
  return entranceStateFor(ownerKey).entrance;
}

/** The starting spell this Tender chose at the door — the one
 *  working the Lv 3 ward/rune gate does not hold back for them
 *  (see castSpell in actions.ts). Null for everyone else. */
export function entranceSpellKeyFor(ownerKey: string): string | null {
  const s = entranceStateFor(ownerKey);
  return s.entrance ? s.spellKey : null;
}

/** Lay the mark at claim time: the account enters at the class
 *  step, its 20 recorded as an award pool (never as spendable
 *  credits — claimTender skips the welcome credit grant when
 *  this mark is laid), and the greeting's welcome marked
 *  received, because the greeter folds into the door's three
 *  (his ruling) and no greeting seeds for an entrance account.
 *  The visitors row must already exist (claimTender creates it
 *  on every road). */
export function markEntranceClaim(ownerKey: string): void {
  sqlite.prepare(
    `UPDATE visitors SET entrance = 1, entrance_step = 'class', entrance_spell = NULL,
       entrance_award_pool = ?, welcome_claimed = 1 WHERE visitor_id = ?`,
  ).run(ENTRANCE_AWARD_POOL, ownerKey);
}

/** Advance the door. Only ever moves FORWARD, one standing at
 *  a time, and only for marked accounts — a legacy key or a
 *  step already passed is a no-op, so the standing machinery
 *  (chooseWeapon, shared with the old road) can call the
 *  weapon-step advance without judging who walks it. */
export function advanceEntranceStep(ownerKey: string, from: EntranceStep, to: EntranceStep, spellKey?: string): boolean {
  const s = entranceStateFor(ownerKey);
  if (!s.entrance || s.step !== from) return false;
  if (spellKey !== undefined) {
    sqlite.prepare("UPDATE visitors SET entrance_step = ?, entrance_spell = ? WHERE visitor_id = ?")
      .run(to, spellKey, ownerKey);
  } else {
    sqlite.prepare("UPDATE visitors SET entrance_step = ? WHERE visitor_id = ?")
      .run(to, ownerKey);
  }
  return true;
}
