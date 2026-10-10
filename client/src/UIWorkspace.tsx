import { useState, useEffect, useRef } from "react";
import { api } from "./api";
// Current default sprites (bundled with the app)
import frayImg from "./assets/enemies/fray.png";
import unravelerImg from "./assets/enemies/unraveler.png";
import hollowImg from "./assets/enemies/hollow.png";
import tangleImg from "./assets/enemies/tangle.png";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import elementalShrineImg from "./assets/buildings/elemental-shrine.png";
import awakeningWellImg from "./assets/buildings/awakening-well.png";
import thornWallImg from "./assets/buildings/thorn-wall.png";
import bindingCircleImg from "./assets/buildings/binding-circle.png";
import treeImg from "./assets/buildings/tree.png";
import tideTileImg from "./assets/terrain-iso/tide-v2.png";
import skyTileImg from "./assets/terrain-iso/sky-v2.png";
import stoneTileImg from "./assets/terrain-iso/stone-v2.png";
import rootTileImg from "./assets/terrain-iso/root-v2.png";
import neutralTileImg from "./assets/terrain-iso/neutral-v2.png";
import cursedTileImg from "./assets/terrain-iso/cursed-v2.png";

const CURRENT_SPRITES: Record<string, Record<string, string>> = {
  enemy: { fray: frayImg, unraveler: unravelerImg, hollow: hollowImg, tangle: tangleImg },
  building: {
    watchtower: watchtowerImg, "dream-wheat": dreamWheatImg,
    "elemental-shrine": elementalShrineImg, "awakening-well": awakeningWellImg,
    "thorn-wall": thornWallImg, "binding-circle": bindingCircleImg, tree: treeImg,
  },
  terrain: {
    tide: tideTileImg, sky: skyTileImg, stone: stoneTileImg,
    root: rootTileImg, neutral: neutralTileImg, cursed: cursedTileImg,
  },
};

type Section = "enemies" | "buildings" | "terrain" | "timers";

interface UiSprite {
  id: number;
  category: string;
  name: string;
  url: string;
}

// Default config values
const DEFAULTS: Record<string, any> = {
  // Enemies
  "enemy.fray.power": 2, "enemy.fray.hp": 3,
  "enemy.unraveler.power": 4, "enemy.unraveler.hp": 6,
  "enemy.hollow.power": 0, "enemy.hollow.hp": 5,
  "enemy.tangle.power": 3, "enemy.tangle.hp": 8,
  // Buildings
  "building.watchtower.cost": 5, "building.watchtower.buildMinutes": 15,
  "building.watchtower.damage": 3, "building.watchtower.powerBonus": 2, "building.watchtower.upkeepPerHour": 3,
  "building.watchtower.enabled": true,
  "building.dream-wheat.cost": 2, "building.dream-wheat.buildMinutes": 10,
  "building.dream-wheat.harvestEnergy": 4, "building.dream-wheat.enabled": true,
  "building.elemental-shrine.cost": 8, "building.elemental-shrine.buildMinutes": 15,
  "building.elemental-shrine.enabled": true,
  "building.awakening-well.cost": 10, "building.awakening-well.buildMinutes": 20,
  "building.awakening-well.energyBonus": 3, "building.awakening-well.enabled": true,
  "building.thorn-wall.cost": 3, "building.thorn-wall.buildMinutes": 5,
  "building.thorn-wall.damage": 1, "building.thorn-wall.enabled": true,
  "building.binding-circle.cost": 6, "building.binding-circle.buildMinutes": 10,
  "building.binding-circle.enabled": true,
  "building.tree.cost": 4, "building.tree.buildMinutes": 15,
  "building.tree.energyBonus": 1, "building.tree.enabled": true,
  // Timers
  "timer.energyRegenMinutes": 4,
  "timer.buildHelperDivisor": 2,
  "timer.wheatWellSynergy": 0.75,
};

const ENEMIES = ["fray", "unraveler", "hollow", "tangle"];
const BUILDINGS = ["watchtower", "dream-wheat", "elemental-shrine", "awakening-well", "thorn-wall", "binding-circle", "tree"];
const TERRAINS = ["tide", "sky", "stone", "root", "neutral", "cursed"];

