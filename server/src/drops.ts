/**
 * THE DROP TABLE (Nigel, rates ruled 2026-10-23 09:23;
 * reagents ruled 13:18 the same day; Shadow amount 09:30;
 * commissioned 2026-10-25 01:05 — "Yes implement it") —
 * what a felled enemy leaves behind, and the Pack it
 * gathers in.
 *
 * THE LOOT TABLE FIX (Nigel, ruled 2026-10-25 18:46, the
 * delivery 18:46, the rates restated 19:39 — "energy for
 * every fell but keep everything else the same"):
 *   · THE INVENTED SEVEN ARE OUT of the game and the pool —
 *     Shoal Salt · Rainwater Vial · Held Breath · Hawk
 *     Feather · Hewn Stone Dust · Bramble Cutting ·
 *     Nightcap Spore were a draft's pencils, never his
 *     ruling. EMBER ASH STAYS: it is one of the true twelve.
 *   · THE TWELVE OF RECORD fill the pool (the Homage Book's
 *     list, ~/workspace/spellbook-design/reagent-list-of-record.md):
 *     Dream Shroom · Ember Ash · Fray Ash · Hollow Silk ·
 *     Moon Petal · Root Sap · Rune Shard · Shadow Matter
 *     (bottled) · Sky Salt · Star Seed · Stone Dust ·
 *     Tidewater. Two of the twelve meet standing purses and
 *     are NOT merged into them: a dropped Rune Shard lands
 *     as the standing rune-shard stack (the shard forge's
 *     own ledger — one stack, as it has always been), and
 *     bottled Shadow Matter lands as an inventory stack of
 *     its own, never as tender_progress.shadow_matter.
 *   · ENERGY pays on EVERY fell now, by kind (Fray 3 ·
 *     Hollow 5 · Unraveler 8 · Tangle 12) — the homeland's
 *     creditBattleKill paid none before this build, and
 *     the casual Table paid a flat silent 3.
 *   · EVERY OTHER RATE STANDS AT TODAY'S NUMBERS (19:39):
 *     items 35% · relics 5% · rune shards 10% · the bonus
 *     reagent (alchemy) roll 10%, and the guaranteed
 *     reagents per fell by the kind's AC bonus over 10
 *     (Fray 1 · Hollow 2 · Unraveler 3 · Tangle 5), each
 *     reagent an independent roll on the twelve.
 *   · ATTUNEMENT pays exactly as it always has — the
 *     drizzle: a 20% roll paying a tenth of a point, its
 *     element the ground's where the ground holds one,
 *     else chance's draw (rollDrip below is the one draw,
 *     and actions.ts' payFellDrip pays through it). What
 *     changed is only its DELIVERY (below).
 *   · THE DELIVERY (18:46): fells on the homeland and at
 *     the casual Table no longer pay silently. The whole
 *     take — energy, the drizzle when it falls, reagents,
 *     items, relics, shards — is rolled here as ONE take
 *     (rollFellTake), springs out of the dissipated enemy
 *     on the client, flies to the nearest Tender, and
 *     lands in the PACK: her own pack on the homeland
 *     (the tender_pack rows below), the room's shared Pack
 *     at the casual Table (table.ts). A click claims an
 *     entry into the claimer's own inventory, purse or
 *     pools. The CAMPAIGN road is untouched by this build
 *     (Nigel, 19:27: the campaign's item system can be
 *     different): campaign fells keep the silent personal
 *     take through rollFellDrops, exactly as before.
 *
 * AMOUNTS per successful percentage roll are 1 (one shard,
 * one good, one relic): the spec rules amounts only for
 * Shadow Matter and for reagents; the rest is its open
 * pencil #2, standing as the smallest honest reading.
 *
 * RELICS land as held goods: once-cursed items, cleansed,
 * that fell from a dissipated enemy — each carrying a
 * temporary bonus to a different zodiac effect (its
 * identity here is one verb of the wheel's own FX palette),
 * some granting EXP. An unconsumed relic carries no timer
 * and stays tradeable (spec §3). CONSUMPTION — the clock,
 * the bonus in play, the EXP — rides the relics build,
 * not this one, as before.
 *
 * THE INVENTORY (spec §7): the travelling player
 * inventory — 30 different stacks, a stack holds up to
 * 100. (The kinds cap stood at 15 until Nigel raised
 * it, 2026-10-26: "increase item limit to 30.")
 * The caps bind what a CLAIM can carry into it; a
 * drop that cannot land stays in the Pack, and the claim
 * says so plainly. (Before this build the caps bound the
 * drop itself; the Pack is ground, not her back, so the
 * caps moved to the claim — the full-pack spoken line
 * moved with them.)
 */
