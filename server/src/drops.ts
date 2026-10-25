/**
 * THE DROP TABLE (Nigel, rates ruled 2026-10-23 09:23;
 * reagents ruled 13:18 the same day; Shadow amount 09:30;
 * commissioned 2026-10-25 01:05 — "Yes implement it") —
 * what a felled enemy leaves behind on the homeland, and
 * the pack it gathers in.
 *
 * THE TABLE, per felled enemy, each class its own roll:
 * rune shards 10% · items 35% · relics 5% · energy 20% ·
 * alchemy ingredients 10% · Shadow Matter 20%. The energy
 * and Shadow classes are NOT rolled here: they already pay
 * through creditBattleKill's standing roads (payFellDrip's
 * 20% drizzle; the 20% Shadow roll paying the kind's AC
 * bonus) — the spec's table and the live numbers agree, so
 * they are the same road, never a second roll. This module
 * carries the classes that had no home: shards, items,
 * relics, alchemy — and the REAGENTS, which are no roll at
 * all: a guaranteed channel standing beside the percentage
 * classes (ruled 13:18). Every enemy drops reagents on
 * death, 1 per point of its AC bonus over 10 (Fray 1 ·
 * Hollow 2 · Unraveler 3 · Tangle 5), each reagent an
 * independent roll on the rolling table.
 *
 * THE GOODS are one pantry. Reagents "join the items list,
 * with a rolling table of their own" (13:18 ruling), and
 * the draft's answer to one-class-or-two — the same eight
 * goods feed spells and potions alike — is the only goods
 * list the record holds, so the items class and the
 * alchemy class pay from this same table. The eight NAMES
 * are the reagent-map draft's pencils (drawn 2026-10-23
 * for Nigel's strike, faces owed by his hand): they stand
 * as the table's contents until he rules them, flagged
 * here and in the build report — never dressed as law.
 *
 * AMOUNTS per successful roll are 1 (one shard, one good,
 * one relic): the spec rules amounts only for Shadow
 * Matter and for reagents; the rest is its open pencil #2.
 * One is the smallest honest reading of "a drop" — flagged
 * for Nigel's strike like the names.
 *
 * RELICS land as held goods: once-cursed items, cleansed,
 * that fell from a dissipated enemy — each carrying a
 * temporary bonus to a different zodiac effect (its
 * identity here is one verb of the wheel's own FX palette),
 * some granting EXP. An unconsumed relic carries no timer
 * and stays tradeable (spec §3). CONSUMPTION — the clock,
 * the bonus in play, the EXP — is NOT built here: it rides
 * the zodiac effects wiring, and is flagged as overflow in
 * the build report rather than faked.
 *
 * THE PACK (spec §7): the travelling player inventory —
 * 15 different stacks, a stack holds up to 100. A drop
 * that cannot land (a full stack, or a sixteenth kind)
 * could not be carried, and the notice says so plainly.
 * The behaviour at the cap is the build's honest stand-in,
 * flagged: the spec rules the cap, not the overflow.
 */
import { sqlite } from "./store.js";
import { enemyArmorBonus } from "./enemyAC.js";
import { FX_PALETTE } from "./zodiacLive.js";

export const DROP_RATES = { shard: 0.10, items: 0.35, relic: 0.05, alchemy: 0.10 } as const;
export const INVENTORY_STACK_CAP = 100;
export const INVENTORY_STACK_KINDS = 15;
export const SHARDS_PER_ATTUNEMENT_POINT = 20;
export const RUNE_SHARD_KEY = "rune-shard";

export interface PantryGood { key: string; name: string; element: string }

/** The rolling table — the reagent-map draft's eight
 *  pencil goods, each tied to its element (draft §3). */
