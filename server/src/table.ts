/**
 * THE TABLE — the server half of the Discord Activity
 * (design of record: ~/workspace/discord-voice/TABLE-DESIGN.md).
 *
 * P0 — THE EMPTY TABLE (the plumbing proof, built 2026-10-15):
 * the Activity launches, each opener is NAMED (Discord sign-in through
 * the Embedded App SDK's OAuth code, exchanged here; or a doorway-test
 * name while Discord is not yet configured on the server), seated
 * players see each other in the Party zone, and each is dealt a
 * DIFFERENT test hand that is sent to their socket and nowhere else —
 * privacy by architecture, not by promise: a hand exists only in its
 * owner's payload. Dice are rolled here, where the referee can witness
 * them, and written into the shared Tale. Personal notes and the typed
 * inventory persist per player (table_profiles) and are likewise only
 * ever sent to their owner.
 *
 * What P0 deliberately does NOT do (later phases, per the design):
 * real decks and account binding (P1), summoning and referee combat
 * (P1), the Storytender's Panel and campaign persistence (P2). The
 * room state is in memory; a server restart clears the room but never
 * a profile.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { Express, Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db, schema, sqlite } from "./store.js";
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from "./config.js";
import { tenderOwnerKey } from "./tenders.js";
import { awakenedPayloadById, calculateMaxEnergy, resolveCurrentEnemyArt, handlers, incursionRoster } from "./actions.js";
import { getTenderProgress, healTierForLevel, healAmountForLevel, tenderMaxHpForLevel, awardTenderExp } from "./tenderExp.js";
import { HUE_ORDER } from "./workings.js";
import { grimoireNow, refreshGrimoire, spellByKey, healSpell, pourCapFor, hpForCast, spendAttunement, attunementPools, attunementLevel, POUR_ENGINES } from "./grimoire.js";

const TABLE_CONFIGURED = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
const MAX_SEATED = 5; // ruled 2026-10-15: up to 5 Tenders to a table
const TALE_CAP = 100;

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
  /** Real-deck cards only: the Awoken's true card face, exactly as
   *  the site serves it, plus its level and ledger id. Stand-in
   *  cards carry none of these and show their glyph face. */
  art?: string;
  level?: number;
  awokenId?: number;
}

/** The stand-in pool: the roster an UNBOUND seat brings. Bound
 *  seats bring their Tender's whole collection instead. */
const TEST_POOL: Omit<TableCard, "id">[] = [
  { name: "Warden of Small Rains", power: 3, toughness: 4, element: "tide" },
  { name: "Keeper of the Low Bell", power: 2, toughness: 5, element: "stone" },
  { name: "Mothwing Herald", power: 4, toughness: 2, element: "sky" },
  { name: "Rootbound Confessor", power: 1, toughness: 6, element: "root" },
  { name: "Ashen Choirling", power: 5, toughness: 3, element: "stone" },
  { name: "The Patient Knife", power: 6, toughness: 2, element: "sky" },
  { name: "Mender of Torn Sails", power: 2, toughness: 3, element: "tide" },
  { name: "Gloaming Pilgrim", power: 3, toughness: 3, element: "root" },
  { name: "Spark of the First Forge", power: 7, toughness: 4, element: "sky" },
  { name: "Hushkeeper", power: 1, toughness: 2, element: "tide" },
];

interface Player {
  key: string;
  name: string;
  watcher: boolean;
  /** The seat's roster — every card available to cast. For a bound
   *  seat that is the Tender's whole collection (Nigel, 2026-10-16:
   *  the full roster stands at the Table, not a dealt five). */
  hand: TableCard[];
  notes: string;
  inventory: string[];
  /** The Tender this seat is bound to (display name), or null when
   *  the seat holds stand-in cards. */
  bound?: string | null;
  /** The seat's Tender standing (Tender EXP, 2026-10-16): a
   *  bound seat carries its Tender's true level and what it
   *  unlocks; a stand-in seat stands at Lv 1. */
  tenderLevel: number;
  healTier: number;
  healAmount: number;
  wardRuneUnlocked: boolean;
  /** The Tender's HP for this sitting — full until the
   *  referee deals damage; by level, per the HP law. */
  tenderHp: number;
  maxTenderHp: number;
  /** True once this seat's Tender has fallen in the battle. */
  fallen: boolean;
  /** The tender-progress owner key for bound seats — where
   *  battle EXP is paid. Null for stand-in seats. */
  expKey: string | null;
  /** The seat's attunement pools (whole points), for the pour
   *  stepper — refreshed at the cast; the referee re-reads the
   *  pool itself before any point is spent. Null unbound. */
  pools: Record<string, number> | null;
  /** This sitting's energy: for a bound seat, the game's own max
   *  energy for that Tender, calculated from their whole roster by
   *  the one law (calculateMaxEnergy) — all of it, as ruled. */
  energy: number;
  maxEnergy: number;
}

/** An Awoken standing on the field. The card rides inside it whole,
 *  so a recall returns exactly what was cast. */
interface FieldUnit {
  hex: string;
  card: TableCard;
  hp: number;
  maxHp: number;
  ownerKey: string;
  ownerName: string;
  /** Rounds of striking this unit must still sit out (a pin). */
  pinned: number;
}

/** One of the dark, standing on the field. Damage is its filed
 *  Power, health its filed HP — the Compendium's canon numbers,
 *  no hidden tables (Nigel, 2026-10-16). */
interface EnemyUnit {
  hex: string;
  kind: string;
  label: string;
  art: string | null;
  power: number;
  hp: number;
  maxHp: number;
  /** Rounds this dark thing must still sit out (a rune's pin). */
  pinned: number;
}

/** A working of the Written Light on the field (Nigel, 2026-10-17:
 *  the glyphs and their functions come to the Table). WARDS stand
 *  on the edge between two hexes (hexA/hexB); RUNES are written
 *  on a hex's ground (hex). Written for one battle: when the
 *  battle ends, the light fades — after the Crown Shard, if any
 *  hangs unfed, has fallen where it must. */
interface Working {
  id: string;
  kind: "ward" | "rune";
  root: string;
  /** The Grimoire spell's engine and its numbers, snapshotted
   *  at the cast (Nigel, 2026-10-17): tuning the book changes
   *  the NEXT cast, never a working already standing. */
  engine: string;
  nums: Record<string, number>;
  name: string;
  hue: string;
  ownerKey: string;
  ownerName: string;
  hex: string | null;
  /** Multi-hex casts (the Three Blades, Shard Rain) share a
   *  group: the rain falls once for the whole covered ground. */
  group?: string;
  hexA: string | null;
  hexB: string | null;
  hp: number;
  /** The health the working was raised with (its rating's full
   *  measure) and the elemental points poured into it at the cast
   *  (the Pour, Nigel 2026-10-17) — both snapshotted at the cast. */
  maxHp: number;
  pour: number;
  stops: number;
  charges: number;
}

const ENEMY_STATS: Record<string, { power: number; hp: number }> = {
  fray: { power: 1, hp: 3 },
  unraveler: { power: 4, hp: 6 },
  hollow: { power: 0, hp: 5 },
  tangle: { power: 3, hp: 8 },
};

/** The instance field: a full honeycomb filling the battlefield
 *  (Nigel, 2026-10-16). Generated, not listed — the client draws
 *  the identical field from the identical constants; the two
 *  generators must stay in step. The hex nearest the middle is
 *  the star-seed's and is never stood upon. */
function buildFieldHexes(): { id: string; x: number; y: number; center: boolean }[] {
  const R = 26, dx = Math.sqrt(3) * R, dy = 1.5 * R;
  const out: { id: string; x: number; y: number; center: boolean }[] = [];
  for (let r = 0; r < 6; r++) {
    const y = 26 + r * dy;
    const off = (r % 2) * (dx / 2);
    for (let c = 0; ; c++) {
      const x = 28 + off + c * dx;
      if (x > 276) break;
      out.push({ id: `hex-${r}-${c}`, x, y, center: false });
    }
  }
  let best = out[0], bd = Infinity;
  for (const h of out) { const d = (h.x - 150) ** 2 + (h.y - 130) ** 2; if (d < bd) { bd = d; best = h; } }
  best.center = true;
  return out;
}
const FIELD_HEXES_SERVER = buildFieldHexes();
const SUMMONABLE_HEXES = FIELD_HEXES_SERVER.filter(h => !h.center).map(h => h.id);

/** The Dark roster the room shows — names and tellings; the faces
 *  resolve live from the game's current enemy art. */
const ENEMY_ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awoken where it stands." },
] as const;

interface TaleEntry {
  at: number;
  text: string;
}

/** A BASTION BATTLE at the Table (the Columns, 2026-10-17): a
 *  host's call to arms, claimed into a room. The seats fight the
 *  column's true roster; their energy is ONE POOL (joining
 *  Tenders' energy joins the pool, scaled by level); an AMBUSH
 *  call — warned ahead, while the column still marched — lends
 *  every strike +1. Victory and defeat report back to the land. */
