// THE HOMELAND SERVES DISCORD — THE ROOM SEAT (Nigel,
// 2026-10-28). The Discord seat's new face: THE HOMELAND
// ITSELF, with the room layer on it (server/src/rooms.ts).
// A seat is taken at one of the doors — host your homeland,
// hunt a new starseed (a fresh table is dealt), join a room by
// its code, or walk in by an invite's code / a land's name in
// the address — and from there the homeland's own face
// (Territory) stands on the room's land: every seat sees the
// same land, the same field, the same fight, settled once by
// the homeland's own engine. The room's furniture rides along:
// the party panel (who sits here, and where their figures
// stand), the seed's climb strip, the dice box, and the Tale.
//
// Identity is carried as it stands: a Discord arrival walks
// the Push 36 intro door (TableIntro) until it holds a Tender
// session; a browser arrival seats by the game's own session
// proof (the Tender token this browser already carries).

import { useCallback, useEffect, useRef, useState } from "react";
import Territory from "./Territory";
import TableIntro from "./TableIntro";
import {
  api, roomApi, setRoomSeat, tenderToken,
  type Awakened, type RoomEnterResult, type RoomStateView,
} from "./api";
import { toLayerAssets } from "./wakeShared";
import { takeTableSession } from "./tableSdk";
// THE DOORS WEAR HIS ARTWORK (Nigel, 2026-10-28, 12:43: "use
// my meteor for the starseed image in the table selection
// button and a beacon for the host my homeland button plz"):
// a button made FROM a thing is the thing's image. The
// starseed door wears THE METEOR — the very file the homeland
// renders for a starseed (Territory's meteorGif, the seed's
// face at every unrisen seat) — and the host door wears THE
// BEACON — Nigel's beacon art standing on the land (the
// beacon-stage seed's face, Territory's seedBeaconArt).
import meteorGif from "./assets/meteor-rain.gif";
import seedBeaconArt from "./assets/starseed/beacon.png";

type Stage =
  | { kind: "door" }
  | { kind: "intro"; mode: "begin" | "login" }
  | { kind: "password"; door: "homeland" | "starseed" | "room" | "join"; opts?: { room?: string; watch?: boolean } }
  | { kind: "seated"; enter: RoomEnterResult };

