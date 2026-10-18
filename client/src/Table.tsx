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
import glyphEngine from "./assets/glyphs/engine.png";
import glyphStandard from "./assets/glyphs/standard.png";
import glyphBeacon from "./assets/glyphs/beacon.png";
import glyphBlade from "./assets/glyphs/blade.png";
import glyphBlades from "./assets/glyphs/blades.png";
import glyphCoil from "./assets/glyphs/coil.png";
import { ANIMATED_GLYPH, PROJECTILE_GIF } from "./effects";

const GLYPHS: Record<string, string> = { seal: ANIMATED_GLYPH.seal, engine: glyphEngine, standard: glyphStandard, trees: ANIMATED_GLYPH.trees, beacon: glyphBeacon, lattice: ANIMATED_GLYPH.lattice, blade: glyphBlade, blades: glyphBlades, shard: ANIMATED_GLYPH.shard, coil: glyphCoil, shardrain: ANIMATED_GLYPH.shardrain };

/** A spell as the Table reads it — from the Grimoire (Nigel,
 *  2026-10-17): the workshop's book is the data of record now;
 *  the generated WORKING_DEFS are only the offline fallback. */
interface TableDef {
  key: string; root: string; kind: string; engine: string;
  glyph: string | null; cost: number; blurb: string;
  forms: Record<string, string>; numbers: Record<string, number>;
}
const STATIC_DEFS: Record<string, TableDef> = Object.fromEntries(
  Object.values(WORKING_DEFS as Record<string, any>).map((d: any) => [d.key, {
    key: d.key, root: d.root, kind: d.kind, engine: d.key,
    glyph: GLYPHS[d.key] ?? null, cost: d.cost, blurb: d.blurb,
    forms: d.forms as Record<string, string>, numbers: {} as Record<string, number>,
  }]),
);
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
  layers?: { source_id: string; category: string; imageUrl: string | null }[];
  element: string;
  power: number;
  toughness: number;
  hp: number;
  maxHp: number;
  shield?: number;
  maxShield?: number;
  level: number | null;
  ownerKey: string;
  ownerName: string;
}

interface EnemyView { name: string; label: string; note: string; art: string | null }

interface SharedState {
  room: string;
  mode?: string;
  campaign?: {
    bank: number;
    bankStart: number;
    seeded: boolean;
    over: string | null;
    storytenderName: string | null;
    stage: { title: string; text: string; imageUrl: string | null; at: number } | null;
    deals: number;
  } | null;
  sky: { mood: string; description: string; endsAt: string | null };
  round: number;
  threat: number;
  players: { key: string; name: string; handCount: number; energy: number; maxEnergy: number; tenderHp: number; maxTenderHp: number; fallen: boolean; storytender?: boolean }[];
  watcherCount: number;
  tale: { at: number; text: string }[];
  field: FieldUnitView[];
  enemies: EnemyView[];
  dark: { hex: string; kind: string; label: string; art: string | null; power: number; hp: number; maxHp: number; pinned: number; armor?: number; lvl?: number }[];
  workings: WorkingView[];
  battle: { active: boolean; wave: number };
  strikes?: { from: string; to: string; element: string; side: "light" | "dark"; hit: boolean; killed: boolean }[];
  bastion?: {
    callId: number; kind: string; hostName: string; ambush: boolean;
    pool: number; poolMax: number; begun: boolean; resolved: boolean; size: number;
  } | null;
}

interface YouState {
  key: string;
  name: string;
  hand: TableCard[];
  notes: string;
  energy?: number;
  maxEnergy?: number;
  band?: number;
  bandCap?: number;
  tenderLevel?: number;
  healTier?: number;
  healAmount?: number;
  wardRuneUnlocked?: boolean;
  tenderHp?: number;
  maxTenderHp?: number;
  pools?: Record<string, number> | null;
  inventory: string[];
  bound?: string | null;
  yourCall?: { id: number; kind: string; columnId: number | null; seedId: number | null; joinKey?: string | null } | null;
  /** CAMPAIGN (Phase B): dissipations per card — the recast
   *  multiplier the bank will charge for its return. */
  recasts?: Record<string, number>;
  /** The Storytender's private instruments (her eyes only). */
  storytender?: {
    reserve: string[];
    reserveThreat: number;
    partyPower: number;
    deals: number;
    bank: number;
    seeded: boolean;
    over: string | null;
  } | null;
}

type Phase = "boot" | "door" | "connecting" | "seated" | "lost" | "error";

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** The dice wear their shapes again (Nigel, 2026-10-18): every
 *  die in the pop-up is drawn as its own stone — the triangle,
 *  the pipped cube, the diamond, the kite, the pentagon, the
 *  hexagon — never bare text. */
