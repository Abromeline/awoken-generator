// THE HOMELAND SERVES DISCORD — THE ROOM LAYER (Nigel,
// 2026-10-28: "push the new homeland as it is to the discord
// with its current rules" · "It still give the ability to
// search for a starseed, creating a new table" · "As well as
// host homeland").
//
// A room is a LAYER over the homeland, never a fork of it: the
// room names a LAND (a host's own homeland, or an instance land
// dealt for the room) and seats up to eight Tenders on it. Every
// act in the room runs through the homeland's own action
// handlers with the room in the call's context (actions.ts:
// landKeyFor / actorKeyFor) — the land's rows are the one
// record, settled once by the homeland's own lazy reckoning,
// read by every seat alike. There is no port and no second
// referee: what a guest wins, purifies, builds or loses here
// is the host's land itself, for real, both ways (Nigel's
// hosted-land rulings, 2026-10-24).
//
// This module holds only what the homeland has never needed:
// seats and their figure stands, the doors, the room's Tale,
// and the dice box. The old Table's room engine (table.ts)
// keeps serving the TEST GROUND tab; it is not the seat's road
// any more.

import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema, sqlite } from "./store.js";
import { tenderFromToken, tenderOwnerKey, tenderTokenFromHeader, hashPassword, verifyPassword } from "./tenders.js";
import { getTenderProgress } from "./tenderExp.js";
import { curseHpFor, seedStageForLevel, type WorldMood } from "./actions.js";

/** Seats at a room (carried from the Table's standing cap,
 *  ruled 2026-10-18 at eight). Watchers are not seats. */
export const MAX_ROOM_SEATS = 8;
/** A seat unseen this long is served as stepped away; its
 *  figure keeps standing, as a held seat does at the Table. */
const AWAY_AFTER_MS = 90_000;

export interface RoomSeat {
  tenderId: number | null;
  name: string;
  watcher: boolean;
  isHost: boolean;
  /** The tile this seat's figure stands on, on the room's land. */
  tileId: number | null;
  lastSeenAt: number;
}

export interface TaleEntry {
  at: number;
  kind: "door" | "seat" | "roll" | "line";
  name?: string;
  text: string;
}

export interface RoomRecord {
  code: string;
  door: "instance" | "homeland";
  landOwnerKey: string;
  hostTenderId: number | null;
  hostName: string;
  createdAt: number;
  seats: Map<string, RoomSeat>;
  tale: TaleEntry[];
}

const rooms = new Map<string, RoomRecord>();
/** Seat tokens: token → where the seat stands. */
const seatTokens = new Map<string, { code: string; seatKey: string }>();

function seatKeyOf(seat: RoomSeat): string {
  return seat.watcher ? `watch:${seat.name}` : `tender:${seat.tenderId}`;
}

function tell(room: RoomRecord, kind: TaleEntry["kind"], text: string, name?: string): void {
  room.tale.push({ at: Date.now(), kind, text, name });
  if (room.tale.length > 200) room.tale.splice(0, room.tale.length - 200);
}

// ── The homeland's door record (one word on both seats) ─────
// The hosted homeland's privacy + word live in ui_config
// under the same key the old Table reads and writes
// (`table.homelandDoor.<ownerKey>`), so a word set at either
// seat is the word at both.
interface LandDoor { privacy: "public" | "password"; passwordHash: string | null }
function loadLandDoor(ownerKey: string): LandDoor {
  try {
    const row = db.select().from(schema.uiConfig).where(eq(schema.uiConfig.key, `table.homelandDoor.${ownerKey}`)).get();
    if (!row?.value) return { privacy: "public", passwordHash: null };
    const d = JSON.parse(row.value) as { privacy?: string; passwordHash?: string | null };
    return { privacy: d.privacy === "password" ? "password" : "public", passwordHash: typeof d.passwordHash === "string" ? d.passwordHash : null };
  } catch { return { privacy: "public", passwordHash: null }; }
}
function storeLandDoor(ownerKey: string, door: LandDoor): void {
  const value = JSON.stringify(door);
  db.insert(schema.uiConfig).values({ key: `table.homelandDoor.${ownerKey}`, value })
    .onConflictDoUpdate({ target: schema.uiConfig.key, set: { value } }).run();
}

