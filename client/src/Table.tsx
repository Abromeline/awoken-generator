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
import { ElementGlyph, type GlyphElement } from "./glyphs";
import { BUNDLED_ENEMIES } from "./enemyArt";
import battlegroundBg from "./assets/battleground-bg.jpg";

interface TableCard {
  id: string;
  name: string;
  power: number;
  toughness: number;
  element: string;
}

interface SharedState {
  room: string;
  sky: { mood: string; description: string; endsAt: string | null };
  round: number;
  threat: number;
  players: { key: string; name: string; handCount: number }[];
  watcherCount: number;
  tale: { at: number; text: string }[];
}

interface YouState {
  key: string;
  name: string;
  hand: TableCard[];
  notes: string;
  inventory: string[];
}

type Phase = "boot" | "door" | "connecting" | "seated" | "lost" | "error";

const DICE = [4, 6, 8, 10, 12, 20, 100];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const ROSTER = [
  { name: "fray", label: "Fray", note: "Small ink splatters. Weak alone, dangerous in groups." },
  { name: "unraveler", label: "Unraveler", note: "Looming ink mass. Hunts the strongest standing." },
  { name: "hollow", label: "Hollow", note: "Pure void. Drains energy instead of blood." },
  { name: "tangle", label: "Tangle", note: "Knotted thorns. Pins one Awoken where it stands." },
] as const;

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
  const [diceOpen, setDiceOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [packDraft, setPackDraft] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const heardRef = useRef<string[]>([]);
  const lastJoinRef = useRef<Record<string, unknown> | null>(null);
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
      try {
        const cfg = await (await fetch("/api/table/config")).json();
        if (!cfg.discordClientId) {
          setError("Discord is not configured on the server yet, so the Table cannot check your name. The Ancient One holds the keys that finish this door.");
          setPhase("error");
          return;
        }
        const sdk = new DiscordSDK(cfg.discordClientId);
        setBootStep("Knocking on Discord's door…");
        await sdk.ready();
        setBootStep("Asking Discord your name…");
        const { code } = await sdk.commands.authorize({
          client_id: cfg.discordClientId,
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
        </div>
      </div>
    );
  }

  const sky = shared.sky;
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
              <span className="party-meta">🂠 {p.handCount} in hand</span>
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
            <svg className="field-hexes" viewBox="0 0 300 260" role="img" aria-label="The instance field: the star-seed at the center hex, ringed by six empty hexes">
              {[
                { x: 150, y: 130, center: true },
                { x: 150, y: 52 }, { x: 218, y: 91 }, { x: 218, y: 169 },
                { x: 150, y: 208 }, { x: 82, y: 169 }, { x: 82, y: 91 },
              ].map((h, i) => (
                <g key={i} transform={`translate(${h.x},${h.y})`}>
                  <polygon
                    className={h.center ? "hex center" : "hex"}
                    points="0,-34 30,-17 30,17 0,34 -30,17 -30,-17"
                  />
                  {h.center && (
                    <>
                      <circle className="seed-ground" r="17" />
                      <circle className="seed-bulb" r="8" />
                    </>
                  )}
                </g>
              ))}
            </svg>
            <div className="field-caption">
              <strong>The star-seed</strong> — fallen light, rooted in cracked ground.
              The Bastion is what the party will build around it. In this first
              room the field is at rest: the dealing begins with P1.
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
            {ROSTER.map((r) => (
              <div key={r.name} className="roster-row">
                <img src={BUNDLED_ENEMIES[r.name]} alt={r.label} />
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
              <button className="dice-btn" onClick={() => setDiceOpen(true)} aria-label="Open your dice">🎲 Your dice</button>
            </div>
            {notice && <p className="notice-line">{notice}</p>}
            {tab === "I" && (
              <>
                <div className="hand-cards">
                  {you.hand.map((card, i) => (
                    <div key={card.id} className="tcard">
                      <div className="tcard-banner">
                        <span className="tcard-name">{card.name}</span>
                        <span className="tcard-mark">{ROMAN[i] ?? ""}</span>
                      </div>
                      <div className="tcard-art"><ElementGlyph element={card.element as GlyphElement} width={54} height={54} /></div>
                      <div className="tcard-stats"><span>⚔ {card.power}</span><span>❤ {card.toughness}</span></div>
                    </div>
                  ))}
                </div>
                <p className="quiet small">Your hand — sent to you alone; no other seat at this Table has seen it. Test hand: your real deck is dealt once your Discord name is bound to your Tender (P1).</p>
              </>
            )}
            {tab === "II" && (
              <div className="arts-list">
                <div className="art-row"><strong>Ward · Lvl 1</strong><span>Your own warding hand — every Tender holds the first rung from the start.</span></div>
                <div className="art-row"><strong>Rune · Lvl 1</strong><span>Your own runing hand — upgrades are earned by levels, never granted early.</span></div>
                <p className="quiet small">Wards and runes are cast when the standing begins (P1). Awoken-borne wards and runes will ride here too, labeled by whose power casts them.</p>
              </div>
            )}
            {tab === "III" && (
              <div className="arts-list">
                <div className="art-row"><strong>Heal</strong><span>Restore 5 HP to an Awoken or a Tender · ⚡2 · from level 1. In our lore, the healers are the Binders.</span></div>
                <p className="quiet small">The mending is cast when the standing begins (P1).</p>
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