import { sqlite } from "./store.js";
import { enemyArmorBonus } from "./enemyAC.js";
import { FX_PALETTE } from "./zodiacLive.js";

export const DROP_RATES = { shard: 0.10, items: 0.35, relic: 0.05, alchemy: 0.10 } as const;
export const INVENTORY_STACK_CAP = 100;
export const INVENTORY_STACK_KINDS = 30;
export const SHARDS_PER_ATTUNEMENT_POINT = 20;
export const RUNE_SHARD_KEY = "rune-shard";

/** ENERGY PER FELL, BY KIND (Nigel, ruled 2026-10-25
 *  19:39): every fell pays, scaled by the kind — a few
 *  fells fund a summoning, a Tangle funds building.
 *  Kinds outside the standing roster pay no ladder
 *  energy (the roster is these four). */
export const FELL_ENERGY: Record<string, number> = { fray: 3, hollow: 5, unraveler: 8, tangle: 12 };

export interface Reagent { key: string; name: string }

/** THE TWELVE OF RECORD, in the record's own order —
 *  the rolling table every reagent channel draws from. */
export const REAGENTS: Reagent[] = [
  { key: "dream-shroom", name: "Dream Shroom" },
  { key: "ember-ash", name: "Ember Ash" },
  { key: "fray-ash", name: "Fray Ash" },
  { key: "hollow-silk", name: "Hollow Silk" },
  { key: "moon-petal", name: "Moon Petal" },
  { key: "root-sap", name: "Root Sap" },
  { key: "rune-shard", name: "Rune Shard" },
  { key: "shadow-matter", name: "Shadow Matter (bottled)" },
  { key: "sky-salt", name: "Sky Salt" },
  { key: "star-seed", name: "Star Seed" },
  { key: "stone-dust", name: "Stone Dust" },
  { key: "tidewater", name: "Tidewater" },
];
const REAGENT_BY_KEY = new Map(REAGENTS.map(g => [g.key, g]));
const RELIC_VERBS = FX_PALETTE.map(p => ({ verb: p.verb, label: p.label }));

/** A reagent's inventory key: the Rune Shard lands as the
 *  standing shard stack (one ledger, as it has always
 *  been); every other reagent carries its own stack. */
export function reagentItemKey(reagentKey: string): string {
  return reagentKey === RUNE_SHARD_KEY ? RUNE_SHARD_KEY : `reagent:${reagentKey}`;
}

export type InventoryItemKind = "shard" | "reagent" | "relic";

export function itemKindOf(itemKey: string): InventoryItemKind {
  if (itemKey === RUNE_SHARD_KEY) return "shard";
  if (itemKey.startsWith("relic:")) return "relic";
  return "reagent";
}

