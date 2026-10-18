import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setWheatStageOverride, setDreamWeedStageOverride } from "./BuildingMenu";
import { useEnemyArt, ENEMY_ART_QUERY_KEY } from "./enemyArt";
import { api, GRIMOIRE_ENGINE_FIELDS, GRIMOIRE_HUES, type GrimoireGlyph, type GrimoireSpell, type GrimoireSpellInput, type GrimoireGlyphSort, type GrimoireSpellKind, type ZodiacGraphNode, type ZodiacFxClause } from "./api";
import { ElementGlyph } from "./glyphs";
import { ELEMENTS, ELEMENT_SCHEME, applyElementPalette, elementPalette, isHexColor, type ElementName } from "./palette";
// Current default sprites (bundled with the app)
import glyphSealImg from "./assets/glyphs/seal.png";
import glyphEngineImg from "./assets/glyphs/engine.png";
import glyphStandardImg from "./assets/glyphs/standard.png";
import glyphTreesImg from "./assets/glyphs/trees.png";
import glyphBeaconImg from "./assets/glyphs/beacon.png";
import glyphLatticeImg from "./assets/glyphs/lattice.png";
import glyphBladeImg from "./assets/glyphs/blade.png";
import glyphBladesImg from "./assets/glyphs/blades.png";
import glyphShardImg from "./assets/glyphs/shard.png";
import glyphCoilImg from "./assets/glyphs/coil.png";

import frayImg from "./assets/enemies/fray.png";
import unravelerImg from "./assets/enemies/unraveler.png";
import hollowImg from "./assets/enemies/hollow.png";
import tangleImg from "./assets/enemies/tangle.png";
import watchtowerImg from "./assets/buildings/watchtower.png";
import dreamWheatImg from "./assets/buildings/dream-wheat.png";
import wheatPlantedImg from "./assets/buildings/wheat-planted.png";
import wheatHalfImg from "./assets/buildings/wheat-half.png";
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
    "wheat-planted": wheatPlantedImg, "wheat-half": wheatHalfImg, "wheat-harvest": wheatHarvestImg,
    "attunement-shrine": attunementShrineImg, "dream-weed": dreamWeedImg, "dream-weed-half": dreamWeedHalfImg, "dream-weed-planted": dreamWeedPlantedImg, "sky-bloom": skyBloomImg, "awakening-well": awakeningWellImg,
    "thorn-wall": thornWallImg, "binding-circle": bindingCircleImg, tree: treeImg,
    "hall-of-champions": hallOfChampionsImg,
  },
  terrain: {
    tide: tideTileImg, sky: skyTileImg, stone: stoneTileImg,
    root: rootTileImg, neutral: neutralTileImg, cursed: cursedTileImg,
  },
};

type Section = "enemies" | "buildings" | "terrain" | "timers" | "awakening" | "elements" | "table" | "compendium" | "border" | "grimoire" | "starwright";

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
const BUILDINGS = ["watchtower", "dream-wheat", "wheat-planted", "wheat-half", "wheat-harvest", "attunement-shrine", "dream-weed", "dream-weed-half", "dream-weed-planted", "sky-bloom", "awakening-well", "thorn-wall", "binding-circle", "tree", "hall-of-champions"];
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


