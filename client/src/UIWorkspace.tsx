import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setWheatStageOverride, setDreamWeedStageOverride } from "./BuildingMenu";
import { useEnemyArt, ENEMY_ART_QUERY_KEY } from "./enemyArt";
import { api } from "./api";
import { ElementGlyph } from "./glyphs";
import { ELEMENTS, ELEMENT_SCHEME, applyElementPalette, elementPalette, isHexColor, type ElementName } from "./palette";
// Current default sprites (bundled with the app)
import frayImg from "./assets/enemies/fray.png";
import unravelerImg from "./assets/enemies/unraveler.png";
import hollowImg from "./assets/enemies/hollow.png";
import tangleImg from "./assets/enemies/tangle.png";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import wheatPlantedImg from "./assets/buildings/wheat-planted.png";
import wheatHalfImg from "./assets/buildings/wheat-half.png";
import wheatFullImg from "./assets/buildings/wheat-full.png";
import wheatHarvestImg from "./assets/buildings/wheat-harvest.png";
import attunementShrineImg from "./assets/buildings/attunement-shrine.png";
import dreamWeedImg from "./assets/buildings/dream-weed.png";
import dreamWeedHalfImg from "./assets/buildings/dream-weed-half.png";
import dreamWeedPlantedImg from "./assets/buildings/dream-weed-planted.png";
import skyBloomImg from "./assets/buildings/sky-bloom.png";
import awakeningWellImg from "./assets/buildings/awakening-well.png";
import thornWallImg from "./assets/buildings/thorn-wall.png";
import bindingCircleImg from "./assets/buildings/binding-circle.png";
import treeImg from "./assets/buildings/tree.png";
import hallOfChampionsImg from "./assets/buildings/hall-of-champions.png";
import tideTileImg from "./assets/terrain-iso/tide-v3.png";
import skyTileImg from "./assets/terrain-iso/sky-v3.png";
import stoneTileImg from "./assets/terrain-iso/stone-v3.png";
import rootTileImg from "./assets/terrain-iso/root-v3.png";
import neutralTileImg from "./assets/terrain-iso/neutral-v3.png";
import cursedTileImg from "./assets/terrain-iso/cursed-v3.png";

const CURRENT_SPRITES: Record<string, Record<string, string>> = {
  enemy: { fray: frayImg, unraveler: unravelerImg, hollow: hollowImg, tangle: tangleImg },
  building: {
    watchtower: watchtowerImg, "dream-wheat": dreamWheatImg,
    "wheat-planted": wheatPlantedImg, "wheat-half": wheatHalfImg, "wheat-full": wheatFullImg, "wheat-harvest": wheatHarvestImg,
    "attunement-shrine": attunementShrineImg, "dream-weed": dreamWeedImg, "dream-weed-half": dreamWeedHalfImg, "dream-weed-planted": dreamWeedPlantedImg, "sky-bloom": skyBloomImg, "awakening-well": awakeningWellImg,
    "thorn-wall": thornWallImg, "binding-circle": bindingCircleImg, tree: treeImg,
    "hall-of-champions": hallOfChampionsImg,
  },
  terrain: {
    tide: tideTileImg, sky: skyTileImg, stone: stoneTileImg,
    root: rootTileImg, neutral: neutralTileImg, cursed: cursedTileImg,
  },
};

type Section = "enemies" | "buildings" | "terrain" | "timers" | "awakening" | "elements" | "table" | "compendium";

// The Monsters Compendium (the game's living copy of the Atelier's roll):
// entries live in the game's own store (compendium_entries, seeded from
// the Compendium app's founding roll); sprites are NOT stored on the
// entry — a slotKey points at the ui_sprites table slots, and the canon
// four resolve through the shared enemy-art rule.
interface CompendiumEntry {
  id: number;
  className: string;
  name: string;
  status: "Canon" | "Named" | "Confirmed" | "Dreamed";
  power: number | null;
  hp: number | null;
  story: string;
  typeNote: string | null;
  layers: string | null;
  motion: string | null;
  slotKey: string | null;
  sortOrder: number;
}
interface CompendiumClass { name: string; blurb: string; order: number }
type CompendiumDraft = {
  className: string; name: string; status: CompendiumEntry["status"];
  power: string; hp: string; story: string; typeNote: string;
  layers: string; motion: string; slotKey: string; sortOrder: string;
};
const EMPTY_DRAFT: CompendiumDraft = {
  className: "", name: "", status: "Dreamed", power: "", hp: "",
  story: "", typeNote: "", layers: "", motion: "", slotKey: "", sortOrder: "1",
};

interface UiSprite {
  id: number;
  category: string;
  name: string;
  url: string;
}