function urlParam(name: string): string | null {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

export default function RoomSeat() {
  const session = takeTableSession();
  const [stage, setStage] = useState<Stage>({ kind: "door" });
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [doorWord, setDoorWord] = useState("");
  const [busy, setBusy] = useState(false);
  const enteredRef = useRef(false);

  const enter = useCallback(async (
    door: "homeland" | "starseed" | "room" | "join",
    opts?: { room?: string; password?: string; watch?: boolean },
  ) => {
    setBusy(true); setError("");
    try {
      const res = await roomApi.enter({ door, room: opts?.room, password: opts?.password, watch: opts?.watch });
      setRoomSeat(res.seatToken);
      enteredRef.current = true;
      setStage({ kind: "seated", enter: res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The door would not open.";
      if (/kept by a word/.test(msg)) {
        setStage({ kind: "password", door, opts });
      } else {
        setError(msg);
      }
    } finally { setBusy(false); }
  }, []);

  // The carried doors: an address that names a land or a room
  // walks straight in, as the old seat's doors did — a signed-in
  // Tender seats by the game's own session proof.
  useEffect(() => {
    if (enteredRef.current) return;
    const land = urlParam("land");
    const room = urlParam("room");
    if (!tenderToken()) {
      if (room || land) setStage({ kind: "intro", mode: "begin" });
      else if (session) setStage({ kind: "intro", mode: "begin" });
      return;
    }
    enteredRef.current = true;
    if (land === "homeland") void enter("homeland");
    else if (land === "new") void enter("starseed");
    else if (room) void enter("join", { room });
    else if (session?.room) void enter("room", { room: session.room });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage.kind === "intro") {
    return (
      <div className="table-door-wrap">
        <TableIntro
          authToken={session?.authToken ?? ""}
          initialMode={stage.mode}
          onComplete={() => {
            // The intro stored this browser's Tender session;
            // walk the carried door again, now proven.
            enteredRef.current = false;
            setStage({ kind: "door" });
            const land = urlParam("land");
            const room = urlParam("room");
            if (land === "homeland") void enter("homeland");
            else if (land === "new") void enter("starseed");
            else if (room) void enter("join", { room });
            else if (session?.room) void enter("room", { room: session.room });
            else setStage({ kind: "door" });
          }}
          onCancel={() => setStage({ kind: "door" })}
        />
      </div>
    );
  }

  if (stage.kind === "password") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ A word keeps this homeland</h1>
          <p className="quiet">The Tender of this land set a word on its door. Speak it, and the seat is yours.</p>
          <input
            className="door-input" type="password" value={doorWord} autoFocus
            onChange={(e) => setDoorWord(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && doorWord) void enter(stage.door, { ...stage.opts, password: doorWord }); }}
            placeholder="The door's word"
          />
          {error && <p className="error-line">{error}</p>}
          <div className="door-actions">
            <button className="table-btn primary" disabled={busy || !doorWord} onClick={() => void enter(stage.door, { ...stage.opts, password: doorWord })}>Speak it, and sit</button>
            <button className="table-btn" onClick={() => setStage({ kind: "door" })}>Back to the doors</button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "seated") return <SeatedRoom enter={stage.enter} />;

  // The doors, in the Bastion travel panel's own words.
  const signedIn = !!tenderToken();
  return (
    <div className="table-door-wrap">
      <div className="table-door">
        <h1>🕯️ The Table</h1>
        {session?.room && (
          <p className="quiet">Discord has brought you to this Table. Take your seat, and the homeland's own ground opens under the room.</p>
        )}
        {!signedIn && !session && (
          <p className="quiet">
            New to the Awokin — or already a Tender? Begin here: account first, then waking,
            class and weapon at three woken — and the seat is yours.
          </p>
        )}
        {error && <p className="error-line">{error}</p>}
        <div className="door-actions">
          {session?.room ? (
            <button className="table-btn primary" disabled={busy} onClick={() => { if (signedIn) void enter("room", { room: session.room }); else setStage({ kind: "intro", mode: "begin" }); }}>
              ⚔ Take your seat at this Table
            </button>
          ) : (
            <button className="table-btn primary door-btn" disabled={busy} onClick={() => { if (signedIn) void enter("starseed"); else setStage({ kind: "intro", mode: "begin" }); }}>
              <img className="door-face" src={meteorGif} alt="" /> Hunt a new starseed — a fresh table is dealt
            </button>
          )}
          <button className="table-btn door-btn" disabled={busy} onClick={() => { if (signedIn) void enter("homeland"); else setStage({ kind: "intro", mode: "login" }); }}>
            <img className="door-face" src={seedBeaconArt} alt="" /> Host homeland — the Table stands on your own land
          </button>
        </div>
        {!signedIn && (
          <div className="door-actions">
            <button className="table-btn" onClick={() => setStage({ kind: "intro", mode: "begin" })}>🌱 Begin as a new Tender</button>
            <button className="table-btn" onClick={() => setStage({ kind: "intro", mode: "login" })}>🔑 I already have a Tender</button>
          </div>
        )}
        <label className="door-label" htmlFor="room-join-code">Or join a room by its code — an invite link carries it in the address</label>
        <input
          id="room-join-code" className="door-input" value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64))}
          placeholder="Room code"
        />
        <div className="door-actions">
          <button className="table-btn" disabled={busy || !joinCode.trim()} onClick={() => { if (signedIn) void enter("join", { room: joinCode.trim() }); else setStage({ kind: "intro", mode: "begin" }); }}>
            Take the seat in that room
          </button>
          <button className="table-btn" disabled={busy} onClick={() => void enter("room", { room: joinCode.trim() || session?.room || "the-table", watch: true })}>
            Watch instead
          </button>
        </div>
      </div>
    </div>
  );
}

