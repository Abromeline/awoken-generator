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

const TABLE_CONFIGURED = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
const MAX_SEATED = 5; // ruled 2026-10-15: up to 5 Tenders to a table
const TALE_CAP = 100;

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
}

/** The P0 test pool. Test cards only — real decks arrive with account
 *  binding in P1; the Table says so on its face. */
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
  hand: TableCard[];
  notes: string;
  inventory: string[];
}

interface TaleEntry {
  at: number;
  text: string;
}

interface Room {
  id: string;
  players: Map<WebSocket, Player>;
  tale: TaleEntry[];
  shoe: TableCard[];
  sky: { mood: string; description: string; endsAt: string | null };
}

const rooms = new Map<string, Room>();
/** Sign-in tokens issued by /api/table/auth: token → Discord user. */
const authTokens = new Map<string, { id: string; name: string }>();

function shuffledShoe(): TableCard[] {
  const cards: TableCard[] = [];
  for (let copy = 0; copy < 3; copy++) {
    for (const c of TEST_POOL) cards.push({ ...c, id: randomUUID() });
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function dealHand(room: Room): TableCard[] {
  if (room.shoe.length < 5) room.shoe = shuffledShoe();
  return room.shoe.splice(0, 5);
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
    players: seated.map(p => ({ key: p.key, name: p.name, handCount: p.hand.length })),
    watcherCount: room.players.size - seated.length,
    tale: room.tale.slice(-TALE_CAP),
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
    room = { id, players: new Map(), tale: [], shoe: shuffledShoe(), sky: await currentSky() };
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
      player = { key, name, watcher, hand: watcher ? [] : dealHand(room), notes: profile.notes, inventory: profile.inventory };
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

/** Mount the Table's HTTP routes: config + sign-in exchange. These
 *  must be registered BEFORE the static bundle and its SPA fallback in
 *  index.ts, or the fallback answers /api/table/* with index.html.
 *  Secrets stay server-side, always. */
export function registerTableRoutes(app: Express): void {
  app.get("/api/table/config", (_req: Request, res: Response) => {
    res.json({ discordClientId: DISCORD_CLIENT_ID || null, devMode: !TABLE_CONFIGURED });
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
      const token = randomUUID();
      authTokens.set(token, { id: String(user.id), name });
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