// Default config values
const DEFAULTS: Record<string, any> = {
  // Enemies
  "enemy.fray.power": 1, "enemy.fray.hp": 3,
  "enemy.unraveler.power": 4, "enemy.unraveler.hp": 6,
  "enemy.hollow.power": 0, "enemy.hollow.hp": 5,
  "enemy.tangle.power": 3, "enemy.tangle.hp": 8,
  // Buildings
  "building.watchtower.cost": 2, "building.watchtower.buildMinutes": 15,
  "building.watchtower.damage": 3, "building.watchtower.powerBonus": 2, "building.watchtower.upkeepPerHour": 2,
  "building.watchtower.enabled": true,
  "building.dream-wheat.cost": 2, "building.dream-wheat.buildMinutes": 10,
  "building.dream-wheat.harvestEnergy": 4, "building.dream-wheat.enabled": true,
  "building.awakening-well.cost": 2, "building.awakening-well.buildMinutes": 20,
  "building.awakening-well.energyBonus": 3, "building.awakening-well.enabled": true,
  "building.thorn-wall.cost": 2, "building.thorn-wall.buildMinutes": 5,
  "building.thorn-wall.damage": 1, "building.thorn-wall.enabled": true,
  "building.binding-circle.cost": 2, "building.binding-circle.buildMinutes": 10,
  "building.binding-circle.enabled": true,
  "building.tree.cost": 2, "building.tree.buildMinutes": 15,
  "building.tree.energyBonus": 1, "building.tree.enabled": true,
  "building.attunement-shrine.cost": 4, "building.attunement-shrine.buildMinutes": 20,
  "building.attunement-shrine.upkeepPerHour": 3, "building.attunement-shrine.enabled": true,
  "building.dream-weed.cost": 5, "building.dream-weed.buildMinutes": 25,
  "building.dream-weed.harvestEnergy": 5, "building.dream-weed.growHours": 1, "building.dream-weed.enabled": true,
  "building.sky-bloom.cost": 15, "building.sky-bloom.buildMinutes": 25,
  "building.sky-bloom.harvestEnergy": 10, "building.sky-bloom.growHours": 8, "building.sky-bloom.enabled": true,
  "building.hall-of-champions.cost": 10, "building.hall-of-champions.buildMinutes": 30,
  "building.hall-of-champions.enabled": true,
  // Timers
  "timer.energyRegenMinutes": 4,
  "timer.buildHelperDivisor": 2,
  "timer.wheatWellSynergy": 0.75,
};

const ENEMIES = ["fray", "unraveler", "hollow", "tangle"];
const BUILDINGS = ["watchtower", "dream-wheat", "wheat-planted", "wheat-half", "wheat-full", "wheat-harvest", "attunement-shrine", "dream-weed", "dream-weed-half", "dream-weed-planted", "sky-bloom", "awakening-well", "thorn-wall", "binding-circle", "tree", "hall-of-champions"];
// Real building types get stat knobs; growth-stage entries are sprite slots only.
const CONFIG_BUILDINGS = new Set(["watchtower", "dream-wheat", "attunement-shrine", "dream-weed", "sky-bloom", "awakening-well", "thorn-wall", "binding-circle", "tree", "hall-of-champions"]);
const TERRAINS = ["tide", "sky", "stone", "root", "neutral", "cursed"];
const AWAKENING = ["wake-slot", "wake-ready", "gather-wakes"];
const AWAKENING_LABELS: Record<string, string> = {
  "wake-slot": "Wake Slot Background",
  "wake-ready": "Free Wake Crystal",
  "gather-wakes": "Gather Wakes Button",
};