// ── Dealing an instance land (Door One) ─────────────────────
function currentMood(): WorldMood {
  try {
    const rows = sqlite.prepare("SELECT value FROM settings WHERE key = 'world_mood'").all() as { value: string }[];
    if (rows.length) {
      const data = JSON.parse(rows[0].value) as { mood?: string };
      if (data.mood === "thickening" || data.mood === "thinning" || data.mood === "quiet" || data.mood === "storm") return data.mood;
    }
  } catch { /* a world with no sky yet opens quiet */ }
  return "quiet";
}

const INSTANCE_RADIUS = 6; // 127 tiles, as fresh Table lands stand
const DEAL_ELEMENTS = ["tide", "sky", "stone", "root", "neutral"] as const;

/** Deal a fresh instance land under a synthetic key: a
 *  radius-6 disc of cursed ground, a starseed standing at its
 *  heart on purified ground (the seed's hex turns the moment
 *  it is stood on — here it is dealt already turned, the
 *  room's hearth), and every tile at the curse's ring strength
 *  by the homeland's own reckoning (curseHpFor, the standing
 *  sky). The homeland's frontier law grows it from there, as
 *  it grows any land. Idempotent: a land already dealt under
 *  the key is left exactly as it stands. */
export async function dealInstanceLand(landOwnerKey: string): Promise<{ tiles: number; seedTileId: number }> {
  const existing = await db.select({ id: schema.territoryTiles.id }).from(schema.territoryTiles)
    .where(eq(schema.territoryTiles.ownerKey, landOwnerKey)).limit(1);
  const mood = currentMood();
  if (existing.length) {
    const seed = sqlite.prepare("SELECT tile_id AS tileId FROM star_seeds WHERE owner_key = ? ORDER BY id ASC LIMIT 1").get(landOwnerKey) as { tileId: number } | undefined;
    const count = sqlite.prepare("SELECT COUNT(*) AS n FROM territory_tiles WHERE owner_key = ?").get(landOwnerKey) as { n: number };
    return { tiles: Number(count.n), seedTileId: seed?.tileId ?? existing[0].id };
  }
  const pick = () => DEAL_ELEMENTS[Math.floor(Math.random() * DEAL_ELEMENTS.length)];
  const now = new Date();
  let heartId = 0;
  let tiles = 0;
  for (let q = -INSTANCE_RADIUS; q <= INSTANCE_RADIUS; q++) {
    for (let r = -INSTANCE_RADIUS; r <= INSTANCE_RADIUS; r++) {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      if (ring > INSTANCE_RADIUS) continue;
      const hp = curseHpFor(ring, mood);
      const [row] = await db.insert(schema.territoryTiles).values({
        ownerKey: landOwnerKey, q, r, element: pick(), cursed: 1, lastPassiveAt: now,
        curseHp: hp, curseMaxHp: hp,
      }).returning({ id: schema.territoryTiles.id });
      tiles++;
      if (q === 0 && r === 0) heartId = row.id;
    }
  }
  // The seed's hex, purified in the standing shape (the shape
  // settleSeedFeeding writes when the Tender stands on it).
  sqlite.prepare(`UPDATE territory_tiles SET cursed = 0, element = 'root', curse_hp = NULL, curse_max_hp = NULL,
    attune_points = 0, attune_element = NULL, mix_points = NULL, sealed_trays = 0, grow_points = 0, top_points = NULL, height = 1
    WHERE id = ?`).run(heartId);
  sqlite.prepare("INSERT INTO star_seeds (owner_key, tile_id, level, state, created_at) VALUES (?, ?, 1, 'held', ?)")
    .run(landOwnerKey, heartId, Date.now());
  return { tiles, seedTileId: heartId };
}

// ── Standing a room ─────────────────────────────────────────
async function roomOnHomeland(hostTenderId: number, hostName: string): Promise<RoomRecord> {
  const code = `homeland-${hostTenderId}`;
  const existing = rooms.get(code);
  if (existing) return existing;
  const room: RoomRecord = {
    code, door: "homeland",
    landOwnerKey: tenderOwnerKey(hostTenderId),
    hostTenderId, hostName,
    createdAt: Date.now(), seats: new Map(), tale: [],
  };
  rooms.set(code, room);
  tell(room, "door", `${hostName} opens their homeland at this Table.`);
  return room;
}