interface BastionState {
  callId: number;
  kind: string; // bastion | ambush | siege
  hostKey: string; // the host seat's owner key (tender:<id>)
  hostTenderId: number;
  hostName: string;
  columnId: number | null;
  seedId: number | null;
  roster: { kind: string; count: number; power: number; hp: number }[];
  size: number;
  ambush: boolean;
  pool: number;
  poolMax: number;
  begun: boolean;
  resolved: boolean;
}

interface Room {
  id: string;
  bastion: BastionState | null;
  players: Map<WebSocket, Player>;
  tale: TaleEntry[];
  sky: { mood: string; description: string; endsAt: string | null };
  field: Map<string, FieldUnit>;
  workings: Working[];
  enemies: { name: string; label: string; note: string; art: string | null }[];
  dark: Map<string, EnemyUnit>;
  battle: { active: boolean; wave: number; timer: ReturnType<typeof setInterval> | null; ticking: boolean };
  roundNo: number;
}

const rooms = new Map<string, Room>();
/** Sign-in tokens issued by /api/table/auth: token → Discord user. */
const authTokens = new Map<string, { id: string; name: string }>();

// ── The real deck (Nigel's word, 2026-10-16) ─────────────────────
// A bound seat is dealt from its Tender's own collection: their
// Awoken, with the true card faces the site serves, the stats the
// game's own payload builder computes, and the element the sum of
// the parts declares. The binding is one Discord name ↔ one Tender.

async function bindingFor(discordId: string): Promise<number | null> {
  try {
    const rows = await db.select().from(schema.tableBindings)
      .where(eq(schema.tableBindings.discordId, discordId)).limit(1);
    return rows.length ? rows[0].tenderId : null;
  } catch { return null; }
}

async function tenderDisplayName(tenderId: number): Promise<string | null> {
  try {
    const rows = await db.select().from(schema.tenders)
      .where(eq(schema.tenders.id, tenderId)).limit(1);
    return rows.length ? (rows[0].tenderName ?? null) : null;
  } catch { return null; }
}

const ELEMENT_ORDER = ["tide", "sky", "stone", "root", "fire"];

/** An Awoken's element for the Table's one-glyph face: the dominant
 *  filed element across its parts (the sum-of-the-parts law), ties
 *  broken by the canonical order, no tally at all → neutral. */
function dominantElement(layers: { element?: string | null }[]): string {
  const tally = new Map<string, number>();
  for (const layer of layers) {
    const el = layer.element ?? null;
    if (el && el !== "neutral") tally.set(el, (tally.get(el) ?? 0) + 1);
  }
  let best = "neutral";
  let bestCount = 0;
  for (const el of ELEMENT_ORDER) {
    const count = tally.get(el) ?? 0;
    if (count > bestCount) { best = el; bestCount = count; }
  }
  return best;
}

async function deckForTender(tenderId: number): Promise<TableCard[]> {
  const ownerKey = tenderOwnerKey(tenderId);
  const rows = await db.select().from(schema.awakened)
    .where(eq(schema.awakened.ownerKey, ownerKey));
  const cards: TableCard[] = [];
  for (const row of rows.slice(0, 120)) {
    const payload = await awakenedPayloadById(row.id).catch(() => null);
    if (!payload) continue;
    cards.push({
      id: randomUUID(),
      name: payload.name,
      power: payload.power,
      toughness: payload.toughness,
      element: dominantElement(payload.layers as { element?: string | null }[]),
      art: payload.image_url,
      level: payload.level,
      awokenId: payload.id,
    });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

async function currentSky(): Promise<Room["sky"]> {
  try {
    const rows = await db.select().from(schema.settings)
      .where(eq(schema.settings.key, "world_mood")).limit(1);
    if (rows.length) {
      const data = JSON.parse(rows[0].value) as { mood: string; description?: string; endsAt?: string };
      if (data?.mood) return { mood: data.mood, description: data.description ?? "", endsAt: data.endsAt ?? null };
    }
  } catch { /* the sky is a display truth; never let it break the room */ }
  return { mood: "quiet", description: "", endsAt: null };
}

async function loadProfile(key: string, name: string): Promise<{ notes: string; inventory: string[] }> {
  const rows = await db.select().from(schema.tableProfiles)
    .where(eq(schema.tableProfiles.playerKey, key)).limit(1);
  if (rows.length) {
    let inventory: string[] = [];
    try { const parsed = JSON.parse(rows[0].inventory); if (Array.isArray(parsed)) inventory = parsed.filter(x => typeof x === "string"); } catch {}
    return { notes: rows[0].notes, inventory };
  }
  await db.insert(schema.tableProfiles)
    .values({ playerKey: key, displayName: name, notes: "", inventory: "[]" })
    .onConflictDoNothing();
  return { notes: "", inventory: [] };
}

async function saveProfile(player: Player): Promise<void> {
  await db.insert(schema.tableProfiles)
    .values({
      playerKey: player.key,
      displayName: player.name,
      notes: player.notes.slice(0, 8000),
      inventory: JSON.stringify(player.inventory.slice(0, 100)),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.tableProfiles.playerKey,
      set: {
        displayName: player.name,
        notes: player.notes.slice(0, 8000),
        inventory: JSON.stringify(player.inventory.slice(0, 100)),
        updatedAt: new Date(),
      },
    });
}

function sharedState(room: Room) {
  const seated = [...room.players.values()].filter(p => !p.watcher);
  return {
    room: room.id,
    sky: room.sky,
    round: room.roundNo,
    threat: [...room.dark.values()].reduce((sum, e) => sum + e.power, 0),
    players: seated.map(p => ({ key: p.key, name: p.name, handCount: p.hand.length, energy: p.energy, maxEnergy: p.maxEnergy, tenderHp: p.tenderHp, maxTenderHp: p.maxTenderHp, fallen: p.fallen })),
    watcherCount: room.players.size - seated.length,
    tale: room.tale.slice(-TALE_CAP),
    dark: [...room.dark.values()].map(e => ({ ...e })),
    workings: room.workings.map(w => ({ ...w })),
    battle: { active: room.battle.active, wave: room.battle.wave },
    field: [...room.field.values()].map(u => ({
      hex: u.hex, name: u.card.name, art: u.card.art ?? null, element: u.card.element,
      power: u.card.power, toughness: u.card.toughness, hp: u.hp, maxHp: u.maxHp,
      level: u.card.level ?? null, ownerKey: u.ownerKey, ownerName: u.ownerName,
    })),
    enemies: room.enemies,
    bastion: room.bastion ? {
      callId: room.bastion.callId, kind: room.bastion.kind, hostName: room.bastion.hostName,
      ambush: room.bastion.ambush, pool: room.bastion.pool, poolMax: room.bastion.poolMax,
      begun: room.bastion.begun, resolved: room.bastion.resolved, size: room.bastion.size,
    } : null,
  };
}

function sendState(room: Room): void {
  const state = sharedState(room);
  for (const [ws, player] of room.players) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({
      type: "state",
      state,
      // THE privacy law: a hand (and the notes and inventory) travel
      // only inside their owner's own payload. Other sockets never
      // receive them — not hidden, absent.
      you: player.watcher ? null : {
        key: player.key,
        name: player.name,
        hand: player.hand,
        notes: player.notes,
        inventory: player.inventory,
        bound: player.bound ?? null,
        energy: room.bastion?.begun && !room.bastion.resolved ? room.bastion.pool : player.energy,
        yourCall: (() => {
          if (!player.expKey) return null;
          try {
            const c = sqlite.prepare("SELECT id, kind, column_id, seed_id FROM bastion_calls WHERE owner_key = ? AND state = 'open' ORDER BY created_at ASC LIMIT 1").get(player.expKey) as any;
            return c ? { id: c.id, kind: c.kind, columnId: c.column_id, seedId: c.seed_id } : null;
          } catch { return null; }
        })(),
        maxEnergy: player.maxEnergy,
        tenderLevel: player.tenderLevel,
        healTier: player.healTier,
        healAmount: player.healAmount,
        wardRuneUnlocked: player.wardRuneUnlocked,
        tenderHp: player.tenderHp,
        maxTenderHp: player.maxTenderHp,
        pools: player.pools ?? null,
      },
    }));
  }
}

function tell(room: Room, text: string): void {
  room.tale.push({ at: Date.now(), text });
  if (room.tale.length > TALE_CAP * 2) room.tale = room.tale.slice(-TALE_CAP);
}

async function getRoom(id: string): Promise<Room> {
  let room = rooms.get(id);
  if (!room) {
    // The Dark's faces resolve once, at the room's making, under
    // the game's current-art law; null means the bundled face.
    const { art } = await resolveCurrentEnemyArt().catch(() => ({ art: {} as Record<string, { url: string } | null> }));
    room = {
      id, players: new Map(), tale: [], sky: await currentSky(),
      field: new Map(),
      workings: [],
      enemies: ENEMY_ROSTER.map(e => ({ ...e, art: art[e.name]?.url ?? null })),
      dark: new Map(),
      bastion: null,
      battle: { active: false, wave: 1, timer: null, ticking: false },
      roundNo: 0,
    };
    rooms.set(id, room);
  }
  return room;
}