export function itemDisplayName(itemKey: string): string {
  if (itemKey === RUNE_SHARD_KEY) return "Rune Shard";
  if (itemKey.startsWith("reagent:")) return REAGENT_BY_KEY.get(itemKey.slice(8))?.name ?? itemKey;
  // A pre-conversion key, should one ever be read before
  // the conversion has run: name it by its converted good.
  if (itemKey.startsWith("pantry:")) {
    const target = INVENTED_CONVERSION[itemKey];
    if (target) return itemDisplayName(target);
    return itemKey;
  }
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
 *  steady order (shards, reagents in table order, relics),
 *  with the shard count broken out for the forge control. */
export function inventoryView(ownerKey: string): InventoryView {
  const rows = sqlite.prepare("SELECT item_key AS key, qty FROM tender_inventory WHERE owner_key = ? AND qty > 0").all(ownerKey) as { key: string; qty: number }[];
  const order = (k: string) => k === RUNE_SHARD_KEY ? 0 : k.startsWith("reagent:") ? 1 + REAGENTS.findIndex(g => `reagent:${g.key}` === k) : k.startsWith("pantry:") ? 50 : 100;
  const stacks = rows
    .map(r => ({ key: r.key, name: itemDisplayName(r.key), kind: itemKindOf(r.key), qty: Math.max(0, Math.floor(Number(r.qty) || 0)) }))
    .sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
  const shardRow = rows.find(r => r.key === RUNE_SHARD_KEY);
  return { stacks, shardCount: shardRow ? Math.max(0, Math.floor(Number(shardRow.qty) || 0)) : 0 };
}

/** Land goods in the inventory under the ruled caps: a
 *  stack holds 100; the inventory holds 30 different
 *  stacks. Returns how many landed and how many could
 *  not be carried. */
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

/** Could this stack land whole in the inventory right
 *  now? The claim roads ask before they take an entry
 *  out of the Pack, so a refused claim leaves the entry
 *  standing. */
export function inventoryCanHold(ownerKey: string, itemKey: string, qty: number): boolean {
  const row = sqlite.prepare("SELECT qty FROM tender_inventory WHERE owner_key = ? AND item_key = ?").get(ownerKey, itemKey) as { qty: number } | undefined;
  if (!row) {
    const kinds = (sqlite.prepare("SELECT COUNT(*) AS n FROM tender_inventory WHERE owner_key = ? AND qty > 0").get(ownerKey) as { n: number }).n;
    if (kinds >= INVENTORY_STACK_KINDS) return false;
    return qty <= INVENTORY_STACK_CAP;
  }
  return Math.max(0, Number(row.qty ?? 0)) + qty <= INVENTORY_STACK_CAP;
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

/* ── THE TAKE ─────────────────────────────────────────── */

/** One piece of a fell's take. Energy and attunement ride
 *  as their own kinds (they land in purses and pools at
 *  the claim, never as inventory stacks); items carry
 *  their inventory key. */
export interface FellDrop {
  kind: "energy" | "attunement" | "item";
  itemKey?: string;
  element?: string;
  qty: number;
}

const DRIP_ELEMENTS = ["root", "tide", "sky", "stone", "fire"] as const;
export const DRIP_AMOUNT = 0.1;
export const DRIP_CHANCE = 0.2;

/** THE DRIZZLE'S ONE DRAW (Nigel, 2026-10-19/20): a 20%
 *  roll; when it falls, a tenth of a point of the ground's
 *  element where the ground holds one of the five, else
 *  chance's element. Null when the roll misses. Every
 *  road that pays the drip — silently (payFellDrip) or
 *  as a physical drop — draws here, so the measure can
 *  never fork. */
export function rollDrip(groundElement?: string | null): string | null {
  if (Math.random() >= DRIP_CHANCE) return null;
  if (groundElement && (DRIP_ELEMENTS as readonly string[]).includes(groundElement)) return groundElement;
  return DRIP_ELEMENTS[Math.floor(Math.random() * DRIP_ELEMENTS.length)];
}

function rollReagent(): Reagent {
  return REAGENTS[Math.floor(Math.random() * REAGENTS.length)];
}

/** The item classes of one fell, each its own roll, at
 *  the standing rates: the GUARANTEED reagents (13:18 —
 *  count = the kind's AC bonus over 10, each an
 *  independent roll on the twelve), then items 35%,
 *  the bonus reagent roll 10%, rune shards 10%,
 *  relics 5% — amounts of 1, merged by key. */
export function rollItemDrops(kind: string): FellDrop[] {
  const byKey = new Map<string, number>();
  const take = (itemKey: string, qty: number): void => { byKey.set(itemKey, (byKey.get(itemKey) ?? 0) + qty); };
  const bonus = enemyArmorBonus(kind);
  for (let i = 0; i < bonus; i++) take(reagentItemKey(rollReagent().key), 1);
  if (Math.random() < DROP_RATES.items) take(reagentItemKey(rollReagent().key), 1);
  if (Math.random() < DROP_RATES.alchemy) take(reagentItemKey(rollReagent().key), 1);
  if (Math.random() < DROP_RATES.shard) take(RUNE_SHARD_KEY, 1);
  if (Math.random() < DROP_RATES.relic) {
    const fx = RELIC_VERBS[Math.floor(Math.random() * RELIC_VERBS.length)];
    take(`relic:${fx.verb}`, 1);
  }
  return [...byKey.entries()].map(([itemKey, qty]) => ({ kind: "item" as const, itemKey, qty }));
}

/** THE WHOLE TAKE of one fell on the delivery roads
 *  (homeland + casual Table): the energy ladder, the
 *  drizzle when its roll falls, and the item classes. */
export function rollFellTake(kind: string, groundElement?: string | null): FellDrop[] {
  const drops: FellDrop[] = [];
  const energy = FELL_ENERGY[kind] ?? 0;
  if (energy > 0) drops.push({ kind: "energy", qty: energy });
  const drip = rollDrip(groundElement);
  if (drip) drops.push({ kind: "attunement", element: drip, qty: DRIP_AMOUNT });
  drops.push(...rollItemDrops(kind));
  return drops;
}

/** A drop's spoken name, for the tale and the Pack. */
export function dropDisplayName(drop: FellDrop): string {
  if (drop.kind === "energy") return "Energy";
  if (drop.kind === "attunement") return `${drop.element ? drop.element.charAt(0).toUpperCase() + drop.element.slice(1) : ""} attunement`;
  return itemDisplayName(drop.itemKey ?? "");
}

/** The take as the tale speaks it: "3 energy, a drizzle
 *  of fire attunement, Root Sap ×2, a rune shard". */
export function describeDrops(drops: FellDrop[]): string {
  const parts: string[] = [];
  for (const d of drops) {
    if (d.kind === "energy") parts.push(`${d.qty} energy`);
    else if (d.kind === "attunement") parts.push(`a drizzle of ${d.element} attunement`);
    else {
      const name = itemDisplayName(d.itemKey ?? "");
      parts.push(d.itemKey === RUNE_SHARD_KEY ? (d.qty === 1 ? "a rune shard" : `${d.qty} rune shards`) : d.qty === 1 ? `a ${name}` : `${name} ×${d.qty}`);
    }
  }
  return parts.join(", ");
}

/* ── THE HOMELAND PACK (unclaimed drops, per Tender) ──── */

export interface PackEntryView {
  id: number;
  kind: "energy" | "attunement" | "item";
  itemKey?: string;
  element?: string;
  name: string;
  qty: number;
}

interface PackRow { id: number; kind: string; item_key: string | null; element: string | null; qty: number }

function packRowView(r: PackRow): PackEntryView {
  const drop: FellDrop = { kind: r.kind as FellDrop["kind"], itemKey: r.item_key ?? undefined, element: r.element ?? undefined, qty: Number(r.qty) };
  return { id: r.id, kind: drop.kind, itemKey: drop.itemKey, element: drop.element, name: dropDisplayName(drop), qty: drop.qty };
}

/** Land a take in a Tender's own Pack (the homeland
 *  road): like drops merge into standing entries, so
 *  the Pack reads as a gathered pile, not a trail of
 *  single coins. The Pack holds what fell — the
 *  inventory's caps bind at the claim, not here. */
export function landHomelandPack(ownerKey: string, drops: FellDrop[]): void {
  if (!ownerKey || !drops.length) return;
  const now = Date.now();
  for (const d of drops) {
    const itemKey = d.itemKey ?? null;
    const element = d.element ?? null;
    const row = sqlite.prepare("SELECT id, qty FROM tender_pack WHERE owner_key = ? AND kind = ? AND item_key IS ? AND element IS ?")
      .get(ownerKey, d.kind, itemKey, element) as { id: number; qty: number } | undefined;
    if (row) {
      sqlite.prepare("UPDATE tender_pack SET qty = qty + ? WHERE id = ?").run(d.qty, row.id);
    } else {
      sqlite.prepare("INSERT INTO tender_pack (owner_key, kind, item_key, element, qty, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(ownerKey, d.kind, itemKey, element, d.qty, now);
    }
  }
}

/** Her Pack as the bag panel serves it: energy first,
 *  attunement by element, items in table order. */
export function homelandPackView(ownerKey: string): PackEntryView[] {
  const rows = sqlite.prepare("SELECT id, kind, item_key, element, qty FROM tender_pack WHERE owner_key = ? AND qty > 0").all(ownerKey) as PackRow[];
  const order = (v: PackEntryView) => v.kind === "energy" ? 0 : v.kind === "attunement" ? 1 : 2;
  return rows.map(packRowView).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

/** Read one Pack entry without taking it (the claim road
 *  validates the landing before the entry is spent). */
export function peekHomelandPackEntry(ownerKey: string, entryId: number): PackEntryView | null {
  const row = sqlite.prepare("SELECT id, kind, item_key, element, qty FROM tender_pack WHERE owner_key = ? AND id = ?").get(ownerKey, entryId) as PackRow | undefined;
  return row ? packRowView(row) : null;
}

/** Take one Pack entry out (the claim's second half,
 *  after the landing is proven). False if it is gone. */
export function takeHomelandPackEntry(ownerKey: string, entryId: number): boolean {
  const r = sqlite.prepare("DELETE FROM tender_pack WHERE owner_key = ? AND id = ?").run(ownerKey, entryId);
  return r.changes > 0;
}

/* ── DROP EVENTS (the homeland's spring-and-fly) ──────── */

/** A fell's visible moment on the homeland: where the
 *  dark stood (axial, fractional as the wanderers walk)
 *  and what sprang out of it. Drained once by the next
 *  territory read, like the notices, so the client can
 *  fly the faces to the Tender. */
export interface DropEvent { at: number; fromQ: number; fromR: number; drops: FellDrop[] }

export function recordDropEvent(ownerKey: string, event: DropEvent): void {
  if (!ownerKey || !event.drops.length) return;
  sqlite.prepare("INSERT INTO drop_events (owner_key, payload, seen, created_at) VALUES (?, ?, 0, ?)")
    .run(ownerKey, JSON.stringify(event), Date.now());
}

export function drainDropEvents(ownerKey: string): DropEvent[] {
  const rows = sqlite.prepare("SELECT id, payload FROM drop_events WHERE owner_key = ? AND seen = 0 ORDER BY id ASC").all(ownerKey) as { id: number; payload: string }[];
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  sqlite.prepare(`UPDATE drop_events SET seen = 1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  return rows.flatMap(r => { try { return [JSON.parse(r.payload) as DropEvent]; } catch { return []; } });
}

/* ── THE SILENT ROAD (campaign, unchanged) ────────────── */

/** Roll the drop table for one felled enemy and land the
 *  ITEM classes straight in the Tender's inventory,
 *  leaving a spoken line in the notice ledger. This is
 *  the campaign road's standing behaviour, kept whole:
 *  the correction changed WHAT the table holds (the
 *  twelve for the invented eight), never how campaign
 *  fells pay. Called from table.ts' fellDark for
 *  campaign rooms. */
export function rollFellDrops(ownerKey: string, kind: string): void {
  if (!ownerKey) return;
  const landed = new Map<string, number>();
  const left = new Map<string, number>();
  for (const d of rollItemDrops(kind)) {
    if (d.kind !== "item" || !d.itemKey) continue;
    const r = addToInventory(ownerKey, d.itemKey, d.qty);
    if (r.landed > 0) landed.set(d.itemKey, (landed.get(d.itemKey) ?? 0) + r.landed);
    if (r.left > 0) left.set(d.itemKey, (left.get(d.itemKey) ?? 0) + r.left);
  }
  const parts: string[] = [];
  for (const [key, n] of landed) {
    const name = itemDisplayName(key);
    parts.push(key === RUNE_SHARD_KEY ? (n === 1 ? "a rune shard" : `${n} rune shards`) : n === 1 ? `a ${name}` : `${name} ×${n}`);
  }
  const kindName = kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : "dark";
  let line = parts.length
    ? `The felled ${kindName} leaves behind: ${parts.join(", ")}.`
    : `The felled ${kindName} leaves nothing it can give.`;
  if (left.size > 0) {
    const leftNames = [...left.keys()].map(itemDisplayName);
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

/* ── THE CONVERSION (stacks convert, counts preserved) ── */

/** THE CONVERSION MAPPING (Nigel, ruled 2026-10-25
 *  19:04: existing stacks of the invented goods convert
 *  to correct reagents, counts preserved). Devised by
 *  element affinity — each invented good was filed under
 *  an element; it converts to that element's good of the
 *  twelve (a spore to a shroom where the kind itself
 *  speaks):
 *    Shoal Salt (tide)      → Tidewater
 *    Rainwater Vial (tide)  → Tidewater
 *    Held Breath (sky)      → Sky Salt
 *    Hawk Feather (sky)     → Hollow Silk
 *    Hewn Stone Dust (stone)→ Stone Dust
 *    Bramble Cutting (root) → Root Sap
 *    Nightcap Spore (root)  → Dream Shroom
 *  Ember Ash was never invented — it is one of the
 *  twelve; its stacks only change their key's prefix
 *  (pantry: → reagent:), count untouched. */
export const INVENTED_CONVERSION: Record<string, string> = {
  "pantry:shoal-salt": "reagent:tidewater",
  "pantry:rainwater-vial": "reagent:tidewater",
  "pantry:held-breath": "reagent:sky-salt",
  "pantry:hawk-feather": "reagent:hollow-silk",
  "pantry:hewn-stone-dust": "reagent:stone-dust",
  "pantry:bramble-cutting": "reagent:root-sap",
  "pantry:nightcap-spore": "reagent:dream-shroom",
  "pantry:ember-ash": "reagent:ember-ash",
};

/** Convert every standing stack of the invented goods
 *  (and the old pantry: prefix) to the twelve, counts
 *  preserved whole. Runs at boot; idempotent — once no
 *  old key stands, it does nothing. The conversion
 *  writes the sums directly: where two invented goods
 *  convert onto one reagent, a converted stack may
 *  stand above the 100 cap — the cap binds new gains
 *  and claims, never the conversion, or counts would
 *  not be preserved. */
export function convertInventedStacks(): { from: string; to: string; qty: number }[] {
  const moved: { from: string; to: string; qty: number }[] = [];
  const oldKeys = Object.keys(INVENTED_CONVERSION);
  const rows = sqlite.prepare(`SELECT owner_key AS ownerKey, item_key AS itemKey, qty FROM tender_inventory WHERE item_key IN (${oldKeys.map(() => "?").join(",")}) AND qty > 0`).all(...oldKeys) as { ownerKey: string; itemKey: string; qty: number }[];
  for (const row of rows) {
    const target = INVENTED_CONVERSION[row.itemKey];
    if (!target) continue;
    sqlite.prepare(`INSERT INTO tender_inventory (owner_key, item_key, qty, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_key, item_key) DO UPDATE SET qty = qty + excluded.qty, updated_at = excluded.updated_at`)
      .run(row.ownerKey, target, row.qty, Date.now());
    sqlite.prepare("DELETE FROM tender_inventory WHERE owner_key = ? AND item_key = ?").run(row.ownerKey, row.itemKey);
    moved.push({ from: row.itemKey, to: target, qty: row.qty });
  }
  return moved;
}