async function roomOnInstance(code: string, creatorName: string): Promise<RoomRecord> {
  const existing = rooms.get(code);
  if (existing) return existing;
  const landOwnerKey = `roomland:${code}`;
  await dealInstanceLand(landOwnerKey);
  const room: RoomRecord = {
    code, door: "instance", landOwnerKey,
    hostTenderId: null, hostName: creatorName,
    createdAt: Date.now(), seats: new Map(), tale: [],
  };
  rooms.set(code, room);
  tell(room, "door", `${creatorName} hunts a new starseed — a fresh table is dealt.`);
  return room;
}

function freshRoomCode(): string {
  return `table-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

/** A seat's opening stand on a land: ground beside the heart —
 *  a purified tile nearest the centre, else the heart itself. */
function openingStand(landOwnerKey: string): number | null {
  const row = sqlite.prepare(`SELECT id FROM territory_tiles WHERE owner_key = ? ORDER BY cursed ASC,
    (ABS(q) + ABS(r) + ABS(q + r)) / 2 ASC, id ASC LIMIT 1`).get(landOwnerKey) as { id: number } | undefined;
  return row?.id ?? null;
}

async function seatFigure(tenderId: number): Promise<{ classKey: string | null; weaponKey: string | null; level: number }> {
  try {
    const p = await getTenderProgress(tenderOwnerKey(tenderId));
    return { classKey: p.classKey ?? null, weaponKey: (p as any).weaponKey ?? null, level: p.level ?? 1 };
  } catch { return { classKey: null, weaponKey: null, level: 1 }; }
}

// ── The seat ledger (the dispatcher's road in) ──────────────
/** Resolve a seat token to the room context an action call
 *  stands in. Returns null for a faded or unknown token. The
 *  seat's CURRENT stand rides along: casting, summoning and
 *  attuning reckon their reach from where the seat stands. */
export function resolveRoomSeat(token: string | null | undefined): {
  code: string; landOwnerKey: string; watcher: boolean; seatTileId: number | null; tenderId: number | null;
} | null {
  if (!token) return null;
  const ref = seatTokens.get(token);
  if (!ref) return null;
  const room = rooms.get(ref.code);
  if (!room) return null;
  const seat = room.seats.get(ref.seatKey);
  if (!seat) return null;
  return {
    code: room.code, landOwnerKey: room.landOwnerKey,
    watcher: seat.watcher, seatTileId: seat.tileId, tenderId: seat.tenderId,
  };
}

// ── The seats standing on a land (the engine's road in) ────
// The homeland's settles (actions.ts) reckon for every body
// and every feeder standing on the land a room stands on —
// THE ROOM'S BODY-AND-SEED LAWS (Nigel, 2026-10-28: "Guests
// should take damage" · "star seeds should draw energy from
// any tender standing on them"). The room registry lives
// here, so the engine reads the seats through these two
// doors and writes a woken seat's new stand through the
// second — the registry itself never leaves this module.
export interface RoomSeatOnLand {
  tenderId: number | null;
  tileId: number | null;
  isHost: boolean;
  watcher: boolean;
}

export function roomSeatsOnLand(landOwnerKey: string): RoomSeatOnLand[] {
  const out: RoomSeatOnLand[] = [];
  for (const room of rooms.values()) {
    if (room.landOwnerKey !== landOwnerKey) continue;
    for (const seat of room.seats.values()) {
      out.push({ tenderId: seat.tenderId, tileId: seat.tileId, isHost: seat.isHost, watcher: seat.watcher });
    }
  }
  return out;
}

/** Move one seat's figure stand on its land (the bastion
 *  wake moves a fallen guest's figure without touching the
 *  guest's own homeland stand, which is another land's
 *  business). True when the seat was found and moved. */
export function moveRoomSeatStand(landOwnerKey: string, tenderId: number, tileId: number): boolean {
  for (const room of rooms.values()) {
    if (room.landOwnerKey !== landOwnerKey) continue;
    for (const seat of room.seats.values()) {
      if (!seat.watcher && seat.tenderId === tenderId) { seat.tileId = tileId; return true; }
    }
  }
  return false;
}

// ── Routes ──────────────────────────────────────────────────
export function registerRoomRoutes(app: Express): void {
  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };

  /** POST /api/room/enter — take a seat at a room. Identity is
   *  the Tender session (the same proof the browser door seats
   *  by today); a watcher needs no session. Doors:
   *    "homeland" — the caller's own homeland, hosted here.
   *    "starseed" — a NEW table on a fresh instance land.
   *    "room"     — the named room (Discord's instance room, an
   *                 invite's room); an instance room not yet
   *                 standing is dealt as it is named.
   *    "join"     — the named room as it stands (a homeland
   *                 room stands on its land whether or not its
   *                 host is seated; an instance room that has
   *                 folded refuses in plain words). */
  app.post("/api/room/enter", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as { door?: string; room?: string; password?: string; watch?: boolean; name?: string };
      const tender = await tenderFromToken(tenderTokenFromHeader(req.headers["x-tender-token"])).catch(() => null);
      const watch = body.watch === true;
      if (!tender && !watch) { fail(res, 401, "That seat is not signed in — walk the intro door first (Begin as a new Tender, or I already have a Tender), and the seat is yours."); return; }
      const door = String(body.door ?? "room");
      let room: RoomRecord | null = null;

      if (door === "homeland") {
        if (!tender) { fail(res, 401, "Watchers cannot host a homeland."); return; }
        room = await roomOnHomeland(tender.id, tender.tenderName ?? "A Tender");
      } else if (door === "starseed") {
        if (!tender) { fail(res, 401, "Watchers cannot hunt a starseed."); return; }
        room = await roomOnInstance(freshRoomCode(), tender.tenderName ?? "A Tender");
      } else if (door === "room" || door === "join") {
        const code = String(body.room ?? "").trim();
        if (!code) { fail(res, 400, "Name the room to enter."); return; }
        const homelandMatch = /^homeland-(\d+)$/.exec(code);
        if (rooms.has(code)) {
          room = rooms.get(code)!;
        } else if (homelandMatch) {
          const hostId = Number(homelandMatch[1]);
          const host = sqlite.prepare("SELECT tender_name AS name FROM tenders WHERE id = ?").get(hostId) as { name: string | null } | undefined;
          if (!host) { fail(res, 404, "That homeland's Tender is not to be found."); return; }
          room = await roomOnHomeland(hostId, host.name ?? "A Tender");
        } else if (door === "room") {
          room = await roomOnInstance(code, tender?.tenderName ?? String(body.name ?? "A watcher"));
        } else {
          fail(res, 404, "That table has folded — hunt a new starseed, or open a homeland."); return;
        }
      } else { fail(res, 400, "Name the door: homeland, starseed, room, or join."); return; }

      // The host's word: a homeland kept by a password asks it
      // of every guest (the host never asks their own word).
      const isHost = !!tender && room.door === "homeland" && room.hostTenderId === tender.id;
      if (room.door === "homeland" && !isHost) {
        const landDoor = loadLandDoor(room.landOwnerKey);
        if (landDoor.privacy === "password" && landDoor.passwordHash) {
          const word = typeof body.password === "string" ? body.password : "";
          if (!word || !verifyPassword(word, landDoor.passwordHash)) {
            fail(res, 403, "That homeland is kept by a word — speak it, and the seat is yours."); return;
          }
        }
      }

      // Take (or retake) the seat.
      const name = tender?.tenderName ?? String(body.name ?? "A watcher");
      const seat: RoomSeat = {
        tenderId: tender?.id ?? null,
        name,
        watcher: watch || !tender,
        isHost,
        tileId: null,
        lastSeenAt: Date.now(),
      };
      const key = seatKeyOf(seat);
      const prior = room.seats.get(key);
      if (prior) { seat.tileId = prior.tileId; }
      if (seat.tileId == null) {
        if (isHost && tender) {
          const row = sqlite.prepare("SELECT tender_tile_id AS tileId FROM tender_progress WHERE owner_key = ?").get(room.landOwnerKey) as { tileId: number | null } | undefined;
          seat.tileId = row?.tileId ?? openingStand(room.landOwnerKey);
        } else {
          seat.tileId = openingStand(room.landOwnerKey);
        }
      }
      if (!seat.watcher) {
        const seated = [...room.seats.values()].filter(s => !s.watcher).length;
        if (!prior && seated >= MAX_ROOM_SEATS) { fail(res, 403, "That Table already seats eight — watch, and a seat may free."); return; }
      }
      room.seats.set(key, seat);
      const token = randomUUID();
      seatTokens.set(token, { code: room.code, seatKey: key });
      if (!prior) tell(room, "seat", seat.watcher ? `${name} watches the Table.` : `${name} takes a seat at the Table.`);
      res.json({
        ok: true, code: room.code, door: room.door, seatToken: token,
        hostName: room.hostName, isHost,
        you: { tenderId: seat.tenderId, name: seat.name, tileId: seat.tileId, watcher: seat.watcher },
      });
    } catch (err) {
      fail(res, 500, err instanceof Error ? err.message : "The room would not open.");
    }
  });

  /** The caller's standing seat, from their seat token. */
  function mySeat(req: Request): { room: RoomRecord; seat: RoomSeat } | null {
    const token = String(req.headers["x-room-seat"] ?? "");
    const ref = seatTokens.get(token);
    if (!ref) return null;
    const room = rooms.get(ref.code);
    const seat = room?.seats.get(ref.seatKey);
    if (!room || !seat) return null;
    seat.lastSeenAt = Date.now();
    return { room, seat };
  }

  /** GET /api/room/state — the room's furniture: who sits here
   *  and where their figures stand (the party panel), the land
   *  seed's climb (the seed strip), and the Tale. Polling it is
   *  also the seat's heartbeat. */
  app.get("/api/room/state", async (req: Request, res: Response) => {
    const mine = mySeat(req);
    if (!mine) { fail(res, 401, "That seat has faded — take the door again."); return; }
    const { room } = mine;
    const now = Date.now();
    const seats = [];
    for (const seat of room.seats.values()) {
      const figure = seat.tenderId != null ? await seatFigure(seat.tenderId) : { classKey: null, weaponKey: null, level: 1 };
      // THE BODY each seat's figure carries (THE ROOM'S BODY
      // LAW, Nigel 2026-10-28: "Guests should take damage"):
      // the seat Tender's own homeland body — its pool and
      // its blackout — read from their own record, so the
      // party panel shows a fallen guest as fallen.
      let body: { hp: number; maxHp: number; down: boolean } | null = null;
      if (!seat.watcher && seat.tenderId != null) {
        try {
          const key = tenderOwnerKey(seat.tenderId);
          const p = await getTenderProgress(key);
          const row = sqlite.prepare("SELECT hp, down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(key) as { hp: number | null; downUntil: number | null } | undefined;
          if (row) {
            body = {
              hp: row.hp == null ? p.maxTenderHp : Math.min(Number(row.hp), p.maxTenderHp),
              maxHp: p.maxTenderHp,
              down: row.downUntil != null && Number(row.downUntil) > now,
            };
          }
        } catch { /* no progress stands — no body to serve */ }
      }
      seats.push({
        tenderId: seat.tenderId, name: seat.name, watcher: seat.watcher, isHost: seat.isHost,
        tileId: seat.tileId, away: now - seat.lastSeenAt > AWAY_AFTER_MS,
        classKey: figure.classKey, weaponKey: figure.weaponKey, level: figure.level,
        body,
      });
    }
    const seedRow = sqlite.prepare(`SELECT level, fed_energy AS fed FROM star_seeds
      WHERE owner_key = ? AND state IN ('held','first','fallen') ORDER BY level DESC, id ASC LIMIT 1`).get(room.landOwnerKey) as { level: number; fed: number } | undefined;
    const seed = seedRow ? {
      level: Number(seedRow.level),
      stage: seedStageForLevel(Number(seedRow.level)),
      fedEnergy: Number(seedRow.fed ?? 0),
    } : null;
    const landDoor = room.door === "homeland" ? loadLandDoor(room.landOwnerKey) : { privacy: "public" as const, passwordHash: null };
    res.json({
      ok: true, code: room.code, door: room.door, hostName: room.hostName,
      seats, seed, tale: room.tale.slice(-60),
      landDoor: { privacy: landDoor.privacy, hasPassword: !!landDoor.passwordHash },
    });
  });

  /** POST /api/room/stand — move my figure's stand on the land. */
  app.post("/api/room/stand", (req: Request, res: Response) => {
    const mine = mySeat(req);
    if (!mine) { fail(res, 401, "That seat has faded — take the door again."); return; }
    if (mine.seat.watcher) { fail(res, 403, "Watchers stand nowhere — take a seat to walk the land."); return; }
    // A FALLEN Tender does not walk (the homeland's own law,
    // Phase D — the same refusal setTenderTile speaks at
    // home): the blackout holds the seat's figure where it
    // fell until the bastion wake, on a guest exactly as on
    // the host.
    if (mine.seat.tenderId != null) {
      const bodyRow = sqlite.prepare("SELECT down_until AS downUntil FROM tender_progress WHERE owner_key = ?").get(tenderOwnerKey(mine.seat.tenderId)) as { downUntil: number | null } | undefined;
      if (bodyRow?.downUntil != null && Number(bodyRow.downUntil) > Date.now()) {
        fail(res, 400, "Your Tender has fallen — he wakes at the bastion, half-healed, when the blackout lifts."); return;
      }
    }
    const tileId = Number((req.body ?? {}).tileId);
    const tile = sqlite.prepare("SELECT id FROM territory_tiles WHERE id = ? AND owner_key = ?").get(tileId, mine.room.landOwnerKey) as { id: number } | undefined;
    if (!tile) { fail(res, 400, "That ground is not this land's."); return; }
    mine.seat.tileId = tileId;
    // The host's figure has ONE stand record — the homeland's
    // own (tender_progress.tender_tile_id), which the homeland
    // face reads. A host walking in the room walks their
    // homeland, so the walk is written there too; a guest's
    // stand lives in the seat alone (their own homeland's
    // stand is another land's business).
    if (mine.seat.isHost && mine.room.door === "homeland") {
      sqlite.prepare("UPDATE tender_progress SET tender_tile_id = ? WHERE owner_key = ?").run(tileId, mine.room.landOwnerKey);
    }
    res.json({ ok: true, tileId });
  });

  /** POST /api/room/roll — the dice box: the roll is written
   *  into the room's Tale, as the old seat's rolls are. */
  app.post("/api/room/roll", (req: Request, res: Response) => {
    const mine = mySeat(req);
    if (!mine) { fail(res, 401, "That seat has faded — take the door again."); return; }
    const body = (req.body ?? {}) as { label?: string; sides?: number; count?: number };
    const sides = Math.min(1000, Math.max(2, Math.floor(Number(body.sides ?? 20)) || 20));
    const count = Math.min(10, Math.max(1, Math.floor(Number(body.count ?? 1)) || 1));
    const label = String(body.label ?? "").trim().slice(0, 60);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0);
    const text = `🎲 ${label ? `${label}: ` : ""}${rolls.join(" + ")}${count > 1 ? ` = ${total}` : ""} (d${sides})`;
    tell(mine.room, "roll", text, mine.seat.name);
    res.json({ ok: true, rolls, total, sides });
  });

  /** POST /api/room/tell — a seat's own line in the Tale. */
  app.post("/api/room/tell", (req: Request, res: Response) => {
    const mine = mySeat(req);
    if (!mine) { fail(res, 401, "That seat has faded — take the door again."); return; }
    const text = String((req.body ?? {}).text ?? "").trim().slice(0, 300);
    if (!text) { fail(res, 400, "Say the line first."); return; }
    tell(mine.room, "line", text, mine.seat.name);
    res.json({ ok: true });
  });

  /** POST /api/room/door — the host sets their homeland room's
   *  word (the same ui_config record the old seat reads). */
  app.post("/api/room/door", (req: Request, res: Response) => {
    const mine = mySeat(req);
    if (!mine) { fail(res, 401, "That seat has faded — take the door again."); return; }
    if (mine.room.door !== "homeland" || !mine.seat.isHost) { fail(res, 403, "Only the homeland's own Tender keeps its door."); return; }
    const body = (req.body ?? {}) as { privacy?: string; password?: string };
    if (body.privacy === "public") {
      storeLandDoor(mine.room.landOwnerKey, { privacy: "public", passwordHash: null });
      tell(mine.room, "door", `${mine.seat.name} opens the homeland's door to all.`);
      res.json({ ok: true, privacy: "public" }); return;
    }
    const word = String(body.password ?? "");
    if (!word) { fail(res, 400, "Speak the word the door should keep."); return; }
    storeLandDoor(mine.room.landOwnerKey, { privacy: "password", passwordHash: hashPassword(word) });
    tell(mine.room, "door", `${mine.seat.name} sets a word on the homeland's door.`);
    res.json({ ok: true, privacy: "password" });
  });

  /** POST /api/room/leave — give the seat back. */
  app.post("/api/room/leave", (req: Request, res: Response) => {
    const token = String(req.headers["x-room-seat"] ?? "");
    const ref = seatTokens.get(token);
    if (ref) {
      seatTokens.delete(token);
      const room = rooms.get(ref.code);
      const seat = room?.seats.get(ref.seatKey);
      if (room && seat) {
        room.seats.delete(ref.seatKey);
        tell(room, "seat", `${seat.name} leaves the Table.`);
      }
    }
    res.json({ ok: true });
  });
}