// ── The Referee (P1, 2026-10-16) ────────────────────────
// The battle loop, run by the room itself. Damage is always
// the attacker's filed Power; Tenders are shielded by their
// standing company and hurt only when nothing stands (or by
// the Hollow, which drains energy instead of blood). Class
// flavor lives in targeting, exactly as the Compendium files
// it: the Unraveler hunts the strongest standing, the Fray
// swarm the weakest, the Tangle pins.

function hexDist(a: string, b: string): number {
  const ha = FIELD_HEXES_SERVER.find(h => h.id === a);
  const hb = FIELD_HEXES_SERVER.find(h => h.id === b);
  if (!ha || !hb) return 999;
  return Math.hypot(ha.x - hb.x, ha.y - hb.y);
}

function seatByKey(room: Room, key: string): Player | undefined {
  for (const p of room.players.values()) if (p.key === key) return p;
  return undefined;
}

/** Pay battle EXP to a seat's Tender (bound seats) and keep
 *  the seat's standing true when a level is crossed. */
async function payBattleExp(room: Room, seat: Player, amount: number, why: string): Promise<void> {
  if (!seat.expKey || amount <= 0) return;
  const before = seat.tenderLevel;
  const view = await awardTenderExp(seat.expKey, amount).catch(() => null);
  if (!view) return;
  if (view.level > before) {
    const gained = view.level - before;
    seat.tenderLevel = view.level;
    seat.healTier = view.healTier;
    seat.healAmount = view.healAmount;
    seat.wardRuneUnlocked = view.wardRuneUnlocked;
    seat.maxTenderHp = view.maxTenderHp;
    seat.tenderHp = Math.min(view.maxTenderHp, seat.tenderHp + 5 * gained);
    tell(room, `${seat.name} has reached Tender Lv ${view.level} — ${why} The party feels it.`);
  }
}


// ── The Written Light at the Table (2026-10-17) ─────────
// Nigel's ruling brought the glyphs and their functions to
// the Table: WARDS stand on the edge between two hexes,
// RUNES are written on a hex's ground, and BINDING covers
// the whole hex — a sprung rune holds everything standing
// on it, never a chosen one. Workings are written for one
// battle; when the battle ends the light fades (after any
// unfed Crown Shard has fallen where it must).

function neighborsOf(hex: string): string[] {
  const h = FIELD_HEXES_SERVER.find(x => x.id === hex);
  if (!h) return [];
  return FIELD_HEXES_SERVER.filter(x => x.id !== hex && Math.hypot(x.x - h.x, x.y - h.y) <= 52).map(x => x.id);
}

function engineBright(room: Room, ownerKey: string): boolean {
  return room.workings.some(w => w.engine === "engine" && w.ownerKey === ownerKey);
}

function beaconReach(w: Working): Set<string> {
  const out = new Set<string>();
  for (const hx of [w.hexA, w.hexB]) if (hx) { out.add(hx); for (const n of neighborsOf(hx)) out.add(n); }
  return out;
}

function fellDark(room: Room, enemy: EnemyUnit, killer: Player | null): void {
  room.dark.delete(enemy.hex);
  tell(room, `The ${enemy.label} unravels!`);
  if (killer && !killer.fallen) {
    killer.energy = Math.min(killer.maxEnergy + 10, killer.energy + 3);
    void payBattleExp(room, killer, 2, "The dark pays for its felling.");
  }
}

/** Spring the rune written on a hex, if the dark stands on it. */
function springHex(room: Room, hex: string, fired: Set<string>): void {
  const darkHere = [...room.dark.values()].filter(e => e.hex === hex);
  if (!darkHere.length) return;
  const rune = room.workings.find(w => w.kind === "rune" && w.hex === hex && !fired.has(w.id));
  if (!rune) return;
  fired.add(rune.id);
  const caster = seatByKey(room, rune.ownerKey) ?? null;
  const bright = caster && engineBright(room, caster.key) ? 1 : 0;
  if (rune.engine === "lattice") {
    // The Lattice holds with a health rating (Nigel, 2026-10-17):
    // pinning a dark costs the Lattice that dark's power from its
    // health — it holds what it can afford, and stands on while
    // health remains instead of spending itself in one spring.
    let heldCount = 0;
    for (const e of darkHere) {
      const strain = Math.max(1, e.power);
      if (rune.hp >= strain) {
        rune.hp -= strain;
        e.pinned = Math.max(e.pinned, rune.nums.pinRounds ?? 2);
        heldCount++;
      }
    }
    if (heldCount) tell(room, `${rune.name} springs — the floor is the snare, and ${heldCount} of the dark stand bound in light.`);
    if (rune.hp <= 0) {
      room.workings = room.workings.filter(w => w !== rune);
      tell(room, `${rune.name} is worn through and goes out, spent and honored.`);
    } else if (heldCount) {
      tell(room, `${rune.name} holds on — ❤${rune.hp} of its light remains.`);
    }
  } else if (rune.engine === "blade" || rune.engine === "blades") {
    const power = (rune.nums.power ?? (rune.engine === "blade" ? 6 : 3)) + bright * (rune.nums.brightBonus ?? 1);
    tell(room, `${rune.name} springs — ${power} harm to everything standing on its ground.`);
    for (const e of darkHere) { e.hp -= power; if (e.hp <= 0) fellDark(room, e, caster); }
    rune.charges--;
    if (rune.charges <= 0) room.workings = room.workings.filter(w => w !== rune);
    else tell(room, `${rune.name} hums on, waiting for one more.`);
  } else if (rune.engine === "coil") {
    const free = SUMMONABLE_HEXES.filter(hx => hx !== hex && !room.field.has(hx) && !room.dark.has(hx));
    let moved = 0;
    for (const e of darkHere) {
      if (!free.length) break;
      const spot = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      room.dark.delete(e.hex);
      e.hex = spot;
      room.dark.set(spot, e);
      moved++;
    }
    if (caster && moved) caster.energy = Math.min(caster.maxEnergy + 10, caster.energy + Math.min(rune.nums.energyCap ?? 3, moved * (rune.nums.energyPerDark ?? 1)));
    tell(room, `${rune.name} turns the dark aside — ${moved} thrown back to far ground, their strikes forgotten.`);
    room.workings = room.workings.filter(w => w !== rune);
  } else if (rune.engine === "shardrain") {
    // SHARD RAIN (Nigel, 2026-10-17): ONE pool over ALL the
    // covered ground. The group's hexes gather every foe
    // standing under the same writing; the dice — the base,
    // plus one per attunement level snapshotted at the cast —
    // roll once, and the pool splits between them all, the
    // remainder walking down the line one point at a time.
    const group = rune.group ?? rune.id;
    const covered = room.workings.filter(w => w.kind === "rune" && w.engine === "shardrain" && (w.group ?? w.id) === group);
    const hexSet = new Set(covered.map(w => w.hex));
    const foes = [...room.dark.values()].filter(e => hexSet.has(e.hex));
    if (foes.length) {
      const dice = Math.max(1, (rune.nums.diceBase ?? 2) + (rune.nums.dicePerLevel ?? 1) * (rune.nums.rainLevel ?? 0));
      const rolls: number[] = [];
      let pool = 0;
      for (let i = 0; i < dice; i++) { const r = 1 + Math.floor(Math.random() * 6); rolls.push(r); pool += r; }
      const share = Math.floor(pool / foes.length);
      let rem = pool - share * foes.length;
      tell(room, `${rune.name} FALLS — the sky opens over ${hexSet.size} hex${hexSet.size === 1 ? "" : "es"}: ${dice} dice (${rolls.join(" + ")}) make a pool of ${pool}, split over ${foes.length} of the dark — ${share} harm each${rem ? `, and ${rem} of them take one more` : ""}.`);
      for (const e of foes) {
        const d = share + (rem > 0 ? (rem--, 1) : 0);
        e.hp -= d;
        if (e.hp <= 0) fellDark(room, e, caster);
      }
      room.workings = room.workings.filter(w => !covered.includes(w));
    }
  } else if (rune.engine === "shard") {
    const greatest = Math.max(...darkHere.map(e => e.power));
    if (greatest >= (rune.nums.minPower ?? 5)) {
      const dmg = greatest * (rune.nums.multiplier ?? 2) + rune.pour * (rune.nums.harmPerPoint ?? 1);
      tell(room, `${rune.name} falls on the whole hex — ${dmg} harm, measured by the greatest standing there.`);
      for (const e of darkHere) { e.hp -= dmg; if (e.hp <= 0) fellDark(room, e, caster); }
      room.workings = room.workings.filter(w => w !== rune);
    }
  }
}

/** Battle's end: unfed Shards fall where they must; then all
 *  written light fades — it was written for this battle. */
