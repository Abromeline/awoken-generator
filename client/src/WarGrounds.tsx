import { useEffect, useState } from "react";
import { api } from "./api";
import type { TerritoryTile, EdgeWork } from "./api";
import { buildingImage } from "./BuildingMenu";

/**
 * THE WAR-GROUNDS — the fine-edit panel for ONE hex (War-Ground's
 * charter: the moving and marching of Awoken and the buildings, and
 * the war effect of the ground they stand on; Nigel, 2026-10-15).
 *
 * The map's walls are placed by tapping a 24px invisible hit-strip
 * along a painted edge — honest, but fine work at map distance. This
 * panel is the same law at arm's length: ONE hex, enlarged, its six
 * edges fat enough for any thumb. Each edge carries ONE work of the
 * four (Nigel, 2026-10-15): a WALL (blocks passage, no damage), THORNS
 * (passage, but slowed), a WARD (a wall of the other kind — blocks or
 * traps every reach, fliers included; Warding hands only), or a RUNE
 * (a trap, not a barrier; Runeing hands only; snare / harm / meld
 * chosen at the casting). Walls, wards and runes can be strengthened
 * at exponential energy cost; thorns are growth and cannot. Every
 * action rides the server's law (placeEdgeWork, strengthenEdgeWork,
 * removeEdgeWork, teachSkill, the builder flow, demolishBuilding,
 * claimSpark) — the panel invents nothing.
 */

// ── Geometry — mirrors Territory's hexCellVertices exactly (the
// Selection Grid law: one geometry, everywhere it is drawn). Dirs
// follow the FACE_HEX corner order: 0 = top edge, then clockwise,
// and a work's canonical home is the lexicographically smaller of
// its two tiles, exactly as the server keeps it (placeEdgeWork).
const FACE_HEX: [number, number][] = [
  [-406, -468], [415, -468], [861, -6],
  [431, 476], [-431, 472], [-870, -6],
];
const ISO_DEN = 796;
function hexVerts(cx: number, cy: number, size: number): [number, number][] {
  const k = size / ISO_DEN;
  return FACE_HEX.map(([x, y]): [number, number] => [cx + x * k, cy + y * k]);
}
const WALL_DIR_DELTAS: [number, number][] = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
const WALL_OPPOSITE = [3, 4, 5, 0, 1, 2];
const DIR_NAMES = ["top", "upper-right", "lower-right", "bottom", "lower-left", "upper-left"];

export type WgWork = EdgeWork;
interface BuildingDef { type: string; name: string; cost: number; buildMinutes: number; desc: string; icon: string }
interface StandingAwoken { id: number; name: string; power: number; stance: string; level?: number; skills: string[] }

type WorkKind = "wall" | "thorns" | "ward" | "rune";
type RuneKind = "snare" | "harm" | "meld";
// Client mirrors of the server's stems — display only; the server
// is the law and its refusals speak.
const WORK_DEFS: Record<WorkKind, { icon: string; name: string; cost: number; blurb: string }> = {
  wall: { icon: "🧱", name: "Wall", cost: 2, blurb: "Blocks passage. No damage. Any Awoken standing here may raise it. HP 10." },
  thorns: { icon: "🌵", name: "Thorns", cost: 1, blurb: "Passage allowed — but slowed: crossing or fighting through them costs an enemy its next strike." },
  ward: { icon: "🔷", name: "Ward", cost: 3, blurb: "A wall of the other kind — blocks or traps every reach, fliers included. Needs the Warding skill. HP 15." },
  rune: { icon: "🔶", name: "Rune", cost: 3, blurb: "A trap, not a barrier — springs once on the first enemy who crosses, then is spent. Needs the Runeing skill." },
};
const RUNE_DEFS: Record<RuneKind, { name: string; blurb: string }> = {
  snare: { name: "Snare", blurb: "Stops the crossing whole — held fast, no damage." },
  harm: { name: "Harm", blurb: "Heavy damage, no stop — 6 wounds, doubling with each strengthening." },
  meld: { name: "Meld", blurb: "Some of both — 3 wounds and the strike never comes." },
};
const TEACH_COST = 5;
const TEACH_MIN_LEVEL = 5;
const strengthenCostOf = (kind: WorkKind, level: number) => WORK_DEFS[kind].cost * Math.pow(2, level);

