/**
 * THE TABLE — the Discord Activity's room
 * (design of record: ~/workspace/discord-voice/TABLE-DESIGN.md).
 *
 * P0 — THE EMPTY TABLE: the room itself, whole — Sky Bar, Party,
 * Battleground with the star-seed at its heart, the Dark, the private
 * hand with its tabbed satchel, the dice pop-up, the Tale, personal
 * notes and the typed inventory — with named players and private test
 * hands proving the plumbing. Dealing, summoning and referee combat
 * are P1; the Storytender's Stage and Panel are P2. Nothing here
 * pretends otherwise: what cannot be done yet says so on its face.
 *
 * The skin is Ash & Ember (ruled 2026-10-15): charcoal and bone,
 * dried-blood browns, gold kept for light and law. The layout and
 * readability are the accepted prototype's, untouched.
 */

import { useEffect, useRef, useState } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import { takeTableBoot, takeTableSession } from "./tableSdk";
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { BUNDLED_ENEMIES } from "./enemyArt";
import battlegroundBg from "./assets/battleground-bg.jpg";
import { WORKING_DEFS, HUE_ORDER } from "./workingsData";
import glyphSeal from "./assets/glyphs/seal.png";
import glyphEngine from "./assets/glyphs/engine.png";
import glyphStandard from "./assets/glyphs/standard.png";
import glyphTrees from "./assets/glyphs/trees.png";
import glyphBeacon from "./assets/glyphs/beacon.png";
import glyphLattice from "./assets/glyphs/lattice.png";
import glyphBlade from "./assets/glyphs/blade.png";
import glyphBlades from "./assets/glyphs/blades.png";
import glyphShard from "./assets/glyphs/shard.png";
import glyphCoil from "./assets/glyphs/coil.png";

const GLYPHS: Record<string, string> = { seal: glyphSeal, engine: glyphEngine, standard: glyphStandard, trees: glyphTrees, beacon: glyphBeacon, lattice: glyphLattice, blade: glyphBlade, blades: glyphBlades, shard: glyphShard, coil: glyphCoil };
/** The hues of the Written Light: filter recipes turn the gold
 *  master into the poured element (the grimoire's own recipes). */
const HUE_FILTERS: Record<string, string> = {
  unaligned: "none",
  tide: "hue-rotate(155deg) saturate(1.25)",
  sky: "hue-rotate(212deg) saturate(.5) brightness(1.3)",
  stone: "hue-rotate(-8deg) saturate(1.45) brightness(.97)",
  root: "hue-rotate(74deg) saturate(1.15)",
  fire: "hue-rotate(-30deg) saturate(1.6) brightness(1.06)",
};
const HUE_GLOWS: Record<string, string> = { unaligned: "#ffd98a", tide: "#57c8ff", sky: "#cdb9ff", stone: "#e8a33d", root: "#7dd069", fire: "#ff7a33" };
const HUE_LABELS: Record<string, string> = { unaligned: "Unaligned", tide: "Tide", sky: "Sky", stone: "Stone", root: "Root", fire: "Fire" };

interface WorkingView {
  id: string; kind: "ward" | "rune"; root: string; name: string; hue: string;
  ownerKey: string; ownerName: string;
  hex: string | null; hexA: string | null; hexB: string | null;
  hp: number; stops: number; charges: number;
}

function hexNeighbors(id: string): string[] {
  const h = FIELD_HEXES.find(x => x.id === id);
  if (!h) return [];
  return FIELD_HEXES.filter(x => x.id !== id && Math.hypot(x.x - h.x, x.y - h.y) <= 52).map(x => x.id);
}

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
  art?: string;
  level?: number;
  awokenId?: number;
}

interface FieldUnitView {
  hex: string;
  name: string;
  art: string | null;
  element: string;
  power: number;
  toughness: number;
  hp: number;
  maxHp: number;
  level: number | null;
  ownerKey: string;
  ownerName: string;
}

interface EnemyView { name: string; label: string; note: string; art: string | null }

interface SharedState {
  room: string;
  sky: { mood: string; description: string; endsAt: string | null };
  round: number;
  threat: number;
  players: { key: string; name: string; handCount: number; energy: number; maxEnergy: number; tenderHp: number; maxTenderHp: number; fallen: boolean }[];
  watcherCount: number;
  tale: { at: number; text: string }[];
  field: FieldUnitView[];
  enemies: EnemyView[];
  dark: { hex: string; kind: string; label: string; art: string | null; power: number; hp: number; maxHp: number; pinned: number }[];
  workings: WorkingView[];
  battle: { active: boolean; wave: number };
}

interface YouState {
  key: string;
  name: string;
  hand: TableCard[];
  notes: string;
  energy?: number;
  maxEnergy?: number;
  tenderLevel?: number;
  healTier?: number;
  healAmount?: number;
  wardRuneUnlocked?: boolean;
  tenderHp?: number;
  maxTenderHp?: number;
  inventory: string[];
  bound?: string | null;
}