function settleShardsAndFade(room: Room): void {
  for (const w of [...room.workings]) {
    if (w.engine !== "shard") continue;
    const mine = [...room.field.values()].filter(u => u.ownerKey === w.ownerKey);
    if (mine.length) {
      const strongest = mine.reduce((a, b) => (b.card.power > a.card.power ? b : a));
      const dmg = strongest.card.power * (w.nums.multiplier ?? 2) + w.pour * (w.nums.harmPerPoint ?? 1);
      strongest.hp -= dmg;
      tell(room, `${w.name} went unfed — a doom owed is a doom paid: it falls on ${strongest.card.name}, ${dmg} harm.`);
      if (strongest.hp <= 0) {
        room.field.delete(strongest.hex);
        const owner = seatByKey(room, strongest.ownerKey);
        if (owner) owner.hand = [...owner.hand, strongest.card];
        tell(room, `${strongest.card.name} dissipates to its Tender's roster.`);
      }
    } else {
      tell(room, `${w.name} went unfed, and falls on empty ground — the Balance accepts the smaller price.`);
    }
  }
  if (room.workings.length) {
    tell(room, "The written light fades from the field — it was written for this battle.");
    room.workings = [];
  }
}

function dealWave(room: Room): void {
  const wave = room.battle.wave;
  const free = SUMMONABLE_HEXES.filter(h => !room.field.has(h) && !room.dark.has(h));
  const kinds = ["fray", "fray", "fray", "tangle", "tangle", "hollow", "unraveler"];
  const count = Math.min(free.length, 3 + (wave - 1) * 2);
  const spots = [...free].sort(() => Math.random() - 0.5).slice(0, count);
  for (const hex of spots) {
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const base = ENEMY_STATS[kind];
    const rosterFace = room.enemies.find(e => e.name === kind);
    const hp = base.hp + (wave - 1);
    room.dark.set(hex, {
      hex, kind, label: rosterFace?.label ?? kind, art: rosterFace?.art ?? null,
      power: base.power + Math.floor((wave - 1) / 3), hp, maxHp: hp, pinned: 0,
    });
  }
  for (const hex of spots) springHex(room, hex, new Set());
  room.battle.active = true;
  room.roundNo = 0;
  tell(room, `Wave ${wave} is dealt — ${count} of the dark take the field.`);
  if (!room.battle.timer) {
    room.battle.timer = setInterval(() => { void runRound(room); }, 2800);
  }
}

/** The column takes the field (the Columns, 2026-10-17): the
 *  roster's true kinds and numbers, at the field's far edges,
 *  with the column's own hardened power and health. */
function dealBastion(room: Room): void {
  const b = room.bastion;
  if (!b) return;
  const center = FIELD_HEXES_SERVER.find(h => h.center) ?? FIELD_HEXES_SERVER[0];
  const free = SUMMONABLE_HEXES
    .filter(h => !room.field.has(h) && !room.dark.has(h))
    .map(id => FIELD_HEXES_SERVER.find(h => h.id === id)!)
    .sort((a, z) => ((z.x - center.x) ** 2 + (z.y - center.y) ** 2) - ((a.x - center.x) ** 2 + (a.y - center.y) ** 2));
  let i = 0;
  for (const entry of b.roster) {
    for (let n = 0; n < entry.count && i < free.length; n++, i++) {
      const hex = free[i].id;
      const face = room.enemies.find(e => e.name === entry.kind);
      room.dark.set(hex, {
        hex, kind: entry.kind, label: face?.label ?? entry.kind, art: face?.art ?? null,
        power: entry.power, hp: entry.hp, maxHp: entry.hp, pinned: 0,
      });
    }
  }
  for (const hex of [...room.dark.keys()]) springHex(room, hex, new Set());
  room.battle.active = true;
  room.roundNo = 0;
  b.begun = true;
  tell(room, `${b.kind === "siege" ? "The cursed bastion" : "The column"} is met — ${b.size} of the dark stand at the field's edge. ${b.ambush ? "Warned ahead, you strike with the ambush's edge (+1)." : ""} One pool binds you: ⚡${b.pool}.`);
  if (!room.battle.timer) {
    room.battle.timer = setInterval(() => { void runRound(room); }, 2800);
  }
}

/** A bastion battle WON (the Columns, 2026-10-17): the victory
 *  is reported to the land — the column falls and its break
 *  begins (with the reckoning paid to the standing Awoken), a
 *  besieged seed is LIBERATED, and guests carry home nothing
 *  but energy, as ruled. */
async function resolveBastionVictory(room: Room): Promise<void> {
  const b = room.bastion;
  if (!b || b.resolved) return;
  b.resolved = true;
  const ctx = { tender: { id: b.hostTenderId, tenderName: b.hostName } };
  const survivorPairs = [...room.field.values()].flatMap(u => {
    const seat = seatByKey(room, u.ownerKey);
    const id = Number((u.card as any).awokenId);
    return seat?.expKey && id > 0 ? [{ awakenedId: id, ownerKey: seat.expKey }] : [];
  });
  try {
    if (b.columnId) {
      await handlers.defeatIncursion({ columnId: b.columnId, survivorPairs }, ctx as any);
    }
    if (b.seedId) {
      const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ?").get(b.seedId) as any;
      if (seed && seed.state === "corrupted") {
        sqlite.prepare("UPDATE star_seeds SET state = 'fallen' WHERE id = ?").run(b.seedId);
        sqlite.prepare("UPDATE territory_tiles SET cursed = 0, element = 'neutral' WHERE id = ?").run(seed.tile_id);
        sqlite.prepare("UPDATE incursion_columns SET state = 'defeated', resolved_at = ? WHERE owner_key = ? AND target_tile_id = ? AND state = 'arrived'")
          .run(Date.now(), b.hostKey, seed.tile_id);
        tell(room, "The cursed bastion FALLS — the seed is free, and its hex is light again.");
      }
    }
    // Guests: nothing but energy, carried home.
    for (const p of room.players.values()) {
      if (p.watcher || !p.expKey || p.expKey === b.hostKey) continue;
      try {
        const cur = sqlite.prepare("SELECT energy FROM tender_resources WHERE owner_key = ?").get(p.expKey) as any;
        const max = await calculateMaxEnergy(p.expKey);
        const nowE = Number(cur?.energy ?? 10);
        sqlite.prepare(`INSERT INTO tender_resources (owner_key, energy, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(owner_key) DO UPDATE SET energy = excluded.energy, updated_at = excluded.updated_at`)
          .run(p.expKey, Math.min(max, nowE + Math.max(3, b.size)), Date.now());
      } catch { /* the road home is rough; the tale stands */ }
    }
    sqlite.prepare("UPDATE bastion_calls SET state = 'won' WHERE id = ?").run(b.callId);
    tell(room, "The call is answered and the day is won — the land reckons it so.");
  } catch { /* the report rides the next telling */ }
}

/** A bastion battle LOST: reported to the land — a held seed's
 *  hold breaks (its bastion falls, the seed corrupts); a siege
 *  simply fails, and the cursed bastion stands. */
async function resolveBastionDefeat(room: Room): Promise<void> {
  const b = room.bastion;
  if (!b || b.resolved) return;
  b.resolved = true;
  const ctx = { tender: { id: b.hostTenderId, tenderName: b.hostName } };
  try {
    if (b.columnId) await handlers.failIncursion({ columnId: b.columnId }, ctx as any).catch(() => {});
    sqlite.prepare("UPDATE bastion_calls SET state = 'lost' WHERE id = ?").run(b.callId);
    tell(room, "The call ends in the dark's keeping — the land reckons that too.");
  } catch { /* as above */ }
}

function endBattle(room: Room): void {
  room.battle.active = false;
  if (room.battle.timer) { clearInterval(room.battle.timer); room.battle.timer = null; }
}