const ELEMENT_STYLE: Record<string, { emoji: string; face: string; stroke: string }> = {
  tide: { emoji: "🌊", face: "rgba(38,84,124,0.55)", stroke: "#4da3ff" },
  sky: { emoji: "🌪️", face: "rgba(88,70,140,0.50)", stroke: "#b18cff" },
  stone: { emoji: "🪨", face: "rgba(110,88,54,0.50)", stroke: "#c9a86a" },
  root: { emoji: "🌱", face: "rgba(58,102,52,0.50)", stroke: "#7fc46a" },
  fire: { emoji: "🔥", face: "rgba(130,54,32,0.55)", stroke: "#ff7a4d" },
  neutral: { emoji: "◇", face: "rgba(70,70,80,0.50)", stroke: "#9a9aa5" },
};

interface Props {
  tile: TerritoryTile;
  walls: WgWork[];
  standing: StandingAwoken[];
  tileBuildings: any[];
  energy: number;
  onClose: () => void;
  onPlaceWork: (dir: number, kind: WorkKind, runeKind?: RuneKind) => Promise<void>;
  onStrengthenWork: (dir: number) => Promise<void>;
  onRemoveWork: (dir: number) => Promise<void>;
  onTeachSkill: (awakenedId: number, skill: "warding" | "runeing") => Promise<void>;
  onChooseBuilding: (def: BuildingDef) => void;
  onDemolish: (buildingId: number) => Promise<void>;
  onClaimSpark?: () => void;
}

