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
import { db, schema } from "./store.js";
import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET } from "./config.js";
import { tenderOwnerKey } from "./tenders.js";
import { awakenedPayloadById, calculateMaxEnergy, resolveCurrentEnemyArt } from "./actions.js";
import { getTenderProgress, healTierForLevel, healAmountForLevel, tenderMaxHpForLevel } from "./tenderExp.js";

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
}

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

interface Room {
  id: string;
  players: Map<WebSocket, Player>;
  tale: TaleEntry[];
  sky: { mood: string; description: string; endsAt: string | null };
  field: Map<string, FieldUnit>;
  enemies: { name: string; label: string; note: string; art: string | null }[];
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
    round: 0,
    threat: 0,
    players: seated.map(p => ({ key: p.key, name: p.name, handCount: p.hand.length, energy: p.energy, maxEnergy: p.maxEnergy, tenderHp: p.tenderHp, maxTenderHp: p.maxTenderHp })),
    watcherCount: room.players.size - seated.length,
    tale: room.tale.slice(-TALE_CAP),
    field: [...room.field.values()].map(u => ({
      hex: u.hex, name: u.card.name, art: u.card.art ?? null, element: u.card.element,
      power: u.card.power, toughness: u.card.toughness, hp: u.hp, maxHp: u.maxHp,
      level: u.card.level ?? null, ownerKey: u.ownerKey, ownerName: u.ownerName,
    })),
    enemies: room.enemies,
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
        energy: player.energy,
        maxEnergy: player.maxEnergy,
        tenderLevel: player.tenderLevel,
        healTier: player.healTier,
        healAmount: player.healAmount,
        wardRuneUnlocked: player.wardRuneUnlocked,
        tenderHp: player.tenderHp,
        maxTenderHp: player.maxTenderHp,
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
      enemies: ENEMY_ROSTER.map(e => ({ ...e, art: art[e.name]?.url ?? null })),
    };
    rooms.set(id, room);
  }
  return room;
}

function handleConnection(ws: WebSocket): void {
  let room: Room | null = null;
  let player: Player | null = null;

  const fail = (message: string) => {
    try { ws.send(JSON.stringify({ type: "joinError", message })); } catch {}
    try { ws.close(); } catch {}
  };

  ws.on("message", async (raw) => {
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
      if (!watcher && key.startsWith("discord:")) {
        const tenderId = await bindingFor(key.slice("discord:".length));
        if (tenderId !== null) {
          const cards = await deckForTender(tenderId).catch(() => [] as TableCard[]);
          if (cards.length) {
            hand = cards;
            bound = await tenderDisplayName(tenderId);
            maxEnergy = await calculateMaxEnergy(tenderOwnerKey(tenderId)).catch(() => 12);
            energy = maxEnergy;
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
      player = { key, name, watcher, hand, notes: profile.notes, inventory: profile.inventory, bound, energy, maxEnergy, tenderLevel, healTier, healAmount, wardRuneUnlocked, tenderHp: maxTenderHp, maxTenderHp };
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
      if (player.energy < cost) {
        ws.send(JSON.stringify({ type: "error", message: `${card.name} costs ⚡${cost} — you hold ⚡${player.energy}.` }));
        return;
      }
      player.energy -= cost;
      player.hand = player.hand.filter(c => c.id !== cardId);
      room.field.set(hex, {
        hex, card, hp: card.toughness, maxHp: card.toughness,
        ownerKey: player.key, ownerName: player.name,
      });
      tell(room, `${player.name} casts ${card.name} onto the field (⚡${cost}).`);
      sendState(room);
      return;
    }

    // RECALL: your own standing Awoken steps back into the
    // roster. The energy spent casting is not returned — what
    // was spent was spent.
    if (msg.type === "recall") {
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
      if (room.players.size === 0) rooms.delete(room.id);
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