async function runRound(room: Room): Promise<void> {
  if (!room.battle.active || room.battle.ticking) return;
  room.battle.ticking = true;
  try {
    await refreshGrimoire().catch(() => {});
    room.roundNo++;
    // The written light tends itself: living walls regrow,
    // and a standing Engine sings energy to its Tender.
    for (const w of room.workings) {
      if (w.engine === "trees" && w.hp > 0 && w.hp < (w.maxHp || (w.nums.hp ?? 8))) w.hp = Math.min(w.maxHp || (w.nums.hp ?? 8), w.hp + (w.nums.regrow ?? 2));
      if (w.engine === "engine") {
        const owner = seatByKey(room, w.ownerKey);
        if (owner && !owner.fallen) owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + (w.nums.energyPerRound ?? 1));
      }
    }
    // The standing strike first.
    for (const unit of [...room.field.values()]) {
      if (!room.field.has(unit.hex)) continue;
      if (room.dark.size === 0) break;
      if (unit.pinned > 0) { unit.pinned--; continue; }
      let target: EnemyUnit | null = null;
      let best = Infinity;
      for (const e of room.dark.values()) {
        const d = hexDist(unit.hex, e.hex) - e.hp * 0.01;
        if (d < best) { best = d; target = e; }
      }
      if (!target) break;
      const stdWard = room.workings.find(w => w.engine === "standard" && w.ownerKey === unit.ownerKey && (w.hexA === unit.hex || w.hexB === unit.hex));
      const bcnWard = room.workings.find(w => w.engine === "beacon" && w.ownerKey === unit.ownerKey && beaconReach(w).has(target.hex));
      const strikePower = unit.card.power
        + (stdWard ? (stdWard.nums.strikeBonus ?? 1) : 0)
        + (bcnWard ? (bcnWard.nums.darkBonus ?? 1) : 0)
        + (room.bastion?.ambush && room.bastion.begun ? 1 : 0); // the ambush bonus (Nigel, 2026-10-17)
      target.hp -= strikePower;
      if (target.hp <= 0) {
        room.dark.delete(target.hex);
        tell(room, `${unit.card.name} unravels the ${target.label}!`);
        const owner = seatByKey(room, unit.ownerKey);
        if (owner && !owner.fallen) {
          owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3); // the harvest
          await payBattleExp(room, owner, 2, "The dark pays for its felling.");
        }
      }
    }
    // The dark answers.
    for (const enemy of [...room.dark.values()]) {
      const standing = [...room.field.values()];
      if (enemy.pinned > 0) { enemy.pinned--; continue; }
      if (enemy.kind === "hollow") {
        if (room.bastion?.begun && !room.bastion.resolved) {
          room.bastion.pool = Math.max(0, room.bastion.pool - 2);
        } else {
          for (const p of room.players.values()) {
            if (!p.watcher && !p.fallen) p.energy = Math.max(0, p.energy - 2);
          }
        }
        continue;
      }
      if (standing.length > 0) {
        let victim: FieldUnit;
        if (enemy.kind === "unraveler") victim = standing.reduce((a, b) => (b.card.power > a.card.power ? b : a));
        else if (enemy.kind === "fray") victim = standing.reduce((a, b) => (b.hp < a.hp ? b : a));
        else victim = standing[Math.floor(Math.random() * standing.length)];
        // The written light answers first: a ward on the edge
        // between the striker and its mark may stop the blow.
        let blow = enemy.power;
        const edgeWards = room.workings.filter(w => w.kind === "ward" && w.ownerKey === victim.ownerKey &&
          ((w.hexA === enemy.hex && w.hexB === victim.hex) || (w.hexA === victim.hex && w.hexB === enemy.hex)));
        const seal = edgeWards.find(w => w.engine === "seal");
        if (seal && blow > 0) {
          blow = 0;
          enemy.hp -= (seal.nums.riposte ?? 3) + (engineBright(room, victim.ownerKey) ? (seal.nums.brightBonus ?? 1) : 0);
          seal.stops++;
          // The Seal's health rating (Nigel, 2026-10-17): every
          // blow it stops costs it that blow's power in health.
          seal.hp -= enemy.power;
          tell(room, `${seal.name} stops the ${enemy.label}'s strike cold — and answers it.`);
          if (enemy.hp <= 0) {
            room.dark.delete(enemy.hex);
            tell(room, `The ${enemy.label} unravels on the Seal's light!`);
            const owner = seatByKey(room, seal.ownerKey);
            if (owner && !owner.fallen) {
              owner.energy = Math.min(owner.maxEnergy + 10, owner.energy + 3);
              await payBattleExp(room, owner, 2, "The dark pays for its felling.");
            }
          }
          if (seal.stops >= (seal.nums.stops ?? 3)) {
            room.workings = room.workings.filter(w => w !== seal);
            tell(room, `${seal.name} has stopped its third strike; its light goes out, spent and honored.`);
          } else if (seal.hp <= 0) {
            room.workings = room.workings.filter(w => w !== seal);
            tell(room, `${seal.name} is worn through by the blows it stopped; its light goes out, spent and honored.`);
          }
        }
        const trees = edgeWards.find(w => w.engine === "trees");
        if (blow > 0 && trees) {
          trees.hp -= blow;
          blow = 0;
          tell(room, `${trees.name} take the blow meant for ${victim.card.name}.`);
          if (trees.hp <= 0) {
            room.workings = room.workings.filter(w => w !== trees);
            tell(room, `${trees.name} are broken — for this battle. The seed remembers them.`);
          }
        }
        victim.hp -= blow;
        if (enemy.kind === "tangle" && blow > 0) victim.pinned = Math.max(victim.pinned, 1);
        if (victim.hp <= 0) {
          room.field.delete(victim.hex);
          const owner = seatByKey(room, victim.ownerKey);
          if (owner) owner.hand = [...owner.hand, victim.card];
          tell(room, `The ${enemy.label} unravels ${victim.card.name} — it dissipates to its Tender's roster.`);
        }
      } else {
        // Nothing stands: the shield law leaves the Tenders bare.
        const bare = [...room.players.values()].filter(p => !p.watcher && !p.fallen);
        if (bare.length === 0) break;
        const tender = bare[Math.floor(Math.random() * bare.length)];
        tender.tenderHp -= enemy.power;
        if (tender.tenderHp <= 0) {
          tender.tenderHp = 0;
          tender.fallen = true;
          tell(room, `${tender.name} has fallen. The Bastion mourns — and fights on.`);
        }
      }
    }
    // Endings.
    const seatedAlive = [...room.players.values()].filter(p => !p.watcher && !p.fallen);
    if (room.dark.size === 0 && room.battle.active) {
      settleShardsAndFade(room);
      endBattle(room);
      if (room.bastion?.begun && !room.bastion.resolved) {
        tell(room, "The dark is broken at the bastion — the field breathes again.");
        for (const p of seatedAlive) await payBattleExp(room, p, 5, "A bastion held together pays together.");
        await resolveBastionVictory(room);
      } else {
        tell(room, `Wave ${room.battle.wave} is broken. The field breathes again.`);
        for (const p of seatedAlive) {
          p.energy = Math.min(p.maxEnergy + 10, p.energy + 5);
          await payBattleExp(room, p, 5, "A wave broken together pays together.");
        }
        room.battle.wave++;
      }
    } else if (seatedAlive.length === 0 && room.battle.active) {
      settleShardsAndFade(room);
      endBattle(room);
      if (room.bastion?.begun && !room.bastion.resolved) {
        await resolveBastionDefeat(room);
      } else {
        tell(room, `The dark holds the field. Wave ${room.battle.wave} stands unbroken — re-seat, recast, and begin it again.`);
      }
      room.dark.clear();
    }
    sendState(room);
  } finally {
    room.battle.ticking = false;
  }
}