type Phase = "boot" | "door" | "connecting" | "seated" | "lost" | "error";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
// The field fills the battlefield (Nigel, 2026-10-16): a
// generated honeycomb, edge to edge — the server owns the
// identical field from the identical constants; the two
// generators must stay in step. The hex nearest the middle
// holds the star-seed and is never stood upon.
const FIELD_HEXES: { id: string; x: number; y: number; center?: boolean }[] = (() => {
  const R = 26, dx = Math.sqrt(3) * R, dy = 1.5 * R;
  const out: { id: string; x: number; y: number; center?: boolean }[] = [];
  for (let r = 0; r < 6; r++) {
    const y = 26 + r * dy;
    const off = (r % 2) * (dx / 2);
    for (let c = 0; ; c++) {
      const x = 28 + off + c * dx;
      if (x > 276) break;
      out.push({ id: `hex-${r}-${c}`, x, y });
    }
  }
  let best = out[0], bd = Infinity;
  for (const h of out) { const d = (h.x - 150) ** 2 + (h.y - 130) ** 2; if (d < bd) { bd = d; best = h; } }
  best.center = true;
  return out;
})();

const ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awoken where it stands." },
] as const;

function PourRow({ hue, setHue }: { hue: string; setHue: (h: string) => void }) {
  return (
    <div className="pour-row">
      <span className="pour-label">Pour the light as:</span>
      {HUE_ORDER.map((hu) => (
        <button key={hu} className={`hue-chip${hue === hu ? " active" : ""}`} onClick={() => setHue(hu)} title={`Pour ${HUE_LABELS[hu]}`}>
          <span className="hue-dot" style={{ background: HUE_GLOWS[hu] }} />{HUE_LABELS[hu]}
        </button>
      ))}
    </div>
  );
}