export const PANTRY: PantryGood[] = [
  { key: "shoal-salt", name: "Shoal Salt", element: "tide" },
  { key: "rainwater-vial", name: "Rainwater Vial", element: "tide" },
  { key: "held-breath", name: "Held Breath", element: "sky" },
  { key: "hawk-feather", name: "Hawk Feather", element: "sky" },
  { key: "hewn-stone-dust", name: "Hewn Stone Dust", element: "stone" },
  { key: "ember-ash", name: "Ember Ash", element: "fire" },
  { key: "bramble-cutting", name: "Bramble Cutting", element: "root" },
  { key: "nightcap-spore", name: "Nightcap Spore", element: "root" },
];
const PANTRY_BY_KEY = new Map(PANTRY.map(g => [g.key, g]));
const RELIC_VERBS = FX_PALETTE.map(p => ({ verb: p.verb, label: p.label }));

export type InventoryItemKind = "shard" | "pantry" | "relic";

export function itemKindOf(itemKey: string): InventoryItemKind {
  if (itemKey === RUNE_SHARD_KEY) return "shard";
  if (itemKey.startsWith("relic:")) return "relic";
  return "pantry";
}

export function itemDisplayName(itemKey: string): string {
  if (itemKey === RUNE_SHARD_KEY) return "Rune Shard";
  if (itemKey.startsWith("pantry:")) return PANTRY_BY_KEY.get(itemKey.slice(7))?.name ?? itemKey;
  if (itemKey.startsWith("relic:")) {
    const verb = itemKey.slice(6);
    const fx = RELIC_VERBS.find(r => r.verb === verb);
    return fx ? `${fx.label} Relic` : "Relic";
  }
  return itemKey;
}

export interface InventoryStack { key: string; name: string; kind: InventoryItemKind; qty: number }
export interface InventoryView { stacks: InventoryStack[]; shardCount: number }

/** The pack as the item screen serves it — stacks in a
 *  steady order (shards, pantry in table order, relics),
 *  with the shard count broken out for the forge control. */
export function inventoryView(ownerKey: string): InventoryView {
  const rows = sqlite.prepare("SELECT item_key AS key, qty FROM tender_inventory WHERE owner_key = ? AND qty > 0").all(ownerKey) as { key: string; qty: number }[];
  const order = (k: string) => k === RUNE_SHARD_KEY ? 0 : k.startsWith("pantry:") ? 1 + PANTRY.findIndex(g => `pantry:${g.key}` === k) : 100;
  const stacks = rows
    .map(r => ({ key: r.key, name: itemDisplayName(r.key), kind: itemKindOf(r.key), qty: Math.max(0, Math.floor(Number(r.qty) || 0)) }))
    .sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
  const shardRow = rows.find(r => r.key === RUNE_SHARD_KEY);
  return { stacks, shardCount: shardRow ? Math.max(0, Math.floor(Number(shardRow.qty) || 0)) : 0 };
}

/** Land goods in the pack under the ruled caps: a stack
 *  holds 100; the pack holds 15 different stacks. Returns
 *  how many landed and how many could not be carried. */
export function addToInventory(ownerKey: string, itemKey: string, qty: number): { landed: number; left: number } {
  if (qty <= 0) return { landed: 0, left: 0 };
  const row = sqlite.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, itemKey) as { qty: number } | undefined;
  if (!row) {
    const kinds = (sqlite.prepare("SELECT COUNT(*) AS n FROM tender_inventory WHERE owner_key = ? AND qty > 0").get(ownerKey) as { n: number }).n;
    if (kinds >= INVENTORY_STACK_KINDS) return { landed: 0, left: qty };
  }
  const room = INVENTORY_STACK_CAP - Math.max(0, Number(row?.qty ?? 0));
  const landed = Math.min(qty, Math.max(0, room));
  if (landed > 0) {
    sqlite.prepare(`INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`)
      .run(ownerKey, itemKey, landed, Date.now());
  }
  return { landed, left: qty - landed };
}

/** Spend exactly the ruled price of an attunement point —
 *  20 rune shards (ruled 2026-10-23 09:13). False when
 *  the pack holds fewer; nothing is spent. */