function handleConnection(ws: WebSocket): void {
  let room: Room | null = null;
  let player: Player | null = null;

  const fail = (message: string) => {
    try { ws.send(JSON.stringify({ type: "joinError", message })); } catch {}
    try { ws.close(); } catch {}
  };

  ws.on("message", async (raw) => {
    // The Grimoire is a living book: a tuning saved in the
    // workshop is in the referee's hands by the next message.
    await refreshGrimoire().catch(() => {});
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "join") {
      if (room) return; // one seat per socket
      const roomId = String(msg.room || "the-table").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "the-table";
      let key = "";
      let name = "";
      let watcher = false;
      if (msg.watch === true) {
        watcher = true;
        key = `watch:${randomUUID()}`;
        name = String(msg.name || "A Watcher").slice(0, 40) || "A Watcher";
      } else if (typeof msg.authToken === "string" && authTokens.has(msg.authToken)) {
        const user = authTokens.get(msg.authToken)!;
        key = `discord:${user.id}`;
        name = user.name.slice(0, 60);
      } else if (!TABLE_CONFIGURED && typeof msg.devName === "string" && msg.devName.trim()) {
        // Doorway-test seats exist only while Discord itself is not
        // configured on the server. Once it is, a name at the Table is
        // a Discord name, proven by sign-in — never merely claimed.
        name = msg.devName.trim().slice(0, 40);
        key = `dev:${name.toLowerCase().replace(/\s+/g, "-")}`;
      } else {
        fail(TABLE_CONFIGURED
          ? "That seat needs a Discord sign-in. Reopen the Table from the voice channel, or watch instead."
          : "Give a name to take your seat.");
        return;
      }
      room = await getRoom(roomId);
      room.sky = await currentSky();
      const seatedCount = [...room.players.values()].filter(p => !p.watcher).length;
      if (!watcher && seatedCount >= MAX_SEATED) watcher = true; // a full table deals no sixth hand; watchers are welcome
      const profile = watcher ? { notes: "", inventory: [] as string[] } : await loadProfile(key, name);
      // The full roster stands at the Table (Nigel, 2026-10-16):
      // a bound seat brings its Tender's whole collection, and
      // its energy is that roster's own calculation by the game's
      // one law — all of it. An unbound seat brings the whole
      // stand-in pool and a stand-in's portion of energy.
      let hand: TableCard[] = [];
      let bound: string | null = null;
      let energy = 12;
      let maxEnergy = 12;
      let tenderLevel = 1;
      let healTier = healTierForLevel(1);
      let healAmount = healAmountForLevel(1);
      let wardRuneUnlocked = false;
      let maxTenderHp = tenderMaxHpForLevel(1);
      let expKey: string | null = null;
      if (!watcher && key.startsWith("discord:")) {
        const tenderId = await bindingFor(key.slice("discord:".length));
        if (tenderId !== null) {
          const cards = await deckForTender(tenderId).catch(() => [] as TableCard[]);
          if (cards.length) {
            hand = cards;
            bound = await tenderDisplayName(tenderId);
            maxEnergy = await calculateMaxEnergy(tenderOwnerKey(tenderId)).catch(() => 12);
            energy = maxEnergy;
            expKey = tenderOwnerKey(tenderId);
            const progress = await getTenderProgress(tenderOwnerKey(tenderId)).catch(() => null);
            if (progress) {
              tenderLevel = progress.level;
              healTier = progress.healTier;
              healAmount = progress.healAmount;
              wardRuneUnlocked = progress.wardRuneUnlocked;
              maxTenderHp = progress.maxTenderHp;
            }
          }
        }
      }
      if (!watcher && !bound) {
        hand = TEST_POOL.map(c => ({ ...c, id: randomUUID() }));
        energy = 12;
        maxEnergy = 12;
      }
      player = { key, name, watcher, hand, notes: profile.notes, inventory: profile.inventory, bound, energy, maxEnergy, tenderLevel, healTier, healAmount, wardRuneUnlocked, tenderHp: maxTenderHp, maxTenderHp, fallen: false, expKey, pools: expKey ? await attunementPools(expKey).catch(() => null) : null };
      room.players.set(ws, player);
      if (!watcher) {
        tell(room, `${name} takes a seat at the Table.`);
      }
      sendState(room);
      return;
    }

    if (!room || !player) return;

    if (msg.type === "roll") {
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no dice — bind in the game to be dealt a hand." }));
        return;
      }
      const sides = [4, 6, 8, 10, 12, 20, 100].includes(msg.sides) ? msg.sides : 20;
      const result = 1 + Math.floor(Math.random() * sides);
      tell(room, `${player.name} rolled d${sides} → ${result}.`);
      sendState(room);
      return;
    }

    // CASTING (P1, 2026-10-16): a card leaves the roster and
    // stands on a ring hex, at a cost of its power in energy.
    // The center hex is the star-seed and is never stood upon.
    if (msg.type === "summon") {
      if (player.fallen) {
        ws.send(JSON.stringify({ type: "error", message: "You have fallen — you will rise between waves." }));
        return;
      }
      if (player.watcher) {
        ws.send(JSON.stringify({ type: "error", message: "Watchers hold no hand to cast from." }));
        return;
      }
      const hex = String(msg.hex ?? "");
      const cardId = String(msg.cardId ?? "");
      const card = player.hand.find(c => c.id === cardId);
      if (!SUMMONABLE_HEXES.includes(hex)) {
        ws.send(JSON.stringify({ type: "error", message: "An Awoken stands on a field hex — the center hex is the star-seed's." }));
        return;
      }
      if (room.field.has(hex)) {
        ws.send(JSON.stringify({ type: "error", message: "That hex is already stood upon." }));
        return;
      }
      if (!card) {
        ws.send(JSON.stringify({ type: "error", message: "That Awoken is not in your roster." }));
        return;
      }
      const cost = Math.max(1, card.power);
      if (room.bastion?.begun && !room.bastion.resolved) {
        // One pool binds the muster (Nigel, 2026-10-17): joining
        // Tenders' energy joins the pool, scaled by level.
        if (room.bastion.pool < cost) {
          ws.send(JSON.stringify({ type: "error", message: `${card.name} costs ⚡${cost} — the pool holds ⚡${room.bastion.pool}.` }));
          return;
        }
        room.bastion.pool -= cost;
      } else {
        if (player.energy < cost) {
          ws.send(JSON.stringify({ type: "error", message: `${card.name} costs ⚡${cost} — you hold ⚡${player.energy}.` }));
          return;
        }
        player.energy -= cost;
      }
      player.hand = player.hand.filter(c => c.id !== cardId);
      room.field.set(hex, {
        hex, card, hp: card.toughness, maxHp: card.toughness,
        ownerKey: player.key, ownerName: player.name, pinned: 0,
      });
      tell(room, `${player.name} casts ${card.name} onto the field (⚡${cost}).`);
      sendState(room);
      return;
    }

    // RECALL: your own standing Awoken steps back into the
    // roster. The energy spent casting is not returned — what
    // was spent was spent.
    if (msg.type === "recall") {
      if (player.fallen) return;
      const hex = String(msg.hex ?? "");
      const unit = room.field.get(hex);
      if (!unit) return;
      if (unit.ownerKey !== player.key) {
        ws.send(JSON.stringify({ type: "error", message: "That Awoken answers to another Tender." }));
        return;
      }
      room.field.delete(hex);
      player.hand = [...player.hand, unit.card];
      tell(room, `${player.name} recalls ${unit.card.name} from the field.`);
      sendState(room);
      return;
    }

    // BEGIN THE UNRAVELING: any standing seat may call the
    // wave down. The referee deals and the rounds begin.
    // THE WRITTEN LIGHT (2026-10-17): wards raised on edges,
    // runes written on ground, heal by a Tender's tier. Priced in
    // energy, gated by Tender level (wards & runes at Lv 3+), and
    // refused plainly when the Table cannot honor them. The hue
    // is chosen at the pour: in this first seating it names and
    // dresses the working; the attunement twists ride the
    // Tender's own elemental tree when that is built.
    if (msg.type === "castHeal") {
      if (!player) return;
      if (player.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers hold no mending — bind in the game to cast." })); return; }
      const unit = room.field.get(String(msg.hex || ""));
      if (!unit || unit.ownerKey !== player.key) { ws.send(JSON.stringify({ type: "error", message: "Heal reaches only your own standing Awoken." })); return; }
      if (unit.hp >= unit.maxHp) { ws.send(JSON.stringify({ type: "error", message: `${unit.card.name} stands whole already.` })); return; }
      const healCost = healSpell()?.cost ?? 2;
      if (player.energy < healCost) { ws.send(JSON.stringify({ type: "error", message: `Heal costs ⚡${healCost} — you hold ⚡${player.energy}.` })); return; }
      player.energy -= healCost;
      const healed = Math.min(player.healAmount, unit.maxHp - unit.hp);
      unit.hp += healed;
      tell(room, `${player.name} mends ${unit.card.name} — ${healed} HP restored (Heal, Tier ${player.healTier}).`);
      sendState(room);
      return;
    }

    if (msg.type === "castWard") {
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers raise no wards — bind in the game to cast." })); return; }
      const def = spellByKey(String(msg.root || ""));
      if (!def || def.kind !== "ward") { ws.send(JSON.stringify({ type: "error", message: "That is not a ward of the Written Light." })); return; }
      if (def.engine === "springleaf") { ws.send(JSON.stringify({ type: "error", message: "The Springleaf Ward answers columns on the land — it has no purchase on the Table's dark." })); return; }
      if (!caster.wardRuneUnlocked) { ws.send(JSON.stringify({ type: "error", message: `Wards wake at Tender Lv 3 — you stand at Lv ${caster.tenderLevel}.` })); return; }
      const hue = (HUE_ORDER as readonly string[]).includes(String(msg.hue)) ? String(msg.hue) : "unaligned";
      const hexA = String(msg.hexA || "");
      const hexB = String(msg.hexB || "");
      const mine = room.field.get(hexA);
      if (!mine || mine.ownerKey !== caster.key) { ws.send(JSON.stringify({ type: "error", message: "A ward stands on the edge of a hex your own Awoken holds." })); return; }
      if (!neighborsOf(hexA).includes(hexB)) { ws.send(JSON.stringify({ type: "error", message: "That edge does not exist — the two hexes must share a side." })); return; }
      if (room.workings.some(w => w.kind === "ward" && ((w.hexA === hexA && w.hexB === hexB) || (w.hexA === hexB && w.hexB === hexA)))) { ws.send(JSON.stringify({ type: "error", message: "A ward already stands on that edge." })); return; }
      if (def.engine === "standard" && room.workings.some(w => w.engine === "standard" && w.ownerKey === caster.key)) { ws.send(JSON.stringify({ type: "error", message: "One Standard per Tender — yours already flies." })); return; }
      if (caster.energy < def.cost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${def.cost} — you hold ⚡${caster.energy}.` })); return; }
      // The Pour (Nigel, 2026-10-17): elemental points of the
      // poured hue, fed into the working at its cast — capped by
      // the book, drawn from the caster's own attunement pool,
      // and checked before anything is spent, so a refused cast
      // costs nothing.
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      let pour = 0;
      if (pourWanted > 0) {
        if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} takes no pour — its strength is not bought with attunement.` })); return; }
        if (hue === "unaligned") { ws.send(JSON.stringify({ type: "error", message: "An unaligned cast has no element to pour — choose a hue, and its pool feeds the working." })); return; }
        if (!caster.expKey) { ws.send(JSON.stringify({ type: "error", message: "Pouring draws on your attunement pools — bind your Tender at the Table to pour." })); return; }
        const pools = await attunementPools(caster.expKey);
        const cap = pourCapFor(def, pools, hue);
        if (pourWanted > cap) { ws.send(JSON.stringify({ type: "error", message: `Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.` })); return; }
        const held = pools[hue] ?? 0;
        if (held < pourWanted) { ws.send(JSON.stringify({ type: "error", message: `Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${held}.` })); return; }
        pour = pourWanted;
      }
      caster.energy -= def.cost;
      if (pour > 0 && caster.expKey) {
        await spendAttunement(caster.expKey, hue, pour);
        if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pour);
      }
      // The health rating: holding wards are raised with health
      // grown from the book's base, the caster's level, the pour.
      const hp = hpForCast(def, caster.tenderLevel, pour, engineBright(room, caster.key));
      room.workings.push({
        id: randomUUID(), kind: "ward", root: def.key, engine: def.engine, nums: { ...def.numbers }, name: def.forms[hue] ?? def.name, hue,
        ownerKey: caster.key, ownerName: caster.name, hex: null, hexA, hexB,
        hp, maxHp: hp, pour, stops: 0, charges: 0,
      });
      tell(room, `${caster.name} raises ${def.forms[hue] ?? def.name} on the edge of ${mine.card.name}'s hex.`);
      sendState(room);
      return;
    }

    if (msg.type === "castRune") {
      if (!player) return;
      const caster = player;
      if (caster.watcher) { ws.send(JSON.stringify({ type: "error", message: "Watchers write no runes — bind in the game to cast." })); return; }
      const def = spellByKey(String(msg.root || ""));
      if (!def || (def.kind !== "rune" && def.kind !== "spell")) { ws.send(JSON.stringify({ type: "error", message: "That is not a rune of the Written Light." })); return; }
      if (!caster.wardRuneUnlocked) { ws.send(JSON.stringify({ type: "error", message: `Runes wake at Tender Lv 3 — you stand at Lv ${caster.tenderLevel}.` })); return; }
      const hue = (HUE_ORDER as readonly string[]).includes(String(msg.hue)) ? String(msg.hue) : "unaligned";
      const hexes: string[] = Array.isArray(msg.hexes) ? [...new Set<string>(msg.hexes.map((h: unknown) => String(h)))].slice(0, 12) : [];
      if (def.engine === "blades") {
        const maxT = def.numbers.maxTargets ?? 3;
        if (hexes.length < 1 || hexes.length > maxT) { ws.send(JSON.stringify({ type: "error", message: `${def.name} is planted on one to ${maxT} hexes.` })); return; }
      } else if (def.engine === "shardrain") {
        const maxT = def.numbers.maxHexes ?? 3;
        if (hexes.length < 1 || hexes.length > maxT) { ws.send(JSON.stringify({ type: "error", message: `${def.name} is written over one to ${maxT} hexes of ground.` })); return; }
      } else if (hexes.length !== 1) { ws.send(JSON.stringify({ type: "error", message: "That rune is written on one hex's ground." })); return; }
      for (const hx of hexes) {
        if (!SUMMONABLE_HEXES.includes(hx)) { ws.send(JSON.stringify({ type: "error", message: "Runes are written on the field's ground — not on the star-seed's hex." })); return; }
        if (room.workings.some(w => w.kind === "rune" && w.hex === hx)) { ws.send(JSON.stringify({ type: "error", message: "That ground is already written — one writing per hex." })); return; }
      }
      if (caster.energy < def.cost) { ws.send(JSON.stringify({ type: "error", message: `${def.name} costs ⚡${def.cost} — you hold ⚡${caster.energy}.` })); return; }
      // The Pour, as at the ward's raising — one pour feeds the
      // whole cast (the Three Blades drink once, not per hex).
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      let pour = 0;
      if (pourWanted > 0) {
        if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { ws.send(JSON.stringify({ type: "error", message: `${def.name} takes no pour — its strength is not bought with attunement.` })); return; }
        if (hue === "unaligned") { ws.send(JSON.stringify({ type: "error", message: "An unaligned cast has no element to pour — choose a hue, and its pool feeds the working." })); return; }
        if (!caster.expKey) { ws.send(JSON.stringify({ type: "error", message: "Pouring draws on your attunement pools — bind your Tender at the Table to pour." })); return; }
        const pools = await attunementPools(caster.expKey);
        const cap = pourCapFor(def, pools, hue);
        if (pourWanted > cap) { ws.send(JSON.stringify({ type: "error", message: `Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.` })); return; }
        const held = pools[hue] ?? 0;
        if (held < pourWanted) { ws.send(JSON.stringify({ type: "error", message: `Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${held}.` })); return; }
        pour = pourWanted;
      }
      caster.energy -= def.cost;
      if (pour > 0 && caster.expKey) {
        await spendAttunement(caster.expKey, hue, pour);
        if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pour);
      }
      const hp = hpForCast(def, caster.tenderLevel, pour, false);
      // SHARD RAIN (Nigel, 2026-10-17): the caster's attunement
      // LEVEL in the spell's element is snapshotted at the cast,
      // as HP is — the rain that falls later rolls by the sky
      // the caster stood under when they wrote it. An unaligned
      // cast rolls the base dice alone.
      let rainNums: Record<string, number> = { ...def.numbers };
      if (def.engine === "shardrain") {
        let lvl = 0;
        if (hue !== "unaligned" && caster.expKey) {
          const pools = await attunementPools(caster.expKey).catch(() => null);
          if (pools) lvl = attunementLevel(pools[hue] ?? 0);
        }
        rainNums = { ...def.numbers, rainLevel: lvl };
      }
      const group = randomUUID();
      for (const hx of hexes) {
        room.workings.push({
          id: randomUUID(), kind: "rune", root: def.key, engine: def.engine, nums: rainNums, name: def.forms[hue] ?? def.name, hue,
          ownerKey: caster.key, ownerName: caster.name, hex: hx, hexA: null, hexB: null,
          hp, maxHp: hp, pour, stops: 0, charges: def.engine === "blade" ? (def.numbers.charges ?? 2) : 1,
          group,
        });
      }
      tell(room, hexes.length > 1
        ? `${caster.name} writes ${def.forms[hue] ?? def.name} across ${hexes.length} hexes.`
        : `${caster.name} writes ${def.forms[hue] ?? def.name} on the ground of the field.`);
      for (const hx of hexes) springHex(room, hx, new Set());
      sendState(room);
      return;
    }

    if (msg.type === "pourWorking") {
      // PUSH A NEUTRAL RUNE (Nigel, 2026-10-17): a neutral rune
      // already standing on the field — your own OR AN ALLY'S —
      // may be pushed either way: pour an element into it and it
      // takes that hue. The pour obeys the cast's law (your
      // attunement level in the pushed element is the depth cap,
      // the points are truly spent) and the rune gains the
      // pour's measure of health, as if fed at its raising.
      // Runes that take no pour cannot be pushed.
      const caster = player;
      const fail = (message: string) => { ws.send(JSON.stringify({ type: "error", message })); };
      const w = room.workings.find(x => x.id === String(msg.workingId));
      if (!w) { fail("No such working stands on the field."); return; }
      if (w.kind !== "rune") { fail("Only a rune can be pushed — a ward's hue is chosen at its raising."); return; }
      if (w.hue !== "unaligned") { fail(`That rune already burns ${w.hue} — its way is chosen.`); return; }
      const def = spellByKey(w.root);
      if (!def) { fail("That rune's spell is no longer in the book."); return; }
      if (!(POUR_ENGINES as readonly string[]).includes(def.engine)) { fail(`${def.name} takes no pour — there is nothing to push it with.`); return; }
      const hue = String(msg.hue ?? "");
      if (!(HUE_ORDER as readonly string[]).includes(hue) || hue === "unaligned") { fail("Name the element to push the rune toward."); return; }
      const pourWanted = Math.max(0, Math.floor(Number(msg.pour) || 0));
      if (pourWanted < 1) { fail("Name the depth to pour."); return; }
      if (!caster.expKey) { fail("Pouring draws on your attunement pools — bind your Tender at the Table to pour."); return; }
      const pools = await attunementPools(caster.expKey);
      const cap = attunementLevel(pools[hue] ?? 0);
      if (pourWanted > cap) { fail(`Your ${hue} attunement stands at Lv ${cap} — you pour no deeper than your attunement.`); return; }
      if ((pools[hue] ?? 0) < pourWanted) { fail(`Pouring ${pourWanted} ${hue} points — your ${hue} pool holds ${pools[hue] ?? 0}.`); return; }
      await spendAttunement(caster.expKey, hue, pourWanted);
      if (caster.pools) caster.pools[hue] = Math.max(0, (caster.pools[hue] ?? 0) - pourWanted);
      const gained = Math.floor((def.numbers.hpPerPoint ?? 0) * pourWanted);
      w.hue = hue; w.pour = (w.pour ?? 0) + pourWanted; w.name = def.forms[hue] ?? w.name;
      w.hp += gained; w.maxHp += gained;
      tell(room, `${caster.name} pushes ${def.name} toward ${hue} — poured ${pourWanted} deep, and the rune takes the hue.`);
      sendState(room);
      return;
    }

    if (msg.type === "startWave") {
      if (player.watcher || player.fallen) {
        ws.send(JSON.stringify({ type: "error", message: "Only a standing seat at the Table may begin the Unraveling." }));
        return;
      }
      if (room.battle.active) {
        ws.send(JSON.stringify({ type: "error", message: "The wave is already on the field." }));
        return;
      }
      if (room.dark.size > 0) room.dark.clear();
      // The fallen rise again between waves, at half their ward.
      for (const p of room.players.values()) {
        if (p.fallen) { p.fallen = false; p.tenderHp = Math.ceil(p.maxTenderHp / 2); }
      }
      dealWave(room);
      tell(room, `${player.name} begins the Unraveling.`);
      sendState(room);
      return;
    }

    // CLAIM A CALL (the Columns, 2026-10-17): the host seat of a
    // standing call seats it in this room. The pool is struck
    // from the seats then present — their max energy, each
    // scaled +2 per level above the first.
    if (msg.type === "claimBastion") {
      if (player.watcher || !player.expKey) {
        ws.send(JSON.stringify({ type: "error", message: "Only a bound seat can claim its call." }));
        return;
      }
      if (room.bastion) {
        ws.send(JSON.stringify({ type: "error", message: "A call already stands claimed in this room." }));
        return;
      }
      const callId = Math.floor(Number(msg.callId ?? 0));
      const call = sqlite.prepare("SELECT * FROM bastion_calls WHERE id = ? AND state = 'open'").get(callId) as any;
      if (!call) { ws.send(JSON.stringify({ type: "error", message: "No open call by that name stands." })); return; }
      if (call.owner_key !== player.expKey) { ws.send(JSON.stringify({ type: "error", message: "That call is another Tender's to claim." })); return; }
      let roster: { kind: string; count: number; power: number; hp: number }[] = [];
      let size = 0;
      if (call.column_id) {
        const col = sqlite.prepare("SELECT * FROM incursion_columns WHERE id = ?").get(call.column_id) as any;
        if (!col) { ws.send(JSON.stringify({ type: "error", message: "The column that call named is gone." })); return; }
        roster = incursionRoster(Number(col.size), Number(col.power));
        size = Number(col.size);
      } else if (call.seed_id) {
        const seed = sqlite.prepare("SELECT * FROM star_seeds WHERE id = ?").get(call.seed_id) as any;
        size = 8 + 2 * Number(seed?.level ?? 1);
        roster = incursionRoster(size, 2);
      }
      let pool = 0;
      for (const p of room.players.values()) {
        if (p.watcher) continue;
        pool += p.maxEnergy + 2 * Math.max(0, p.tenderLevel - 1);
      }
      room.bastion = {
        callId: call.id, kind: call.kind, hostKey: call.owner_key, hostTenderId: call.host_tender_id,
        hostName: player.name, columnId: call.column_id, seedId: call.seed_id,
        roster, size, ambush: call.kind === "ambush",
        pool, poolMax: pool, begun: false, resolved: false,
      };
      tell(room, `${player.name} claims the call: a ${call.kind.toUpperCase()} — ${size} of the dark. Friends, take your seats; the host begins it when the muster is ready. The pool stands at ⚡${pool}.`);
      sendState(room);
      return;
    }

    // BEGIN THE BASTION BATTLE: the host alone deals the column.
    if (msg.type === "startBastion") {
      if (!room.bastion) { ws.send(JSON.stringify({ type: "error", message: "No call stands claimed in this room." })); return; }
      if (player.expKey !== room.bastion.hostKey) { ws.send(JSON.stringify({ type: "error", message: "The host begins their own call." })); return; }
      if (room.battle.active || room.bastion.begun) { ws.send(JSON.stringify({ type: "error", message: "The battle is already joined." })); return; }
      if (room.dark.size > 0) room.dark.clear();
      for (const p of room.players.values()) {
        if (p.fallen) { p.fallen = false; p.tenderHp = Math.ceil(p.maxTenderHp / 2); }
      }
      dealBastion(room);
      sendState(room);
      return;
    }

    if (msg.type === "notes" && !player.watcher) {
      player.notes = String(msg.text ?? "").slice(0, 8000);
      await saveProfile(player);
      sendState(room);
      return;
    }

    if (msg.type === "inventory" && !player.watcher) {
      const items = Array.isArray(msg.items) ? msg.items.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 120)).slice(0, 100) : [];
      player.inventory = items;
      await saveProfile(player);
      sendState(room);
      return;
    }
  });

  ws.on("close", () => {
    if (room && player) {
      room.players.delete(ws);
      if (!player.watcher) tell(room, `${player.name} leaves the Table.`);
      if (room.players.size === 0) { endBattle(room); rooms.delete(room.id); }
      else sendState(room);
    }
  });
  ws.on("error", () => { try { ws.close(); } catch {} });
}