export default function Table() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [bootStep, setBootStep] = useState("Waking the Table…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [devName, setDevName] = useState("");
  const [shared, setShared] = useState<SharedState | null>(null);
  const [you, setYou] = useState<YouState | null>(null);
  const [tab, setTab] = useState<"I" | "II" | "III" | "IV">("I");
  // The workshop-chosen card border (Nigel, 2026-10-17) wraps the
  // hand cards here too — the same public read the game consumes.
  const [cardBorder, setCardBorder] = useState<{ imageUrl: string | null; fit: string | null }>({ imageUrl: null, fit: null });
  useEffect(() => {
    let live = true;
    fetch("/api/getCardBorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((d) => { if (live && d && typeof d === "object") setCardBorder({ imageUrl: d.imageUrl ?? null, fit: d.fit ?? null }); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  // The Written Light: what is being laid, in which poured hue,
  // and the placement steps (a ward wants an anchor hex, then a
  // neighbour; the Three Blades gather up to three hexes).
  const [pourHue, setPourHue] = useState<string>("unaligned");
  const [placing, setPlacing] = useState<{ kind: "ward" | "rune" | "heal"; root: string } | null>(null);
  const [wardAnchor, setWardAnchor] = useState<string | null>(null);
  const [bladePicks, setBladePicks] = useState<string[]>([]);
  const [diceOpen, setDiceOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [packDraft, setPackDraft] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const heardRef = useRef<string[]>([]);
  const lastJoinRef = useRef<Record<string, unknown> | null>(null);
  const [bindCode, setBindCode] = useState("");
  const [bindCodeMsg, setBindCodeMsg] = useState("");
  const [bindInput, setBindInput] = useState("");
  const [bindMsg, setBindMsg] = useState("");

  // The binding code (door): minted by the game for the Tender this
  // browser is signed in as — the same session the game itself uses.
  async function fetchBindCode() {
    setBindCodeMsg("");
    try {
      const token = window.localStorage.getItem("awoken-tender-token") ?? "";
      const res = await fetch("/api/getTableBindCode", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tender-Token": token },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The game would not mint a code.");
      setBindCode(String(data.code));
    } catch (e) {
      setBindCodeMsg(e instanceof Error ? e.message : "The game would not mint a code.");
    }
  }

  // Spend a code at the Table (room): this seat's proven Discord
  // token names who is binding; the code names the Tender. On
  // success the seat is re-taken so the real deck is dealt.
  async function submitBind() {
    setBindMsg("");
    const token = String(lastJoinRef.current?.authToken ?? takeTableSession()?.authToken ?? "");
    if (!token) { setBindMsg("This seat was not Discord-proven, so it has nothing to bind with."); return; }
    try {
      const res = await fetch("/api/table/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code: bindInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The binding did not take.");
      setBindMsg(`Bound${data.tenderName ? ` to ${data.tenderName}` : ""}. Re-seat to draw your real deck:`);
    } catch (e) {
      setBindMsg(e instanceof Error ? e.message : "The binding did not take.");
    }
  }
  const taleRef = useRef<HTMLDivElement>(null);

  const inDiscord = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("frame_id");

  // The boot names its step, and no step may hang silently: if the
  // Table sits at one step for 20 seconds, the door says which step
  // jammed instead of spinning forever (Nigel's stuck launch,
  // 2026-10-16 — the candle burned with no word of where). The error
  // carries the door record: what this page can see of its own
  // framing, so the Keeper can tell a launch that never entered
  // Discord's frame from a handshake Discord never answered.
  const doorRecord = () => {
    try {
      const q = new URLSearchParams(window.location.search);
      const embedded = window.parent !== window;
      const heard = heardRef.current.length ? heardRef.current.join("  ·  ") : "silence — nothing came back";
      return [
        `Framed by Discord: ${embedded ? "yes" : "NO"}`,
        `Sent by: ${document.referrer || "nothing"}`,
        `Door: ${window.location.host}`,
        `Frame tag: ${q.has("frame_id") ? "present" : "MISSING"}`,
        `Heard back: ${heard}`,
      ].join("\n");
    } catch { return "Door record unavailable."; }
  };
  useEffect(() => {
    if (phase !== "boot" && phase !== "connecting") return;
    const t = setTimeout(() => {
      setError(`The Table got stuck at this step: “${bootStep}”.\n${doorRecord()}`);
      setPhase("error");
    }, 20000);
    return () => clearTimeout(t);
  }, [phase, bootStep]);

  function connect(join: Record<string, unknown>) {
    lastJoinRef.current = join;
    setPhase("connecting");
    setBootStep("Taking your seat…");
    setError("");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/table/ws`);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "join", ...join }));
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === "state") {
        setShared(msg.state);
        setYou(msg.you);
        setPhase("seated");
      } else if (msg.type === "joinError") {
        setError(String(msg.message || "The Table would not seat you."));
        setPhase("error");
      } else if (msg.type === "error") {
        setNotice(String(msg.message || ""));
      }
    };
    ws.onclose = () => {
      setPhase((p) => (p === "seated" || p === "connecting" ? "lost" : p));
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  // Boot: inside Discord, sign in silently and take the seat the SDK
  // names. Outside Discord, show the door.
  useEffect(() => {
    let cancelled = false;
    // The listening ear (2026-10-16): record every word spoken to
    // this frame while the boot knocks, so a stuck door can report
    // whether Discord answered in the new dialect (op tuples), the
    // old one (DISPATCH objects), or not at all. Observe only.
    const OP_NAMES: Record<number, string> = { 0: "HANDSHAKE", 1: "FRAME", 2: "CLOSE", 3: "HELLO (old greeting)" };
    const ear = (ev: MessageEvent) => {
      if (heardRef.current.length >= 8) return;
      const d: any = ev.data;
      let shape: string;
      if (Array.isArray(d)) shape = `op ${OP_NAMES[Number(d[0])] ?? String(d[0])}`;
      else if (d && typeof d === "object" && typeof d.cmd === "string") shape = `old-style ${d.cmd}${d.evt ? "/" + d.evt : ""}`;
      else shape = typeof d;
      heardRef.current.push(`${ev.origin} → ${shape}`);
    };
    window.addEventListener("message", ear);
    (async () => {
      if (!inDiscord) {
        try {
          const cfg = await (await fetch("/api/table/config")).json();
          if (!cancelled) setDevMode(Boolean(cfg.devMode));
        } catch {}
        if (!cancelled) setPhase("door");
        return;
      }
      // THE PREPARED SESSION (light front page, 2026-10-16): when
      // this room was imported by table-main.tsx after Discord had
      // already answered and vouched, there is nothing to knock
      // for — the seat ticket is waiting. Take the seat directly.
      const prepared = takeTableSession();
      if (prepared) {
        connect({ authToken: prepared.authToken, room: prepared.room });
        return;
      }
      try {
        // THE EARLY KNOCK (audit verdict, 2026-10-16): the SDK was
        // already constructed and the knock sent at module scope in
        // table-main.tsx (see tableSdk.ts) — Discord answered the
        // bare Control's identical knock there, while the knock from
        // inside this effect, however early, came after a bundle
        // load and a React mount and heard silence. Consume that
        // boot when it exists; only a framed launch off the proxy
        // host (no app id in the hostname) falls back to building
        // the SDK here, config-fetched, with the same re-aim.
        setBootStep("Knocking on Discord's door…");
        const early = takeTableBoot();
        let sdk: DiscordSDK;
        let clientId: string;
        if (early) {
          sdk = early.sdk;
          clientId = early.clientId;
          await early.ready;
        } else {
          const cfg = await (await fetch("/api/table/config")).json();
          clientId = typeof cfg.discordClientId === "string" ? cfg.discordClientId : "";
          if (!clientId) {
            setError("Discord is not configured on the server yet, so the Table cannot check your name. The Ancient One holds the keys that finish this door.");
            setPhase("error");
            return;
          }
          sdk = new DiscordSDK(clientId);
          try {
            const s = sdk as unknown as { sourceOrigin?: string; handshake?: () => void };
            if (s.sourceOrigin && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com/.test(s.sourceOrigin) && typeof s.handshake === "function") {
              s.sourceOrigin = "https://discord.com";
              s.handshake();
            }
          } catch {}
          await sdk.ready();
        }
        setBootStep("Asking Discord your name…");
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });
        setBootStep("Proving your name to the Table…");
        const authRes = await fetch("/api/table/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (!authRes.ok) {
          const body = await authRes.json().catch(() => ({}));
          throw new Error(body.error || "Discord refused the sign-in.");
        }
        const auth = await authRes.json();
        setBootStep("Discord is vouching for you…");
        await sdk.commands.authenticate({ access_token: auth.accessToken });
        if (!cancelled) connect({ authToken: auth.token, room: sdk.instanceId || "the-table" });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "The door to the Table would not open.");
          setPhase("error");
        }
      }
    })();
    return () => { cancelled = true; window.removeEventListener("message", ear); try { wsRef.current?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notes follow the server copy until the Tender starts writing.
  useEffect(() => {
    if (you && !notesDirty) setNotesDraft(you.notes);
  }, [you, notesDirty]);

  // The Tale reads newest-last; keep its foot in view.
  useEffect(() => {
    const el = taleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shared?.tale.length]);

  const send = (msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  if (phase === "boot" || phase === "connecting") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="quiet">The Table is being set…</p>
          <p className="quiet" style={{ fontSize: 12, opacity: 0.75 }}>{bootStep}</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="error-line" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{error}</p>
          <button className="table-btn" onClick={() => window.location.reload()}>Try the door again</button>
        </div>
      </div>
    );
  }

  if (phase === "lost") {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <h1>🕯️ The Table</h1>
          <p className="quiet">The connection to the Table was lost — the room keeps your seat warm only a moment.</p>
          <button className="table-btn" onClick={() => lastJoinRef.current && connect(lastJoinRef.current)}>Rejoin the Table</button>
        </div>
      </div>
    );
  }

  if (phase === "door" || !shared) {
    return (
      <div className="table-door-wrap">
        <div className="table-door">
          <p className="door-back"><a href="/">← Back to the Awoken</a></p>
          <h1>🕯️ The Table</h1>
          <p>
            A table for Tenders, played together. Awoken never fight each other here —
            every battle is the party against the Unbinding.
          </p>
          {devMode ? (
            <>
              <p className="quiet">
                The doorway test: Discord sign-in is not configured on this server yet,
                so a name spoken here seats you. Once Discord is configured, only a
                proven Discord name can sit.
              </p>
              <label className="door-label" htmlFor="door-name">Your name at the Table</label>
              <input
                id="door-name"
                className="door-input"
                value={devName}
                onChange={(e) => setDevName(e.target.value)}
                maxLength={40}
                placeholder="e.g. Tender of the quiet moss"
              />
              <div className="door-actions">
                <button
                  className="table-btn primary"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: "the-table" })}
                >
                  Take your seat
                </button>
                <button className="table-btn" onClick={() => connect({ watch: true, name: devName.trim() || "A Watcher", room: "the-table" })}>
                  Watch instead
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="quiet">
                Open the Table from the voice channel in Discord to be named and dealt a hand.
                From a plain browser you may still watch the room.
              </p>
              <button className="table-btn" onClick={() => connect({ watch: true, name: "A Watcher", room: "the-table" })}>
                Watch the Table
              </button>
            </>
          )}
          <div className="bind-code-panel">
            <h4>🎲 Your Table binding code</h4>
            <p className="quiet">
              Signed in here as your Tender? Take a one-time code, then spend it at the
              Table in Discord (the bind strip above your hand) — your Discord name is
              tied to this Tender, and the Table deals your real deck from then on.
            </p>
            {bindCode ? (
              <p className="bind-code-shown">Your code: <strong>{bindCode}</strong> — it fades in fifteen minutes and works once.</p>
            ) : (
              <button className="table-btn" onClick={() => void fetchBindCode()}>Show my binding code</button>
            )}
            {bindCodeMsg && <p className="quiet small">{bindCodeMsg}</p>}
          </div>
        </div>
      </div>
    );
  }

  const sky = shared.sky;
  const selectedCard = you && selectedCardId ? you.hand.find(c => c.id === selectedCardId) ?? null : null;
  return (
    <div className="table-room">
      <header className="skybar">
        <span className="sky-reign">☁ <strong>{sky.mood}</strong>{sky.description ? ` — ${sky.description}` : ""}</span>
        <span className="sky-round">The Table · casual room</span>
        <span className="sky-threat">
          <label>Unraveling power</label>
          <span className="threat-track"><span className="threat-fill" style={{ width: "0%" }} /></span>
          <span className="threat-num">0 — the dark is not yet dealt</span>
        </span>
      </header>

      <main className="table-main">
        <aside className="panel party-panel">
          <h3>The Party</h3>
          {shared.players.length === 0 && <p className="quiet">No Tenders seated yet.</p>}
          {shared.players.map((p) => (
            <div key={p.key} className={`party-row${you && p.key === you.key ? " self" : ""}`}>
              <span className="party-name">{p.name}{you && p.key === you.key ? " (you)" : ""}</span>
              {p.fallen ? <span className="party-meta fallen">💀 fallen — rises between waves</span> : <span className="party-meta">❤ {p.tenderHp}/{p.maxTenderHp} · ⚡ {p.energy} · 🂠 {p.handCount} in roster</span>}
            </div>
          ))}
          {shared.watcherCount > 0 && <p className="quiet">{shared.watcherCount} watching</p>}
          {you && (
            <div className="packing">
              <h4>Your packing</h4>
              {you.inventory.length === 0 && <p className="quiet">Nothing written down yet.</p>}
              <ul className="packing-list">
                {you.inventory.map((item, i) => (
                  <li key={i}>
                    <span>{item}</span>
                    <button
                      className="mini-btn"
                      aria-label={`Remove ${item}`}
                      onClick={() => send({ type: "inventory", items: you.inventory.filter((_, j) => j !== i) })}
                    >✕</button>
                  </li>
                ))}
              </ul>
              <form
                className="packing-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = packDraft.trim();
                  if (!v) return;
                  send({ type: "inventory", items: [...you.inventory, v] });
                  setPackDraft("");
                }}
              >
                <input value={packDraft} onChange={(e) => setPackDraft(e.target.value)} maxLength={120} placeholder="Write an item…" aria-label="Add an item to your packing" />
                <button className="mini-btn add" type="submit">Add</button>
              </form>
              <p className="quiet small">Yours alone — typed, kept, and carried between sittings.</p>
            </div>
          )}
        </aside>

        <section className="panel field-panel">
          <div className="field-wrap">
            <img className="field-bg" src={battlegroundBg} alt="" aria-hidden="true" />
            <div className="field-board">
            <svg className="field-hexes" viewBox="0 0 300 260" role="img" aria-label="The instance field: the star-seed at the center hex, ringed by six hexes where Awoken may stand">
              {FIELD_HEXES.map((h) => {
                const unit = shared.field.find(u => u.hex === h.id);
                const myUnit = !!(unit && you && unit.ownerKey === you.key);
                let pickable = false;
                if (placing && !h.center) {
                  if (placing.kind === "heal") pickable = myUnit;
                  else if (placing.kind === "rune") pickable = !shared.workings.some(w => w.kind === "rune" && w.hex === h.id);
                  else if (!wardAnchor) pickable = myUnit;
                  else pickable = hexNeighbors(wardAnchor).includes(h.id);
                }
                return (
                  <g
                    key={h.id}
                    transform={`translate(${h.x},${h.y})`}
                    onClick={() => {
                      if (h.center) return;
                      if (placing && you) {
                        if (placing.kind === "heal") {
                          if (myUnit) { send({ type: "castHeal", hex: h.id }); setPlacing(null); }
                          return;
                        }
                        if (placing.kind === "rune") {
                          if (placing.root === "blades") {
                            setBladePicks(prev => prev.includes(h.id) ? prev.filter(x => x !== h.id) : prev.length >= 3 ? prev : [...prev, h.id]);
                            return;
                          }
                          if (!shared.workings.some(w => w.kind === "rune" && w.hex === h.id)) {
                            send({ type: "castRune", root: placing.root, hue: pourHue, hexes: [h.id] });
                            setPlacing(null);
                          }
                          return;
                        }
                        if (!wardAnchor) { if (myUnit) setWardAnchor(h.id); return; }
                        if (hexNeighbors(wardAnchor).includes(h.id)) {
                          send({ type: "castWard", root: placing.root, hue: pourHue, hexA: wardAnchor, hexB: h.id });
                          setPlacing(null); setWardAnchor(null);
                        } else if (h.id === wardAnchor) setWardAnchor(null);
                        return;
                      }
                      if (unit && you && unit.ownerKey === you.key) { send({ type: "recall", hex: h.id }); return; }
                      if (selectedCard && !unit) send({ type: "summon", cardId: selectedCard.id, hex: h.id });
                    }}
                    style={{ cursor: !h.center && (pickable || selectedCard || myUnit) ? "pointer" : "default" }}
                  >
                    <polygon
                      className={`${h.center ? "hex center" : "hex"}${unit ? " stood" : ""}${!h.center && selectedCard && !unit ? " open" : ""}${pickable ? " pickable" : ""}${wardAnchor === h.id ? " anchor" : ""}${bladePicks.includes(h.id) ? " picked" : ""}`}
                      points="0,-26 22.52,-13 22.52,13 0,26 -22.52,13 -22.52,-13"
                    />
                    {h.center && (
                      <>
                        <circle className="seed-ground" r="13" />
                        <circle className="seed-bulb" r="6" />
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="field-units" aria-hidden={false}>
              {shared.field.map((u) => {
                const h = FIELD_HEXES.find(x => x.id === u.hex);
                if (!h) return null;
                const mine = you && u.ownerKey === you.key;
                return (
                  <div
                    key={u.hex}
                    className={`field-unit${mine ? " mine" : ""}`}
                    style={{ left: `${(h.x / 300) * 100}%`, top: `${(h.y / 260) * 100}%` }}
                    title={mine ? `${u.name} — yours. Tap its hex to recall it.` : `${u.name} — stands for ${u.ownerName}.`}
                  >
                    {u.art
                      ? <img src={u.art} alt={u.name} />
                      : <ElementGlyph element={u.element as GlyphElement} width={30} height={30} />}
                    <span className="unit-name">{u.name}</span>
                    <span className="unit-hp"><span className="unit-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (u.hp / Math.max(1, u.maxHp)) * 100))}%` }} /></span>
                    <span className="unit-stats">⚔{u.power} ❤{u.hp}/{u.maxHp}</span>
                  </div>
                );
              })}
              {shared.dark.map((e) => {
                const h = FIELD_HEXES.find(x => x.id === e.hex);
                if (!h) return null;
                return (
                  <div key={e.hex} className="field-unit dark" style={{ left: `${(h.x / 300) * 100}%`, top: `${(h.y / 260) * 100}%` }} title={`${e.label} — ⚔${e.power}, ❤${e.hp}/${e.maxHp}`}>
                    {e.art
                      ? <img src={e.art} alt={e.label} />
                      : <span className="dark-glyph">🕳️</span>}
                    <span className="unit-name">{e.label}</span>
                    <span className="unit-hp"><span className="unit-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (e.hp / Math.max(1, e.maxHp)) * 100))}%` }} /></span>
                    <span className="unit-stats">⚔{e.power} ❤{e.hp}/{e.maxHp}{e.pinned > 0 ? ` · ⛓${e.pinned}` : ""}</span>
                  </div>
                );
              })}
            </div>
            </div>
            <div className="field-workings">
              {shared.workings.map((w) => {
                const img = GLYPHS[w.root];
                if (!img) return null;
                const filter = `${HUE_FILTERS[w.hue] ?? "none"} drop-shadow(0 0 6px ${HUE_GLOWS[w.hue] ?? "#ffd98a"})`;
                if (w.kind === "rune" && w.hex) {
                  const h = FIELD_HEXES.find(x => x.id === w.hex);
                  if (!h) return null;
                  return (
                    <div key={w.id} className="field-working rune" style={{ left: `${(h.x / 300) * 100}%`, top: `${(h.y / 260) * 100}%` }} title={`${w.name} — written by ${w.ownerName}`}>
                      <img src={img} alt={w.name} style={{ filter }} />
                      {w.root === "blade" && <span className="working-tag">{w.charges}✦</span>}
                    </div>
                  );
                }
                if (w.kind === "ward" && w.hexA && w.hexB) {
                  const a = FIELD_HEXES.find(x => x.id === w.hexA);
                  const b = FIELD_HEXES.find(x => x.id === w.hexB);
                  if (!a || !b) return null;
                  const deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
                  return (
                    <div key={w.id} className="field-working ward" style={{ left: `${(((a.x + b.x) / 2) / 300) * 100}%`, top: `${(((a.y + b.y) / 2) / 260) * 100}%`, transform: `translate(-50%, -50%) rotate(${deg}deg)` }} title={`${w.name} — raised by ${w.ownerName}`}>
                      <img src={img} alt={w.name} style={{ filter }} />
                      {w.root === "trees" && <span className="working-tag">❤{w.hp}</span>}
                      {w.root === "seal" && <span className="working-tag">{3 - w.stops}✦</span>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
            <div className="field-caption">
              <strong>The star-seed</strong> — fallen light, rooted in cracked ground.
              The Bastion is what the party will build around it. Cast from your
              roster onto the field; when the party stands ready, begin the Unraveling.
            </div>
            {placing && (
              <div className="placing-bar">
                <span className="placing-text">
                  {placing.kind === "heal" && <>Mending — tap one of <strong>your own standing Awoken</strong> to restore {you?.healAmount ?? 5} HP (⚡2).</>}
                  {placing.kind === "rune" && placing.root !== "blades" && <>Writing the <strong>{(WORKING_DEFS as Record<string, any>)[placing.root]?.forms[pourHue]}</strong> — tap a hex's ground to write it there. It springs the moment the dark stands on it.</>}
                  {placing.kind === "rune" && placing.root === "blades" && <>Planting the <strong>{(WORKING_DEFS as Record<string, any>)[placing.root]?.forms[pourHue]}</strong> — tap up to three hexes ({bladePicks.length}/3 chosen), then lay them.</>}
                  {placing.kind === "ward" && !wardAnchor && <>Raising the <strong>{(WORKING_DEFS as Record<string, any>)[placing.root]?.forms[pourHue]}</strong> — tap a hex <strong>your Awoken holds</strong>: the ward will stand on one of its edges.</>}
                  {placing.kind === "ward" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the ward stands on the edge between the two.</>}
                </span>
                {placing.kind === "rune" && placing.root === "blades" && bladePicks.length > 0 && (
                  <button className="table-btn primary" onClick={() => { send({ type: "castRune", root: "blades", hue: pourHue, hexes: bladePicks }); setPlacing(null); setBladePicks([]); }}>Lay the blades · ⚡4</button>
                )}
                <button className="table-btn" onClick={() => { setPlacing(null); setWardAnchor(null); setBladePicks([]); }}>Set the light down</button>
              </div>
            )}
            <div className="battle-bar">
              {shared.battle.active ? (
                <span className="battle-status">🌑 Wave {shared.battle.wave} — {shared.dark.length} of the dark stand · round {shared.round}</span>
              ) : you ? (
                <button className="table-btn primary battle-btn" onClick={() => send({ type: "startWave" })}>⚔ Begin the Unraveling — Wave {shared.battle.wave}</button>
              ) : (
                <span className="battle-status">The field is at rest. A seated Tender may begin the Unraveling.</span>
              )}
            </div>
          </div>
          <div className="tale" ref={taleRef} aria-label="The Tale — the session's log">
            {shared.tale.length === 0 && <p className="quiet">The Tale is unwritten. For now.</p>}
            {shared.tale.map((t, i) => (
              <p key={i} className="tale-line">
                <time>{new Date(t.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time> {t.text}
              </p>
            ))}
          </div>
        </section>

        <aside className="panel dark-panel">
          <h3>The Dark</h3>
          <div className="roster">
            {(shared.enemies.length ? shared.enemies : ROSTER.map(r => ({ ...r, art: null }))).map((r) => (
              <div key={r.name} className="roster-row">
                <img src={r.art ?? BUNDLED_ENEMIES[r.name as keyof typeof BUNDLED_ENEMIES]} alt={r.label} />
                <div>
                  <strong>{r.label}</strong>
                  <p>{r.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="quiet small">The whole roster. When the dealing begins, the dark is dealt from here — face-up, never a bare number.</p>
          {you && (
            <div className="notes">
              <h4>Your notes</h4>
              <textarea
                value={notesDraft}
                onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                rows={6}
                maxLength={8000}
                placeholder="Suspicions, names, half-remembered omens…"
                aria-label="Your personal notes"
              />
              <button
                className="mini-btn add"
                disabled={!notesDirty}
                onClick={() => { send({ type: "notes", text: notesDraft }); setNotesDirty(false); }}
              >
                Keep these notes
              </button>
              <p className="quiet small">Yours alone, like your hand.</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="handzone">
        {you ? (
          <>
            <div className="satchel-head">
              <div className="satchel-tabs" role="tablist" aria-label="Your satchel">
                {(["I", "II", "III", "IV"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {t}{t === "I" ? " · Awoken" : t === "II" ? " · Abilities" : t === "III" ? " · Spells" : " · Potions & Items"}
                  </button>
                ))}
              </div>
              <span className="my-energy" title="Your energy for this sitting — calculated from your whole roster by the game's law">⚡ {you.energy ?? 0}<span className="my-energy-max"> / {you.maxEnergy ?? 0}</span></span>
              <button className="dice-btn" onClick={() => setDiceOpen(true)} aria-label="Open your dice">🎲 Your dice</button>
            </div>
            {notice && <p className="notice-line">{notice}</p>}
            {tab === "I" && (
              <>
                <div className="hand-cards">
                  {you.hand.map((card) => {
                    const cost = Math.max(1, card.power);
                    const afford = (you.energy ?? 0) >= cost;
                    const selected = selectedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        className={`tcard castable${selected ? " selected" : ""}${afford ? "" : " dim"}`}
                        data-element={card.element}
                        role="button"
                        aria-pressed={selected}
                        title={afford ? `Cast ${card.name} — ⚡${cost}. Tap, then tap a ring hex.` : `${card.name} costs ⚡${cost} — you hold ⚡${you.energy ?? 0}.`}
                        onClick={() => setSelectedCardId(selected ? null : card.id)}
                      >
                        <div className="tcard-banner">
                          <span className="tcard-name">{card.name}</span>
                          <span className="tcard-mark">{card.level ? `Lv ${card.level}` : ""}</span>
                        </div>
                        {card.art ? (
                          <div className="tcard-art real"><img src={card.art} alt={`${card.name}, your Awoken`} /></div>
                        ) : (
                          <div className="tcard-art"><ElementGlyph element={card.element as GlyphElement} width={54} height={54} /></div>
                        )}
                        <div className="tcard-stats"><span>⚔ {card.power}</span><span>❤ {card.toughness}</span><span className="cost-chip">⚡{cost}</span></div>
                        {cardBorder.imageUrl && <img className={`card-border-frame fit-${cardBorder.fit ?? "hug"}`} src={cardBorder.imageUrl} alt="" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
                {selectedCard ? (
                  <p className="cast-hint">Casting <strong>{selectedCard.name}</strong> — tap an open ring hex on the field to set it standing (⚡{Math.max(1, selectedCard.power)}). Tap its hex again later to recall it; the energy spent is not returned.</p>
                ) : you.bound ? (
                  <p className="quiet small">Your roster — every Awoken of <strong>{you.bound}</strong> stands ready, sent to you alone. Tap one to cast it onto the field.</p>
                ) : (
                  <div className="bind-strip">
                    <p className="quiet small">Your roster — sent to you alone. These are stand-in cards: bind your Tender and your own Awoken take their places, true faces and all. Take a code in the game (the 🎲 The Table panel at the screen's right edge), then spend it here.</p>
                    <div className="bind-row">
                      <input
                        className="door-input"
                        value={bindInput}
                        onChange={(e) => setBindInput(e.target.value.toUpperCase())}
                        maxLength={6}
                        placeholder="Binding code"
                        aria-label="Binding code"
                      />
                      <button className="table-btn primary" disabled={bindInput.trim().length < 6} onClick={() => void submitBind()}>Bind my Tender</button>
                      {bindMsg.startsWith("Bound") && (
                        <button className="table-btn" onClick={() => window.location.reload()}>Re-seat now</button>
                      )}
                    </div>
                    {bindMsg && <p className="quiet small">{bindMsg}</p>}
                  </div>
                )}
              </>
            )}
            {tab === "II" && (
              <div className="arts-list">
                <PourRow hue={pourHue} setHue={setPourHue} />
                {Object.values(WORKING_DEFS).filter(d => d.kind === "ward").map(d => {
                  const formName = (d.forms as Record<string, string>)[pourHue];
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, choose the hex your Awoken holds, then its neighbour.`}>
                      <img src={GLYPHS[d.key]} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} />
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · Ward · ⚡{d.cost}</em>
                        <span>{d.blurb}</span>
                      </span>
                    </button>
                  );
                })}
                <p className="quiet small">Wards are walls: they stand on a hex's edge and answer what crosses it. A ward is written for one battle — when the wave breaks, the light fades. The hue names and dresses the working in this first seating; its elemental twists wake with your attunement.</p>
              </div>
            )}
            {tab === "III" && (
              <div className="arts-list">
                <PourRow hue={pourHue} setHue={setPourHue} />
                <button className={`working-card${placing?.kind === "heal" ? " selected" : ""}`}
                  onClick={() => { setPlacing(placing?.kind === "heal" ? null : { kind: "heal", root: "heal" }); setWardAnchor(null); setBladePicks([]); }}
                  title={`Heal — restore ${you.healAmount ?? 5} HP to one of your standing Awoken · ⚡2`}>
                  <span className="heal-medal">✚</span>
                  <span className="working-text">
                    <strong>Heal · Tier {you.healTier ?? 1}</strong>
                    <em>The mending art · ⚡2 · yours from Tender Lv 1</em>
                    <span>Restore {you.healAmount ?? 5} HP to one of your standing Awoken. In our lore, the healers are the Binders.</span>
                  </span>
                </button>
                {Object.values(WORKING_DEFS).filter(d => d.kind === "rune").map(d => {
                  const formName = (d.forms as Record<string, string>)[pourHue];
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "rune", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, then write it on a hex's ground.`}>
                      <img src={GLYPHS[d.key]} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} />
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · Rune · ⚡{d.cost}</em>
                        <span>{d.blurb}</span>
                      </span>
                    </button>
                  );
                })}
                <p className="quiet small">Runes are ground-writing: they wait in a hex's floor and spring when the dark stands on them — binding everything on the hex at once. One writing per hex; a rune is spent when it springs (the Blade hums on for one more).</p>
              </div>
            )}
            {tab === "IV" && (
              <div className="arts-list">
                <p className="quiet">Potions and carried things will gather here as the world deals them. What you write down yourself rides in your packing, under the Party.</p>
              </div>
            )}
          </>
        ) : (
          <p className="watcher-line">You are watching the Table. Bind in the game to be dealt a hand — the shared zones are yours to see; the hands are not.</p>
        )}
      </footer>

      {diceOpen && (
        <div className="dice-overlay" role="dialog" aria-label="Your dice">
          <div className="dice-pop">
            <div className="dice-head">
              <strong>Your dice</strong>
              <button className="mini-btn" onClick={() => setDiceOpen(false)} aria-label="Close the dice">✕</button>
            </div>
            <div className="dice-grid">
              {DICE.map((d) => (
                <button
                  key={d}
                  className="die-btn"
                  onClick={() => { send({ type: "roll", sides: d }); setDiceOpen(false); }}
                >
                  d{d}
                </button>
              ))}
            </div>
            <p className="quiet small">Rolled by the referee, in the open, and written into the Tale.</p>
          </div>
        </div>
      )}
    </div>
  );
}