// Discord Table art slots (Nigel, via the Unseated's Atelier, 2026-10-15).
// These are the workshop's holding shelves for the Table's replaceable art:
// uploads persist in ui_sprites under category "table", keyed by slot name,
// exactly like the other sections. The four classic enemies (Fray, Unraveler,
// Hollow, Tangle) already live in the Enemies section and are NOT duplicated
// here — only the Table's newer faces get slots. The Compendium group
// (added 2026-10-16, same source) holds confirmed monsters' art as the
// Compendium grows, one slot per approved design.
interface TableSlot { name: string; label: string; canvas: string; note?: string }
const TABLE_GROUPS: { title: string; caption?: string; slots: TableSlot[] }[] = [
  {
    title: "New faces for the Dark",
    slots: [
      { name: "enemy_thornrunner", label: "Thornrunner", canvas: "480×480" },
      { name: "enemy_hollow_choir", label: "The Hollow Choir", canvas: "480×480" },
      { name: "enemy_gloaming_stag", label: "Gloaming Stag", canvas: "480×480" },
    ],
  },
  {
    title: "The Compendium — Confirmed",
    caption: "Monsters from the Compendium, confirmed by Nigel as their designs were approved. These are holding shelves for their art: uploads save here like everywhere else in the workshop, but nothing in the game draws from these slots yet — no battle or Table surface renders them until a consumer is built.",
    slots: [
      { name: "enemy_seamother", label: "The Seamother", canvas: "480×480", note: "Confirmed 2026-10-16. Stitch-walker; sews herself forward." },
      { name: "enemy_long_parish", label: "The Long Parish", canvas: "480×480", note: "Confirmed 2026-10-16. The procession that never arrives." },
    ],
  },
  {
    title: "The star-seed & the Bastion",
    slots: [
      { name: "seed_ground", label: "Cracked ground disc", canvas: "512×512", note: "The cracked earth the bulb grows from — the seed's bed on the centre hex." },
      { name: "seed_bulb_1", label: "Star-seed bulb — young", canvas: "360×360", note: "The bulb at the pool's smallest. It grows as the pool grows." },
      { name: "seed_bulb_2", label: "Star-seed bulb — grown", canvas: "360×360" },
      { name: "seed_bulb_3", label: "Star-seed bulb — swollen", canvas: "360×360", note: "The bulb at the pool's fullest, before the tally." },
      { name: "bastion_lvl_1", label: "Bastion — Level 1", canvas: "640×512", note: "What the Awoken build around a held seed. Level = holders' level ÷ 3." },
      { name: "bastion_lvl_2", label: "Bastion — Level 2", canvas: "640×512" },
      { name: "bastion_lvl_3", label: "Bastion — Level 3", canvas: "640×512" },
    ],
  },
  {
    title: "Stage sets — the Storytender's screens",
    slots: [
      { name: "stage_gate_lamplight", label: "The Gate at Lamplight", canvas: "1280×720", note: "Full-bleed stage backdrops. PNG or JPEG." },
      { name: "stage_road_falls", label: "The Road Between Falls", canvas: "1280×720", note: "PNG or JPEG." },
      { name: "stage_ring_ground", label: "The Ring of Ground", canvas: "1280×720", note: "PNG or JPEG." },
      { name: "stage_blank_slate", label: "Blank Slate — map grid", canvas: "1280×720", note: "PNG or JPEG." },
    ],
  },
  {
    title: "Item sprites — the typed inventory",
    slots: [
      { name: "item_flask", label: "Flask", canvas: "128×128", note: "Small icons that ride beside typed inventory entries, matched by the item's name." },
      { name: "item_rope", label: "Rope", canvas: "128×128" },
      { name: "item_candle", label: "Candle", canvas: "128×128" },
      { name: "item_key", label: "Key", canvas: "128×128" },
      { name: "item_crystal", label: "Crystal", canvas: "128×128" },
      { name: "item_ration", label: "Ration", canvas: "128×128" },
      { name: "item_chalk", label: "Chalk", canvas: "128×128" },
      { name: "item_satchel", label: "Satchel", canvas: "128×128", note: "The fallback sprite when no name matches." },
    ],
  },
  {
    title: "Abilities & table signs",
    slots: [
      { name: "ability_ward", label: "Ward", canvas: "128×128", note: "Tab II marks: every Tender casts Lvl 1 wards and runes; Awoken-borne ones ride here too." },
      { name: "ability_rune", label: "Rune", canvas: "128×128" },
      { name: "sign_dice", label: "Dice sign", canvas: "128×128", note: "The mark that opens the dice pop-up on the hand." },
      { name: "sign_kindred", label: "Kindred sign", canvas: "128×128", note: "The twin-flame mark of the Kindred pool." },
    ],
  },
];