function DieGlyph({ sides }: { sides: number }) {
  switch (sides) {
    case 4:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,5 30,28 4,28" /><polygon points="17,16 22.5,24.5 11.5,24.5" /></svg>);
    case 6:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><rect x="8" y="8" width="18" height="18" rx="2.5" />{[[13, 12.5], [21, 12.5], [13, 17], [21, 17], [13, 21.5], [21, 21.5]].map(([cx, cy], i) => (<circle key={i} className="pip" cx={cx} cy={cy} r="1.5" />))}</svg>);
    case 8:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,4 29,17 17,30 5,17" /><line x1="5" y1="17" x2="29" y2="17" /><line x1="17" y1="4" x2="17" y2="17" /><line x1="17" y1="30" x2="17" y2="17" /></svg>);
    case 10:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 28,13 17,31 6,13" /><line x1="6" y1="13" x2="28" y2="13" /></svg>);
    case 12:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,4 29.5,13 24.5,28.5 9.5,28.5 4.5,13" /><circle className="pip" cx="17" cy="18" r="1.6" /></svg>);
    case 20:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 29,10.5 29,23.5 17,31 5,23.5 5,10.5" /><polygon points="17,11 23.5,22 10.5,22" /></svg>);
    default:
      return (<svg className="die-glyph" viewBox="0 0 34 34" aria-hidden="true"><polygon points="17,3 28,13 17,31 6,13" /><line x1="6" y1="13" x2="28" y2="13" /><text x="17" y="24.5" textAnchor="middle" fontSize="8.5" fill="currentColor" stroke="none">%</text></svg>);
  }
}
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
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awokin where it stands." },
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
  // The hand drawer (Phase A room, Nigel 2026-10-18): the hand
  // rests half off-screen and rises when reached for.
  const [handUp, setHandUp] = useState(false);
  // CAMPAIGN doors (Phase B): the Discord door's proven name,
  // held while the opener chooses the room's nature; and the
  // doorway-test campaign key.
  const [authJoin, setAuthJoin] = useState<{ authToken: string; instanceId: string } | null>(null);
  const [campKey, setCampKey] = useState("");
  // The Stage: hidden by the viewer's own tap until a new
  // scene is set.
  const [stageHidden, setStageHidden] = useState(false);
  // The Storytender's instruments (her panel's drafts).
  const [stNarrate, setStNarrate] = useState("");
  const [stSceneTitle, setStSceneTitle] = useState("");
  const [stSceneText, setStSceneText] = useState("");
  const [stSceneImg, setStSceneImg] = useState("");
  const [stSkyText, setStSkyText] = useState("");
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
  // The Grimoire, read at mount (the same public read the game
  // uses): names, costs, blurbs, and glyph assignments all come
  // from the workshop's book. The referee refreshes its own
  // copy on every message, so a tuning lands within a cast.
  const [grimoire, setGrimoire] = useState<any | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/getGrimoire", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then((r) => r.json())
      .then((d) => { if (live && d && Array.isArray(d.spells)) setGrimoire(d); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const defs: Record<string, TableDef> = (() => {
    if (!grimoire) return STATIC_DEFS;
    const out: Record<string, TableDef> = {};
    for (const sp of grimoire.spells as any[]) {
      const glyph = (grimoire.glyphs as any[]).find((g) => g.id === sp.glyphId);
      out[sp.key] = {
        key: sp.key, root: sp.name, kind: sp.kind, engine: sp.engine,
        glyph: glyph ? (glyph.imageUrl ?? (glyph.assetKey ? GLYPHS[glyph.assetKey] ?? null : null)) : null,
        cost: sp.cost, blurb: sp.blurb, forms: sp.forms ?? {}, numbers: sp.numbers ?? {},
      };
    }
    return out;
  })();
  const healDef = Object.values(defs).find((d) => d.engine === "heal");
  // The Written Light: what is being laid, in which poured hue,
  // and the placement steps (a ward wants an anchor hex, then a
  // neighbour; the Three Blades gather up to three hexes).
  const [pourHue, setPourHue] = useState<string>("unaligned");
  // The Pour (Nigel, 2026-10-17): elemental points fed into the
  // working being placed, chosen in the placing bar.
  const [pourPts, setPourPts] = useState(0);
  const [placing, setPlacing] = useState<{ kind: "ward" | "rune" | "heal"; root: string } | null>(null);
  const [pushTargetId, setPushTargetId] = useState<string | null>(null);
  const [pushHue, setPushHue] = useState<string>("root");
  const [pushPts, setPushPts] = useState(0);
  const [wardAnchor, setWardAnchor] = useState<string | null>(null);
  const [bladePicks, setBladePicks] = useState<string[]>([]);
  const [callKeyInput, setCallKeyInput] = useState("");
  // VISUALIZED COMBAT (Nigel, 2026-10-17): the referee reports
  // every strike of the round it just resolved; the Table
  // flies them — the attacker's element from its hex to its
  // mark's, the dark answering in a darkened bolt.
  const [shots, setShots] = useState<{ id: number; from: string; to: string; img: string; dark: boolean; hit: boolean; killed: boolean; idx: number }[]>([]);
  const lastRoundRef = useRef(-1);
  const shotIdRef = useRef(0);
  useEffect(() => {
    if (!shared) return;
    if (shared.round === lastRoundRef.current) return;
    lastRoundRef.current = shared.round;
    const strikes = shared.strikes ?? [];
    if (!strikes.length) return;
    const fresh = strikes.map((st) => ({
      id: ++shotIdRef.current,
      from: st.from, to: st.to,
      img: st.side === "dark" ? PROJECTILE_GIF.unaligned : (PROJECTILE_GIF[st.element] ?? PROJECTILE_GIF.unaligned),
      dark: st.side === "dark", hit: st.hit, killed: st.killed, idx: shotIdRef.current % 1000,
    }));
    setShots(prev => [...prev.slice(-30), ...fresh]);
    const ids = new Set(fresh.map(f => f.id));
    const t = setTimeout(() => setShots(prev => prev.filter(x => !ids.has(x.id))), 1500);
    return () => clearTimeout(t);
  }, [shared]);
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
        // The door inside Discord (Phase B): the opener chooses
        // the room's nature — the casual table, or a campaign
        // (as a Tender, or as its Storytender). The instance id
        // names the room either way, so the whole party lands
        // together whichever door they take.
        if (!cancelled) {
          setAuthJoin({ authToken: auth.token, instanceId: sdk.instanceId || "the-table" });
          setPhase("door");
        }
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

  // A newly set scene raises the Stage again.
  useEffect(() => {
    if (shared?.campaign?.stage) setStageHidden(false);
  }, [shared?.campaign?.stage?.at]);

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
          <p className="door-back"><a href="/">← Back to the Awokin</a></p>
          <h1>🕯️ The Table</h1>
          <p>
            A table for Tenders, played together. Awokin never fight each other here —
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
              <label className="door-label" htmlFor="door-campaign">Or open a campaign — a Storytender deals, one bank binds the party</label>
              <input
                id="door-campaign"
                className="door-input"
                value={campKey}
                onChange={(e) => setCampKey(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24))}
                maxLength={24}
                placeholder="Campaign key (blank = the main campaign)"
              />
              <div className="door-actions">
                <button
                  className="table-btn"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: `campaign-${campKey.trim() || "main"}` })}
                >
                  📖 Campaign — take a seat
                </button>
                <button
                  className="table-btn"
                  disabled={!devName.trim()}
                  onClick={() => connect({ devName: devName.trim(), room: `campaign-${campKey.trim() || "main"}`, storytender: true })}
                >
                  📖 Campaign — be the Storytender
                </button>
              </div>
            </>
          ) : authJoin ? (
            <>
              <p className="quiet">
                Discord has vouched for your name. Choose the room's nature — the whole
                party lands together whichever door they take.
              </p>
              <div className="door-actions">
                <button className="table-btn primary" onClick={() => connect({ authToken: authJoin.authToken, room: authJoin.instanceId })}>
                  ⚔ The casual table
                </button>
                <button className="table-btn" onClick={() => connect({ watch: true, name: "A Watcher", room: authJoin.instanceId })}>
                  Watch instead
                </button>
              </div>
              <div className="door-actions">
                <button className="table-btn" onClick={() => connect({ authToken: authJoin.authToken, room: `campaign-${authJoin.instanceId}` })}>
                  📖 Campaign — take a seat
                </button>
                <button className="table-btn" onClick={() => connect({ authToken: authJoin.authToken, room: `campaign-${authJoin.instanceId}`, storytender: true })}>
                  📖 Campaign — be the Storytender
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
  const bandFull = !!you && (you.band ?? 0) >= (you.bandCap ?? 5);
  // CAMPAIGN: the star-seed swells with the bank — the bulb is
  // the pool's body, read at a glance (TABLE-DESIGN §4.5).
  const bankFrac = shared.campaign?.seeded && shared.campaign.bankStart > 0
    ? Math.max(0.05, Math.min(1.5, shared.campaign.bank / shared.campaign.bankStart))
    : null;
  const bulbR = bankFrac === null ? 6 : 3 + 4.5 * bankFrac;
  // CAMPAIGN: a dissipated Awokin's recast price doubles per
  // dissipation — the card chips show the bank's true price.
  const castCostOf = (card: TableCard): number => {
    const n = shared.mode === "campaign" && you?.recasts ? (you.recasts[card.id] ?? 0) : 0;
    return Math.max(1, card.power) * (n > 0 ? 2 ** Math.min(n, 5) : 1);
  };
  return (
    <div className="table-room">
      <header className="skybar">
        <span className="sky-reign">☁ <strong>{sky.mood}</strong>{sky.description ? ` — ${sky.description}` : ""}</span>
        <span className="sky-round">The Table · {shared.mode === "campaign" ? "campaign room" : "casual room"}</span>
        {shared.campaign?.seeded && !shared.campaign.over && (
          <span className="bank-chip" title="The party's one bank — every cast draws from it, every harvest joins it, and what remains divides evenly when the campaign turns home">🌟 The Bank ⚡{shared.campaign.bank}</span>
        )}
        {shared.campaign?.over === "fallen" && <span className="bank-chip fallen">🌑 The Bastion has fallen</span>}
        {shared.campaign?.over === "ended" && <span className="bank-chip">🏠 The campaign has turned home</span>}
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
              {p.storytender ? <span className="party-meta">📖 Storytender — she deals</span> : p.fallen ? <span className="party-meta fallen">💀 fallen — rises between waves</span> : <span className="party-meta">❤ {p.tenderHp}/{p.maxTenderHp} · ⚡ {p.energy} · 🂠 {p.handCount} in roster</span>}
            </div>
          ))}
          {shared.watcherCount > 0 && <p className="quiet">{shared.watcherCount} watching</p>}
          {you && (
            <details className="packing">
              <summary>Your packing</summary>
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
            </details>
          )}
        </aside>

        <section className="panel field-panel">
          <div className="field-wrap">
            <img className="field-bg" src={battlegroundBg} alt="" aria-hidden="true" />
            <div className="field-board">
            <svg className="field-hexes" viewBox="0 0 300 260" role="img" aria-label="The instance field: the star-seed at the center hex, ringed by six hexes where Awokin may stand">
              <defs>
                <radialGradient id="hexOpen" cx="50%" cy="40%" r="75%">
                  <stop offset="0%" stopColor="#e8dcc3" stopOpacity="0.13" />
                  <stop offset="55%" stopColor="#e8dcc3" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
                </radialGradient>
                <radialGradient id="hexStood" cx="50%" cy="40%" r="75%">
                  <stop offset="0%" stopColor="#ddc38b" stopOpacity="0.34" />
                  <stop offset="60%" stopColor="#c9a227" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
                </radialGradient>
              </defs>
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
                          if (defs[placing.root]?.engine === "blades" || defs[placing.root]?.engine === "shardrain") {
                            const maxT = defs[placing.root]?.engine === "shardrain" ? (defs[placing.root]?.numbers.maxHexes ?? 3) : (defs[placing.root]?.numbers.maxTargets ?? 3);
                            setBladePicks(prev => prev.includes(h.id) ? prev.filter(x => x !== h.id) : prev.length >= maxT ? prev : [...prev, h.id]);
                            return;
                          }
                          if (!shared.workings.some(w => w.kind === "rune" && w.hex === h.id)) {
                            send({ type: "castRune", root: placing.root, hue: pourHue, hexes: [h.id], pour: pourPts });
                            setPlacing(null); setPourPts(0);
                          }
                          return;
                        }
                        if (!wardAnchor) { if (myUnit) setWardAnchor(h.id); return; }
                        if (hexNeighbors(wardAnchor).includes(h.id)) {
                          send({ type: "castWard", root: placing.root, hue: pourHue, hexA: wardAnchor, hexB: h.id, pour: pourPts });
                          setPlacing(null); setWardAnchor(null); setPourPts(0);
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
                        <circle className="seed-bulb" r={bulbR} />
                      </>
                    )}
                  </g>
                );
              })}
              <g className="shots-layer">
                {shots.map((shot, i) => {
                  const a = FIELD_HEXES.find(x => x.id === shot.from);
                  const b = FIELD_HEXES.find(x => x.id === shot.to);
                  if (!a || !b) return null;
                  const dx = b.x - a.x, dy = b.y - a.y;
                  return (
                    <image
                      key={shot.id}
                      href={shot.img}
                      x={a.x - 15} y={a.y - 15} width={30} height={30}
                      className={shot.dark ? "dark-shot" : undefined}
                      ref={(el) => {
                        if (!el || el.dataset.flown) return;
                        el.dataset.flown = "1";
                        el.animate(shot.hit ? [
                          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
                          { transform: `translate(${dx}px, ${dy}px) scale(${shot.killed ? 1.8 : 0.85})`, opacity: shot.killed ? 0 : 0.85 },
                        ] : [
                          // A miss flies — and spends itself wide of the mark.
                          { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
                          { transform: `translate(${dx * 0.92}px, ${dy * 0.92 - 14}px) scale(0.8)`, opacity: 0 },
                        ], { duration: 540, delay: i * 55, easing: "cubic-bezier(.25,.7,.3,1)", fill: "forwards" });
                      }}
                    />
                  );
                })}
              </g>
            </svg>
            <div className="field-units" aria-hidden={false}>
              {shared.field.map((u) => {
                const h = FIELD_HEXES.find(x => x.id === u.hex);
                if (!h) return null;
                const mine = you && u.ownerKey === you.key;
                // The field cutout, by the game's one law (FieldAwoken):
                // the piece art itself, body → arms → head — background
                // and aura layers never stand on a field, so no baked
                // background rides behind the figure (Nigel, 2026-10-18).
                const cutout = (u.layers ?? [])
                  .filter(l => {
                    const c = (l.category || "").toLowerCase().trim();
                    return c !== "background" && c !== "aura" && !c.includes("background") && !c.includes("aura") && !!l.imageUrl;
                  })
                  .sort((a, b) => {
                    const order = ["aspect", "body", "arms", "head"];
                    return order.indexOf(a.category) - order.indexOf(b.category);
                  });
                return (
                  <div
                    key={u.hex}
                    className={`field-unit${mine ? " mine" : ""}`}
                    style={{ left: `${(h.x / 300) * 100}%`, top: `${(h.y / 260) * 100}%` }}
                    title={mine ? `${u.name} — yours. Tap its hex to recall it.` : `${u.name} — stands for ${u.ownerName}.`}
                  >
                    {cutout.length
                      ? <span className="field-unit-art" aria-hidden="true">{cutout.map((l, i) => <img key={i} src={l.imageUrl as string} alt="" />)}</span>
                      : u.art
                        ? <img src={u.art} alt={u.name} />
                        : <ElementGlyph element={u.element as GlyphElement} width={30} height={30} />}
                    <span className="unit-name">{u.name}</span>
                    <span className="unit-hp"><span className="unit-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (u.hp / Math.max(1, u.maxHp)) * 100))}%` }} /></span>
                    <span className="unit-hp shield"><span className="unit-hp-fill shield-fill" style={{ width: `${Math.max(0, Math.min(100, ((u.shield ?? 0) / Math.max(1, u.maxShield ?? 1)) * 100))}%` }} /></span>
                    <span className="unit-stats">⚔{u.power} ❤{u.hp}/{u.maxHp}{(u.shield ?? 0) > 0 ? ` 🛡${u.shield}` : ""} · AC {u.toughness}</span>
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
                    <span className="unit-stats">⚔{e.power} ❤{e.hp}/{e.maxHp}{e.armor ? ` · AC ${e.armor}` : ""}{e.pinned > 0 ? ` · ⛓${e.pinned}` : ""}</span>
                  </div>
                );
              })}
            </div>
            <div className="field-workings">
              {shared.workings.map((w) => {
                const img = defs[w.root]?.glyph ?? GLYPHS[w.root] ?? null;
                const filter = `${HUE_FILTERS[w.hue] ?? "none"} drop-shadow(0 0 6px ${HUE_GLOWS[w.hue] ?? "#ffd98a"})`;
                if (w.kind === "rune" && w.hex) {
                  const h = FIELD_HEXES.find(x => x.id === w.hex);
                  if (!h) return null;
                  return (
                    <div key={w.id} className="field-working rune" style={{ left: `${(h.x / 300) * 100}%`, top: `${(h.y / 260) * 100}%` }} title={`${w.name} — written by ${w.ownerName}`}>
                      {img ? <img src={img} alt={w.name} style={{ filter }} /> : <span className="working-glyph-fallback" style={{ filter }}>✦</span>}
                      {defs[w.root]?.engine === "blade" && <span className="working-tag">{w.charges}✦</span>}
                      {defs[w.root]?.engine === "lattice" && <span className="working-tag">❤{w.hp}</span>}
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
                      {img ? <img src={img} alt={w.name} style={{ filter }} /> : <span className="working-glyph-fallback" style={{ filter }}>✦</span>}
                      {defs[w.root]?.engine === "trees" && <span className="working-tag">❤{w.hp}</span>}
                      {defs[w.root]?.engine === "seal" && <span className="working-tag">❤{w.hp} · {(defs[w.root]?.numbers.stops ?? 3) - w.stops}✦</span>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
            </div>
            {shared.campaign?.stage && !shared.battle.active && !stageHidden && (
            <div className="stage-overlay" role="region" aria-label="The Storytender's Stage">
              {shared.campaign.stage.imageUrl && <img className="stage-img" src={shared.campaign.stage.imageUrl} alt="" />}
              <div className="stage-body">
                <h3>{shared.campaign.stage.title}</h3>
                {shared.campaign.stage.text && <p>{shared.campaign.stage.text}</p>}
                <button className="table-btn" onClick={() => setStageHidden(true)}>⚔ To the field</button>
              </div>
            </div>
          )}
          <div className="field-caption">
              <strong>The star-seed</strong> — fallen light, rooted in cracked ground.
              The Bastion is what the party will build around it. Cast from your
              roster onto the field; when the party stands ready, begin the Unraveling.
            </div>
            {(() => {
              const neutrals = shared.workings.filter(w => w.kind === "rune" && w.hue === "unaligned" && ["lattice", "shard"].includes(defs[w.root]?.engine ?? ""));
              if (!neutrals.length) return null;
              const target = neutrals.find(w => w.id === pushTargetId) ?? null;
              const pool = Math.floor(you?.pools?.[pushHue] ?? 0);
              const lvl = Math.min(3, Math.floor(pool / 10));
              return (
                <div className="placing-bar">
                  <span className="placing-text">
                    {neutrals.map(w => (
                      <button key={w.id} className="table-btn" onClick={() => { setPushTargetId(target?.id === w.id ? null : w.id); setPushPts(0); }}>
                        ✦ {w.name} — {w.ownerName}&rsquo;s neutral rune{(target?.id === w.id) ? " (pushing)" : " — push it"}
                      </button>
                    ))}
                    {target && (
                      <>
                        <select value={pushHue} onChange={(e) => { setPushHue(e.target.value); setPushPts(0); }}>
                          {["tide", "sky", "stone", "root", "fire"].map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <button className="table-btn" disabled={pushPts <= 0} onClick={() => setPushPts(p => Math.max(0, p - 1))}>−</button>
                        <span>Pour {pushPts} (your {pushHue} Lv {lvl})</span>
                        <button className="table-btn" disabled={pushPts >= lvl} onClick={() => setPushPts(p => Math.min(lvl, p + 1))}>+</button>
                        <button className="table-btn primary" disabled={pushPts <= 0} onClick={() => { send({ type: "pourWorking", workingId: target.id, hue: pushHue, pour: pushPts }); setPushTargetId(null); setPushPts(0); }}>Push it toward {pushHue}</button>
                      </>
                    )}
                  </span>
                </div>
              );
            })()}
            {placing && (
              <div className="placing-bar">
                <span className="placing-text">
                  {placing.kind === "heal" && <>Mending — tap one of <strong>your own standing Awokin</strong> to restore {you?.healAmount ?? 5} HP (⚡{healDef?.cost ?? 2}).</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine !== "blades" && defs[placing.root]?.engine !== "shardrain" && <>Writing the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap a hex's ground to write it there. It springs the moment the dark stands on it.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "shardrain" && <>Writing the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxHexes ?? 3} hexes to cover ({bladePicks.length}/{defs[placing.root]?.numbers.maxHexes ?? 3} chosen), then let it fall. When the dark stands on its ground, the sky opens once: the dice pool splits over every foe beneath it.</>}
                  {placing.kind === "rune" && defs[placing.root]?.engine === "blades" && <>Planting the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap up to {defs[placing.root]?.numbers.maxTargets ?? 3} hexes ({bladePicks.length}/{defs[placing.root]?.numbers.maxTargets ?? 3} chosen), then lay them.</>}
                  {placing.kind === "ward" && !wardAnchor && <>Raising the <strong>{defs[placing.root]?.forms[pourHue] ?? defs[placing.root]?.root}</strong> — tap a hex <strong>your Awokin holds</strong>: the ward will stand on one of its edges.</>}
                  {placing.kind === "ward" && wardAnchor && <>Now tap a <strong>neighbouring hex</strong> — the ward stands on the edge between the two.</>}
                </span>
                {placing.kind !== "heal" && ["seal", "trees", "lattice", "shard"].includes(defs[placing.root]?.engine ?? "") && pourHue !== "unaligned" && you?.pools && (() => {
                  const def = defs[placing.root];
                  const n = def?.numbers ?? {};
                  const pool = Math.floor(you.pools[pourHue] ?? 0);
                  const cap = Math.min(3, Math.floor(pool / 10));
                  const maxPour = Math.min(cap, pool);
                  const bright = shared?.workings.some(w => defs[w.root]?.engine === "engine" && w.ownerKey === you.key) ? 1 : 0;
                  const hpPreview = def?.engine === "shard" ? null
                    : Math.max(1, Math.floor((n.hp ?? 6) + (n.hpPerLevel ?? 1) * (you.tenderLevel ?? 1) + (n.hpPerPoint ?? 2) * pourPts + (def?.engine === "trees" ? bright * (n.brightHpBonus ?? 2) : 0)));
                  return (
                    <span className="placing-pour">
                      <button className="table-btn" disabled={pourPts <= 0} onClick={() => setPourPts(p => Math.max(0, p - 1))}>−</button>
                      <span>Pour {pourPts} {pourHue} pt{pourPts === 1 ? "" : "s"} (pool {pool} · your {pourHue} Lv {cap})</span>
                      <button className="table-btn" disabled={pourPts >= maxPour} onClick={() => setPourPts(p => Math.min(maxPour, p + 1))}>+</button>
                      <span className="placing-pour-effect">{def?.engine === "shard" ? `→ +${pourPts * (n.harmPerPoint ?? 1)} harm when it falls` : `→ raised with ❤${hpPreview}`}</span>
                    </span>
                  );
                })()}
                {placing.kind === "rune" && (defs[placing.root]?.engine === "blades" || defs[placing.root]?.engine === "shardrain") && bladePicks.length > 0 && (
                  <button className="table-btn primary" onClick={() => { send({ type: "castRune", root: placing.root, hue: pourHue, hexes: bladePicks, pour: pourPts }); setPlacing(null); setBladePicks([]); setPourPts(0); }}>{defs[placing.root]?.engine === "shardrain" ? "Write the rain" : "Lay them"} · ⚡{defs[placing.root]?.cost ?? 4}</button>
                )}
                <button className="table-btn" onClick={() => { setPlacing(null); setWardAnchor(null); setBladePicks([]); }}>Set the light down</button>
              </div>
            )}
            <div className="battle-bar">
              {shared.battle.active ? (
                <span className="battle-status">🌑 Wave {shared.battle.wave} — {shared.dark.length} of the dark stand · round {shared.round}</span>
              ) : shared.campaign ? (
                <>
                <span className="battle-status">
                  {shared.campaign.over === "fallen"
                    ? "🌑 The Bastion has fallen — this campaign is ended by the enemy's right. A new campaign opens at the door."
                    : shared.campaign.over === "ended"
                      ? "🏠 The campaign has turned home — its growth goes with you. A new campaign opens at the door."
                      : <>📖 A campaign table — {shared.campaign.storytenderName ? <>{shared.campaign.storytenderName} deals the dark.</> : "awaiting a Storytender to deal."}{shared.campaign.seeded ? <> The bank ⚡{shared.campaign.bank} binds you.</> : null}</>}
                </span>
                {!shared.campaign.over && !shared.campaign.storytenderName && you && (
                  <button className="table-btn battle-btn" onClick={() => send({ type: "stEnd" })}>🏠 Turn the campaign home</button>
                )}
                </>
              ) : you ? (
                <>
                {shared.bastion ? (
                  <div className="bastion-banner">
                    ⚔ {shared.bastion.kind.toUpperCase()} — {shared.bastion.hostName}'s call · One pool ⚡{shared.bastion.pool}/{shared.bastion.poolMax}
                    {shared.bastion.ambush ? " · Ambush: strikes +1" : ""}
                    {shared.bastion.resolved ? " · the day is decided" : shared.bastion.begun ? " · the battle is joined" : " · waiting for the host to begin"}
                    {!shared.bastion.begun && !shared.bastion.resolved && you?.yourCall?.id === shared.bastion.callId && (
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "startBastion" })}>⚔ Begin the {shared.bastion.kind}</button>
                    )}
                  </div>
                ) : you?.yourCall ? (
                  you.yourCall.joinKey && shared.room !== `call-${you.yourCall.joinKey.toLowerCase()}` ? (
                    <div className="bastion-banner">
                      📣 Your {you.yourCall.kind.toUpperCase()} call stands in its own room — key <strong>{you.yourCall.joinKey}</strong>. Sit there to claim it; friends enter the key to join you.
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "switchRoom", callKey: you.yourCall!.joinKey })}>🪑 Sit at your call</button>
                    </div>
                  ) : (
                    <div className="bastion-banner">
                      📣 Your {you.yourCall.kind.toUpperCase()} call stands — claim this room for it, and your friends' energy joins the pool.{you.yourCall.joinKey ? <> Key: <strong>{you.yourCall.joinKey}</strong></> : null}
                      <button className="table-btn primary battle-btn" onClick={() => send({ type: "claimBastion", callId: you.yourCall!.id })}>📣 Claim this room</button>
                    </div>
                  )
                ) : null}
                {you && !shared.bastion && (
                  <div className="bastion-banner">
                    🔑 Answering a friend's call? Enter their key — a bastion key, an ambush key, a siege key — and take your seat at their defence, Awokin in hand.
                    <input className="call-key-input" value={callKeyInput} onChange={e => setCallKeyInput(e.target.value.toUpperCase())} placeholder="KEY" maxLength={6} />
                    <button className="table-btn battle-btn" disabled={callKeyInput.trim().length < 4} onClick={() => send({ type: "switchRoom", callKey: callKeyInput.trim() })}>Answer the call</button>
                  </div>
                )}
                {!shared.bastion && <button className="table-btn primary battle-btn" onClick={() => send({ type: "startWave" })}>⚔ Begin the Unraveling — Wave {shared.battle.wave}</button>}
                </>
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
            <details className="notes">
              <summary>Your notes</summary>
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
            </details>
          )}
        </aside>
      </main>

      <footer className={you?.storytender ? "handzone st-zone" : you ? `handzone drawer${handUp ? " risen" : ""}` : "handzone plain"}>
        {you?.storytender ? (
          <div className="st-panel">
            <div className="st-head">
              <strong>📖 The Storytender's Panel</strong>
              <span className="quiet small">
                The bank ⚡{you.storytender.bank}
                {you.storytender.seeded ? " — every cast draws from it; every harvest joins it." : " — it seeds at your first dealing, from the party's poured stakes."}
                {you.storytender.over ? " This campaign is over." : ""}
              </span>
            </div>
            <div className="st-cols">
              <div className="st-col">
                <h4>Compose the dark</h4>
                {(shared.enemies.length ? shared.enemies : ROSTER.map(r => ({ ...r, art: null }))).map((r) => (
                  <div key={r.name} className="st-roster-row">
                    <span>{r.label}</span>
                    <button className="mini-btn add" onClick={() => send({ type: "stAdd", kind: r.name })}>Hold +</button>
                  </div>
                ))}
                <div className="st-reserve">
                  {you.storytender.reserve.length === 0 && <span className="quiet small">Nothing held back. The party sees none of this — the Dark is sealed until you deal.</span>}
                  {you.storytender.reserve.map((k, i) => (
                    <button key={i} className="mini-btn" title="Release this piece" onClick={() => send({ type: "stRemove", index: i })}>
                      {(shared.enemies.find(e => e.name === k)?.label ?? k)} ✕
                    </button>
                  ))}
                </div>
                <p className="quiet small">Threat held ⚔{you.storytender.reserveThreat} · the party stands ⚔{you.storytender.partyPower} — a fairness gauge, advice, not a leash.</p>
                <div className="st-actions">
                  <button className="table-btn primary" disabled={!you.storytender.reserve.length || !!you.storytender.over} onClick={() => send({ type: "stDeal" })}>🌑 Deal the dark</button>
                  <button className="table-btn" disabled={!you.storytender.reserve.length} onClick={() => send({ type: "stClear" })}>Clear</button>
                </div>
              </div>
              <div className="st-col">
                <h4>The telling</h4>
                <form className="packing-form" onSubmit={(e) => { e.preventDefault(); if (stNarrate.trim()) { send({ type: "stNarrate", text: stNarrate.trim() }); setStNarrate(""); } }}>
                  <input value={stNarrate} onChange={(e) => setStNarrate(e.target.value)} maxLength={500} placeholder="Speak into the Tale…" aria-label="Narration for the Tale" />
                  <button className="mini-btn add" type="submit">Tell</button>
                </form>
                <h4>The scene</h4>
                <input className="door-input st-input" value={stSceneTitle} onChange={(e) => setStSceneTitle(e.target.value)} maxLength={80} placeholder="Scene title — the place, named" aria-label="Scene title" />
                <textarea className="st-textarea" value={stSceneText} onChange={(e) => setStSceneText(e.target.value)} maxLength={1000} rows={3} placeholder="What the party sees…" aria-label="Scene text" />
                <input className="door-input st-input" value={stSceneImg} onChange={(e) => setStSceneImg(e.target.value)} maxLength={600} placeholder="Image address (https://…) — optional" aria-label="Scene image address" />
                <div className="st-actions">
                  <button className="table-btn" onClick={() => send({ type: "stScene", title: stSceneTitle, text: stSceneText, imageUrl: stSceneImg })}>🖼️ Set the scene</button>
                </div>
                <h4>The sky</h4>
                <form className="packing-form" onSubmit={(e) => { e.preventDefault(); send({ type: "stSky", text: stSkyText.trim() }); }}>
                  <input value={stSkyText} onChange={(e) => setStSkyText(e.target.value)} maxLength={160} placeholder="Name the weather over this place…" aria-label="The sky over the scene" />
                  <button className="mini-btn add" type="submit">Turn</button>
                </form>
              </div>
              <div className="st-col">
                <h4>Mercy &amp; pacing</h4>
                <div className="st-actions">
                  <button className="table-btn" onClick={() => send({ type: "stRest" })}>🛌 Call a rest</button>
                  <button className="table-btn" onClick={() => send({ type: "stAdjourn" })}>🌙 Adjourn</button>
                </div>
                {shared.players.filter(p => p.fallen).map(p => (
                  <div key={p.key} className="st-roster-row">
                    <span>💀 {p.name} has fallen</span>
                    <button className="mini-btn add" onClick={() => send({ type: "stRevive", playerKey: p.key })}>Return at half</button>
                  </div>
                ))}
                {shared.dark.length > 0 && <p className="quiet small">Mercy on the dark: tap a standing foe's hex is the field's business — to lift one early, use its hex below.</p>}
                {shared.dark.map(e => (
                  <div key={e.hex} className="st-roster-row">
                    <span>{e.label} — ❤{e.hp}/{e.maxHp}</span>
                    <button className="mini-btn" onClick={() => send({ type: "stDissipate", hex: e.hex })}>Dissipate</button>
                  </div>
                ))}
                <div className="st-actions">
                  <button className="table-btn" disabled={!!you.storytender.over} onClick={() => send({ type: "stEnd" })}>🏠 End the campaign — divide the bank</button>
                </div>
                <p className="quiet small">Ending by choice divides what remains evenly. If the line falls, no hand can cast, and the bank bleeds dry — the Bastion falls, and the enemy ends it instead.</p>
              </div>
            </div>
          </div>
        ) : you ? (
          <>
            <button type="button" className="hand-grab" onClick={() => setHandUp(v => !v)} aria-expanded={handUp} aria-label={handUp ? "Lower your hand" : "Raise your hand"}>
              <span className="grab-line" aria-hidden="true" />
              {handUp ? "▾ your hand" : "▴ your hand"}
            </button>
            <div className="satchel-head">
              <div className="satchel-tabs" role="tablist" aria-label="Your satchel">
                {(["I", "II", "III", "IV"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                    {t}{t === "I" ? " · Awokin" : t === "II" ? " · Abilities" : t === "III" ? " · Spells" : " · Potions & Items"}
                  </button>
                ))}
              </div>
              <span className="my-energy" title="Your energy for this sitting — calculated from your whole roster by the game's law">⚡ {you.energy ?? 0}<span className="my-energy-max"> / {you.maxEnergy ?? 0}</span></span>
              <span className="my-band" title="Your travelling company — how many of your Awokin may stand on the field at once. Your level widens it (three at Lv 1, four at Lv 3, the true five at Lv 6), and the Muster roads widen it further: the Escort, the Pennant, the Retinue, the Whole Muster.">⚑ {you.band ?? 0}<span className="my-energy-max"> / {you.bandCap ?? 5}</span></span>
              <button className="dice-btn" onClick={() => setDiceOpen(true)} aria-label="Open your dice">🎲 Your dice</button>
            </div>
            {notice && <p className="notice-line">{notice}</p>}
            {tab === "I" && (
              <>
                <div className="hand-cards">
                  {you.hand.map((card) => {
                    const cost = castCostOf(card);
                    const afford = (you.energy ?? 0) >= cost;
                    const selected = selectedCardId === card.id;
                    return (
                      <div
                        key={card.id}
                        className={`tcard castable${selected ? " selected" : ""}${afford ? "" : " dim"}${bandFull && !selected ? " locked" : ""}`}
                        data-element={card.element}
                        role="button"
                        aria-pressed={selected}
                        title={bandFull && !selected ? `Your band stands full — ${you.bandCap ?? 5} strong.` : afford ? `Cast ${card.name} — ⚡${cost}. Tap, then tap a ring hex.` : `${card.name} costs ⚡${cost} — you hold ⚡${you.energy ?? 0}.`}
                        onClick={() => { if (!handUp) { setHandUp(true); return; } if (!selected && bandFull) { setNotice(`Your band stands full — ${you.bandCap ?? 5} strong. Recall a standing Awokin first, or widen the band: levels (Lv 3, Lv 6) and the Muster roads.`); return; } setSelectedCardId(selected ? null : card.id); }}
                      >
                        <div className="tcard-banner">
                          <span className="tcard-name">{card.name}</span>
                          <span className="tcard-mark">{card.level ? `Lv ${card.level}` : ""}</span>
                        </div>
                        {card.art ? (
                          <div className="tcard-art real"><img src={card.art} alt={`${card.name}, your Awokin`} /></div>
                        ) : (
                          <div className="tcard-art"><ElementGlyph element={card.element as GlyphElement} width={54} height={54} /></div>
                        )}
                        <div className="tcard-stats"><span>⚔ {card.power}</span><span>❤ {card.toughness}</span><span className="cost-chip">⚡{cost}</span></div>
                        {selected && cardBorder.imageUrl && <img className={`card-border-frame fit-${cardBorder.fit ?? "hug"}`} src={cardBorder.imageUrl} alt="" aria-hidden="true" />}
                      </div>
                    );
                  })}
                </div>
                {selectedCard ? (
                  <p className="cast-hint">Casting <strong>{selectedCard.name}</strong> — tap an open ring hex on the field to set it standing (⚡{castCostOf(selectedCard)}). Tap its hex again later to recall it; the energy spent is not returned.</p>
                ) : you.bound ? (
                  <p className="quiet small">Your roster — every Awokin of <strong>{you.bound}</strong> stands ready, sent to you alone. Tap one to cast it onto the field.</p>
                ) : (
                  <div className="bind-strip">
                    <p className="quiet small">Your roster — sent to you alone. These are stand-in cards: bind your Tender and your own Awokin take their places, true faces and all. Take a code in the game (the 🎲 The Table panel at the screen's right edge), then spend it here.</p>
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
                <PourRow hue={pourHue} setHue={(h) => { setPourHue(h); setPourPts(0); }} />
                {Object.values(defs).filter(d => d.kind === "ward").map(d => {
                  const formName = d.forms[pourHue] ?? d.root;
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "ward", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, choose the hex your Awokin holds, then its neighbour.`}>
                      {d.glyph ? <img src={d.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✦</span>}
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
                <PourRow hue={pourHue} setHue={(h) => { setPourHue(h); setPourPts(0); }} />
                <button className={`working-card${placing?.kind === "heal" ? " selected" : ""}`}
                  onClick={() => { setPlacing(placing?.kind === "heal" ? null : { kind: "heal", root: "heal" }); setWardAnchor(null); setBladePicks([]); }}
                  title={`Heal — restore ${you.healAmount ?? 5} HP to one of your standing Awokin · ⚡${healDef?.cost ?? 2}`}>
                  {healDef?.glyph ? <img src={healDef.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✚</span>}
                  <span className="working-text">
                    <strong>Heal · Tier {you.healTier ?? 1}</strong>
                    <em>The mending art · ⚡{healDef?.cost ?? 2} · yours from Tender Lv 1</em>
                    <span>Restore {you.healAmount ?? 5} HP to one of your standing Awokin. In our lore, the healers are the Binders.</span>
                  </span>
                </button>
                {Object.values(defs).filter(d => d.kind === "rune" || d.kind === "spell").map(d => {
                  const formName = d.forms[pourHue] ?? d.root;
                  const locked = !you.wardRuneUnlocked;
                  return (
                    <button key={d.key} className={`working-card${placing?.root === d.key ? " selected" : ""}`} disabled={locked}
                      onClick={() => { setPlacing(placing?.root === d.key ? null : { kind: "rune", root: d.key }); setWardAnchor(null); setBladePicks([]); }}
                      title={locked ? `Wakes at Tender Lv 3 — you stand at Lv ${you.tenderLevel ?? 1}` : `${formName} — ⚡${d.cost}. Tap, then write it on a hex's ground.`}>
                      {d.glyph ? <img src={d.glyph} alt="" style={{ filter: `${HUE_FILTERS[pourHue]} drop-shadow(0 0 6px ${HUE_GLOWS[pourHue]})` }} /> : <span className="heal-medal">✦</span>}
                      <span className="working-text">
                        <strong>{locked ? "🔒 " : ""}{formName}</strong>
                        <em>{d.root} · {d.kind === "spell" ? "Spell" : "Rune"} · ⚡{d.cost}</em>
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
                  <DieGlyph sides={d} /><span>d{d}</span>
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
