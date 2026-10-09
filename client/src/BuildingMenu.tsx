import { useState } from "react";
import { api } from "./api";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import elementalShrineImg from "./assets/buildings/elemental-shrine.png";
import awakeningWellImg from "./assets/buildings/awakening-well.png";
import thornWallImg from "./assets/buildings/thorn-wall.png";
import bindingCircleImg from "./assets/buildings/binding-circle.png";

const BUILDING_IMGS: Record<string, string> = {
  "watchtower": watchtowerImg,
  "dream-wheat": dreamWheatImg,
  "elemental-shrine": elementalShrineImg,
  "awakening-well": awakeningWellImg,
  "thorn-wall": thornWallImg,
  "binding-circle": bindingCircleImg,
};

export function buildingImage(type: string): string {
  return BUILDING_IMGS[type] || "";
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
}

export default function BuildingMenu({ onSelect, selected, energy }: Props) {
  const [defs, setDefs] = useState<BuildingDef[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!defs.length) {
      const r = await api.getBuildingDefs();
      setDefs(r.defs);
    }
    setOpen(!open);
  };

  return <div className="building-menu">
    <button className="abtn" onClick={load}>
      🏗️ {open ? "Close" : "Build"}
    </button>
    {open && <div className="building-picker">
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
