import { useState, useEffect } from "react";
import { api } from "./api";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import attunementShrineImg from "./assets/buildings/attunement-shrine.png";
import dreamWeedImg from "./assets/buildings/dream-weed.png";
import dreamWeedHalfImg from "./assets/buildings/dream-weed-half.png";
import dreamWeedPlantedImg from "./assets/buildings/dream-weed-planted.png";
import skyBloomImg from "./assets/buildings/sky-bloom.png";
import awakeningWellImg from "./assets/buildings/awakening-well.png";
import wheatPlantedImg from "./assets/buildings/wheat-planted.png";
import wheatHalfImg from "./assets/buildings/wheat-half.png";
import wheatHarvestImg from "./assets/buildings/wheat-harvest.png";
// Wheat stage overrides from UI workspace uploads (set at runtime)
const dreamWeedStageOverrides: Record<string, string> = {};
export function setDreamWeedStageOverride(stage: string, url: string) {
  dreamWeedStageOverrides[stage] = url;
}
const wheatStageOverrides: Record<string, string> = {};
export function setWheatStageOverride(stage: string, url: string) {
  wheatStageOverrides[stage] = url;
}

// Enemy art resolves through ./enemyArt (server-resolved UI Workspace
// uploads/selection) — there is no per-session override registry anymore.
import treeImg from "./assets/buildings/tree.png";
import thornWallImg from "./assets/buildings/thorn-wall.png";
import bindingCircleImg from "./assets/buildings/binding-circle.png";
import hallOfChampionsImg from "./assets/buildings/hall-of-champions.png";

const BUILDING_IMGS: Record<string, string> = {
  "watchtower": watchtowerImg,
  "dream-wheat": dreamWheatImg,
  "awakening-well": awakeningWellImg,
  "tree": treeImg,
  "thorn-wall": thornWallImg,
  "binding-circle": bindingCircleImg,
  "attunement-shrine": attunementShrineImg,
  "dream-weed": dreamWeedImg,
  "sky-bloom": skyBloomImg,
  "hall-of-champions": hallOfChampionsImg,
};

export function buildingImage(type: string): string {
  return BUILDING_IMGS[type] || "";
}

// The build menu's face for the Dream Shroom (Nigel, 2026-10-18):
// the menu wears the FULL-GROWN stage — the harvest-ready sprite,
// the ripest face of the growth cycle (wheat-harvest.png, or the UI
// Workspace's uploaded override for that stage). Standing shrooms on
// the map and in the panel keep their true stage art; only the
// menu's promise is full-grown.
export function buildingMenuImage(type: string): string {
  if (type === "dream-wheat") {
    return wheatStageOverrides["wheat-harvest"] || wheatHarvestImg;
  }
  return buildingImage(type);
}

// Wheat growth stages: 0=planted, 1=half, 2=full, 3=harvest-ready
export function dreamWeedStageImage(building: any): string {
  if (building.status === "building") {
    return dreamWeedStageOverrides["dream-weed-planted"] || dreamWeedPlantedImg;
  }
  const readyAt = building.readyAt ? new Date(building.readyAt).getTime() : Date.now();
  const now = Date.now();
  const growMs = (building.growHours ?? 1) * 60 * 60 * 1000;
  const lastHarvest = building.lastHarvestAt ? new Date(building.lastHarvestAt).getTime() : readyAt;
  const elapsed = now - lastHarvest;
  const progress = Math.min(1, elapsed / growMs);
  if (progress >= 1) return dreamWeedStageOverrides["dream-weed"] || dreamWeedImg;
  if (progress >= 0.5) return dreamWeedStageOverrides["dream-weed-half"] || dreamWeedHalfImg;
  return dreamWeedStageOverrides["dream-weed-planted"] || dreamWeedPlantedImg;
}

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
  // THREE stages only — planted, half grown, harvest ready (Nigel,
  // 2026-10-16, with the Glow Wheat art): the old fourth "full-grown"
  // bucket is retired, its slot and bundled art removed; the cycle
  // divides in thirds and the fruiting art is the harvest-ready stage.
  if (progress >= 2 / 3) return wheatStageOverrides["wheat-harvest"] || wheatHarvestImg;
  if (progress >= 1 / 3) return wheatStageOverrides["wheat-half"] || wheatHalfImg;
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
        <img src={buildingMenuImage(d.type)} alt={d.name} className="building-thumb" />
        <div className="building-info">
          <strong>{d.icon} {d.name}</strong>
          <small>{d.desc}</small>
          <span className="building-cost"><span className="spark-glow">✦</span>{d.cost} · ⏱{d.buildMinutes >= 60 ? `${d.buildMinutes/60}h` : `${d.buildMinutes}m`}</span>
        </div>
      </button>)}
      {selected && <p className="building-hint">Tap a purified tile to place {selected.name}. Tap again to cancel.</p>}
    </div>}
  </div>;
}