/** Which page the Discord door opens: "table" (the room itself, the
 *  default) or "control" (the bare handshake instrument of the
 *  2026-10-16 audit), switched from the UI Workshop via the generic
 *  setUiConfig action, key "table.doorMode". Read fresh on every
 *  door request so the switch needs no restart. */
export function tableDoorMode(): string {
  try {
    const [row] = db.select().from(schema.uiConfig)
      .where(eq(schema.uiConfig.key, "table.doorMode")).limit(1).all();
    if (row && JSON.parse(row.value) === "control") return "control";
  } catch {}
  return "table";
}

/** Mint a seat token for a Discord-proven user (the auth route's
 *  last step, shared so a seat token means the same thing wherever
 *  it is issued). */
export function issueTableToken(user: { id: string; name: string }): string {
  const token = randomUUID();
  authTokens.set(token, user);
  return token;
}

/** Mount the Table's HTTP routes: config + sign-in exchange. These
 *  must be registered BEFORE the static bundle and its SPA fallback in
 *  index.ts, or the fallback answers /api/table/* with index.html.
 *  Secrets stay server-side, always. */
export function registerTableRoutes(app: Express): void {
  app.get("/api/table/config", (_req: Request, res: Response) => {
    res.json({ discordClientId: DISCORD_CLIENT_ID || null, devMode: !TABLE_CONFIGURED });
  });

  // Spend a binding code (minted in the game by getTableBindCode):
  // the seat's proven Discord token names who is binding; the code
  // names the Tender. One Discord name ↔ one Tender: binding moves
  // the Tender's bond wholesale and replaces this name's old bond.
  app.post("/api/table/bind", async (req: Request, res: Response) => {
    const token = String(req.body?.token ?? "");
    const code = String(req.body?.code ?? "").trim().toUpperCase();
    const user = authTokens.get(token);
    if (!user) { res.status(401).json({ error: "That seat is not signed in — reopen the Table from Discord." }); return; }
    if (!code) { res.status(400).json({ error: "Give the binding code from the game." }); return; }
    const rows = await db.select().from(schema.tableBindCodes)
      .where(eq(schema.tableBindCodes.code, code)).limit(1);
    const row = rows[0];
    if (!row || row.usedAt !== null || row.expiresAt < Date.now()) {
      res.status(400).json({ error: "That code has faded or was already spent. Take a fresh one in the game." });
      return;
    }
    await db.update(schema.tableBindCodes).set({ usedAt: Date.now() })
      .where(eq(schema.tableBindCodes.code, code));
    await db.delete(schema.tableBindings)
      .where(eq(schema.tableBindings.tenderId, row.tenderId));
    await db.insert(schema.tableBindings)
      .values({ discordId: user.id, tenderId: row.tenderId })
      .onConflictDoUpdate({ target: schema.tableBindings.discordId, set: { tenderId: row.tenderId } });
    res.json({ ok: true, tenderName: await tenderDisplayName(row.tenderId) });
  });

  app.post("/api/table/auth", async (req: Request, res: Response) => {
    const code = String(req.body?.code ?? "");
    if (!code) { res.status(400).json({ error: "Missing sign-in code." }); return; }
    if (!TABLE_CONFIGURED) { res.status(503).json({ error: "Discord is not configured on the server yet." }); return; }
    try {
      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
        }),
      });
      if (!tokenRes.ok) { res.status(401).json({ error: "Discord refused the sign-in." }); return; }
      const tok = (await tokenRes.json()) as { access_token: string };
      const userRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      if (!userRes.ok) { res.status(401).json({ error: "Discord would not name you." }); return; }
      const user = (await userRes.json()) as { id: string; username: string; global_name?: string | null };
      const name = user.global_name || user.username;
      const token = issueTableToken({ id: String(user.id), name });
      res.json({ token, accessToken: tok.access_token, user: { id: String(user.id), name } });
    } catch {
      res.status(502).json({ error: "Discord could not be reached." });
    }
  });
}

/** Mount the Table's realtime room socket on the HTTP server. */
export function registerTableSocket(server: Server): void {
  void refreshGrimoire();
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    let pathname = "";
    try { pathname = new URL(req.url ?? "/", "http://localhost").pathname; } catch {}
    if (pathname === "/table/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });
  wss.on("connection", handleConnection);

  // Keep dead sockets from lingering as ghosts at the Table.
  const sweep = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN && client.readyState !== WebSocket.CONNECTING) {
        try { client.terminate(); } catch {}
      }
    }
  }, 30_000);
  sweep.unref?.();
}