export default function WarGrounds({ tile, walls, standing, tileBuildings, energy, onClose, onPlaceWork, onStrengthenWork, onRemoveWork, onTeachSkill, onChooseBuilding, onDemolish, onClaimSpark }: Props) {
  const [defs, setDefs] = useState<BuildingDef[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickDir, setPickDir] = useState<number | null>(null);
  const [selDir, setSelDir] = useState<number | null>(null);
  const [runePick, setRunePick] = useState(false);

  useEffect(() => {
    api.getBuildingDefs().then(r => setDefs(r.defs as BuildingDef[])).catch(() => {});
  }, []);
  // A work action resolves into a refreshed walls prop — clear the
  // busy guard and the open chooser whenever the server's answer lands.
  useEffect(() => { setBusyKey(null); setPickDir(null); setRunePick(false); }, [walls]);
  useEffect(() => { setBusyKey(null); }, [standing]);

  const el = ELEMENT_STYLE[tile.element] ?? ELEMENT_STYLE.neutral;
  const cursed = !!tile.cursed;
  const canWork = !cursed && standing.length > 0;
  const wardingHere = standing.some(a => a.skills.includes("warding"));
  const runeingHere = standing.some(a => a.skills.includes("runeing"));

  // Works touching this tile, keyed by dir IN THIS TILE'S FRAME (a
  // work stored under its canonical neighbor shows on the opposite
  // dir from here).
  const workByDir = new Map<number, WgWork>();
  for (const w of walls) {
    if (w.q === tile.q && w.r === tile.r) workByDir.set(w.dir, w);
    else if (w.q + WALL_DIR_DELTAS[w.dir][0] === tile.q && w.r + WALL_DIR_DELTAS[w.dir][1] === tile.r) {
      workByDir.set(WALL_OPPOSITE[w.dir], w);
    }
  }

  const CX = 130, CY = 118, SIZE = 92;
  const verts = hexVerts(CX, CY, SIZE);
  const facePoints = verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const defName = (type: string) => defs.find(d => d.type === type);
  const busy = (key: string) => busyKey === key;
  const act = (key: string, fn: () => Promise<void>) => { if (busyKey === null) { setBusyKey(key); void fn(); } };

  const selWork = selDir !== null ? workByDir.get(selDir) : undefined;
  const pickWork = pickDir !== null ? workByDir.get(pickDir) : undefined;

  const teachRow = (skill: "warding" | "runeing") => {
    const label = skill === "warding" ? "Warding" : "Runeing";
    const icon = skill === "warding" ? "🔷" : "🔶";
    const candidates = standing.filter(a => !a.skills.includes(skill) && (a.level ?? 0) >= TEACH_MIN_LEVEL);
    if (candidates.length === 0) {
      return <p className="quiet wg-teach-note">{icon} {label} is a milestone teaching — an Awoken of level {TEACH_MIN_LEVEL}+ standing here could learn it for {TEACH_COST}⚡. None standing can yet.</p>;
    }
    return (
      <div className="wg-teach-row">
        {candidates.map(a => (
          <button key={a.id} className="abtn small" disabled={energy < TEACH_COST || busyKey !== null}
            onClick={() => act(`teach-${a.id}-${skill}`, () => onTeachSkill(a.id, skill))}
            title={`Teach ${a.name} the ${label} skill (${TEACH_COST}⚡)`}>
            {icon} Teach {label} — {a.name} (Lv {a.level}) · {TEACH_COST}⚡
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="wg-dock">
      <div className="wg-panel">
        <button className="admin-popup-close" onClick={onClose} aria-label="Close">✕</button>
        <h3>⚔️ War-Grounds</h3>
        <p className="quiet wg-sub">
          {el.emoji} {tile.element} hex · ({tile.q}, {tile.r})
          {cursed ? " · 💀 cursed ground" : " · held ground"}
          {(tile.height ?? 1) > 1 ? ` · ${tile.height} trays` : ""}
          {` · ⚡ ${energy}`}
        </p>

        {/* ── The hex, enlarged: edges are the controls ─────────── */}
        <div className="wg-hex-wrap">
          <svg viewBox="0 0 260 236" width="260" height="236" role="img" aria-label="Hex editor">
            <polygon points={facePoints} fill={el.face} stroke={el.stroke} strokeWidth={2} />
            {verts.map((v, d) => {
              const n = verts[(d + 1) % 6];
              const mx = (v[0] + n[0]) / 2, my = (v[1] + n[1]) / 2;
              let nx = mx - CX, ny = my - CY;
              const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
              const lx = mx + nx * 24, ly = my + ny * 24 + 4;
              const work = workByDir.get(d);
              const selected = selDir === d || pickDir === d;
              const hitStrip = canWork ? (
                <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(255,215,0,0.02)" strokeWidth={40} strokeLinecap="round"
                  style={{ cursor: busyKey !== null ? "wait" : "pointer" }}
                  onClick={() => {
                    if (busyKey !== null) return;
                    if (work) { setSelDir(d); setPickDir(null); }
                    else { setPickDir(d); setSelDir(null); setRunePick(false); }
                  }} />
              ) : null;
              if (work?.kind === "wall" || work?.kind === "ward") {
                const frac = work.maxHp > 0 ? work.hp / work.maxHp : 0;
                const ox = nx * SIZE * 0.07, oy = ny * SIZE * 0.07;
                const isWard = work.kind === "ward";
                const top = isWard
                  ? (frac > 0.5 ? "#b7a6ff" : frac > 0.25 ? "#8d7bd8" : "#5d4d99")
                  : (frac > 0.5 ? "#d9c68f" : frac > 0.25 ? "#b39b5e" : "#7d5f30");
                return (
                  <g key={d}>
                    {isWard
                      ? <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(150,130,255,0.35)" strokeWidth={SIZE * 0.13} strokeLinecap="round" />
                      : <line x1={v[0] + ox} y1={v[1] + oy} x2={n[0] + ox} y2={n[1] + oy} stroke="#4a3826" strokeWidth={SIZE * 0.11} strokeLinecap="round" />}
                    <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={selected ? "#ffd700" : top} strokeWidth={isWard ? SIZE * 0.045 : SIZE * 0.075} strokeLinecap="round" />
                    <text x={lx} y={ly} textAnchor="middle" fontSize={12} fill={isWard ? "#cfc2ff" : "#e8d9a8"} pointerEvents="none">
                      {isWard ? "🔷" : "🧱"} {work.hp}/{work.maxHp}{work.level > 1 ? ` · Lv${work.level}` : ""}
                    </text>
                    {hitStrip}
                  </g>
                );
              }
              if (work?.kind === "thorns") {
                const seg = 7; const pts: string[] = [];
                for (let i = 0; i <= seg; i++) {
                  const t = i / seg;
                  const bx = v[0] + (n[0] - v[0]) * t, by = v[1] + (n[1] - v[1]) * t;
                  const off = i % 2 === 0 ? 0 : SIZE * 0.055;
                  pts.push(`${(bx + nx * off).toFixed(1)},${(by + ny * off).toFixed(1)}`);
                }
                return (
                  <g key={d}>
                    <polyline points={pts.join(" ")} fill="none" stroke={selected ? "#ffd700" : "#69a84f"} strokeWidth={SIZE * 0.05} strokeLinejoin="round" />
                    <text x={lx} y={ly} textAnchor="middle" fontSize={12} fill="#a5d68f" pointerEvents="none">🌵 slows</text>
                    {hitStrip}
                  </g>
                );
              }
              if (work?.kind === "rune") {
                const dd = 5;
                return (
                  <g key={d}>
                    <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={selected ? "#ffd700" : "#e8a13c"} strokeWidth={3.5} strokeDasharray="2 7" strokeLinecap="round" />
                    <polygon points={`${mx},${my - dd} ${mx + dd},${my} ${mx},${my + dd} ${mx - dd},${my}`} fill="#e8a13c" pointerEvents="none" />
                    <text x={lx} y={ly} textAnchor="middle" fontSize={12} fill="#f2c063" pointerEvents="none">
                      🔶 {work.runeKind ?? "rune"}{work.level > 1 ? ` · Lv${work.level}` : ""}
                    </text>
                    {hitStrip}
                  </g>
                );
              }
              return (
                <g key={d}>
                  <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={canWork ? (selected ? "#ffd700" : "rgba(255,215,0,0.6)") : "rgba(140,140,140,0.3)"} strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
                  {canWork && (
                    <>
                      <text x={mx + nx * 20} y={my + ny * 20 + 5} textAnchor="middle" fontSize={16} fill="#ffd700" pointerEvents="none">＋</text>
                      {hitStrip}
                    </>
                  )}
                </g>
              );
            })}
            {/* The building seat, in the hex's heart */}
            {tileBuildings.slice(0, 2).map((b, i) => {
              const bx = tileBuildings.length === 1 ? CX : CX + (i === 0 ? -30 : 30);
              return <image key={b.id} href={buildingImage(b.buildingType)} x={bx - 24} y={CY - 24} width={48} height={48} opacity={b.status === "building" ? 0.6 : 1} />;
            })}
            {tileBuildings.length === 0 && (
              <text x={CX} y={CY + 5} textAnchor="middle" fontSize={13} fill="rgba(230,220,190,0.55)" pointerEvents="none">— empty seat —</text>
            )}
          </svg>
        </div>
        <p className="quiet wg-note">
          {cursed
            ? "Cursed ground raises no works and holds no buildings. Purify it first."
            : standing.length === 0
              ? "Edge works are laid by an Awoken standing on the hex — station one here first."
              : pickDir !== null
                ? `The ${DIR_NAMES[pickDir]} edge is bare. Choose its work below — one work per edge.`
                : selWork
                  ? `The ${DIR_NAMES[selDir!]} edge carries a ${WORK_DEFS[selWork.kind].name}. Its law is below.`
                  : workByDir.size >= 6
                    ? "Every edge carries a work. This hex is a fist."
                    : "Tap a gold edge to lay a work there; tap a standing work to strengthen or take it down. A border shared with the next hex is one work, never two."}
        </p>

        {/* ── The chooser: lay one work on the picked edge ─────── */}
        {pickDir !== null && !pickWork && canWork && (
          <div className="wg-chooser">
            <h4>The {DIR_NAMES[pickDir]} edge — lay one work</h4>
            {!runePick ? (
              <div className="wg-works">
                {(Object.keys(WORK_DEFS) as WorkKind[]).map(kind => {
                  const def = WORK_DEFS[kind];
                  const needsSkill = kind === "ward" ? !wardingHere : kind === "rune" ? !runeingHere : false;
                  return (
                    <button key={kind} className="wg-work-btn" disabled={energy < def.cost || busyKey !== null}
                      onClick={() => {
                        if (kind === "rune") { if (!needsSkill) setRunePick(true); return; }
                        if (needsSkill) return;
                        act(`place-${pickDir}-${kind}`, () => onPlaceWork(pickDir, kind));
                      }}
                      title={def.blurb}>
                      <strong>{def.icon} {def.name} <span className="wg-cost">· {def.cost}⚡</span></strong>
                      <small>{needsSkill ? (kind === "ward" ? "Needs the Warding skill — no hand standing here holds it. Teach it below." : "Needs the Runeing skill — no hand standing here holds it. Teach it below.") : def.blurb}</small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="wg-works">
                {(Object.keys(RUNE_DEFS) as RuneKind[]).map(rk => (
                  <button key={rk} className="wg-work-btn" disabled={energy < WORK_DEFS.rune.cost || busyKey !== null}
                    onClick={() => act(`place-${pickDir}-rune-${rk}`, () => onPlaceWork(pickDir, "rune", rk))}
                    title={RUNE_DEFS[rk].blurb}>
                    <strong>🔶 {RUNE_DEFS[rk].name} rune <span className="wg-cost">· {WORK_DEFS.rune.cost}⚡</span></strong>
                    <small>{RUNE_DEFS[rk].blurb}</small>
                  </button>
                ))}
                <button className="wg-work-btn" onClick={() => setRunePick(false)}>
                  <strong>← Other works</strong>
                  <small>Back to wall, thorns and ward.</small>
                </button>
              </div>
            )}
            {!wardingHere && teachRow("warding")}
            {!runeingHere && teachRow("runeing")}
          </div>
        )}

        {/* ── A standing work: strengthen or take down ─────────── */}
        {selWork && selDir !== null && (
          <div className="wg-chooser">
            <h4>{WORK_DEFS[selWork.kind].icon} {WORK_DEFS[selWork.kind].name}{selWork.runeKind ? ` — ${RUNE_DEFS[selWork.runeKind as RuneKind]?.name ?? selWork.runeKind}` : ""} · level {selWork.level}
              {selWork.maxHp > 0 ? ` · HP ${selWork.hp}/${selWork.maxHp}` : ""}</h4>
            <p className="quiet wg-sel-blurb">
              {selWork.kind === "wall" && "Blocks passage, does no damage. Strengthening doubles its HP."}
              {selWork.kind === "ward" && "A wall of the other kind — blocks or traps every reach, fliers included. Strengthening doubles its HP."}
              {selWork.kind === "thorns" && "Passage allowed, but slowed — crossing or fighting through them costs an enemy its next strike. Thorns are growth, not craft: they cannot be strengthened."}
              {selWork.kind === "rune" && `${RUNE_DEFS[selWork.runeKind as RuneKind]?.blurb ?? "A trap."} One-shot: once sprung, it is spent. Strengthening doubles its bite.`}
            </p>
            <div className="wg-sel-actions">
              {selWork.kind !== "thorns" && (() => {
                const cost = strengthenCostOf(selWork.kind, selWork.level);
                const skillMissing = selWork.kind === "ward" ? !wardingHere : selWork.kind === "rune" ? !runeingHere : false;
                return (
                  <button className="abtn small" disabled={energy < cost || busyKey !== null || skillMissing}
                    onClick={() => act(`str-${selDir}`, () => onStrengthenWork(selDir))}
                    title={skillMissing ? "Cast work — the skilled hand must stand on the hex." : `Strengthen to level ${selWork.level + 1}`}>
                    ⬆ Strengthen — {cost}⚡{skillMissing ? " (skilled hand required)" : ""}
                  </button>
                );
              })()}
              <button className="abtn small" disabled={busyKey !== null}
                onClick={() => { if (confirm(`Take down this ${WORK_DEFS[selWork.kind].name}? The edge opens again.`)) act(`rm-${selDir}`, () => onRemoveWork(selDir)); }}>
                🔨 Take down
              </button>
              <button className="abtn small" onClick={() => setSelDir(null)}>Done</button>
            </div>
            {selWork.kind === "ward" && !wardingHere && teachRow("warding")}
            {selWork.kind === "rune" && !runeingHere && teachRow("runeing")}
          </div>
        )}

        {/* ── The tile's readings, written plainly ─────────────── */}
        <div className="wg-readings">
          {cursed && tile.curseHp != null && (
            <span className="wg-reading">💀 Curse {tile.curseHp}/{tile.curseMaxHp ?? tile.curseHp}</span>
          )}
          {!!tile.traysSealed && <span className="wg-reading">▦ {tile.traysSealed} tray{tile.traysSealed === 1 ? "" : "s"} sealed</span>}
          {!!tile.stackPower && <span className="wg-reading">⚔ Stack power {tile.stackPower}</span>}
          {tile.attuneElement && (
            <span className="wg-reading">{(ELEMENT_STYLE[tile.attuneElement] ?? ELEMENT_STYLE.neutral).emoji} Attunement {tile.attuneElement} {tile.attunePoints ?? 0}/10</span>
          )}
          {standing.map(a => (
            <span key={a.id} className="wg-reading wg-standing-chip">
              ✦ {a.name} · ⚔{a.power} · {a.stance}
              {a.skills.includes("warding") ? " · 🔷 Warding" : ""}
              {a.skills.includes("runeing") ? " · 🔶 Runeing" : ""}
            </span>
          ))}
          {standing.length === 0 && <span className="wg-reading">No Awoken stationed</span>}
        </div>

        {!!tile.spark && onClaimSpark && (
          <button className="abtn small wg-spark" onClick={onClaimSpark}>✦ A spark glimmers on this hex — claim it</button>
        )}

        {/* ── The building seat ────────────────────────────────── */}
        <div className="wg-buildings">
          <h4>🏰 Building seat {tileBuildings.length > 0 ? `(${tileBuildings.length}/2)` : ""}</h4>
          {tileBuildings.map(b => {
            const def = defName(b.buildingType);
            const readyMin = b.readyAt ? Math.max(0, Math.ceil((new Date(b.readyAt).getTime() - Date.now()) / 60000)) : 0;
            return (
              <div key={b.id} className="wg-building-row">
                <img src={buildingImage(b.buildingType)} alt={def?.name ?? b.buildingType} className="building-thumb" />
                <div className="wg-building-info">
                  <strong>{def?.icon ?? "🏠"} {def?.name ?? b.buildingType}</strong>
                  <small>{b.status === "building" ? `⏳ Building — ready in ${readyMin >= 60 ? `${(readyMin / 60).toFixed(1)}h` : `${readyMin}m`}` : b.status === "dormant" ? "💤 Dormant" : "Standing"}</small>
                </div>
                <button className="abtn small" title={`Demolish this ${def?.name ?? b.buildingType}`}
                  onClick={() => { if (confirm(`Demolish this ${def?.name ?? b.buildingType}?`)) void onDemolish(b.id); }}>
                  🔨
                </button>
              </div>
            );
          })}
          {!cursed && tileBuildings.length < 2 && (
            <div className="building-picker wg-picker">
              {defs.map(d => (
                <button key={d.type} className="building-option" disabled={energy < d.cost}
                  onClick={() => onChooseBuilding(d)}
                  title={energy < d.cost ? `Needs ${d.cost}⚡` : `Build ${d.name} on this hex`}>
                  <img src={buildingImage(d.type)} alt={d.name} className="building-thumb" />
                  <div className="building-info">
                    <strong>{d.icon} {d.name}</strong>
                    <small>{d.desc}</small>
                    <span className="building-cost">⚡{d.cost} · ⏱{d.buildMinutes >= 60 ? `${d.buildMinutes / 60}h` : `${d.buildMinutes}m`}</span>
                  </div>
                </button>
              ))}
              {defs.length > 0 && <p className="building-hint">Choose a building — you will assign its builders next, as always.</p>}
            </div>
          )}
          {!cursed && tileBuildings.length >= 2 && <p className="quiet">Two buildings stand — this hex is full.</p>}
        </div>

        <div className="wave-edit-actions">
          <button className="abtn small" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
