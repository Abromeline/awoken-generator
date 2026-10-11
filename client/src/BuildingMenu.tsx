import { useState, useEffect } from "react";
import { api } from "./api";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import elementalShrineImg from "./assets/buildings/elemental-shrine.png";
import attunementShrineImg from "./assets/buildings/attunement-shrine.png";
import awakeningWellImg from "./assets/buildings/awakening-well.png";
import wheatPlantedImg from "./assets/buildings/wheat-planted.png";
import wheatHalfImg from "./assets/buildings/wheat-half.png";
import wheatFullImg from "./assets/buildings/wheat-full.png";
import wheatHarvestImg from "./assets/buildings/wheat-harvest.png";
// Wheat stage overrides from UI workspace uploads (set at runtime)
const wheatStageOverrides: Record<string, string> = {};
export function setWheatStageOverride(stage: string, url: string) {
  wheatStageOverrides[stage] = url;
}

// Enemy sprite overrides from UI workspace uploads (set at runtime)
const enemyOverrides: Record<string, string> = {};
export function setEnemyOverride(type: string, url: string) {
  enemyOverrides[type] = url;
}
export function enemyImage(type: string): string {
  return enemyOverrides[type] || "";
}
import treeImg from "./assets/buildings/tree.png";
import thornWallImg from "./assets/buildings/thorn-wall.png";
import bindingCircleImg from "./assets/buildings/binding-circle.png";

const BUILDING_IMGS: Record<string, string> = {
  "watchtower": watchtowerImg,
  "dream-wheat": dreamWheatImg,
  "elemental-shrine": elementalShrineImg,
  "awakening-well": awakeningWellImg,
  "tree": treeImg,
  "thorn-wall": thornWallImg,
  "binding-circle": bindingCircleImg,
  "attunement-shrine": attunementShrineImg,
};

export function buildingImage(type: string): string {
  return BUILDING_IMGS[type] || "";
}

// Wheat growth stages: 0=planted, 1=half, 2=full, 3=harvest-ready
export function wheatStageImage(building: any): string {
  if (building.buildingType !== "dream-wheat") {
    return buildingImage(building.buildingType);
  }
  if (building.status === "building") {
    return wheatStageOverrides["wheat-planted"] || wheatPlantedImg; // still constructing
  }
  // Calculate growth progress from readyAt (when construction finished)
  // Wheat regrows every 4h after harvest
  const readyAt = building.readyAt ? new Date(building.readyAt).getTime() : Date.now();
  const now = Date.now();
  const growMs = 4 * 60 * 60 * 1000; // 4 hours
  const lastHarvest = building.lastHarvestAt ? new Date(building.lastHarvestAt).getTime() : readyAt;
  const elapsed = now - lastHarvest;
  const progress = Math.min(1, elapsed / growMs);
  if (progress >= 1) return wheatStageOverrides["wheat-harvest"] || wheatHarvestImg;
  if (progress >= 0.66) return wheatStageOverrides["wheat-full"] || wheatFullImg;
  if (progress >= 0.33) return wheatStageOverrides["wheat-half"] || wheatHalfImg;
  return wheatStageOverrides["wheat-planted"] || wheatPlantedImg;
}

interface BuildingDef {
  type: string;
  name: string;
  cost: number;
  buildMinutes: number;
  desc: string;
  icon: string;
}

interface Props {
  onSelect: (def: BuildingDef | null) => void;
  selected: BuildingDef | null;
  energy: number;
  alwaysOpen?: boolean;
}

export default function BuildingMenu({ onSelect, selected, energy, alwaysOpen = false }: Props) {
  const [defs, setDefs] = useState<BuildingDef[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!defs.length) {
      const r = await api.getBuildingDefs();
      setDefs(r.defs);
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (alwaysOpen && defs.length === 0) load();
  }, []);

  const showPicker = alwaysOpen || open;
  return <div className="building-menu">
    {alwaysOpen && <h2>🏰 Buildings</h2>}
    {!alwaysOpen && (
      <button className="abtn" onClick={load}>
        🏗️ {open ? "Close" : "Build"}
      </button>
    )}
    {showPicker && <div className="building-picker">
      {defs.map(d => <button
        key={d.type}
        className={`building-option ${selected?.type === d.type ? "selected" : ""} ${energy < d.cost ? "cant-afford" : ""}`}
        onClick={() => onSelect(selected?.type === d.type ? null : d)}
        disabled={energy < d.cost}
      >
        <img src={buildingImage(d.type)} alt={d.name} className="building-thumb" />
        <div className="building-info">
          <strong>{d.icon} {d.name}</strong>
          <small>{d.desc}</small>
          <span className="building-cost">⚡{d.cost} · ⏱{d.buildMinutes >= 60 ? `${d.buildMinutes/60}h` : `${d.buildMinutes}m`}</span>
        </div>
      </button>)}
      {selected && <p className="building-hint">Tap a purified tile to place {selected.name}. Tap again to cancel.</p>}
    </div>}
  </div>;
}
