import { useEffect, useState } from "react";
import { api } from "./api";
import type { TerritoryTile } from "./api";
import { buildingImage, buildingMenuImage, wheatStageImage } from "./BuildingMenu";

/**
 * THE WAR-GROUNDS — the fine-edit panel for ONE hex (War-Ground's
 * charter: the moving and marching of Awoken and the buildings, and
 * the war effect of the ground they stand on; Nigel, 2026-10-15).
 *
 * One hex, enlarged: its building seat and Dream Shroom wedges, its
 * seed missions, and its plain readings — the tile's curse, trays,
 * stack power and attunement, and who stands on it. Every action
 * rides the server's law (the builder flow, demolishBuilding,
 * claimSpark, the seed missions) — the panel invents nothing.
 *
 * (The panel once also laid the Edge Works — a wall, thorns, ward
 * or rune on the hex's edges, taught through the skills ledger.
 * That system is removed whole, Nigel 2026-10-27: "runes and
 * wards are no longer locked to hexs there is no reason for the
 * edgeworks system". The book's own runes and wards are cast from
 * the Grimoire, as they always were, and are untouched.)
 */

// ── Geometry — mirrors Territory's hexCellVertices exactly (the
// Selection Grid law: one geometry, everywhere it is drawn).
const FACE_HEX: [number, number][] = [
  [-406, -468], [415, -468], [861, -6],
  [431, 476], [-431, 472], [-870, -6],
];
const ISO_DEN = 796;
function hexVerts(cx: number, cy: number, size: number): [number, number][] {
  const k = size / ISO_DEN;
  return FACE_HEX.map(([x, y]): [number, number] => [cx + x * k, cy + y * k]);
}

interface BuildingDef { type: string; name: string; cost: number; buildMinutes: number; desc: string; icon: string }
interface StandingAwoken { id: number; name: string; power: number; stance: string; level?: number }

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
  standing: StandingAwoken[];
  tileBuildings: any[];
  energy: number;
  onClose: () => void;
  onChooseBuilding: (def: BuildingDef) => void;
  onDemolish: (buildingId: number) => Promise<void>;
  onClaimSpark?: () => void;
  // THE SEEDS (the Columns, 2026-10-17): this tile's star seed,
  // the field party for a fetch, and the mission calls.
  seed?: { id: number; state: string; level: number; defenses: number; tileCursed: boolean } | null;
  fieldParty?: { awakenedId: number; name: string; marching: boolean }[];
  onFetchSeed?: (seedId: number, awakenedIds: number[]) => Promise<void>;
  onHoldSeed?: (seedId: number) => Promise<void>;
}

/** The seed's choices (the Columns, 2026-10-17): FETCH it with
    a riding party, or HOLD it with a bastion — the War-Grounds
    face of the seed missions. */
function SeedMissions({ tile, seed, fieldParty, onFetchSeed, onHoldSeed }: {
  tile: TerritoryTile;
  seed: { id: number; state: string; level: number; defenses: number; tileCursed: boolean };
  fieldParty: { awakenedId: number; name: string; marching: boolean }[];
  onFetchSeed?: (seedId: number, awakenedIds: number[]) => Promise<void>;
  onHoldSeed?: (seedId: number) => Promise<void>;
}) {
  const [party, setParty] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: number) =>
    setParty(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= 4 ? p : [...p, id]);
  return (
    <div className="wg-seed">
      <h4>⭐ A star seed lies here — Lv {seed.level}</h4>
      <p>{seed.tileCursed
        ? "It fell in cursed ground. No bastion can rise here — but a party may ride THROUGH the curse to fetch it, if they can survive there and back."
        : "Its hex is purified: fetch its energy home, or raise a bastion and HOLD it — a held seed can grow into the heart of a new city."}</p>
      {!seed.tileCursed && onHoldSeed && (
        <button className="abtn" disabled={busy} onClick={async () => { setBusy(true); try { await onHoldSeed(seed.id); } finally { setBusy(false); } }}>
          🏯 HOLD — raise a bastion (6<span className="spark-glow">✦</span>)
        </button>
      )}
      {onFetchSeed && (
        <div className="wg-fetch">
          <p className="wg-fetch-label">🧺 The fetch party (rides from the home bastion; pick up to 4):</p>
          {fieldParty.length === 0 && <p className="quiet">No Awokin stand in your field.</p>}
          {fieldParty.map(m => (
            <label key={m.awakenedId} className="wg-fetch-row">
              <input type="checkbox" disabled={m.marching || busy} checked={party.includes(m.awakenedId)} onChange={() => toggle(m.awakenedId)} />
              {m.name}{m.marching ? " — on the march" : ""}
            </label>
          ))}
          <button className="abtn" disabled={busy || party.length === 0} onClick={async () => { setBusy(true); try { await onFetchSeed(seed.id, party); } finally { setBusy(false); } }}>
            🧺 FETCH — ride for the seed
          </button>
        </div>
      )}
    </div>
  );
}