export default function UIWorkspace() {
  const [section, setSection] = useState<Section>("enemies");
  const [sprites, setSprites] = useState<UiSprite[]>([]);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ category: string; name: string } | null>(null);

  useEffect(() => {
    api.call("listUiSprites", {}).then((r: any) => setSprites(r.sprites)).catch(() => {});
    api.call("getUiConfig", {}).then((r: any) => setConfig({ ...DEFAULTS, ...r.config })).catch(() => setConfig(DEFAULTS));
  }, []);

  const getVal = (key: string) => config[key] ?? DEFAULTS[key];

  const setVal = async (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    try {
      await api.call("setUiConfig", { key, value });
    } catch (e) {
      console.error("Config save failed", e);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(uploadTarget.name);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      await api.call("uploadUiSprite", {
        category: uploadTarget.category,
        name: uploadTarget.name,
        imageBase64: base64,
      });
      const r: any = await api.call("listUiSprites", {});
      setSprites(r.sprites);
    } catch (err) {
      console.error("Upload failed", err);
    }
    setUploading(null);
    setUploadTarget(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const spritesFor = (category: string, name: string) =>
    sprites.filter(s => s.category === category && s.name === name);

  return (
    <div className="ui-workspace">
      <h2>🎨 UI Workspace</h2>
      <p className="quiet">Tweak sprites, stats, and timers. Changes apply immediately.</p>

      <div className="workspace-tabs">
        {(["enemies", "buildings", "terrain", "timers"] as Section[]).map(s => (
          <button key={s} className={section === s ? "active" : ""} onClick={() => setSection(s)}>
            {s === "enemies" ? "👹 Enemies" : s === "buildings" ? "🏗️ Buildings" : s === "terrain" ? "🗺️ Terrain" : "⏱️ Timers"}
          </button>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={handleFile} />

      {section === "enemies" && (
        <div className="workspace-grid">
          {ENEMIES.map(name => (
            <div key={name} className="workspace-card">
              <h3>{name.charAt(0).toUpperCase() + name.slice(1)}</h3>
              <div className="sprite-row">
                {CURRENT_SPRITES.enemy[name] && (
                  <div className="sprite-current">
                    <img src={CURRENT_SPRITES.enemy[name]} alt={name} className="sprite-thumb" />
                    <small>Current</small>
                  </div>
                )}
                {spritesFor("enemy", name).map(s => (
                  <div key={s.id} className="sprite-uploaded">
                    <img src={s.url} alt={s.name} className="sprite-thumb" />
                    <small>Uploaded</small>
                  </div>
                ))}
                <button
                  className="upload-btn"
                  disabled={uploading === name}
                  onClick={() => { setUploadTarget({ category: "enemy", name }); fileRef.current?.click(); }}
                >
                  {uploading === name ? "..." : "+ Sprite"}
                </button>
              </div>
              <div className="stat-rows">
                <label>Power <input type="number" value={getVal(`enemy.${name}.power`)} onChange={e => setVal(`enemy.${name}.power`, +e.target.value)} /></label>
                <label>HP <input type="number" value={getVal(`enemy.${name}.hp`)} onChange={e => setVal(`enemy.${name}.hp`, +e.target.value)} /></label>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "buildings" && (
        <div className="workspace-grid">
          {BUILDINGS.map(name => (
            <div key={name} className="workspace-card">
              <h3>{name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</h3>
              <div className="sprite-row">
                {CURRENT_SPRITES.building[name] && (
                  <div className="sprite-current">
                    <img src={CURRENT_SPRITES.building[name]} alt={name} className="sprite-thumb" />
                    <small>Current</small>
                  </div>
                )}
                {spritesFor("building", name).map(s => (
                  <div key={s.id} className="sprite-uploaded">
                    <img src={s.url} alt={s.name} className="sprite-thumb" />
                    <small>Uploaded</small>
                  </div>
                ))}
                <button
                  className="upload-btn"
                  disabled={uploading === name}
                  onClick={() => { setUploadTarget({ category: "building", name }); fileRef.current?.click(); }}
                >
                  {uploading === name ? "..." : "+ Sprite"}
                </button>
              </div>
              <div className="stat-rows">
                <label>Cost ⚡ <input type="number" value={getVal(`building.${name}.cost`)} onChange={e => setVal(`building.${name}.cost`, +e.target.value)} /></label>
                <label>Build (min) <input type="number" value={getVal(`building.${name}.buildMinutes`)} onChange={e => setVal(`building.${name}.buildMinutes`, +e.target.value)} /></label>
                {name === "watchtower" && (
                  <>
                    <label>Volley dmg <input type="number" value={getVal("building.watchtower.damage")} onChange={e => setVal("building.watchtower.damage", +e.target.value)} /></label>
                    <label>Power bonus <input type="number" value={getVal("building.watchtower.powerBonus")} onChange={e => setVal("building.watchtower.powerBonus", +e.target.value)} /></label>
                    <label>Upkeep ⚡/hr <input type="number" value={getVal("building.watchtower.upkeepPerHour")} onChange={e => setVal("building.watchtower.upkeepPerHour", +e.target.value)} /></label>
                  </>
                )}
                {name === "thorn-wall" && (
                  <label>Damage <input type="number" value={getVal("building.thorn-wall.damage")} onChange={e => setVal("building.thorn-wall.damage", +e.target.value)} /></label>
                )}
                {name === "dream-wheat" && (
                  <label>Harvest ⚡ <input type="number" value={getVal("building.dream-wheat.harvestEnergy")} onChange={e => setVal("building.dream-wheat.harvestEnergy", +e.target.value)} /></label>
                )}
                {(name === "awakening-well" || name === "tree") && (
                  <label>Energy bonus <input type="number" value={getVal(`building.${name}.energyBonus`)} onChange={e => setVal(`building.${name}.energyBonus`, +e.target.value)} /></label>
                )}
                <label className="toggle">
                  <input type="checkbox" checked={getVal(`building.${name}.enabled`)} onChange={e => setVal(`building.${name}.enabled`, e.target.checked)} />
                  Enabled
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "terrain" && (
        <div className="workspace-grid">
          {TERRAINS.map(name => (
            <div key={name} className="workspace-card">
              <h3>{name.charAt(0).toUpperCase() + name.slice(1)}</h3>
              <div className="sprite-row">
                {CURRENT_SPRITES.terrain[name] && (
                  <div className="sprite-current">
                    <img src={CURRENT_SPRITES.terrain[name]} alt={name} className="sprite-thumb" />
                    <small>Current</small>
                  </div>
                )}
                {spritesFor("terrain", name).map(s => (
                  <div key={s.id} className="sprite-uploaded">
                    <img src={s.url} alt={s.name} className="sprite-thumb" />
                    <small>Uploaded</small>
                  </div>
                ))}
                <button
                  className="upload-btn"
                  disabled={uploading === name}
                  onClick={() => { setUploadTarget({ category: "terrain", name }); fileRef.current?.click(); }}
                >
                  {uploading === name ? "..." : "+ Sprite"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "timers" && (
        <div className="workspace-grid">
          <div className="workspace-card wide">
            <h3>⏱️ Global Timers</h3>
            <div className="stat-rows">
              <label>Energy regen (min) <input type="number" value={getVal("timer.energyRegenMinutes")} onChange={e => setVal("timer.energyRegenMinutes", +e.target.value)} /></label>
              <label>Builder time divisor <input type="number" step="0.1" value={getVal("timer.buildHelperDivisor")} onChange={e => setVal("timer.buildHelperDivisor", +e.target.value)} />
                <small>Each builder divides time by this</small></label>
              <label>Wheat-well synergy <input type="number" step="0.05" min="0" max="1" value={getVal("timer.wheatWellSynergy")} onChange={e => setVal("timer.wheatWellSynergy", +e.target.value)} />
                <small>Multiplier (0.75 = 25% faster)</small></label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