/** The seated room: the homeland's own face on the room's land,
 *  with the room's furniture standing beside it. */
function SeatedRoom({ enter }: { enter: RoomEnterResult }) {
  const [studio, setStudio] = useState<{ items: Awakened[]; assets: ReturnType<typeof toLayerAssets> } | null>(null);
  const [guestItems, setGuestItems] = useState<Awakened[]>([]);
  const [roomState, setRoomState] = useState<RoomStateView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rollLabel, setRollLabel] = useState("");
  const [rollSides, setRollSides] = useState(20);
  const [tellText, setTellText] = useState("");
  const [doorWord, setDoorWord] = useState("");
  const [doorMsg, setDoorMsg] = useState("");
  const taleRef = useRef<HTMLDivElement | null>(null);

  const loadStudio = useCallback(async () => {
    try {
      const s = await api.getStudio();
      setStudio({ items: (s.awakened ?? []) as Awakened[], assets: toLayerAssets(s.assets ?? []) });
    } catch (e) { setLoadError(e instanceof Error ? e.message : "The studio would not open."); }
  }, []);

  useEffect(() => { void loadStudio(); }, [loadStudio]);

  // The room's heartbeat + furniture, and the foreign company
  // standing on this land (their creature payloads ride the
  // territory read; the map draws a placement only from its
  // payload).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await roomApi.state();
        if (!cancelled) setRoomState(st);
      } catch { /* a faded seat names itself at the next act */ }
      try {
        const t = await api.getTerritory();
        if (!cancelled) setGuestItems(((t as unknown as { guestAwoken?: Awakened[] }).guestAwoken ?? []));
      } catch { /* the map's own poll carries the land */ }
    };
    void poll();
    const iv = setInterval(() => void poll(), 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const el = taleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [roomState?.tale]);

  useEffect(() => () => { setRoomSeat(null); }, []);

  const me = roomState?.seats.find(s => s.tenderId != null && s.tenderId === enter.you.tenderId) ?? null;
  const others = (roomState?.seats ?? []).filter(s => !s.watcher && s.tenderId !== enter.you.tenderId);
  const items = [...(studio?.items ?? [])];
  for (const g of guestItems) if (!items.some(i => i.id === g.id)) items.push(g);
  const myStand = enter.isHost || !me
    ? null
    : me.tileId != null && me.classKey
      ? { tileId: me.tileId, classKey: me.classKey, weaponKey: me.weaponKey }
      : null;

  const copyInvite = async () => {
    const link = `${window.location.origin}/table?room=${encodeURIComponent(enter.code)}`;
    try { await navigator.clipboard.writeText(link); setDoorMsg("Invite link copied — a friend who opens it lands at this room's door."); }
    catch { setDoorMsg(`Invite link: ${link}`); }
  };

  return (
    <div className="room-seat">
      <div className="room-seat-map">
        {studio ? (
          <Territory
            tenderItems={items}
            assets={studio.assets}
            onUpdate={() => void loadStudio()}
            roomSeats={others.map(s => ({ tenderId: s.tenderId, name: s.name, classKey: s.classKey, tileId: s.tileId, away: s.away }))}
            roomSelfStand={myStand}
          />
        ) : (
          <div className="table-door-wrap"><div className="table-door">
            <h1>🕯️ The Table</h1>
            <p className="quiet">{loadError || "The land is gathering…"}</p>
          </div></div>
        )}
      </div>
      <aside className="room-furniture" aria-label="The room's furniture">
        <h2>{enter.door === "homeland" ? `🏠 ${enter.hostName}'s homeland` : "🌠 A fresh table, dealt from a starseed"}</h2>
        <p className="quiet small">Room <strong>{enter.code}</strong> — the homeland itself serves this Table; what is won, built or lost here is real on that land.</p>
        <button className="table-btn small" onClick={() => void copyInvite()}>Invite a friend — copy the room link</button>
        {doorMsg && <p className="quiet small">{doorMsg}</p>}

        <h3>The party at this Table</h3>
        <ul className="room-party">
          {(roomState?.seats ?? []).map(s => (
            <li key={`${s.tenderId ?? "w"}-${s.name}`} className={s.away ? "away" : ""}>
              <span>{s.watcher ? "👁" : s.isHost ? "🏠" : "⚔"} {s.name}{s.tenderId === enter.you.tenderId ? " (you)" : ""}</span>
              <span className="quiet small">{s.watcher ? "watching" : `${s.classKey ?? "—"} · Lv ${s.level}${s.away ? " · stepped away" : ""}`}</span>
            </li>
          ))}
          {!roomState && <li className="quiet">The seats are gathering…</li>}
        </ul>

        {roomState?.seed && (
          <>
            <h3>The seed's climb</h3>
            <p className="quiet small">
              Stage: <strong>{String(roomState.seed.stage)}</strong> · level {roomState.seed.level} · fed ✦{roomState.seed.fedEnergy}
            </p>
          </>
        )}

        <h3>🎲 The dice box</h3>
        <div className="room-dice">
          <input className="door-input" value={rollLabel} onChange={(e) => setRollLabel(e.target.value)} placeholder="Name the roll" />
          <select className="door-input" value={rollSides} onChange={(e) => setRollSides(Number(e.target.value))}>
            {[4, 6, 8, 10, 12, 20, 100].map(n => <option key={n} value={n}>d{n}</option>)}
          </select>
          <button className="table-btn small" onClick={() => void roomApi.roll({ label: rollLabel || undefined, sides: rollSides }).catch(() => {})}>Roll</button>
        </div>

        <h3>📖 The Tale</h3>
        <div className="room-tale" ref={taleRef}>
          {(roomState?.tale ?? []).map((t, i) => (
            <p key={i} className={`tale-line ${t.kind}`}>
              {t.name ? <strong>{t.name}: </strong> : null}{t.text}
            </p>
          ))}
          {(!roomState || roomState.tale.length === 0) && <p className="quiet small">Nothing is written yet.</p>}
        </div>
        <div className="room-dice">
          <input className="door-input" value={tellText} onChange={(e) => setTellText(e.target.value)} placeholder="Write a line in the Tale"
            onKeyDown={(e) => { if (e.key === "Enter" && tellText.trim()) { void roomApi.tell(tellText.trim()).then(() => setTellText("")).catch(() => {}); } }} />
          <button className="table-btn small" disabled={!tellText.trim()} onClick={() => void roomApi.tell(tellText.trim()).then(() => setTellText("")).catch(() => {})}>Write</button>
        </div>

        {enter.isHost && enter.door === "homeland" && (
          <>
            <h3>The door's word</h3>
            <p className="quiet small">
              {roomState?.landDoor.privacy === "password" ? "A word keeps this homeland's door." : "This homeland's door stands open to all."}
            </p>
            <div className="room-dice">
              <input className="door-input" type="password" value={doorWord} onChange={(e) => setDoorWord(e.target.value)} placeholder="Set a word" />
              <button className="table-btn small" disabled={!doorWord} onClick={() => void roomApi.setDoor({ privacy: "password", password: doorWord }).then(() => { setDoorWord(""); setDoorMsg("The word is set — guests speak it at the door."); }).catch(() => {})}>Set the word</button>
              <button className="table-btn small" onClick={() => void roomApi.setDoor({ privacy: "public" }).then(() => setDoorMsg("The door stands open to all.")).catch(() => {})}>Open it to all</button>
            </div>
          </>
        )}

        <button className="table-btn small" onClick={() => { void roomApi.leave().catch(() => {}); setRoomSeat(null); window.location.reload(); }}>
          Leave the Table
        </button>
      </aside>
    </div>
  );
}