export default function UIWorkspace() {
  const [section, setSection] = useState<Section>("enemies");
  const queryClient = useQueryClient();
  // The live enemy art, resolved server-side (pin > latest upload >
  // bundled): the same answer every battle surface renders.
  const { data: enemyArtData } = useEnemyArt();
  const [swapping, setSwapping] = useState<string | null>(null);
  const chooseEnemySprite = async (name: string, spriteId: number | null) => {
    setSwapping(name);
    try {
      await api.setEnemySpriteSelection({ name, spriteId });
      await queryClient.invalidateQueries({ queryKey: ENEMY_ART_QUERY_KEY });
    } catch (e) {
      console.error("Enemy sprite selection failed", e);
    }
    setSwapping(null);
  };
  const [sprites, setSprites] = useState<UiSprite[]>([]);
  const [compClasses, setCompClasses] = useState<CompendiumClass[]>([]);
  const [compEntries, setCompEntries] = useState<CompendiumEntry[]>([]);
  const [compLastSync, setCompLastSync] = useState<{ at: string; added: number; updated: number; removed: number; total: number } | null>(null);
  const [compEditing, setCompEditing] = useState<number | "new" | null>(null);
  const [compDraft, setCompDraft] = useState<CompendiumDraft>(EMPTY_DRAFT);
  const [compSaving, setCompSaving] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const loadCompendium = async () => {
    try {
      const r: any = await api.call("getCompendium", {});
      setCompClasses(r.classes || []);
      setCompEntries(r.entries || []);
      setCompLastSync(r.lastSync ?? null);
    } catch (e) { console.error("Compendium load failed", e); }
  };

  const startCompEdit = (entry: CompendiumEntry) => {
    setCompError(null);
    setCompEditing(entry.id);
    setCompDraft({
      className: entry.className, name: entry.name, status: entry.status,
      power: entry.power === null ? "" : String(entry.power),
      hp: entry.hp === null ? "" : String(entry.hp),
      story: entry.story, typeNote: entry.typeNote ?? "",
      layers: entry.layers ?? "", motion: entry.motion ?? "",
      slotKey: entry.slotKey ?? "", sortOrder: String(entry.sortOrder),
    });
  };

  const saveCompEntry = async () => {
    setCompSaving(true);
    setCompError(null);
    const num = (v: string) => (v.trim() === "" ? null : Math.max(0, parseInt(v, 10) || 0));
    const payload = {
      className: compDraft.className.trim(), name: compDraft.name.trim(),
      status: compDraft.status, power: num(compDraft.power), hp: num(compDraft.hp),
      story: compDraft.story, typeNote: compDraft.typeNote.trim() || null,
      layers: compDraft.layers.trim() || null, motion: compDraft.motion.trim() || null,
      slotKey: compDraft.slotKey.trim() || null, sortOrder: Math.max(0, parseInt(compDraft.sortOrder, 10) || 0),
    };
    try {
      if (compEditing === "new") await api.call("addCompendiumEntry", payload);
      else await api.call("updateCompendiumEntry", { id: compEditing, ...payload });
      setCompEditing(null);
      await loadCompendium();
    } catch (e) {
      setCompError(e instanceof Error ? e.message : "Save failed");
    }
    setCompSaving(false);
  };

  const deleteCompEntry = async (entry: CompendiumEntry) => {
    if (!confirm(`Remove ${entry.name} from the Compendium?`)) return;
    try {
      await api.call("deleteCompendiumEntry", { id: entry.id });
      setCompEditing(null);
      await loadCompendium();
    } catch (e) {
      setCompError(e instanceof Error ? e.message : "Delete failed");
    }
  };
  const [config, setConfig] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<{ category: string; name: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Element palette adjusters: a local draft of the canonical scheme.
  // Edits live-preview (the shared palette + --elem-* vars move at once);
  // Apply persists the whole draft through updateUITheme in one save.
  const [elementDraft, setElementDraft] = useState<Record<ElementName, string>>({ ...elementPalette });
  const [elementSave, setElementSave] = useState<"" | "saving" | "saved" | "error">("");

  useEffect(() => {
    api.call("listUiSprites", {}).then((r: any) => {
      setSprites(r.sprites);
      // Apply wheat stage overrides
      for (const s of r.sprites || []) {
        if (s.category === "building" && s.name.startsWith("wheat-")) {
          setWheatStageOverride(s.name, s.url);
        }
        if (s.category === "building" && s.name.startsWith("dream-weed")) {
          setDreamWeedStageOverride(s.name, s.url);
        }
      }
    }).catch(() => {});
    api.call("getUiConfig", {}).then((r: any) => setConfig({ ...DEFAULTS, ...r.config })).catch(() => setConfig(DEFAULTS));
    void loadCompendium();
    api.getUITheme().then(r => {
      if (r.ok) setElementDraft({ ...ELEMENT_SCHEME, ...r.theme.elementColors });
    }).catch(() => {});
  }, []);

  const setElementColor = (el: ElementName, value: string) => {
    setElementDraft(prev => ({ ...prev, [el]: value }));
    setElementSave("");
    // Live preview only for well-formed hex; a half-typed hex field must
    // never push a broken color into the shared palette.
    if (isHexColor(value)) applyElementPalette({ [el]: value });
  };

  const saveElementColors = async (colors: Record<ElementName, string>) => {
    setElementSave("saving");
    try {
      const valid: Partial<Record<ElementName, string>> = {};
      for (const el of ELEMENTS) if (isHexColor(colors[el])) valid[el] = colors[el];
      const r = await api.updateUITheme({ elementColors: valid });
      setElementDraft({ ...ELEMENT_SCHEME, ...r.theme.elementColors });
      applyElementPalette(r.theme.elementColors);
      setElementSave("saved");
    } catch (e) {
      console.error("Element palette save failed", e);
      setElementSave("error");
    }
  };

  const resetElementColors = () => {
    setElementDraft({ ...ELEMENT_SCHEME });
    applyElementPalette({ ...ELEMENT_SCHEME });
    void saveElementColors({ ...ELEMENT_SCHEME });
  };

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
    if (!file) {
      setUploadError("No file selected");
      return;
    }
    if (!uploadTarget) {
      setUploadError("Upload target not set — tap + PNG again");
      return;
    }
    setUploading(uploadTarget.name);
    setUploadError(null);
    try {
      const buf = await file.arrayBuffer();
      // Chunked base64 to avoid stack overflow on large files
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      await api.call("uploadUiSprite", {
        category: uploadTarget.category,
        name: uploadTarget.name,
        imageBase64: base64,
      });
      const r: any = await api.call("listUiSprites", {});
      setSprites(r.sprites);
      // A fresh upload may be the new live face (latest-upload rule).
      await queryClient.invalidateQueries({ queryKey: ENEMY_ART_QUERY_KEY });
    } catch (err) {
      console.error("Upload failed", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
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
        {(["enemies", "buildings", "terrain", "timers", "awakening", "elements", "table", "compendium"] as Section[]).map(s => (
          <button key={s} className={section === s ? "active" : ""} onClick={() => setSection(s)}>
            {s === "enemies" ? "👹 Enemies" : s === "buildings" ? "🏗️ Buildings" : s === "terrain" ? "🗺️ Terrain" : s === "timers" ? "⏱️ Timers" : s === "awakening" ? "✨ Awakening" : s === "elements" ? "🌿 Elements" : s === "table" ? "🎲 Discord Table" : "📖 Compendium"}
          </button>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={handleFile} />

      {section === "enemies" && (
        <div className="workspace-grid">
          {ENEMIES.map(name => {
            const uploads = spritesFor("enemy", name);
            const live = enemyArtData?.art?.[name] ?? null;
            const pinned = enemyArtData?.selection?.[name];
            const bundledPinned = pinned === 0;
            return (
            <div key={name} className="workspace-card">
              <h3>{name.charAt(0).toUpperCase() + name.slice(1)}</h3>
              <div className="sprite-row">
                <div className="sprite-current">
                  <img src={live?.url || CURRENT_SPRITES.enemy[name]} alt={name} className="sprite-thumb" />
                  <small>{live ? "Current: Uploaded" : bundledPinned && uploads.length ? "Current: Bundled (pinned)" : "Current: Bundled"}</small>
                </div>
                {uploads.map(s => (
                  <div key={s.id} className="sprite-uploaded">
                    <img src={s.url} alt={s.name} className="sprite-thumb" />
                    <small>{live?.spriteId === s.id ? "Uploaded · Live" : "Uploaded"}</small>
                    {live?.spriteId !== s.id && (
                      <button
                        className="swap-btn"
                        disabled={swapping === name}
                        onClick={() => chooseEnemySprite(name, s.id)}
                      >
                        {swapping === name ? "..." : "Make current"}
                      </button>
                    )}
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
              {(live || (bundledPinned && uploads.length > 0)) && (
                <div className="sprite-actions">
                  {live && (
                    <button
                      className="swap-btn"
                      disabled={swapping === name}
                      onClick={() => chooseEnemySprite(name, 0)}
                    >
                      {swapping === name ? "..." : "Revert to bundled"}
                    </button>
                  )}
                  {bundledPinned && uploads.length > 0 && (
                    <button
                      className="swap-btn"
                      disabled={swapping === name}
                      onClick={() => chooseEnemySprite(name, null)}
                    >
                      {swapping === name ? "..." : "Use latest upload"}
                    </button>
                  )}
                </div>
              )}
              <div className="stat-rows">
                <label>Power <input type="number" value={getVal(`enemy.${name}.power`)} onChange={e => setVal(`enemy.${name}.power`, +e.target.value)} /></label>
                <label>HP <input type="number" value={getVal(`enemy.${name}.hp`)} onChange={e => setVal(`enemy.${name}.hp`, +e.target.value)} /></label>
              </div>
            </div>
            );
          })}
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
              {CONFIG_BUILDINGS.has(name) && (
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
                {name === "attunement-shrine" && (
                  <label>Upkeep ⚡/hr <input type="number" value={getVal("building.attunement-shrine.upkeepPerHour")} onChange={e => setVal("building.attunement-shrine.upkeepPerHour", +e.target.value)} /></label>
                )}
                {(name === "dream-weed" || name === "sky-bloom") && (
                  <>
                    <label>Harvest ⚡ <input type="number" value={getVal(`building.${name}.harvestEnergy`)} onChange={e => setVal(`building.${name}.harvestEnergy`, +e.target.value)} /></label>
                    <label>Grow (hrs) <input type="number" value={getVal(`building.${name}.growHours`)} onChange={e => setVal(`building.${name}.growHours`, +e.target.value)} /></label>
                  </>
                )}
                {(name === "awakening-well" || name === "tree") && (
                  <label>Energy bonus <input type="number" value={getVal(`building.${name}.energyBonus`)} onChange={e => setVal(`building.${name}.energyBonus`, +e.target.value)} /></label>
                )}
                <label className="toggle">
                  <input type="checkbox" checked={getVal(`building.${name}.enabled`)} onChange={e => setVal(`building.${name}.enabled`, e.target.checked)} />
                  Enabled
                </label>
              </div>
              )}
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
              <label>Energy regen, online (min) — offline is 3× slower <input type="number" value={getVal("timer.energyRegenMinutes")} onChange={e => setVal("timer.energyRegenMinutes", +e.target.value)} /></label>
              <label>Builder time divisor <input type="number" step="0.1" value={getVal("timer.buildHelperDivisor")} onChange={e => setVal("timer.buildHelperDivisor", +e.target.value)} />
                <small>Each builder divides time by this</small></label>
              <label>Wheat-well synergy <input type="number" step="0.05" min="0" max="1" value={getVal("timer.wheatWellSynergy")} onChange={e => setVal("timer.wheatWellSynergy", +e.target.value)} />
                <small>Multiplier (0.75 = 25% faster)</small></label>
            </div>
          </div>
        </div>
      )}

      {section === "elements" && (
        <div className="workspace-grid">
          <div className="workspace-card wide">
            <h3>🌿 Element Colors</h3>
            <p className="quiet" style={{ marginTop: 0 }}>
              The one canonical palette — card corners, the wake ceremony's burn, attunement,
              celebrations, and battle shots all read these colors. Edits preview live;
              Apply saves them to the site for every visitor, on desktop and mobile alike.
            </p>
            <div className="element-rows">
              {ELEMENTS.map(el => (
                <div key={el} className="element-row">
                  <span className="glyph-swatch">
                    <ElementGlyph element={el} color={isHexColor(elementDraft[el]) ? elementDraft[el] : ELEMENT_SCHEME[el]} dotColor={isHexColor(elementDraft[el]) ? elementDraft[el] : ELEMENT_SCHEME[el]} width={60} height={24} />
                  </span>
                  <span className="element-name">{el}</span>
                  <input
                    type="color"
                    aria-label={`${el} color picker`}
                    value={isHexColor(elementDraft[el]) ? elementDraft[el] : ELEMENT_SCHEME[el]}
                    onChange={e => setElementColor(el, e.target.value)}
                  />
                  <input
                    type="text"
                    aria-label={`${el} hex value`}
                    value={elementDraft[el]}
                    onChange={e => setElementColor(el, e.target.value)}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
              ))}
            </div>
            <div className="element-actions">
              <button className="upload-btn" disabled={elementSave === "saving"} onClick={() => void saveElementColors(elementDraft)}>
                {elementSave === "saving" ? "Saving…" : "Apply colors"}
              </button>
              <button className="upload-btn" disabled={elementSave === "saving"} onClick={resetElementColors}>
                Reset to scheme
              </button>
              {elementSave === "saved" && <span className="save-note">Saved — live across the site.</span>}
              {elementSave === "error" && <span className="save-note" style={{ color: "#e88" }}>Save failed — check your connection and try again.</span>}
            </div>
          </div>
        </div>
      )}

      {section === "awakening" && (
        <div>

          {uploadError && (
            <p className="notice error" style={{ marginBottom: 12 }}>
              Upload failed: {uploadError}
              <button className="abtn small" onClick={() => setUploadError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
            </p>
          )}
        <div className="workspace-grid">
          {AWAKENING.map(name => (
            <div key={name} className="workspace-card">
              <h3>{AWAKENING_LABELS[name]}</h3>
              <div className="sprite-row">
                {spritesFor("awakening", name).map(s => (
                  <div key={s.id} className="sprite-uploaded">
                    <img src={s.url} alt={s.name} className="sprite-thumb" />
                    <small>Uploaded</small>
                  </div>
                ))}
                <button
                  className="upload-btn"
                  disabled={uploading === name}
                  onClick={() => { setUploadTarget({ category: "awakening", name }); fileRef.current?.click(); }}
                >
                  {uploading === name ? "..." : "+ PNG"}
                </button>
              </div>
              <p className="quiet" style={{ fontSize: 11, marginTop: 8 }}>
                {name === "wake-slot" && "Background behind the wake canvas. Transparent PNG recommended."}
                {name === "wake-ready" && "Crystal overlay when free wake is ready. Must have transparency."}
                {name === "gather-wakes" && "Button image when vessel is empty. Must have transparency."}
              </p>
            </div>
          ))}
        </div>
        </div>
      )}

      {section === "table" && (
        <div>
          <p className="quiet" style={{ marginTop: 0 }}>
            🎲 <strong>Discord Table</strong> — these shelves hold the replaceable art for the Discord
            Table: the Activity where Tenders will play the Awoken together. Uploads save here exactly
            like the other sections, ready for the Table to draw from. The four classic enemies keep
            their slots in the Enemies section above; only the Table's newer faces live here.
          </p>
          {uploadError && (
            <p className="notice error" style={{ marginBottom: 12 }}>
              Upload failed: {uploadError}
              <button className="abtn small" onClick={() => setUploadError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
            </p>
          )}
          {TABLE_GROUPS.map(group => (
            <div key={group.title}>
              <h3 style={{ margin: "18px 0 8px" }}>{group.title}</h3>
              {group.caption ? (
                <p className="quiet" style={{ margin: "0 0 8px" }}>{group.caption}</p>
              ) : null}
              <div className="workspace-grid">
                {group.slots.map(slot => (
                  <div key={slot.name} className="workspace-card">
                    <h3>{slot.label}</h3>
                    <div className="sprite-row">
                      {spritesFor("table", slot.name).map(s => (
                        <div key={s.id} className="sprite-uploaded">
                          <img src={s.url} alt={s.name} className="sprite-thumb" />
                          <small>Uploaded</small>
                        </div>
                      ))}
                      <button
                        className="upload-btn"
                        disabled={uploading === slot.name}
                        onClick={() => { setUploadTarget({ category: "table", name: slot.name }); fileRef.current?.click(); }}
                      >
                        {uploading === slot.name ? "..." : "+ Sprite"}
                      </button>
                    </div>
                    <p className="quiet" style={{ fontSize: 11, marginTop: 8 }}>
                      Canvas {slot.canvas} · slot <code>{slot.name}</code>
                      {slot.note ? <><br />{slot.note}</> : null}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "compendium" && (() => {
        const renderCompForm = (showDelete: boolean, entry?: CompendiumEntry) => (
          <div className="comp-form">
            <label>Name
              <input value={compDraft.name} onChange={e => setCompDraft({ ...compDraft, name: e.target.value })} placeholder="The Seamother" />
            </label>
            <label>Class
              <input value={compDraft.className} onChange={e => setCompDraft({ ...compDraft, className: e.target.value })} list="comp-class-list" placeholder="The Stitchers" />
              <datalist id="comp-class-list">
                {compClasses.map(c => <option key={c.name} value={c.name} />)}
              </datalist>
            </label>
            <label>Status
              <select value={compDraft.status} onChange={e => setCompDraft({ ...compDraft, status: e.target.value as CompendiumEntry["status"] })}>
                <option value="Canon">Canon</option>
                <option value="Named">Named</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Dreamed">Dreamed</option>
              </select>
            </label>
            <div className="comp-form-row">
              <label>Power
                <input type="number" min={0} value={compDraft.power} onChange={e => setCompDraft({ ...compDraft, power: e.target.value })} placeholder="—" />
              </label>
              <label>HP
                <input type="number" min={0} value={compDraft.hp} onChange={e => setCompDraft({ ...compDraft, hp: e.target.value })} placeholder="—" />
              </label>
              <label>Order in class
                <input type="number" min={0} value={compDraft.sortOrder} onChange={e => setCompDraft({ ...compDraft, sortOrder: e.target.value })} />
              </label>
            </div>
            <label>Story
              <textarea rows={3} value={compDraft.story} onChange={e => setCompDraft({ ...compDraft, story: e.target.value })} />
            </label>
            <label>Type / variant note
              <input value={compDraft.typeNote} onChange={e => setCompDraft({ ...compDraft, typeNote: e.target.value })} placeholder="Optional" />
            </label>
            <label>Layers
              <textarea rows={2} value={compDraft.layers} onChange={e => setCompDraft({ ...compDraft, layers: e.target.value })} placeholder="Optional — so the body can move" />
            </label>
            <label>Motion
              <textarea rows={2} value={compDraft.motion} onChange={e => setCompDraft({ ...compDraft, motion: e.target.value })} placeholder="Optional — how it crosses the map" />
            </label>
            <label>Sprite slot key
              <input value={compDraft.slotKey} onChange={e => setCompDraft({ ...compDraft, slotKey: e.target.value })} placeholder="enemy_seamother — optional; art uploads live in that Table slot" />
            </label>
            <div className="comp-form-actions">
              <button className="upload-btn" disabled={compSaving} onClick={saveCompEntry}>
                {compSaving ? "..." : compEditing === "new" ? "Add to the roll" : "Save changes"}
              </button>
              <button className="swap-btn" disabled={compSaving} onClick={() => { setCompEditing(null); setCompError(null); }}>Cancel</button>
              {showDelete && entry && (
                <button className="swap-btn comp-delete" disabled={compSaving} onClick={() => deleteCompEntry(entry)}>Remove from roll</button>
              )}
            </div>
          </div>
        );
        return (
          <div>
            <p className="quiet" style={{ marginTop: 0 }}>
              📖 <strong>The Monsters Compendium</strong> — the standing roll of every enemy the heroes
              may face, kept by class. <strong>The Compendium app is the roll of record; this page is
              its mirror in the game.</strong> The Keeper carries the sync: say <em>"sync the
              compendium"</em> in chat (here or in the Atelier) and this page is brought up to the app
              exactly — new entries arrive, changed ones update, ones the app no longer holds are
              removed. Edits made on this page are local, and a sync will overwrite them. Sprites are
              not stored on an entry — an entry's slot key points at the workshop's Table slots, so
              art uploaded here (or in the Discord Table section) shows on the entry; the canon four
              wear the live art from the Enemies section.
            </p>
            <p className="quiet" style={{ marginTop: 0 }}>
              {compLastSync
                ? <>Last synced from the Compendium app: {new Date(compLastSync.at).toLocaleString()} — {compLastSync.total} entries ({compLastSync.added} added, {compLastSync.updated} updated, {compLastSync.removed} removed in that sync).</>
                : <>Seeded from the app's founding roll — not yet synced.</>}
            </p>
            {compError && (
              <p className="notice error" style={{ marginBottom: 12 }}>
                {compError}
                <button className="abtn small" onClick={() => setCompError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
              </p>
            )}
            {uploadError && (
              <p className="notice error" style={{ marginBottom: 12 }}>
                Upload failed: {uploadError}
                <button className="abtn small" onClick={() => setUploadError(null)} style={{ marginLeft: 8 }}>Dismiss</button>
              </p>
            )}
            {compEditing === "new" ? (
              <div className="workspace-card" style={{ marginBottom: 16 }}>{renderCompForm(false)}</div>
            ) : (
              <button className="upload-btn" style={{ marginBottom: 16 }} onClick={() => { setCompError(null); setCompDraft(EMPTY_DRAFT); setCompEditing("new"); }}>
                + New entry
              </button>
            )}
            {compClasses.map(cls => (
              <div key={cls.name}>
                <h3 style={{ margin: "18px 0 4px" }}>{cls.name}</h3>
                {cls.blurb ? <p className="quiet" style={{ margin: "0 0 8px" }}>{cls.blurb}</p> : null}
                <div className="workspace-grid">
                  {compEntries.filter(e => e.className === cls.name).map(entry => {
                    const canonKey = entry.name.toLowerCase();
                    const isCanon = entry.status === "Canon" && ENEMIES.includes(canonKey);
                    const slotUploads = entry.slotKey ? spritesFor("table", entry.slotKey) : [];
                    const slotLive = slotUploads[slotUploads.length - 1];
                    return (
                      <div key={entry.id} className="workspace-card">
                        <h3 style={{ textTransform: "none" }}>{entry.name}</h3>
                        <div className="sprite-row">
                          {isCanon ? (
                            <div className="sprite-current">
                              <img src={enemyArtData?.art?.[canonKey]?.url || CURRENT_SPRITES.enemy[canonKey]} alt={entry.name} className="sprite-thumb" />
                              <small>Live art — kept in Enemies</small>
                            </div>
                          ) : entry.slotKey ? (
                            <>
                              {slotLive ? (
                                <div className="sprite-uploaded">
                                  <img src={slotLive.url} alt={entry.name} className="sprite-thumb" />
                                  <small>Uploaded</small>
                                </div>
                              ) : (
                                <div className="sprite-owed"><span>Sprite<br />owed</span></div>
                              )}
                              <button
                                className="upload-btn"
                                disabled={uploading === entry.slotKey}
                                onClick={() => { setUploadTarget({ category: "table", name: entry.slotKey! }); fileRef.current?.click(); }}
                              >
                                {uploading === entry.slotKey ? "..." : "+ Sprite"}
                              </button>
                            </>
                          ) : (
                            <div className="sprite-owed"><span>Sprite owed<br />— no slot yet</span></div>
                          )}
                        </div>
                        <p style={{ margin: "8px 0 4px" }}>
                          <span className={`comp-chip comp-${entry.status.toLowerCase()}`}>{entry.status}</span>
                          {entry.power !== null && entry.hp !== null && (
                            <span style={{ marginLeft: 8 }}>Power {entry.power} · HP {entry.hp}</span>
                          )}
                        </p>
                        {entry.story && <p className="comp-text">{entry.story}</p>}
                        {entry.typeNote && <p className="comp-text"><em>{entry.typeNote}</em></p>}
                        {entry.layers && <p className="comp-text"><strong>Layers:</strong> {entry.layers}</p>}
                        {entry.motion && <p className="comp-text"><strong>Motion:</strong> {entry.motion}</p>}
                        {entry.slotKey && <p className="quiet" style={{ fontSize: 11 }}>Slot <code>{entry.slotKey}</code> · Discord Table section</p>}
                        {compEditing === entry.id ? renderCompForm(true, entry) : (
                          <button className="swap-btn" onClick={() => startCompEdit(entry)}>Edit entry</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