export default function WarGrounds({ tile, standing, tileBuildings, energy, onClose, onChooseBuilding, onDemolish, onClaimSpark, seed, fieldParty, onFetchSeed, onHoldSeed }: Props) {
  const [defs, setDefs] = useState<BuildingDef[]>([]);

  useEffect(() => {
    api.getBuildingDefs().then(r => setDefs(r.defs as BuildingDef[])).catch(() => {});
  }, []);

  const el = ELEMENT_STYLE[tile.element] ?? ELEMENT_STYLE.neutral;
  const cursed = !!tile.cursed;

  const CX = 130, CY = 118, SIZE = 92;
  const verts = hexVerts(CX, CY, SIZE);
  const facePoints = verts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  // The hex's two populations (Nigel, 2026-10-18): the building seat
  // (max two) and the Dream Shroom wedges (max six) beside it — the
  // crop's own layer, seated at the six flat-edged wedge centroids.
  const seatBuildings = tileBuildings.filter(b => b.buildingType !== "dream-wheat");
  const shroomsByAge = tileBuildings.filter(b => b.buildingType === "dream-wheat").sort((a, b) => a.id - b.id);
  const wedgeOf = (b: any): number => typeof b.wedge === "number" ? b.wedge : Math.max(0, shroomsByAge.findIndex(s => s.id === b.id));
  const wedgeCentroid = (w: number) => {
    const a = verts[w], b = verts[(w + 1) % 6];
    return { x: (CX + a[0] + b[0]) / 3, y: (CY + a[1] + b[1]) / 3 };
  };

  const defName = (type: string) => defs.find(d => d.type === type);

  return (
    <div className="wg-dock">
      <div className="wg-panel">
        <button className="admin-popup-close" onClick={onClose} aria-label="Close">✕</button>
        <h3>⚔️ War-Grounds</h3>
        {seed && seed.state === "fallen" && (
          <SeedMissions tile={tile} seed={seed} fieldParty={fieldParty ?? []} onFetchSeed={onFetchSeed} onHoldSeed={onHoldSeed} />
        )}
        {seed && seed.state === "held" && (
          <div className="wg-seed held">
            <h4>⭐🏯 A held seed — Lv {seed.level}</h4>
            <p>The bastion stands and the seed grows in its keeping. Defenses held: {seed.defenses}. The seed grows by feeding alone — stands held never raise it.</p>
          </div>
        )}
        {seed && seed.state === "corrupted" && (
          <div className="wg-seed corrupted">
            <h4>💀 A cursed bastion</h4>
            <p>The seed is theirs now — a fortress of the dark on your land. One day, with friends at your side, you may besiege it. The invitations ride with the Table.</p>
          </div>
        )}
        <p className="quiet wg-sub">
          {el.emoji} {tile.element} hex · ({tile.q}, {tile.r})
          {cursed ? " · 💀 cursed ground" : " · held ground"}
          {(tile.height ?? 1) > 1 ? ` · ${tile.height} trays` : ""}
          {` · ✦ ${energy}`}
        </p>

        {/* ── The hex, enlarged: its seat and wedges ──────────── */}
        <div className="wg-hex-wrap">
          <svg viewBox="0 0 260 236" width="260" height="236" role="img" aria-label="Hex editor">
            <polygon points={facePoints} fill={el.face} stroke={el.stroke} strokeWidth={2} />
            {/* The building seat, in the hex's heart */}
            {seatBuildings.slice(0, 2).map((b, i) => {
              const bx = seatBuildings.length === 1 ? CX : CX + (i === 0 ? -30 : 30);
              return <image key={b.id} href={buildingImage(b.buildingType)} x={bx - 24} y={CY - 24} width={48} height={48} opacity={b.status === "building" ? 0.6 : 1} />;
            })}
            {/* The Dream Shrooms, seated at their wedge points */}
            {shroomsByAge.map(b => {
              const c = wedgeCentroid(wedgeOf(b));
              return <image key={b.id} href={wheatStageImage(b)} x={c.x - 15} y={c.y - 15} width={30} height={30} preserveAspectRatio="xMidYMid meet" opacity={b.status === "building" ? 0.6 : 1} pointerEvents="none" />;
            })}
            {seatBuildings.length === 0 && shroomsByAge.length === 0 && (
              <text x={CX} y={CY + 5} textAnchor="middle" fontSize={13} fill="rgba(230,220,190,0.55)" pointerEvents="none">— empty seat —</text>
            )}
          </svg>
        </div>
        <p className="quiet wg-note">
          {cursed
            ? "Cursed ground holds no buildings. Purify it first."
            : "This hex at arm's length: its building seat and Dream Shroom wedges above, its readings below. Choose a building in the seat to raise one here."}
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
            <span key={a.id} className="wg-reading wg-standing-chip">
              ✦ {a.name} · ⚔{a.power} · {a.stance}
            </span>
          ))}
          {standing.length === 0 && <span className="wg-reading">No Awokin stationed</span>}
        </div>

        {!!tile.spark && onClaimSpark && (
          <button className="abtn small wg-spark" onClick={onClaimSpark}>✦ A spark glimmers on this hex — claim it</button>
        )}

        {/* ── The building seat ────────────────────────────────── */}
        <div className="wg-buildings">
          <h4>🏰 Building seat {seatBuildings.length > 0 ? `(${seatBuildings.length}/2)` : ""}</h4>
          {seatBuildings.map(b => {
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
          {shroomsByAge.length > 0 && (
            <>
              <h4>🍄 Dream Shroom wedges ({shroomsByAge.length}/6)</h4>
              {shroomsByAge.map(b => {
                const readyMin = b.readyAt ? Math.max(0, Math.ceil((new Date(b.readyAt).getTime() - Date.now()) / 60000)) : 0;
                return (
                  <div key={b.id} className="wg-building-row">
                    <img src={wheatStageImage(b)} alt="Dream Shroom" className="building-thumb" />
                    <div className="wg-building-info">
                      <strong>🍄 Dream Shroom — wedge {wedgeOf(b) + 1}</strong>
                      <small>{b.status === "building" ? `⏳ Planting — ready in ${readyMin >= 60 ? `${(readyMin / 60).toFixed(1)}h` : `${readyMin}m`}` : "Growing on its own clock — tap it on the map when ripe to harvest"}</small>
                    </div>
                    <button className="abtn small" title="Demolish this Dream Shroom"
                      onClick={() => { if (confirm(`Demolish this Dream Shroom?`)) void onDemolish(b.id); }}>
                      🔨
                    </button>
                  </div>
                );
              })}
            </>
          )}
          {!cursed && (seatBuildings.length < 2 || shroomsByAge.length < 6) && (
            <div className="building-picker wg-picker">
              {defs.map(d => {
                const seatFull = d.type !== "dream-wheat" && seatBuildings.length >= 2;
                const wedgesFull = d.type === "dream-wheat" && shroomsByAge.length >= 6;
                return (
                <button key={d.type} className="building-option" disabled={energy < d.cost || seatFull || wedgesFull}
                  onClick={() => onChooseBuilding(d)}
                  title={wedgesFull ? "Every wedge of this hex is planted" : seatFull ? "The building seat is full — the shroom wedges beside it remain" : energy < d.cost ? `Needs ${d.cost}✦` : `Build ${d.name} on this hex`}>
                  <img src={buildingMenuImage(d.type)} alt={d.name} className="building-thumb" />
                  <div className="building-info">
                    <strong>{d.icon} {d.name}</strong>
                    <small>{d.desc}</small>
                    <span className="building-cost"><span className="spark-glow">✦</span>{d.cost} · ⏱{d.buildMinutes >= 60 ? `${d.buildMinutes / 60}h` : `${d.buildMinutes}m`}</span>
                  </div>
                </button>
                );
              })}
              {defs.length > 0 && <p className="building-hint">Choose a building — you will assign its builders next, as always.{seatBuildings.length >= 2 ? " The seat is full; the Dream Shroom wedges beside it remain." : ""}</p>}
            </div>
          )}
          {!cursed && seatBuildings.length >= 2 && shroomsByAge.length >= 6 && <p className="quiet">Two buildings stand and every wedge is planted — this hex is full.</p>}
        </div>

        <div className="wave-edit-actions">
          <button className="abtn small" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
