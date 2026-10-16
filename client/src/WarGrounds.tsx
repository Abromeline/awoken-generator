import { useEffect, useState } from "react";
import { api } from "./api";
import type { TerritoryTile } from "./api";
import { buildingImage } from "./BuildingMenu";

/**
 * THE WAR-GROUNDS — the fine-edit panel for ONE hex (War-Ground's
 * charter: the moving and marching of Awoken and the buildings, and
 * the war effect of the ground they stand on; Nigel, 2026-10-15).
 *
 * The map's walls are placed by tapping a 24px invisible hit-strip
 * along a painted edge — honest, but fine work at map distance. This
 * panel is the same law at arm's length: ONE hex, enlarged, its six
 * edges fat enough for any thumb, the walls it already carries drawn
 * raised with their HP, the building seat in the middle, and the
 * tile's readings written plainly. Every action here rides an
 * existing server action (placeWall, placeBuilding via the builder
 * flow, demolishBuilding, claimSpark) — the panel invents nothing.
 */

// ── Geometry — mirrors Territory's hexCellVertices exactly (the
// Selection Grid law: one geometry, everywhere it is drawn). Dirs
// follow the FACE_HEX corner order: 0 = top edge, then clockwise,
// and a wall's canonical home is the lexicographically smaller of
// its two tiles, exactly as the server keeps it (placeWall).
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

export interface WgWall { edgeKey: string; q: number; r: number; dir: number; hp: number; maxHp: number }
interface BuildingDef { type: string; name: string; cost: number; buildMinutes: number; desc: string; icon: string }
interface StandingAwoken { id: number; name: string; power: number; stance: string }

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
  walls: WgWall[];
  standing: StandingAwoken[];
  tileBuildings: any[];
  energy: number;
  onClose: () => void;
  onPlaceWall: (dir: number) => Promise<void>;
  onChooseBuilding: (def: BuildingDef) => void;
  onDemolish: (buildingId: number) => Promise<void>;
  onClaimSpark?: () => void;
}

export default function WarGrounds({ tile, walls, standing, tileBuildings, energy, onClose, onPlaceWall, onChooseBuilding, onDemolish, onClaimSpark }: Props) {
  const [defs, setDefs] = useState<BuildingDef[]>([]);
  const [busyDir, setBusyDir] = useState<number | null>(null);

  useEffect(() => {
    api.getBuildingDefs().then(r => setDefs(r.defs as BuildingDef[])).catch(() => {});
  }, []);
  // A wall placement resolves into a refreshed walls prop — clear the
  // busy guard whenever the server's answer lands.
  useEffect(() => { setBusyDir(null); }, [walls]);

  const el = ELEMENT_STYLE[tile.element] ?? ELEMENT_STYLE.neutral;
  const cursed = !!tile.cursed;
  const canWall = !cursed && standing.length > 0;

  // Walls touching this tile, keyed by dir IN THIS TILE'S FRAME (a
  // wall stored under its canonical neighbor shows on the opposite
  // dir from here).
  const wallByDir = new Map<number, WgWall>();
  for (const w of walls) {
    if (w.q === tile.q && w.r === tile.r) wallByDir.set(w.dir, w);
    else if (w.q + WALL_DIR_DELTAS[w.dir][0] === tile.q && w.r + WALL_DIR_DELTAS[w.dir][1] === tile.r) {
      wallByDir.set(WALL_OPPOSITE[w.dir], w);
    }
  }

  const CX = 130, CY = 118, SIZE = 92;
  const verts = hexVerts(CX, CY, SIZE);
  const facePoints = verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const defName = (type: string) => defs.find(d => d.type === type);

  return (
    <div className="admin-popup" onClick={onClose}>
      <div className="admin-popup-inner wg-panel" onClick={e => e.stopPropagation()}>
        <button className="admin-popup-close" onClick={onClose} aria-label="Close">✕</button>
        <h3>⚔️ War-Grounds</h3>
        <p className="quiet wg-sub">
          {el.emoji} {tile.element} hex · ({tile.q}, {tile.r})
          {cursed ? " · 💀 cursed ground" : " · held ground"}
          {(tile.height ?? 1) > 1 ? ` · ${tile.height} trays` : ""}
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
              const wall = wallByDir.get(d);
              if (wall) {
                const frac = wall.maxHp > 0 ? wall.hp / wall.maxHp : 0;
                const ox = nx * SIZE * 0.07, oy = ny * SIZE * 0.07;
                return (
                  <g key={d}>
                    <line x1={v[0] + ox} y1={v[1] + oy} x2={n[0] + ox} y2={n[1] + oy} stroke="#4a3826" strokeWidth={SIZE * 0.11} strokeLinecap="round" />
                    <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={frac > 0.5 ? "#d9c68f" : frac > 0.25 ? "#b39b5e" : "#7d5f30"} strokeWidth={SIZE * 0.075} strokeLinecap="round" />
                    <text x={mx + nx * 22} y={my + ny * 22 + 4} textAnchor="middle" fontSize={12} fill="#e8d9a8" pointerEvents="none">
                      🧱 {wall.hp}/{wall.maxHp}
                    </text>
                  </g>
                );
              }
              return (
                <g key={d}>
                  <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke={canWall ? "rgba(255,215,0,0.6)" : "rgba(140,140,140,0.3)"} strokeWidth={3} strokeDasharray="6 4" pointerEvents="none" />
                  {canWall && (
                    <>
                      <text x={mx + nx * 20} y={my + ny * 20 + 5} textAnchor="middle" fontSize={16} fill="#ffd700" pointerEvents="none">＋</text>
                      <line x1={v[0]} y1={v[1]} x2={n[0]} y2={n[1]} stroke="rgba(255,215,0,0.02)" strokeWidth={40} strokeLinecap="round"
                        style={{ cursor: busyDir !== null ? "wait" : "pointer" }}
                        onClick={() => { if (busyDir === null) { setBusyDir(d); void onPlaceWall(d); } }} />
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
            ? "Cursed ground raises no walls and holds no buildings. Purify it first."
            : standing.length === 0
              ? "Walls are raised by an Awoken standing on the hex — station one here first."
              : wallByDir.size >= 6
                ? "Every edge is walled. This hex is a fist."
                : "Tap a gold edge to raise a wall there (2⚡, HP 10). A border shared with the next hex is one wall, never two."}
        </p>

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
            <span key={a.id} className="wg-reading wg-standing-chip">✦ {a.name} · ⚔{a.power} · {a.stance}</span>
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