export function trySpendRuneShards(ownerKey: string): boolean {
  const row = sqlite.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, RUNE_SHARD_KEY) as { qty: number } | undefined;
  if (!row || Number(row.qty) < SHARDS_PER_ATTUNEMENT_POINT) return false;
  sqlite.prepare("UPDATE tender_inventory SET qty = qty - ?, updated_at = ? WHERE owner_key = ? AND item_key = ?")
    .run(SHARDS_PER_ATTUNEMENT_POINT, Date.now(), ownerKey, RUNE_SHARD_KEY);
  return true;
}

function rollPantryGood(): PantryGood {
  return PANTRY[Math.floor(Math.random() * PANTRY.length)];
}

interface FellTake { landed: Map<string, number>; left: Map<string, number> }

/** Roll the drop table for one felled enemy on the
 *  homeland and land the take in the Tender's pack,
 *  leaving a spoken line in the notice ledger for the
 *  next territory read to carry to the map. Called from
 *  creditBattleKill — the one settlement every homeland
 *  kill passes, whoever's hand struck it. */
export function rollFellDrops(ownerKey: string, kind: string): void {
  if (!ownerKey) return;
  const bonus = enemyArmorBonus(kind);
  const take_: FellTake = { landed: new Map(), left: new Map() };
  const take = (itemKey: string, qty: number): void => {
    const r = addToInventory(ownerKey, itemKey, qty);
    if (r.landed > 0) take_.landed.set(itemKey, (take_.landed.get(itemKey) ?? 0) + r.landed);
    if (r.left > 0) take_.left.set(itemKey, (take_.left.get(itemKey) ?? 0) + r.left);
  };
  // THE GUARANTEED CHANNEL (13:18): reagents, count =
  // the kind's AC bonus over 10, each an independent roll.
  for (let i = 0; i < bonus; i++) take(`pantry:${rollPantryGood().key}`, 1);
  // THE PERCENTAGE CLASSES (09:23), each its own roll.
  if (Math.random() < DROP_RATES.items) take(`pantry:${rollPantryGood().key}`, 1);
  if (Math.random() < DROP_RATES.alchemy) take(`pantry:${rollPantryGood().key}`, 1);
  if (Math.random() < DROP_RATES.shard) take(RUNE_SHARD_KEY, 1);
  if (Math.random() < DROP_RATES.relic) {
    const fx = RELIC_VERBS[Math.floor(Math.random() * RELIC_VERBS.length)];
    take(`relic:${fx.verb}`, 1);
  }
  const parts: string[] = [];
  for (const [key, n] of take_.landed) {
    const name = itemDisplayName(key);
    parts.push(key === RUNE_SHARD_KEY ? (n === 1 ? "a rune shard" : `${n} rune shards`) : n === 1 ? `a ${name}` : `${name} ×${n}`);
  }
  const kindName = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "dark";
  let line = parts.length
    ? `The felled ${kindName} leaves behind: ${parts.join(", ")}.`
    : `The felled ${kindName} leaves nothing it can give.`;
  if (take_.left.size > 0) {
    const leftNames = [...take_.left.keys()].map(itemDisplayName);
    line += ` Your pack is full — ${leftNames.join(", ")} could not be carried.`;
  }
  sqlite.prepare("INSERT INTO drop_notices (owner_key, line, seen, created_at) VALUES (?, ?, 0, ?)")
    .run(ownerKey, line, Date.now());
}

/** The unseen drop lines, drained: the territory read
 *  carries them to the map once, and they are spent. */
export function drainDropNotices(ownerKey: string): string[] {
  const rows = sqlite.prepare("SELECT id, line FROM drop_notices WHERE owner_key = ? AND seen = 0 ORDER BY id ASC").all(ownerKey) as { id: number; line: string }[];
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  sqlite.prepare(`UPDATE drop_notices SET seen = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  return rows.map(r => r.line);
}