// ── Card Border section (Nigel, 2026-10-17): the shelf of card-frame
// art. One border is live at a time and wraps every Awoken card in
// the game and at the Table; the wake ceremony always keeps its own
// birth frame. Fits: "hug" stretches art drawn as a full-card frame
// to the card's edge; "morning" is the birth frame's measured fit,
// for art drawn as an ornament surround with a window in the middle.
function CardBorderSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["cardBorder"], queryFn: () => api.getCardBorder() });
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["cardBorder"] });
  const select = useMutation({
    mutationFn: (args: { kind: "none" | "birth" | "upload"; id?: string }) => api.setCardBorderSelection(args),
    onSuccess: refresh, onError: (e: any) => alert(e?.message || "Could not set the border."),
  });
  const fit = useMutation({
    mutationFn: (args: { target: string; fit: "hug" | "morning" }) => api.setCardBorderFit(args),
    onSuccess: refresh, onError: (e: any) => alert(e?.message || "Could not set the fit."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCardBorder({ id }),
    onSuccess: refresh, onError: (e: any) => alert(e?.message || "Could not remove that border."),
  });
  const upload = useMutation({
    mutationFn: (args: { name: string; imageBase64: string }) => api.uploadCardBorder(args),
    onSuccess: () => { setName(""); refresh(); },
    onError: (e: any) => alert(e?.message || "That upload did not land — PNG only, please."),
  });
  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      const base64 = url.split(",")[1] || "";
      upload.mutate({ name: name.trim() || file.name.replace(/\.png$/i, ""), imageBase64: base64 });
    };
    reader.readAsDataURL(file);
  };
  const sel = data?.selection;
  const liveLabel = !data ? "…" : sel?.kind === "none" ? "No border is live"
    : sel?.kind === "birth" ? "The Birth Frame is live"
    : `“${data.uploads.find((u) => u.id === sel?.id)?.name ?? "An uploaded border"}” is live`;
  const fitSelect = (target: string, value: "hug" | "morning") => (
    <select value={value} disabled={fit.isPending} onChange={(e) => fit.mutate({ target, fit: e.target.value as "hug" | "morning" })} title="How this art seats on a card">
      <option value="hug">Hug the edge</option>
      <option value="morning">Morning fit (window)</option>
    </select>
  );
  const row = (key: string, title: string, sub: string, active: boolean, controls: React.ReactNode) => (
    <div key={key} className="stat-rows" style={{ borderTop: "1px solid rgba(184,155,94,.35)", paddingTop: 10, marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div><strong>{title}</strong> {active && <span style={{ color: "#b89b5e" }}>· live on every card</span>}<br /><small>{sub}</small></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{controls}</div>
      </div>
    </div>
  );
  return (
    <div className="workspace-grid">
      <div className="workspace-card wide">
        <h3>🖼️ Card Border</h3>
        <p className="quiet">Add border art here and the live one wraps <strong>every Awoken card</strong> — in the collection, on the card's own page, and in your hand at the Table. Upload a PNG drawn with a transparent middle. <em>Hug the edge</em> suits art drawn as a full-card frame; <em>Morning fit</em> suits art drawn like the birth frame — an ornament surround whose window should land on the card. The wake ceremony always keeps its own birth frame.</p>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ position: "relative", width: 150, aspectRatio: "750 / 971", margin: "34px auto 8px", background: "linear-gradient(160deg,#2a2118,#171208)", border: "2px solid #141414", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>
              <div style={{ position: "absolute", inset: 10, border: "1px solid #b89b5e" }} />
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#e8d5a0", fontSize: 12, letterSpacing: 2 }}>CARD</span>
              {data?.imageUrl && <img className={`card-border-frame fit-${data.fit ?? "hug"}`} src={data.imageUrl} alt="" aria-hidden="true" />}
            </div>
            <small>{liveLabel}</small>
          </div>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            {row("none", "No border", "Cards stand bare, as they were first drawn.", sel?.kind === "none",
              <button disabled={select.isPending || sel?.kind === "none"} onClick={() => select.mutate({ kind: "none" })}>Make live</button>)}
            {row("birth", "The Birth Frame", "Built in — the gold frame from this morning's wake ceremony.", sel?.kind === "birth",
              <>{fitSelect("birth", data?.birthFit ?? "morning")}<button disabled={select.isPending || sel?.kind === "birth"} onClick={() => select.mutate({ kind: "birth" })}>Make live</button></>)}
            {(data?.uploads ?? []).map((u) => row(u.id, u.name, "Your uploaded border art.", sel?.kind === "upload" && sel?.id === u.id,
              <>{fitSelect(u.id, u.fit)}<button disabled={select.isPending || (sel?.kind === "upload" && sel?.id === u.id)} onClick={() => select.mutate({ kind: "upload", id: u.id })}>Make live</button><button disabled={remove.isPending} onClick={() => { if (confirm(`Remove “${u.name}” from the shelf?`)) remove.mutate(u.id); }}>Remove</button></>))}
            <div className="stat-rows" style={{ borderTop: "1px solid rgba(184,155,94,.35)", paddingTop: 10, marginTop: 10 }}>
              <label>Border name <input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thornwood Frame" /></label>
              <input ref={fileRef} type="file" accept="image/png" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              <button disabled={upload.isPending} onClick={() => fileRef.current?.click()}>{upload.isPending ? "Adding…" : "＋ Add border art (PNG)"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GRIMOIRE_BUNDLED: Record<string, string> = { seal: glyphSealImg, engine: glyphEngineImg, standard: glyphStandardImg, trees: glyphTreesImg, beacon: glyphBeaconImg, lattice: glyphLatticeImg, blade: glyphBladeImg, blades: glyphBladesImg, shard: glyphShardImg, coil: glyphCoilImg };
const grimoireGlyphImg = (g: GrimoireGlyph): string | null => g.imageUrl ?? (g.assetKey ? GRIMOIRE_BUNDLED[g.assetKey] ?? null : null);
const ENGINE_LABELS: Record<string, string> = {
  seal: "Seal engine — an edge-wall that stops strikes and answers them",
  engine: "Engine engine — sings energy each round, brightens its tender's workings",
  standard: "Standard engine — an edge-banner that strengthens strikes beside it",
  trees: "Trees engine — a living edge-wall that takes blows and regrows",
  beacon: "Beacon engine — an edge-light that strengthens strikes against the dark near it",
  lattice: "Lattice engine — a floor-rune that pins everything on its hex",
  blade: "Blade engine — a floor-rune that harms everything on its hex, more than once",
  blades: "Blades engine — floor-runes planted on several hexes at once",
  shard: "Shard engine — a floor-rune that waits for great power, then falls on the whole hex",
  coil: "Coil engine — a floor-rune that throws the dark back and returns energy",
  heal: "Heal engine — the mending art (amount is the Tender's heal tier, by law)",
  none: "Not yet seated — the spell is named and numbered in the book, but no referee runs it yet",
};

function SpellEditor({ spell, glyphs, saving, onSave, onDelete, onClose }: {
  spell: GrimoireSpell | null;
  glyphs: GrimoireGlyph[];
  saving: boolean;
  onSave: (input: GrimoireSpellInput) => void;
  onDelete: (key: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(spell?.name ?? "");
  const [kind, setKind] = useState<GrimoireSpellKind>(spell?.kind ?? "rune");
  const [engine, setEngine] = useState(spell?.engine ?? "none");
  const [cost, setCost] = useState(spell?.cost ?? 2);
  const [blurb, setBlurb] = useState(spell?.blurb ?? "");
  const [glyphId, setGlyphId] = useState<string | null>(spell?.glyphId ?? null);
  const [numbers, setNumbers] = useState<Record<string, number>>(spell?.numbers ?? {});
  const [forms, setForms] = useState<Record<string, string>>(spell?.forms ?? {});
  const fields = GRIMOIRE_ENGINE_FIELDS[engine] ?? [];
  const pickEngine = (e: string) => {
    setEngine(e);
    const seeded: Record<string, number> = {};
    for (const f of GRIMOIRE_ENGINE_FIELDS[e] ?? []) seeded[f.key] = numbers[f.key] ?? f.def;
    setNumbers(seeded);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,4,2,.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div className="workspace-card" style={{ maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3>{spell ? `📖 ${spell.name}` : "📖 A new spell"}</h3>
        <p className="quiet">What you save here is live in the world: the Table's referee and the territory map read this book. A standing working keeps the numbers it was cast with — the next cast takes the new page.</p>
        <div style={{ display: "grid", gap: 10 }}>
          <label>Name <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Amber Brand" /></label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>Sort&nbsp;
              <select value={kind} onChange={(e) => setKind(e.target.value as GrimoireSpellKind)}>
                <option value="ward">Ward (stands on an edge)</option>
                <option value="rune">Rune (written on the ground)</option>
                <option value="binding">Binding (covers a hex / mends)</option>
                <option value="spell">Spell (cast)</option>
              </select>
            </label>
            <label>Cost ⚡ <input type="number" min={0} max={99} value={cost} onChange={(e) => setCost(Math.max(0, Math.min(99, Number(e.target.value) || 0)))} style={{ width: 70 }} /></label>
            <label>Its glyph&nbsp;
              <select value={glyphId ?? ""} onChange={(e) => setGlyphId(e.target.value || null)}>
                <option value="">— none yet —</option>
                {glyphs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          </div>
          <label>Engine — the mechanic this spell runs<br />
            <select value={engine} onChange={(e) => pickEngine(e.target.value)} style={{ width: "100%" }}>
              {Object.keys(GRIMOIRE_ENGINE_FIELDS).map((e) => <option key={e} value={e}>{ENGINE_LABELS[e] ?? e}</option>)}
            </select>
          </label>
          {fields.length > 0 && (
            <fieldset style={{ border: "1px solid rgba(184,155,94,.4)", borderRadius: 8, padding: "10px 12px" }}>
              <legend>Its numbers</legend>
              <div style={{ display: "grid", gap: 8 }}>
                {fields.map((f) => (
                  <label key={f.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <span>{f.label}</span>
                    <input type="number" min={0} max={999} value={numbers[f.key] ?? f.def} onChange={(e) => setNumbers({ ...numbers, [f.key]: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })} style={{ width: 80 }} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {engine === "heal" && <p className="quiet">Heal carries no numbers of its own: the amount mended is the Tender's heal tier (5 × tier), by standing law. The book holds only its price.</p>}
          {engine === "none" && <p className="quiet">A spell with no engine is written in the book — named, priced, numbered — but no referee runs it yet. Give it an engine when its mechanic should live in the world.</p>}
          <label>What it does (shown on its card)<br />
            <textarea value={blurb} maxLength={600} rows={3} onChange={(e) => setBlurb(e.target.value)} style={{ width: "100%" }} placeholder="Describe the working as its card should speak it…" />
          </label>
          <fieldset style={{ border: "1px solid rgba(184,155,94,.4)", borderRadius: 8, padding: "10px 12px" }}>
            <legend>Its names by hue (the pour names the casting)</legend>
            <div style={{ display: "grid", gap: 6 }}>
              {GRIMOIRE_HUES.map((h) => (
                <label key={h} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <span style={{ textTransform: "capitalize" }}>{h}</span>
                  <input type="text" value={forms[h] ?? ""} maxLength={120} onChange={(e) => setForms({ ...forms, [h]: e.target.value })} placeholder={name || "Its name in this hue"} style={{ flex: 1 }} />
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={saving || !name.trim()} onClick={() => onSave({ key: spell?.key, name: name.trim(), kind, engine, glyphId, cost, blurb, numbers, forms })}>{saving ? "Saving…" : spell ? "Save the page" : "Write it in the book"}</button>
              <button onClick={onClose}>Close</button>
            </div>
            {spell && <button disabled={saving} onClick={() => { if (confirm(`Tear “${spell.name}” out of the book? Its casts will be refused everywhere.`)) onDelete(spell.key); }}>Tear out this spell</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function GrimoireSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["grimoire"], queryFn: () => api.getGrimoire() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["grimoire"] });
  const [glyphName, setGlyphName] = useState("");
  const glyphFileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<GrimoireSpell | "new" | null>(null);
  const err = (e: any) => alert(e?.message || "The book refused that.");
  const sortM = useMutation({ mutationFn: (a: { glyphId: string; sort: GrimoireGlyphSort }) => api.setGlyphSort(a), onSuccess: refresh, onError: err });
  const assignM = useMutation({ mutationFn: (a: { glyphId: string; spellKey: string | null }) => api.setGlyphSpell(a), onSuccess: refresh, onError: err });
  const delGlyphM = useMutation({ mutationFn: (glyphId: string) => api.deleteGrimoireGlyph({ glyphId }), onSuccess: refresh, onError: err });
  const uploadM = useMutation({ mutationFn: (a: { name: string; imageBase64: string }) => api.uploadGrimoireGlyph(a), onSuccess: () => { setGlyphName(""); refresh(); }, onError: err });
  const upsertM = useMutation({ mutationFn: (spell: GrimoireSpellInput) => api.upsertGrimoireSpell({ spell }), onSuccess: () => { setEditing(null); refresh(); }, onError: err });
  const delSpellM = useMutation({ mutationFn: (key: string) => api.deleteGrimoireSpell({ key }), onSuccess: () => { setEditing(null); refresh(); }, onError: err });
  const onGlyphFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "").split(",")[1] || "";
      uploadM.mutate({ name: glyphName.trim() || file.name.replace(/\.png$/i, ""), imageBase64: base64 });
    };
    reader.readAsDataURL(file);
  };
  const spells = data?.spells ?? [];
  const glyphs = data?.glyphs ?? [];
  const spellName = (key: string | null) => spells.find((sp) => sp.key === key)?.name ?? "—";
  const SORTS: { v: GrimoireGlyphSort; label: string }[] = [
    { v: "ward", label: "Ward" }, { v: "rune", label: "Rune" }, { v: "binding", label: "Binding" }, { v: "spell", label: "Spell" }, { v: "unsorted", label: "Unsorted" },
  ];
  return (
    <div className="workspace-grid">
      <div className="workspace-card wide">
        <h3>📖 The Grimoire — glyphs</h3>
        <p className="quiet">Every glyph image in the book. <strong>Sort</strong> each one — ward, rune, binding, or spell — and <strong>assign</strong> it to the spell whose face it is. Upload new glyph art as PNGs with transparent ground; the Written Light is drawn in one colour so a hue can dress it. The book's own glyphs can be re-sorted and reassigned but never torn out.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
          {glyphs.map((g) => {
            const img = grimoireGlyphImg(g);
            return (
              <div key={g.id} style={{ border: "1px solid rgba(184,155,94,.35)", borderRadius: 10, padding: 10, background: "rgba(0,0,0,.25)" }}>
                <div style={{ height: 92, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 45%, rgba(255,217,138,.10), rgba(0,0,0,.35))", borderRadius: 8 }}>
                  {img ? <img src={img} alt={g.name} style={{ maxHeight: 84, maxWidth: "82%", objectFit: "contain" }} /> : <span style={{ fontSize: 30, color: "#ffd98a" }}>✦</span>}
                </div>
                <div style={{ marginTop: 8 }}><strong>{g.name}</strong>{g.builtin ? <small> · of the Written Light</small> : <small> · your upload</small>}</div>
                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                  <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>Sort
                    <select value={g.sort} disabled={sortM.isPending} onChange={(e) => sortM.mutate({ glyphId: g.id, sort: e.target.value as GrimoireGlyphSort })}>
                      {SORTS.map((so) => <option key={so.v} value={so.v}>{so.label}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>Spell
                    <select value={g.spellKey ?? ""} disabled={assignM.isPending} onChange={(e) => assignM.mutate({ glyphId: g.id, spellKey: e.target.value || null })}>
                      <option value="">— unassigned —</option>
                      {spells.map((sp) => <option key={sp.key} value={sp.key}>{sp.name}</option>)}
                    </select>
                  </label>
                  {!g.builtin && <button disabled={delGlyphM.isPending} onClick={() => { if (confirm(`Remove the glyph “${g.name}” from the book?`)) delGlyphM.mutate(g.id); }}>Remove glyph</button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="stat-rows" style={{ borderTop: "1px solid rgba(184,155,94,.35)", paddingTop: 10, marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label>Glyph name <input type="text" value={glyphName} maxLength={80} onChange={(e) => setGlyphName(e.target.value)} placeholder="e.g. The Amber Brand" /></label>
          <input ref={glyphFileRef} type="file" accept="image/png" style={{ display: "none" }} onChange={(e) => { onGlyphFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button disabled={uploadM.isPending} onClick={() => glyphFileRef.current?.click()}>{uploadM.isPending ? "Adding…" : "＋ Add glyph art (PNG)"}</button>
        </div>
      </div>

      <div className="workspace-card wide">
        <h3>📖 The Grimoire — spells</h3>
        <p className="quiet">The workings of the Written Light, and every spell written since. Tap a spell to open its page: its price, its engine, and <strong>its numbers</strong> — tuned here, they are law at the Table and on the territory map by the next cast. The remaining five glyphs of the fifteen, when they arrive, take their places as new pages.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {spells.map((sp) => {
            const g = glyphs.find((x) => x.id === sp.glyphId);
            const img = g ? grimoireGlyphImg(g) : null;
            return (
              <button key={sp.key} onClick={() => setEditing(sp)} style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", padding: "8px 12px" }}>
                {img ? <img src={img} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} /> : <span style={{ fontSize: 24, width: 40, textAlign: "center" }}>✦</span>}
                <span style={{ flex: 1 }}>
                  <strong>{sp.name}</strong> <small>· {sp.kind} · ⚡{sp.cost}{sp.engine === "none" ? " · not yet seated" : ""}</small><br />
                  <small>{sp.blurb}</small>
                </span>
                <span>{spellName(sp.key) === sp.name ? "✎" : ""}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setEditing("new")}>＋ Write a new spell</button>
        </div>
      </div>

      {editing && (
        <SpellEditor
          spell={editing === "new" ? null : editing}
          glyphs={glyphs}
          saving={upsertM.isPending || delSpellM.isPending}
          onSave={(input) => upsertM.mutate(input)}
          onDelete={(key) => delSpellM.mutate(key)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/** THE STARWRIGHT (2026-10-18) — the Ancient One re-writes the
 *  stars: the whole Skill Zodiac on one wheel, clickable.
 *  Edit a star's words, numbers and effect clauses; drag it to
 *  a new place in the sky; add new stars; lay and cut roads.
 *  Every save is live in the game at once. */
const STAR_SECTORS: Record<string, string> = {
  heart: "#e8b4b8", warden: "#9fb6c9", binder: "#c3aef0", runewright: "#a8c9a1",
  lore: "#d9b26a", warground: "#d97b6a", wake: "#f0e2a0", voice: "#a0d8e8",
  land: "#9ac98f", law: "#c9c9d9", grove: "#7fc97f", music: "#e8a0c9", weather: "#8fb6e8",
};
function starR(n: ZodiacGraphNode): number {
  return n.kind === "center" ? 15 : n.kind === "crown" ? 9 : n.kind === "keystone" ? 8 : n.kind === "notable" ? 7 : 5;
}
function StarwrightSection() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["zodiacGraph"], queryFn: () => api.getZodiacGraph(), staleTime: 0 });
  const [mode, setMode] = useState<"edit" | "roads">("edit");
  const [draft, setDraft] = useState<ZodiacGraphNode | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [roadFrom, setRoadFrom] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragId = useRef<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["zodiacGraph"] }); void qc.invalidateQueries({ queryKey: ["skillTree"] }); };
  const err = (e: any) => setMsg(e?.message ?? "The wheel refused.");
  const saveM = useMutation({
    mutationFn: (node: ZodiacGraphNode) => api.saveZodiacNode({ node }),
    onSuccess: (r) => { setDraft(r.node); setIsNew(false); setMsg(`✦ ${r.node.name} is written.`); refresh(); },
    onError: err,
  });
  const delM = useMutation({
    mutationFn: (id: string) => api.deleteZodiacNode({ id }),
    onSuccess: (r) => { setDraft(null); setConfirmDel(false); setMsg(`The star is unwritten — ${r.removedEdges} road${r.removedEdges === 1 ? "" : "s"} went with it, and no Tender holds it now.`); refresh(); },
    onError: err,
  });
  const edgeM = useMutation({
    mutationFn: (a: { a: string; b: string; cut: boolean }) => a.cut ? api.deleteZodiacEdge({ a: a.a, b: a.b }) : api.addZodiacEdge({ a: a.a, b: a.b }),
    onSuccess: () => refresh(),
    onError: err,
  });
  const resetM = useMutation({
    mutationFn: () => api.resetZodiacGraph(),
    onSuccess: () => { setDraft(null); setConfirmReset(false); setMsg("The wheel stands as it was first written."); refresh(); },
    onError: err,
  });
  if (!data) return <div className="workspace-card wide"><h3>✦ The Starwright</h3><p className="quiet">Reading the sky…</p></div>;
  const graph = data.graph;
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const palette = data.palette;
  const sectors = [...new Set(graph.nodes.map(n => n.sector))].sort();
  const edgeKey = (a: string, b: string) => [a, b].sort().join("|");
  const edgeSet = new Set(graph.edges.map(([a, b]) => edgeKey(a, b)));
  const toLocal = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 360, y: 360 };
    return { x: Math.max(0, Math.min(720, (e.clientX - rect.left) * (720 / rect.width))), y: Math.max(0, Math.min(720, (e.clientY - rect.top) * (720 / rect.height))) };
  };
  const selectNode = (n: ZodiacGraphNode) => { setDraft({ ...n, fx: n.fx.map(c => ({ ...c })) }); setIsNew(false); setConfirmDel(false); };
  const onNodeTap = (n: ZodiacGraphNode) => {
    if (mode === "roads") {
      if (!roadFrom) { setRoadFrom(n.id); setMsg(`Road from ${n.name} — tap the star it should reach.`); return; }
      if (roadFrom === n.id) { setRoadFrom(null); return; }
      const cut = edgeSet.has(edgeKey(roadFrom, n.id));
      edgeM.mutate({ a: roadFrom, b: n.id, cut });
      setMsg(cut ? `The road between ${byId.get(roadFrom)?.name} and ${n.name} is cut.` : `A road now joins ${byId.get(roadFrom)?.name} and ${n.name}.`);
      setRoadFrom(null);
      return;
    }
    selectNode(n);
  };
  const newStar = () => {
    let i = 1; while (byId.has(`star_${i}`)) i++;
    const node: ZodiacGraphNode = {
      id: `star_${i}`, name: "A New Star", kind: "minor", sector: "heart", x: 360, y: 300,
      effect: "", syn: "", el: null, att: 0, pool: "tree", cost: 1, gate: null, requires: [], anyCore: false, fx: [],
    };
    setDraft(node); setIsNew(true); setMode("edit"); setMsg("A new star, unwritten — name it, place it, give it its clauses, then Write it. Road it to the wheel in Roads mode once it stands.");
  };
  const setFx = (at: number, clause: ZodiacFxClause) => {
    if (!draft) return;
    const fx = draft.fx.map((c, i) => i === at ? clause : c);
    setDraft({ ...draft, fx });
  };
  return (
    <div className="workspace-grid">
      <div className="workspace-card wide">
        <h3>✦ The Starwright — re-write the stars</h3>
        <p className="quiet">The whole wheel, as the game now reads it. Every save is live at once — no push, no deploy. A star's <strong>effect clauses</strong> are its true mechanics: the game sums them over what a Tender holds. Its <em>effect text</em> is what the player reads — keep the two telling the same story.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button className={mode === "edit" ? "abtn primary" : "abtn"} onClick={() => { setMode("edit"); setRoadFrom(null); }}>✎ Edit stars</button>
          <button className={mode === "roads" ? "abtn primary" : "abtn"} onClick={() => { setMode("roads"); setMsg("Roads mode: tap one star, then another, to lay or cut the road between them. Tap a road itself to cut it."); }}>🛤️ Roads</button>
          <button className="abtn" onClick={newStar}>✦ Add a star</button>
          {!confirmReset
            ? <button className="abtn" onClick={() => setConfirmReset(true)}>Restore the first writing</button>
            : <button className="abtn danger" onClick={() => resetM.mutate()}>Truly restore? Every edit is lost.</button>}
        </div>
        {msg && <p className="notice-line">{msg}</p>}
        <svg ref={svgRef} viewBox="0 0 720 720" style={{ width: "100%", maxWidth: 720, display: "block", background: "radial-gradient(circle at 50% 50%, #171a29 0%, #0b0d16 70%)", borderRadius: 12, touchAction: "none" }}
          onPointerMove={(e) => {
            if (!dragId.current || !draft || draft.id !== dragId.current) return;
            const p = toLocal(e);
            setDraft({ ...draft, x: Math.round(p.x), y: Math.round(p.y) });
          }}
          onPointerUp={() => { if (dragId.current && draft && draft.id === dragId.current && !isNew) saveM.mutate(draft); dragId.current = null; }}
        >
          {graph.edges.map(([a, b], i) => {
            const na = byId.get(a), nb = byId.get(b);
            if (!na || !nb) return null;
            return (
              <g key={i}>
                <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="transparent" strokeWidth={14} style={{ cursor: mode === "roads" ? "pointer" : "default" }}
                  onClick={() => { if (mode === "roads") { edgeM.mutate({ a, b, cut: true }); setMsg(`The road between ${na.name} and ${nb.name} is cut.`); } }} />
                <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="#4a5170" strokeWidth={1.2} pointerEvents="none" />
              </g>
            );
          })}
          {graph.nodes.map(n => {
            const isSel = draft?.id === n.id;
            const isFrom = roadFrom === n.id;
            return (
              <g key={n.id} style={{ cursor: "pointer" }}
                onPointerDown={(e) => { if (mode === "edit") { selectNode(n); dragId.current = n.id; (e.target as Element).setPointerCapture?.(e.pointerId); } }}
                onClick={() => onNodeTap(n)}
              >
                <circle cx={n.x} cy={n.y} r={starR(n) + 6} fill="transparent" />
                <circle cx={n.x} cy={n.y} r={starR(n)} fill={STAR_SECTORS[n.sector] ?? "#9aa3b8"} stroke={isFrom ? "#ffd76a" : isSel ? "#fff" : "#0b0d16"} strokeWidth={isSel || isFrom ? 2.5 : 1} opacity={0.92} />
                {n.kind === "center" && <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={13} fill="#14161f" pointerEvents="none">♥</text>}
              </g>
            );
          })}
          {draft && isNew && <circle cx={draft.x} cy={draft.y} r={10} fill="none" stroke="#ffd76a" strokeDasharray="3 3" pointerEvents="none" />}
        </svg>
        <p className="quiet">{graph.nodes.length} stars · {graph.edges.length} roads. {mode === "edit" ? "Tap a star to edit it; drag it to move it (it saves when you let go)." : "Tap two stars to lay or cut their road; tap a road to cut it."}</p>
      </div>
      {draft && (
        <div className="workspace-card wide">
          <h3>{isNew ? "✦ A new star" : `✎ ${draft.name}`}</h3>
          {data.bespoke.includes(draft.id) && <p className="notice-line">This star also carries Keeper-wired workings in the game's code — its clauses add their numbers on top; the workings themselves change only by the Keeper's hand.</p>}
          <div className="stat-rows">
            <label>Id {isNew ? "(choose well — the ledger knows it by this)" : "(fixed)"}<input value={draft.id} disabled={!isNew} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} /></label>
            <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Kind
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                {["minor", "notable", "keystone", "element", "crown", "center"].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label>Sector<input value={draft.sector} list="star-sectors" onChange={(e) => setDraft({ ...draft, sector: e.target.value })} /><datalist id="star-sectors">{sectors.map(s => <option key={s} value={s} />)}</datalist></label>
            <label>Pool
              <select value={draft.pool} onChange={(e) => setDraft({ ...draft, pool: e.target.value as "tree" | "canopy" })}>
                <option value="tree">tree</option><option value="canopy">canopy</option>
              </select>
            </label>
            <label>Cost (points)<input type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} /></label>
            <label>Element
              <select value={draft.el ?? ""} onChange={(e) => setDraft({ ...draft, el: e.target.value || null })}>
                <option value="">— none —</option>{["tide", "sky", "stone", "root", "fire"].map(el => <option key={el} value={el}>{el}</option>)}
              </select>
            </label>
            <label>X<input type="number" value={Math.round(draft.x)} onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })} /></label>
            <label>Y<input type="number" value={Math.round(draft.y)} onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })} /></label>
            <label>Gate element
              <select value={draft.gate?.el ?? ""} onChange={(e) => setDraft({ ...draft, gate: e.target.value ? { el: e.target.value, level: draft.gate?.level ?? 1 } : null })}>
                <option value="">— no gate —</option>{["tide", "sky", "stone", "root", "fire"].map(el => <option key={el} value={el}>{el}</option>)}
              </select>
            </label>
            <label>Gate level<input type="number" min={0} max={3} value={draft.gate?.level ?? 1} disabled={!draft.gate} onChange={(e) => draft.gate && setDraft({ ...draft, gate: { ...draft.gate, level: Number(e.target.value) } })} /></label>
            <label>Needs a heart-ring star first (anyCore)<input type="checkbox" checked={draft.anyCore} onChange={(e) => setDraft({ ...draft, anyCore: e.target.checked })} /></label>
          </div>
          <label style={{ display: "block", marginTop: 8 }}>Requires first (comma-separated star ids)<input style={{ width: "100%" }} value={draft.requires.join(", ")} onChange={(e) => setDraft({ ...draft, requires: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></label>
          <label style={{ display: "block", marginTop: 8 }}>Effect — what the player reads<textarea style={{ width: "100%", minHeight: 54 }} value={draft.effect} onChange={(e) => setDraft({ ...draft, effect: e.target.value })} /></label>
          <label style={{ display: "block", marginTop: 8 }}>Synergy note<textarea style={{ width: "100%", minHeight: 40 }} value={draft.syn} onChange={(e) => setDraft({ ...draft, syn: e.target.value })} /></label>
          <h4 style={{ marginTop: 14 }}>Effect clauses — the star's true mechanics</h4>
          {draft.fx.map((c, i) => {
            const spec = palette.find(p => p.verb === c.verb);
            return (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                <select value={c.verb} onChange={(e) => setFx(i, { ...c, verb: e.target.value })}>
                  {palette.map(p => <option key={p.verb} value={p.verb}>{p.label}</option>)}
                </select>
                {spec?.hasElement && (
                  <select value={c.el ?? "stone"} onChange={(e) => setFx(i, { ...c, el: e.target.value })}>
                    {["tide", "sky", "stone", "root", "fire"].map(el => <option key={el} value={el}>{el}</option>)}
                  </select>
                )}
                <input type="number" style={{ width: 80 }} value={c.amount} onChange={(e) => setFx(i, { ...c, amount: Number(e.target.value) })} />
                <small className="quiet" style={{ flex: 1, minWidth: 160 }}>{spec?.hint}</small>
                <button className="abtn small" onClick={() => setDraft({ ...draft, fx: draft.fx.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            );
          })}
          <button className="abtn small" onClick={() => setDraft({ ...draft, fx: [...draft.fx, { verb: "tenderHp", amount: 1, el: null }] })}>+ Add an effect clause</button>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="abtn primary" disabled={saveM.isPending} onClick={() => saveM.mutate(draft)}>{isNew ? "✦ Write this star" : "Save this star"}</button>
            {!isNew && draft.id !== "heart" && (!confirmDel
              ? <button className="abtn" onClick={() => setConfirmDel(true)}>Unwrite this star</button>
              : <button className="abtn danger" onClick={() => delM.mutate(draft.id)}>Truly unwrite it? Its roads go too, and no Tender holds it.</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [compSyncPayload, setCompSyncPayload] = useState<any | null>(null);
  const [compSyncName, setCompSyncName] = useState("");
  const [compSyncMsg, setCompSyncMsg] = useState<string | null>(null);
  const [doorNote, setDoorNote] = useState<string | null>(null);
  const compSyncFileRef = useRef<HTMLInputElement>(null);

  const pickCompSyncFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCompSyncMsg(null);
    setCompSyncPayload(null);
    setCompSyncName("");
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || parsed.complete !== true || !Array.isArray(parsed.entries) || !Array.isArray(parsed.classes)) {
        setCompSyncMsg("That file is not a Compendium roll — ask the Keeper to prepare a fresh one.");
        return;
      }
      setCompSyncPayload(parsed);
      setCompSyncName(file.name);
    } catch {
      setCompSyncMsg("That file could not be read as a Compendium roll.");
    }
    if (compSyncFileRef.current) compSyncFileRef.current.value = "";
  };

  const applyCompSync = async () => {
    if (!compSyncPayload) return;
    setCompSaving(true);
    setCompSyncMsg(null);
    try {
      const r: any = await api.call("importCompendium", compSyncPayload);
      setCompSyncMsg(`Synced: ${r.total} entries — ${r.added} added, ${r.updated} updated, ${r.removed} removed.`);
      setCompSyncPayload(null);
      setCompSyncName("");
      await loadCompendium();
    } catch (e) {
      setCompSyncMsg(e instanceof Error ? e.message : "The sync failed.");
    }
    setCompSaving(false);
  };
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
        {(["enemies", "buildings", "terrain", "timers", "awakening", "elements", "table", "compendium", "border", "grimoire", "starwright"] as Section[]).map(s => (
          <button key={s} className={section === s ? "active" : ""} onClick={() => setSection(s)}>
            {s === "enemies" ? "👹 Enemies" : s === "buildings" ? "🏗️ Buildings" : s === "terrain" ? "🗺️ Terrain" : s === "timers" ? "⏱️ Timers" : s === "awakening" ? "✨ Awakening" : s === "elements" ? "🌿 Elements" : s === "table" ? "🎲 Discord Table" : s === "compendium" ? "📖 Compendium" : s === "grimoire" ? "📖 Grimoire" : s === "starwright" ? "✦ Starwright" : "🖼️ Card Border"}
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

      {section === "border" && <CardBorderSection />}
      {section === "grimoire" && <GrimoireSection />}
      {section === "starwright" && <StarwrightSection />}

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
          <p className="quiet" style={{ marginTop: 0 }}>
            🚪 <strong>The door switch</strong> (handshake audit, 2026-10-16) — while the Table's launch
            is being diagnosed, the Discord door can open the bare Control instrument instead of the
            room: it does nothing but knock and listen, one knock variant per launch. Point the door
            back at the Table when the diagnosis is done.
            <span style={{ display: "inline-flex", gap: 8, marginLeft: 10 }}>
              <button className="abtn small" onClick={async () => { try { await api.call("setUiConfig", { key: "table.doorMode", value: "table" }); setDoorNote("The door now opens the Table."); } catch { setDoorNote("The switch did not save — is the workshop unlocked?"); } }}>Door → the Table</button>
              <button className="abtn small" onClick={async () => { try { await api.call("setUiConfig", { key: "table.doorMode", value: "control" }); setDoorNote("The door now opens the Control instrument."); } catch { setDoorNote("The switch did not save — is the workshop unlocked?"); } }}>Door → the Control</button>
            </span>
            {doorNote && <span style={{ marginLeft: 10 }}>{doorNote}</span>}
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
              compendium"</em> in chat and the Keeper reads the app and brings you its roll as a small
              file — apply it with the sync panel below and this page is brought up to the app exactly:
              new entries arrive, changed ones update, ones the app no longer holds are removed. The
              last hop runs through your unlocked workshop because the game's writes are gated — the
              Keeper never holds your workshop key. Edits made on this page are local, and a sync will
              overwrite them. Sprites are not stored on an entry — an entry's slot key points at the
              workshop's Table slots, so art uploaded here (or in the Discord Table section) shows on
              the entry; the canon four wear the live art from the Enemies section.
            </p>
            <div className="workspace-card" style={{ marginBottom: 16 }}>
              <h3 style={{ textTransform: "none" }}>🔄 Sync from the Compendium app</h3>
              <p className="quiet" style={{ margin: "0 0 8px" }}>
                Pick the roll file the Keeper prepared from the app, then apply it. The app wins:
                this page becomes its exact mirror.
              </p>
              <input ref={compSyncFileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={pickCompSyncFile} />
              <div className="comp-form-actions">
                <button className="swap-btn" onClick={() => compSyncFileRef.current?.click()}>Choose roll file…</button>
                <button className="upload-btn" disabled={!compSyncPayload || compSaving} onClick={applyCompSync}>
                  {compSaving ? "..." : "Apply sync"}
                </button>
                {compSyncName && <span className="quiet" style={{ alignSelf: "center" }}>{compSyncName}</span>}
              </div>
              {compSyncMsg && <p className="comp-text" style={{ marginTop: 8 }}>{compSyncMsg}</p>}
            </div>
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
