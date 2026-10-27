// THE STORYTELLER'S CONSOLE (Twelve #12, Build 2 — Nigel,
// ruled 2026-10-21; the approved proof is its form:
// ~/workspace/storyteller-proof). The console is the
// STORYTELLER'S ALONE (the visibility law, confirmed
// 2026-10-21 15:44): this component is mounted only for
// the seat that holds the storyteller's seat — and, for
// the laying tools, those she has opened the panel to.
// No tender ever renders it; tenders see the board, and
// the board alone, through their unchanged screens.
//
// Its furniture, per the spec: left, the storyteller's own
// pieces — the upload door for her own models and the
// game's real adversary roster, placed where she puts
// them through the Table's own enemy machinery; right,
// the building-pieces menu (his eleven tiles by their real
// names, his six building pieces under their true sheet
// names), the board's backdrop, the random fill, and —
// the seated Storytender's alone — the hand on the light;
// bottom, the party cards of the room's REAL seated
// tenders with their HP and AC as the Table knows them,
// each carrying its fade slider toward black; the dice
// box (d4–d100, how many, cast); and over the board, the
// glyph radial on right-click or long-press: TERRAIN /
// BUILDING / CURSE, and choosing places it.
import { useRef, useState } from "react";
import { TILE3D_POOL, BLD3D_PIECES, BOARD_BACKDROPS } from "./CampaignBoard3D";

export type StTool =
  | { kind: "terrain"; key: string }
  | { kind: "building"; key: string }
  | { kind: "foe"; key: string }
  | { kind: "prop"; key: string }
  | { kind: "propclear" }
  | { kind: "curse" }
  | null;

export interface StRadialState {
  hex: string;
  clientX: number;
  clientY: number;
}

interface ConsolePlayer {
  key: string; name: string; tenderHp: number; maxTenderHp: number;
  fallen: boolean; away?: boolean; storytender?: boolean;
  classKey?: string | null; ac?: number;
}
interface ConsoleShared {
  players: ConsolePlayer[];
  enemies: { name: string; label: string; note: string; art: string | null }[];
  campaign?: { storytellerKey?: string | null; panelAccess?: string[] } | null;
  lightOverrides?: [string, number][] | null;
  backdrop?: string | null;
  veils?: Record<string, number> | null;
  propsPool?: { key: string; name: string; objText: string }[] | null;
  props3d?: [string, string][] | null;
}
interface ConsoleYou {
  key: string;
  storytender?: { dice?: { sides: number; count: number; faces: number[]; total: number; at: number } | null } | null;
}

const CLASS_LABELS: Record<string, string> = {
  warden: "Warden", runewright: "Runewright", binder: "Binder", witch: "Witch", sage: "Sage",
};
const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];
const TEX_STEMS: Record<string, string> = Object.fromEntries(Object.entries(TILE3D_POOL).map(([k, v]) => [k, v.tex]));

function sectorPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}
const SECTORS = [
  { key: "terrain", label: "TERRAIN", glyph: "⛰", centre: -90 },
  { key: "building", label: "BUILDING", glyph: "🏛", centre: 150 },
  { key: "curse", label: "CURSE", glyph: "✦", centre: 30 },
] as const;

export default function StorytellerConsole(props: {
  shared: ConsoleShared;
  you: ConsoleYou;
  send: (msg: Record<string, unknown>) => void;
  isStoryteller: boolean;
  stTool: StTool;
  onArmTool: (t: StTool) => void;
  dmLight: null | 0 | 1 | 2 | "clear";
  onArmLight: (v: null | 0 | 1 | 2 | "clear") => void;
  radial: StRadialState | null;
  onCloseRadial: () => void;
}) {
  const { shared, you, send, isStoryteller, stTool, onArmTool, dmLight, onArmLight, radial, onCloseRadial } = props;
  const [sector, setSector] = useState<null | "terrain" | "building" | "curse">(null);
  const [diceSides, setDiceSides] = useState(20);
  const [diceCount, setDiceCount] = useState(1);
  const [status, setStatus] = useState("");
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dice = you.storytender?.dice ?? null;
  const overrides = shared.lightOverrides ?? [];
  const propsPool = shared.propsPool ?? [];
  const placedProps = shared.props3d ?? [];

  const arm = (t: StTool) => { onArmTool(t); onArmLight(null); };
  const toolIs = (kind: string, key?: string) => !!stTool && stTool.kind === kind && (key === undefined || ("key" in stTool && stTool.key === key));

  const onUpload = (slot: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/\.obj$/i.test(f.name)) { setStatus(`${f.name} is not an .obj file — the door takes single-file .obj models.`); return; }
    if (f.size > 1_500_000) { setStatus(`${f.name} is too large for the pool (the shelf holds models up to ~1.5 MB of text).`); return; }
    f.text().then((text) => {
      send({ type: "stPropUpload", name: f.name.replace(/\.obj$/i, ""), objText: text });
      setStatus(`${f.name} joins your pool — arm it below, then tap the hex it should stand on. A model that will not parse stands as a named marker, plainly.`);
    }).catch(() => setStatus(`Could not read ${f.name}.`));
    void slot;
  };

  const place = (msg: Record<string, unknown>) => {
    if (!radial) return;
    send({ type: "stTile", hex: radial.hex, ...msg });
    onCloseRadial();
    setSector(null);
  };

  return (
    <div className="st-console" data-testid="st-console">
      {/* ── LEFT: the storyteller's own pieces ── */}
      <aside className="st-rail st-rail-left">
        <h4>Your pieces</h4>
        <p className="st-note">Upload a model of your own (.obj) — it joins your pool and stands on the board where you put it, as Dougie stands.</p>
        {(["npc", "adversary", "prop"] as const).map((slot) => (
          <label key={slot} className="st-upload">
            <span>{slot === "npc" ? "NPC model" : slot === "adversary" ? "Adversary model" : "Prop · ruin"}</span>
            <input ref={(el) => { fileRefs.current[slot] = el; }} type="file" accept=".obj" onChange={onUpload(slot)} />
          </label>
        ))}
        <div className="st-pool">
          <button type="button" className={`st-chip${toolIs("prop", "dougie") ? " armed" : ""}`} onClick={() => arm(toolIs("prop", "dougie") ? null : { kind: "prop", key: "dougie" })}>
            🐉 Dougie — the multi-hex prop
          </button>
          {propsPool.map((e) => (
            <button key={e.key} type="button" className={`st-chip${toolIs("prop", e.key) ? " armed" : ""}`} onClick={() => arm(toolIs("prop", e.key) ? null : { kind: "prop", key: e.key })}>
              ◆ {e.name}
            </button>
          ))}
          {placedProps.length > 0 && (
            <button type="button" className={`st-chip${toolIs("propclear") ? " armed" : ""}`} onClick={() => arm(toolIs("propclear") ? null : { kind: "propclear" })}>
              ✕ Strike a prop — tap its hex
            </button>
          )}
        </div>
        <h4>Adversaries</h4>
        <p className="st-note">Arm one, tap a hex — it stands there and fights as the Table's dark fights. Commanding it — marching orders, waves — is the war hand's build, not this one.</p>
        <div className="st-roster">
          {shared.enemies.map((e) => (
            <button key={e.name} type="button" className={`st-foe${toolIs("foe", e.name) ? " armed" : ""}`} onClick={() => arm(toolIs("foe", e.name) ? null : { kind: "foe", key: e.name })}>
              {e.art ? <img src={e.art} alt="" /> : <span className="st-foe-mark">✦</span>}
              <span><strong>{e.label}</strong><small>{e.note}</small></span>
            </button>
          ))}
        </div>
        {isStoryteller && (
          <>
            <h4>The light</h4>
            <p className="st-note">Your hand on the light itself — arm a level, tap a hex. The land's own reckoning stands everywhere you have not spoken.</p>
            <div className="st-light-btns">
              <button type="button" className={dmLight === 2 ? "armed" : ""} onClick={() => { onArmLight(dmLight === 2 ? null : 2); onArmTool(null); }}>☀ Fighting</button>
              <button type="button" className={dmLight === 1 ? "armed" : ""} onClick={() => { onArmLight(dmLight === 1 ? null : 1); onArmTool(null); }}>🕯 Faint</button>
              <button type="button" className={dmLight === 0 ? "armed" : ""} onClick={() => { onArmLight(dmLight === 0 ? null : 0); onArmTool(null); }}>🌑 Dark</button>
              <button type="button" className={dmLight === "clear" ? "armed" : ""} onClick={() => { onArmLight(dmLight === "clear" ? null : "clear"); onArmTool(null); }}>↺ As the land gives</button>
            </div>
            <p className="st-note">{overrides.length} hex{overrides.length === 1 ? "" : "es"} held by your hand.</p>
          </>
        )}
        {status && <p className="st-status">{status}</p>}
      </aside>

      {/* ── RIGHT: the building pieces, the backdrop, the fill ── */}
      <aside className="st-rail st-rail-right">
        <h4>The tile pool</h4>
        <div className="st-tiles">
          {Object.entries(TILE3D_POOL).map(([key, def]) => (
            <button key={key} type="button" className={`st-tile${toolIs("terrain", key) ? " armed" : ""}`} onClick={() => arm(toolIs("terrain", key) ? null : { kind: "terrain", key })}>
              <img src={`/tiles3d/tex/${TEX_STEMS[key]}.png`} alt="" />
              <span>{def.name}</span>
            </button>
          ))}
          <button type="button" className={`st-tile curse-arm${toolIs("curse") ? " armed" : ""}`} onClick={() => arm(toolIs("curse") ? null : { kind: "curse" })}>
            <span className="st-curse-glass">✦</span><span>Give back to the curse</span>
          </button>
        </div>
        <h4>Building pieces</h4>
        <div className="st-tiles">
          {Object.entries(BLD3D_PIECES).map(([key, def]) => (
            <button key={key} type="button" className={`st-tile${toolIs("building", key) ? " armed" : ""}`} onClick={() => arm(toolIs("building", key) ? null : { kind: "building", key })}>
              <span className={`st-bld-swatch ${def.mat}`}>{["wall", "slantwall", "doorwall", "halfwall", "post"].includes(def.form) ? "▮" : ["hexcap", "sqcap"].includes(def.form) ? "▲" : "▬"}</span>
              <span>{def.name}</span>
            </button>
          ))}
        </div>
        <p className="st-note">The sheet's twelve forms stand in a dark neutral skin for now — their drawn faces skin them when the fuller sheet's intake lands. The square stands at each placement's own angle, its sides always showing.</p>
        <button type="button" className="st-fill" onClick={() => send({ type: "stFill" })}>🎲 Random fill — dress the whole map</button>
        <p className="st-note">The fill dresses only ground the curse still holds; the seed's hex and the party's arrival ground are held.</p>
        <h4>The backdrop</h4>
        <div className="st-backdrops">
          {Object.entries(BOARD_BACKDROPS).map(([key, def]) => (
            <button key={key} type="button" className={(shared.backdrop ?? "dusk") === key ? "armed" : ""} onClick={() => send({ type: "stBackdrop", key: key === "dusk" ? null : key })}>
              {def.name}
            </button>
          ))}
        </div>
        {stTool && <p className="st-status">Armed — tap a hex on the board to lay it. Tap the lit piece again to set the hand down.</p>}
      </aside>

      {/* ── BOTTOM: the party, and the dice ── */}
      <div className="st-bottom">
        <div className="st-party">
          {shared.players.map((p) => {
            const veil = shared.veils?.[p.key] ?? 0;
            return (
              <div key={p.key} className="st-pcard">
                <div className="st-pcard-head"><strong>{p.name}</strong><span>{p.storytender ? "Storyteller" : (CLASS_LABELS[p.classKey ?? ""] ?? "Tender")}</span></div>
                <div className="st-hp"><i style={{ width: `${Math.max(0, Math.min(100, (p.maxTenderHp > 0 ? (p.tenderHp / p.maxTenderHp) * 100 : 0)))}%` }} /></div>
                <div className="st-pcard-meta">❤ {Math.ceil(p.tenderHp)}/{p.maxTenderHp} · 🛡 AC {p.ac ?? "—"}{p.fallen ? " · 💀 fallen" : ""}{p.away ? " · away" : ""}</div>
                <label className="st-veil">
                  <span className="st-veil-swatch" style={{ opacity: 1 - veil }} />
                  <input type="range" min={0} max={100} value={Math.round(veil * 100)} aria-label={`Fade ${p.name}'s screen`}
                    onChange={(e) => send({ type: "stVeil", target: p.key, value: Number(e.target.value) / 100 })} />
                  <em>{veil <= 0 ? "CLEAR" : veil >= 1 ? "BLACKED OUT" : `FADED — ${Math.round(veil * 100)}%`}</em>
                </label>
              </div>
            );
          })}
        </div>
        {isStoryteller && (
          <div className="st-dice">
            <div className="st-dice-dice">
              {DICE_SIDES.map((d) => (
                <button key={d} type="button" className={diceSides === d ? "armed" : ""} onClick={() => setDiceSides(d)}>d{d}</button>
              ))}
            </div>
            <div className="st-dice-count">
              <button type="button" onClick={() => setDiceCount(Math.max(1, diceCount - 1))} aria-label="Fewer dice">−</button>
              <span>{diceCount}</span>
              <button type="button" onClick={() => setDiceCount(Math.min(12, diceCount + 1))} aria-label="More dice">+</button>
            </div>
            <button type="button" className="st-cast" onClick={() => send({ type: "stRoll", sides: diceSides, count: diceCount })}>CAST THE BONES</button>
            {dice && (
              <div className="st-dice-result">
                {dice.faces.map((f, i) => <span key={i} className="st-face">{f}</span>)}
                <strong>{dice.count}d{dice.sides} = {dice.total}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── THE RADIAL: right-click or long-press a hex ── */}
      {radial && (
        <div className="st-radial" style={{ left: radial.clientX, top: radial.clientY }}>
          <svg viewBox="0 0 264 264" className="st-radial-svg" role="menu" aria-label={`Lay hex ${radial.hex}`}>
            {SECTORS.map((sec) => {
              const a0 = ((sec.centre - 54) * Math.PI) / 180, a1 = ((sec.centre + 54) * Math.PI) / 180;
              const mid = (sec.centre * Math.PI) / 180;
              const lx = 132 + 89 * Math.cos(mid), ly = 132 + 89 * Math.sin(mid);
              return (
                <g key={sec.key} onClick={() => setSector(sec.key)} className={`st-sector${sector === sec.key ? " on" : ""}`}>
                  <path d={sectorPath(132, 132, 52, 126, a0, a1)} />
                  <text x={lx} y={ly - 4} className="st-sector-glyph">{sec.glyph}</text>
                  <text x={lx} y={ly + 16} className="st-sector-label">{sec.label}</text>
                </g>
              );
            })}
            <circle cx={132} cy={132} r={50} className="st-hub" onClick={() => { onCloseRadial(); setSector(null); }} />
            <text x={132} y={126} className="st-hub-hex">HEX</text>
            <text x={132} y={146} className="st-hub-hex big">{radial.hex}</text>
          </svg>
          {sector === "terrain" && (
            <div className="st-radial-list">
              {Object.entries(TILE3D_POOL).map(([key, def]) => (
                <button key={key} type="button" onClick={() => place({ ground: key })}>{def.name}</button>
              ))}
              <button type="button" onClick={() => place({ ground: "curse" })}>Give back to the curse</button>
            </div>
          )}
          {sector === "building" && (
            <div className="st-radial-list">
              {Object.entries(BLD3D_PIECES).map(([key, def]) => (
                <button key={key} type="button" onClick={() => place({ building: key })}>{def.name}</button>
              ))}
              <button type="button" onClick={() => place({ building: null })}>No building — clear</button>
            </div>
          )}
          {sector === "curse" && (
            <div className="st-radial-list">
              <button type="button" onClick={() => place({ ground: "curse" })}>Cursed Glass — the default tile</button>
              {isStoryteller && (<>
                <button type="button" onClick={() => { send({ type: "stLight", hex: radial.hex, level: 2 }); onCloseRadial(); setSector(null); }}>☀ Set its light fighting</button>
                <button type="button" onClick={() => { send({ type: "stLight", hex: radial.hex, level: 1 }); onCloseRadial(); setSector(null); }}>🕯 Set its light faint</button>
                <button type="button" onClick={() => { send({ type: "stLight", hex: radial.hex, level: 0 }); onCloseRadial(); setSector(null); }}>🌑 Set its light dark</button>
                <button type="button" onClick={() => { send({ type: "stLight", hex: radial.hex, level: null }); onCloseRadial(); setSector(null); }}>↺ Light as the land gives</button>
              </>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
