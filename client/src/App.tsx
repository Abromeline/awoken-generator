import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { setCourtMarks, useCourtMarks } from "./courtMarks";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import deckButtonImg from "./assets/terrain-mountain.png";
import debrisDark from "./assets/debris-dark.jpg";
import { DecksView } from "./Decks";
import Territory from "./Territory";
import MarginGuide from "./MarginGuide";
import WelcomePacket, { AcornButton } from "./WelcomePacket";
import wakeSlotBg from "./assets/wake-slot.png";
import wakeReadyBg from "./assets/wake-ready.png";
import gatherWakesBg from "./assets/gather-wakes.png";

/** Load uploaded awakening sprites from UI Workspace (overrides bundled). */
function useAwakeningSprites() {
  const [sprites, setSprites] = useState<Record<string, string>>({});
  useEffect(() => {
    api.call("listUiSprites", {}).then((r: any) => {
      const map: Record<string, string> = {};
      for (const s of (r.sprites || [])) {
        if (s.category === "awakening") {
          // Use the most recent upload for each name
          map[s.name] = s.url;
        }
      }
      setSprites(map);
    }).catch(() => {});
  }, []);
  return {
    wakeSlot: sprites["wake-slot"] || wakeSlotBg,
    wakeReady: sprites["wake-ready"] || wakeReadyBg,
    gatherWakes: sprites["gather-wakes"] || gatherWakesBg,
  };
}
import { fileToBase64, SafeAreaTopScrim } from "./sdk-compat";
import UIWorkspace from "./UIWorkspace";
import { api, clearTenderToken, clearWorkshopToken, storeTenderToken, storeWorkshopToken, tenderToken as storedTenderToken, workshopToken as storedWorkshopToken, type Asset, type Awakened, type AwokenStory, type Category, type CreditInfo, type LayerRef, type Rarity, type TenderInfo, type TenderLeaderboardEntry, type WaitingAwoken, type WelcomeStatus } from "./api";
import { toPng } from "html-to-image";
import MusicLibrary from "./MusicLibrary";
import { ElementGlyph } from "./glyphs";
import { applyElementPalette, elementPalette, useElementPalette } from "./palette";
import { BUNDLED_TERRAIN, TERRAIN_ART_ELEMENTS, TERRAIN_ART_QUERY_KEY, useTerrainArt } from "./terrainArt";

export type Awoken = Awakened;
type Face = "tender" | "workshop";
type WorkshopView = "wake" | "pool" | "terrain" | "collection" | "compendium" | "tenders" | "tracks" | "ui-workspace" | "glyphs" | "text-colors" | "feedback" | "voice";
type LayerAsset = { sourceId: string; serverId?: number; name: string; category: Category; rarity: Rarity; power: number | null; toughness: number | null; imageUrl: string; mimeType: string; isStarter: boolean };
type BatchStatus = "checking" | "ready" | "invalid" | "uploading" | "done" | "error";
type BatchFile = { id: string; file: File; previewUrl: string; status: BatchStatus; note: string };

const categories: { id: Category; label: string; note: string }[] = [
  { id: "background", label: "Background", note: "the world beneath" },
  { id: "body", label: "Body", note: "the held matter" },
  { id: "arms", label: "Arms", note: "reach and gesture" },
  { id: "aspect", label: "Aspect", note: "elemental manifestation" },
  { id: "head", label: "Head", note: "the final waking layer" },
];
const statCategories: Category[] = ["arms", "body", "head"];
const rarityLabel: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic" };
const rarityWeight: Record<Rarity, number> = { common: 8, uncommon: 4, rare: 2, mythic: 1 };
const firstbornWeight: Record<Rarity, number> = { common: 2, uncommon: 4, rare: 6, mythic: 4 };
const rarityScore: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, mythic: 4 };
const statValues = [0, 1, 2, 3] as const;

const TEMPLATE_WIDTH = 750;
const TEMPLATE_HEIGHT = 971;
function mutationError(error: unknown) { return error instanceof Error ? error.message : "Something interrupted the ritual."; }
/** A 403 from a Tender-gated action means the visitor has not claimed
 * an account yet (fix list #7: claim-first is the front door). Tender-
 * face surfaces route it to the claim gate with a friendly word
 * instead of surfacing the server's refusal text. */
function isClaimGateError(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403;
}
const CLAIM_GATE_NOTE = "The Awoken are waiting — but the waking is for Tenders. Choose your name and a password, and the ritual opens: your first twenty wakes, and the one who has been waiting for you.";
/** Both studio queries go stale together — the tender deck and the workshop compendium. */
function invalidateStudios(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["studio"] });
  void queryClient.invalidateQueries({ queryKey: ["workshopStudio"] });
}
function toLayerAssets(serverAssets: Asset[]): LayerAsset[] {
  return serverAssets.map((asset) => ({ sourceId: `db:${asset.id}`, serverId: asset.id, name: asset.name, category: asset.category, rarity: asset.rarity, power: asset.power, toughness: asset.toughness, element: asset.element ?? null, imageUrl: asset.image_url, mimeType: asset.mime_type, isStarter: false }));
}
function chooseWeighted(options: LayerAsset[], lucky = false) {
  const weights = lucky ? firstbornWeight : rarityWeight;
  const total = options.reduce((sum, item) => sum + weights[item.rarity], 0); let cursor = Math.random() * total;
  for (const item of options) { cursor -= weights[item.rarity]; if (cursor <= 0) return item; }
  return options[options.length - 1];
}
/** Gather one piece per layer, weighted by rarity (or fixed choices in the workshop). */
/* Fire aspects are map-exclusive: only from wildfire sparks, never
   from wakes. Whether a piece IS fire is judged by its filed element
   (the Elements tab) alone — never by its name. A name-guessing
   helper that once lived here was removed under that law
   (Nigel, 2026-10-16); wakes exclude every aspect regardless. */

function pickLayerSet(assets: LayerAsset[], choices?: Record<Category, string>, lucky = false): LayerAsset[] {
  return categories.flatMap((category) => {
    // Awoken are not born with aspects — those are earned later through binding
    if (category.id === "aspect") return [];
    let options = assets.filter((asset) => asset.category === category.id);
    if (!options.length) return [];
    const fixed = choices?.[category.id] ? options.find((asset) => asset.sourceId === choices[category.id]) : undefined;
    const picked = fixed ?? chooseWeighted(options, lucky);
    return picked ? [picked] : [];
  });
}
function canWake(assets: LayerAsset[]) {
  return statCategories.every((category) => assets.some((asset) => asset.category === category));
}
function toLayerRefs(layers: LayerAsset[]): LayerRef[] {
  return layers.map((layer) => ({ source_id: layer.sourceId, name: layer.name, category: layer.category, rarity: layer.rarity, power: layer.power, toughness: layer.toughness }));
}
/** Static, gentle countdown text — no ticking timers, no nags. */
function inAbout(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "very soon";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60); const rest = minutes % 60;
  return rest ? `in about ${hours}h ${rest}m` : `in about ${hours} hour${hours === 1 ? "" : "s"}`;
}
function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = () => reject(new Error("One of the selected drawings could not be read.")); image.src = src; }); }
function canvasToPng(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This device could not prepare the transparent PNG.")), "image/png")); }
async function preparePng(file: File) {
  const header = new Uint8Array(await file.slice(0, 33).arrayBuffer()); const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => header[index] === byte) || header.length < 26) return { ok: false as const, note: "Not a true PNG file." };
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength); const width = view.getUint32(16); const height = view.getUint32(20);
  if (width === 750 && height === 971) return { ok: true as const, file, note: "750 × 971 PNG · transparency intact" };
  if (width !== 2550 || height !== 3300) return { ok: false as const, note: `${width} × ${height} — use 750 × 971 or 2550 × 3300.` };
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url); const canvas = document.createElement("canvas"); canvas.width = 750; canvas.height = 971;
    const context = canvas.getContext("2d"); if (!context) throw new Error("This device could not prepare the shared canvas.");
    const scale = Math.min(750 / width, 971 / height); const drawWidth = width * scale; const drawHeight = height * scale;
    context.drawImage(image, (750 - drawWidth) / 2, (971 - drawHeight) / 2, drawWidth, drawHeight);
    const blob = await canvasToPng(canvas);
    return { ok: true as const, file: new File([blob], file.name, { type: "image/png", lastModified: file.lastModified }), note: "2550 × 3300 PNG · fitted to the shared canvas" };
  } finally { URL.revokeObjectURL(url); }
}
/** Terrain stage art intake check — the same truth test the server runs
 *  (true PNG signature, the shared 1920 × 1280 canvas), so a wrong file is
 *  answered here before the upload rather than after it. The server
 *  remains the judge; this only saves the trip. */
async function checkTerrainPng(file: File) {
  const header = new Uint8Array(await file.slice(0, 33).arrayBuffer()); const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (header.length < 26 || !signature.every((byte, index) => header[index] === byte)) return { ok: false as const, note: "Not a true PNG file." };
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength); const width = view.getUint32(16); const height = view.getUint32(20);
  if (width !== 1920 || height !== 1280) return { ok: false as const, note: `${width} × ${height} — terrain art uses the shared 1920 × 1280 canvas, like the tiles you provided.` };
  return { ok: true as const, note: "1920 × 1280 PNG" };
}
/** Back-to-front draw order, per the artist: background, body, arms, head.
 *  "aura" keeps its slot for legacy compositions only (fix list #9) —
 *  old Awoken bearing an aura layer still draw it between arms and
 *  head; no new aura piece can be filed or chosen. */
const LAYER_ORDER: readonly string[] = ["background", "aspect", "body", "arms", "aura", "head"];
async function compose(layers: LayerAsset[], target?: HTMLCanvasElement | null) {
  const canvas = target ?? document.createElement("canvas"); canvas.width = TEMPLATE_WIDTH; canvas.height = TEMPLATE_HEIGHT;
  const context = canvas.getContext("2d"); if (!context) throw new Error("This device could not prepare the awakening canvas.");
  const ranked = layers.filter((layer) => layer.power !== null && layer.toughness !== null);
  const score = ranked.reduce((sum, layer) => sum + rarityScore[layer.rarity], 0); const min = ranked.length; const max = ranked.length * 4;
  const auraOpacity = 1 / 3 + (max === min ? 0 : (score - min) / (max - min)) * (2 / 3);
  // Draw back-to-front in the artist's order, never in whatever order the
  // caller happened to pass. Preload every image before drawing so layers
  // never pop in piecemeal and get buried by a late arrival.
  const ordered = [...layers].sort((a, b) => LAYER_ORDER.indexOf(a.category) - LAYER_ORDER.indexOf(b.category));
  const images = await Promise.all(ordered.map((layer) => loadImage(layer.imageUrl)));
  context.fillStyle = "#f3f1ea"; context.fillRect(0, 0, 750, 971);
  ordered.forEach((layer, index) => {
    const image = images[index]; context.globalCompositeOperation = layer.category === "background" || layer.mimeType === "image/png" ? "source-over" : "multiply";
    // Legacy aura layers (fix list #9) still fade in by rarity, exactly
    // as before — the category is read as a runtime string here so old
    // compositions keep rendering even though "aura" is no longer a
    // choosable Category.
    const layerCategory: string = layer.category;
    context.globalAlpha = layerCategory === "aura" ? auraOpacity : 1; context.drawImage(image, 0, 0, 750, 971);
  });
  context.globalCompositeOperation = "source-over"; context.globalAlpha = 1;
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
function ordinal(iteration: number) {
  if (iteration === 0) return "First manifestation";
  if (iteration === 1) return "1st repeat";
  if (iteration === 2) return "2nd repeat";
  const mod10 = iteration % 10; const mod100 = iteration % 100; const suffix = mod10 === 1 && mod100 !== 11 ? "st" : mod10 === 2 && mod100 !== 12 ? "nd" : mod10 === 3 && mod100 !== 13 ? "rd" : "th";
  return `${iteration}${suffix} iteration`;
}

function toRoman(num: number): string {
  const map: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let result = "";
  for (const [val, sym] of map) { while (num >= val) { result += sym; num -= val; } }
  return result || "I";
}

export type Element = "tide" | "sky" | "stone" | "root" | "fire";
export function elementForPiece(_name: string, dbElement?: string | null): Element | "neutral" {
  // THE LAW (Nigel, 2026-10-15): a part's element comes from the
  // part's own record — the element the server stamps from the asset
  // — NEVER from keywords in its name. The name-guessing that once
  // lived here (and defaulted everything unrecognized to root) is
  // abolished. A part with no recorded element is "neutral": it
  // contributes nothing, and surfaces must say so honestly.
  if (dbElement && ["tide", "sky", "stone", "root", "fire"].includes(dbElement)) {
    return dbElement as Element;
  }
  return "neutral";
}

export const cornerPaths: Record<Element, string[]> = {
  tide: ["M4 18 A16 16 0 0 1 18 4", "M4 27 A25 25 0 0 1 27 4", "M4 36 A34 34 0 0 1 36 4"],
  sky: ["M10 24 C10 15 19 9 28 12 C35 14 38 22 34 28 C31 33 23 34 19 29 C16 25 19 19 24 19 C28 19 30 24 27 27"],
  stone: ["M4 40 L14 16 L22 28 L30 10 L40 24", "M14 16 L18 22 L14 28 L10 22 Z", "M30 10 L33 15 L30 20 L27 15 Z"],
  root: ["M4 40 C4 24 10 12 22 8 C30 5 38 6 41 10", "M41 10 c-3 -4 -9 -4 -12 -1 c-2.5 2.5 -2 7 1 8.5 c2.4 1.2 5.5 -0.3 5.4 -3 c-0.1 -2.2 -2.8 -3.4 -4.6 -2.2", "M10 34 C14 32 18 32 21 34 C19 36 15 36 13 34 Z"],
  fire: ["M22 6 C22 6 11 21 11 29 A11 11 0 0 0 33 29 C33 21 22 6 22 6 Z"],
};
/** The canonical element palette lives in ./palette (theme-driven: the
 *  stored UI theme overrides the scheme defaults on boot). This alias is
 *  the same live record, so reads at render time always see current colors. */
export const elementColors: Record<Element, string> = elementPalette;

export function Corner({ element, className }: { element: Element; className: string }) {
  return <svg className={className} viewBox="0 0 44 44" fill="none" stroke={elementColors[element]} strokeWidth="1.1" strokeLinecap="round" aria-hidden="true">
    {cornerPaths[element].map((d, i) => <path key={i} d={d} />)}
  </svg>;
}

function creatureRarity(power: number): string {
  if (power <= 4) return "Common";
  if (power <= 6) return "Uncommon";
  if (power <= 8) return "Rare";
  return "Mythic";
}

export function TradingCard({ item, allowDelete = false }: { item: Awoken; allowDelete?: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({ mutationFn: () => api.deleteAwoken({ id: item.id }), onSuccess: () => invalidateStudios(queryClient) });
  const roman = toRoman(item.id);
  const litany = item.layers.filter((layer) => statCategories.includes(layer.category));
  const elements = litany.map((layer) => elementForPiece(layer.name, (layer as any).element)).filter((el): el is Element => el !== "neutral");
  const unique = [...new Set(elements)];
  const corners: Element[] = [0, 1, 2, 3].map((i) => unique[i % unique.length] ?? "root");
  const [tl, tr, bl, br] = corners;
  const stories = item.story_count ?? 0;
  const court = useCourtMarks();
  const courtClass = item.collection === "tender"
    ? court.championId === item.id ? " court-champion" : court.housedIds.has(item.id) ? " court-housed" : ""
    : "";
  return <article className={`trading-card${courtClass}`} aria-label={`${item.name}, power ${item.power}, toughness ${item.toughness}`}>
    <Corner element={tl} className="tcorner tl" />
    <Corner element={tr} className="tcorner tr" />
    <Corner element={bl} className="tcorner bl" />
    <Corner element={br} className="tcorner br" />
    <div className="tc-banner">{roman}</div>
    <div className="tc-title">{item.owner_name} · {creatureRarity(item.base_power)}</div>
    <div className="tc-art">
      <img src={item.image_url} alt={`${item.name}, a layered ink-wash Awoken`} />
      <div className="tc-pips"><span className="tc-pip">⚔{item.power}</span><span className="tc-pip">🛡{item.toughness}</span></div>
      {item.iteration > 0 && <span className="tc-iteration">{ordinal(item.iteration)}</span>}
    </div>
    <div className="tc-pieces">{litany.map((layer) => <div key={`${item.id}-${layer.category}`}>{layer.name}</div>)}</div>
    <div className="tc-stories" title={`${stories} of 3 stories shared`}>{"●".repeat(stories)}{"○".repeat(3 - stories)}</div>
    <div className="tc-watermark" aria-hidden="true">{roman}</div>
    {allowDelete && (
      <button
        className="tc-delete"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
            remove.mutate();
          }
        }}
        disabled={remove.isPending}
        title="Delete this Awoken"
      >
        ×
      </button>
    )}
  </article>;
}

/** The telling spot (Nigel's ruling, 2026-10-15): a Tender tells stories
 *  to their own Awoken, here on the creature itself. Stories stay personal
 *  unless the Tender chooses to send one to Discord — the Voice carries it
 *  with a true image of the card, rendered from the living card itself. */
function StoryTell({ item }: { item: Awoken }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const storiesQuery = useQuery({ queryKey: ["awokenStories", item.id], queryFn: () => api.getAwokenStories({ id: item.id }) });
  const tell = useMutation({
    mutationFn: () => api.shareStory({ id: item.id, story: draft.trim() }),
    onSuccess: () => { setDraft(""); setNotice(null); void queryClient.invalidateQueries({ queryKey: ["awokenStories", item.id] }); invalidateStudios(queryClient); },
    onError: (error) => setNotice(mutationError(error)),
  });
  async function sendToDiscord(storyId: number) {
    const node = stageRef.current;
    if (!node) { setNotice("The card could not be gathered for the sending."); return; }
    setSendingId(storyId); setNotice(null);
    try {
      const dataUrl = await toPng(node, { pixelRatio: 2 });
      const cardPngBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      await api.sendStoryToDiscord({ storyId, cardPngBase64 });
      void queryClient.invalidateQueries({ queryKey: ["awokenStories", item.id] });
    } catch (error) { setNotice(mutationError(error)); }
    finally { setSendingId(null); }
  }
  const stories: AwokenStory[] = storiesQuery.data?.stories ?? [];
  const full = stories.length >= 3 || (item.story_count ?? 0) >= 3;
  return <section className="story-tell" aria-label={`Stories told to ${item.name}`}>
    <header><span>Stories</span><small>told to {item.name} — personal, kept here unless you send one on</small></header>
    {storiesQuery.data?.nextPrompt && <div className="story-prompt"><span className="story-prompt-label">{storiesQuery.data.nextThread && storiesQuery.data.nextChapter ? `Its seed · ${storiesQuery.data.nextThread} · Chapter ${["I", "II", "III"][storiesQuery.data.nextChapter - 1]}` : "Its seed — begin here"}</span><p>{storiesQuery.data.nextPrompt}</p></div>}
    {storiesQuery.isPending && <p className="quiet">Gathering the tellings…</p>}
    {storiesQuery.isError && <p className="quiet">{mutationError(storiesQuery.error)}</p>}
    {stories.map((story) => <div className="story-entry" key={story.id}>
      <blockquote>{story.storyText}</blockquote>
      <div className="story-entry-foot">
        <time>{new Date(story.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
        {story.sentAt
          ? <span className="story-sent">Sent to Discord · {new Date(story.sentAt).toLocaleDateString([], { dateStyle: "medium" })}</span>
          : <button type="button" className="story-send" disabled={sendingId !== null} onClick={() => void sendToDiscord(story.id)}>{sendingId === story.id ? "The Voice is carrying it…" : "Send to Discord"}</button>}
      </div>
    </div>)}
    {!full
      ? <form className="story-form" onSubmit={(event) => { event.preventDefault(); if (draft.trim().length >= 100) tell.mutate(); }}>
          <label htmlFor={`story-${item.id}`}>Tell {item.name} a story</label>
          <textarea id={`story-${item.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} rows={5} maxLength={2000} placeholder="A real telling — 100 to 2,000 characters. Each story strengthens this Awoken, +1/+1, up to three." />
          <div className="story-form-foot"><span>{draft.trim().length} / 2,000{draft.trim().length < 100 ? ` · ${100 - draft.trim().length} more to a telling` : ""}</span><button type="submit" disabled={tell.isPending || draft.trim().length < 100}>{tell.isPending ? "Telling…" : "Tell it"}</button></div>
        </form>
      : <p className="quiet">This Awoken is full of stories — three tellings, held close.</p>}
    {notice && <p className="notice error" role="status">{notice}</p>}
    <div className="story-card-stage" aria-hidden="true"><div ref={stageRef}><TradingCard item={item} /></div></div>
  </section>;
}

function CreatureCard({ item, allowDelete = false, storyteller = false }: { item: Awoken; allowDelete?: boolean; storyteller?: boolean }) {
  const queryClient = useQueryClient(); const [editing, setEditing] = useState(false); const [name, setName] = useState(item.name);
  const spend = useMutation({ mutationFn: (stat: "power" | "toughness") => api.assignStatPoint({ awakenedId: item.id, stat }), onSuccess: () => invalidateStudios(queryClient), onError: (e: any) => alert(e?.message || "That Awoken is not yours to grow.") });
  const rename = useMutation({ mutationFn: () => api.renameAwoken({ id: item.id, name }), onSuccess: () => { setEditing(false); invalidateStudios(queryClient); } });
  const remove = useMutation({ mutationFn: () => api.deleteAwoken({ id: item.id }), onSuccess: () => invalidateStudios(queryClient) });
  const litany = item.layers.filter((layer) => statCategories.includes(layer.category));
  const powerParts = litany.map((layer) => layer.power ?? 0).join(" + "); const toughnessParts = litany.map((layer) => layer.toughness ?? 0).join(" + ");
  return <article className="creature-card">
    <div className="creature-image"><img src={item.image_url} alt={`${item.name}, a layered ink-wash Awoken`} />{item.iteration > 0 && <span className="iteration-mark">{ordinal(item.iteration)}</span>}</div>
    <div className="creature-copy">
      <div className="creature-heading">
        {editing ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) rename.mutate(); }}><label htmlFor={`awoken-name-${item.id}`}>Name this Awoken</label><input id={`awoken-name-${item.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} /><div><button disabled={!name.trim() || rename.isPending}>Keep this name</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div></form> : <button className="name-button" onClick={() => setEditing(true)}>{item.name}</button>}
        <span className="owner-line">Held by {item.owner_name} · {item.collection === "tender" ? "Tender collection" : "Workshop collection"}</span>
      </div>
      <blockquote>{item.flavor_text}</blockquote>
      <div className="total-stats"><div><span>Power</span><strong>{item.power}</strong></div><i aria-hidden="true" /><div><span>Toughness</span><strong>{item.toughness}</strong></div></div>
      {item.empowerment > 0 && <p className="empowerment"><strong>Shared awakening +{item.empowerment}/+{item.empowerment}</strong><span>Every copy of this form has grown stronger.</span></p>}
      {((item.spent_power ?? 0) > 0 || (item.spent_toughness ?? 0) > 0) && <p className="empowerment"><strong>Growth +{item.spent_power ?? 0}/+{item.spent_toughness ?? 0}</strong><span>Levels made flesh — stat points spent into this Awoken, permanent in every battle.</span></p>}
      {(item.stat_points ?? 0) > 0 && <div className="growth-spend"><span>{item.stat_points} stat point{(item.stat_points ?? 0) > 1 ? "s" : ""} waiting — growth is a choice:</span><button disabled={spend.isPending} onClick={() => spend.mutate("power")}>+1 Power</button><button disabled={spend.isPending} onClick={() => spend.mutate("toughness")}>+1 Toughness</button></div>}
      <section className="litany" aria-label="Stat litany"><header><span>The stat litany</span><small>the parts become the whole</small></header>{litany.map((layer) => <div className="litany-row" key={`${item.id}-${layer.category}`}><span>{layer.category}</span><strong>{layer.name}</strong><b>{layer.power}/{layer.toughness}</b></div>)}
        <div className="arithmetic"><span>Power</span><strong>{powerParts || "0"}{item.empowerment ? ` + ${item.empowerment} blessing` : ""}{item.bonus_power ? ` + ${item.bonus_power} gifts` : ""} = {item.power}</strong><span>Toughness</span><strong>{toughnessParts || "0"}{item.empowerment ? ` + ${item.empowerment} blessing` : ""}{item.bonus_toughness ? ` + ${item.bonus_toughness} gifts` : ""} = {item.toughness}</strong></div>
      </section>
      <div className="card-foot"><span>{ordinal(item.iteration)}</span><time>{new Date(item.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div>
      {allowDelete && <button className="release-button" onClick={() => remove.mutate()} disabled={remove.isPending}>Release from collection</button>}
      {storyteller && <StoryTell item={item} />}
    </div>
  </article>;
}

function TenderRank() {
  const { data } = useQuery({
    queryKey: ["tenderRank"],
    queryFn: () => api.getTenderRank(),
    refetchInterval: 60000,
  });
  if (!data || !data.ok) return null;
  return (
    <div className="tender-rank">
      <span className="rank-badge">#{data.myRank}</span>
      <span className="rank-count">{data.myCount} Awoken</span>
      <div className="rank-nearby">
        {data.nearby.map(n => (
          <div key={n.rank} className={`rank-row ${n.isMe ? "me" : ""}`}>
            <span>#{n.rank}</span>
            <span>{n.name}</span>
            <span>{n.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type CeremonyPhase = "idle" | "crystal" | "flare" | "grow" | "settled";

function WakeRitual({ assets, collection, ownerName, manual, onSaved, onNeedClaim, credits, freeWakeAvailable, nextFreeWakeAt, waitingFree, isFirstAwoken, creatorGifts, signedIn, items }: { assets: LayerAsset[]; collection: "tender" | "workshop"; ownerName: string; manual: boolean; onSaved: (id: number) => void; onNeedClaim?: () => void; credits: CreditInfo | null; freeWakeAvailable?: boolean; nextFreeWakeAt?: string | null; waitingFree?: WaitingAwoken | null; isFirstAwoken?: boolean; creatorGifts?: number; signedIn?: boolean; items?: Awoken[] }) {
  const queryClient = useQueryClient();
  const [giftDismissed, setGiftDismissed] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemFailed, setRedeemFailed] = useState(false);
  useEffect(() => { setGiftDismissed(false); }, [creatorGifts]);
  async function dismissGift() {
    setGiftDismissed(true);
    try { await api.ackCreatorGifts(); } catch { /* hidden locally either way */ }
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
  }
  async function redeemGift() {
    const code = redeemCode.trim();
    if (!code) return;
    try {
      await api.redeemWakeCode({ code });
      setRedeemCode("");
      setRedeemFailed(false);
      setRedeemMsg("...another seed grows");
      void queryClient.invalidateQueries({ queryKey: ["studio"] });
    } catch (e) {
      setRedeemFailed(true);
      setRedeemMsg(mutationError(e));
    }
  }
  const awakening = useAwakeningSprites();
  const canvasRef = useRef<HTMLCanvasElement>(null); const [choices, setChoices] = useState<Record<Category, string>>({ background: "", arms: "", body: "", aspect: "", head: "" });
  const [composition, setComposition] = useState<LayerAsset[]>([]); const [notice, setNotice] = useState("The scattered matter waits.");
  const [freeBusy, setFreeBusy] = useState(false);
  // The id of the waiting free creature whose form currently fills the
  // canvas, if any — so the spark can present it without fighting a form
  // the Tender woke themselves.
  const sparkFormRef = useRef<number | null>(null);
  const [, setSparkTick] = useState(0);
  // "Crystal into the Spark" — the wake ceremony (tender face only). A
  // vibrant crystal dwindles into the spark (~2s), the spark flares and
  // dims (~2.5s), the new form grows out of that point (~3.5s) into a
  // quiet breathing loop; then the form's full card takes shape in the
  // same spot on its own. Two taps a wake: one to wake, one to Keep.
  // Tapping the canvas mid-ceremony skips to the settled breath.
  const [ceremony, setCeremony] = useState<CeremonyPhase>("idle");
  const [cardId, setCardId] = useState<number | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  // Armed when a card should form on its own once its data lands: a
  // session wake (at the settled breath) or a spark-claimed waiting
  // creature (once the claimed form joins the deck payload).
  const [wantCard, setWantCard] = useState(false);
  // The waiting payload of a free wake gathered this session, captured
  // from the claim/re-weave responses so its card can form before the
  // welcome payload catches up.
  const [sessionWaiting, setSessionWaiting] = useState<WaitingAwoken | null>(null);
  const ceremonyTimers = useRef<number[]>([]);
  function clearCeremonyTimers() { ceremonyTimers.current.forEach((t) => window.clearTimeout(t)); ceremonyTimers.current = []; }
  function ceremonyLater(ms: number, fn: () => void) { ceremonyTimers.current.push(window.setTimeout(fn, ms)); }
  // The card's own ceremony, once it forms over the spark: Drift In —
  // the card's elements glide in from outside the frame (~2.6s) — then
  // the corner burn: the body, arms and head pieces' glyphs and the
  // power/toughness kindle into the card's four corners one by one in
  // their elemental colors (~1.9s each, ~8s), and the finished card
  // keeps their soft elemental glow. Phases are timer-driven (never
  // animation events), so Keep always arrives; a tap on the stage
  // during either act skips straight to the finished card.
  const [cardPhase, setCardPhase] = useState<"forming" | "burning" | "done">("forming");
  const cardTimers = useRef<number[]>([]);
  function clearCardTimers() { cardTimers.current.forEach((t) => window.clearTimeout(t)); cardTimers.current = []; }
  function cardLater(ms: number, fn: () => void) { cardTimers.current.push(window.setTimeout(fn, ms)); }
  function finishCardCeremony() { clearCardTimers(); setCardPhase("done"); }
  function startCeremony() {
    if (collection !== "tender") return;
    clearCeremonyTimers();
    clearCardTimers();
    setCardPhase("forming");
    setCardOpen(false);
    setCardId(null);
    setSessionWaiting(null);
    setWantCard(true);
    setCeremony("crystal");
    ceremonyLater(2300, () => setCeremony("flare"));
    ceremonyLater(3600, () => setCeremony("grow"));
    ceremonyLater(7100, () => setCeremony("settled"));
  }
  function abortCeremony() { clearCeremonyTimers(); clearCardTimers(); setCeremony("idle"); setCardOpen(false); setWantCard(false); }
  function skipCeremony() {
    if (ceremony === "crystal" || ceremony === "flare" || ceremony === "grow") { clearCeremonyTimers(); setCeremony("settled"); }
    if (cardOpen && cardPhase !== "done") finishCardCeremony();
  }
  // A lone grow beat — the re-presentation of a re-woven free wake.
  function startGrowBeat() {
    clearCeremonyTimers();
    setCeremony("grow");
    ceremonyLater(3500, () => setCeremony("settled"));
  }
  // Keep (or a claim made from the card) concludes the moment: the card
  // closes and the stage resets to the clean spark — the single door.
  function concludeMoment() {
    const concludedId = cardId;
    clearCeremonyTimers();
    clearCardTimers();
    setCardOpen(false);
    setWantCard(false);
    setCardId(null);
    setSessionWaiting(null);
    // Remember the concluded form so a lagging welcome payload cannot
    // re-plant it on the canvas while its claim settles server-side.
    sparkFormRef.current = concludedId;
    setComposition([]);
    setCeremony("idle");
    // The compose effect leaves the last form on the bitmap when the
    // composition empties — wipe it so the spark stands clean again.
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }
  // Dismissing an unclaimed waiting creature's card leaves it waiting —
  // the spark-claim row below stays its door.
  function dismissWaitingCard() { clearCardTimers(); setCardOpen(false); setWantCard(false); }
  useEffect(() => () => { clearCeremonyTimers(); clearCardTimers(); }, []);
  const save = useMutation({ mutationFn: async (layers: LayerAsset[]) => api.saveAwoken({ layers: toLayerRefs(layers), imageBase64: await compose(layers), collection, ownerName }), onSuccess: (data) => { setNotice(data.iteration > 0 ? `${ordinal(data.iteration)}. Every matching Awoken received +${data.empowerment}/+${data.empowerment}.` : "A new form has crossed over."); if (collection === "tender") setCardId(data.id); onSaved(data.id); }, onError: (error) => { abortCeremony(); if (collection === "tender" && isClaimGateError(error)) onNeedClaim?.(); } });
  const checkout = useMutation({ mutationFn: () => api.createCheckoutSession(), onSuccess: (data) => { window.location.href = data.url; }, onError: (error) => { if (isClaimGateError(error) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(error)); } });
  const vesselEmpty = credits !== null && credits.balance <= 0;
  function onWakeButton() { if (vesselEmpty) { if (credits?.checkoutEnabled) checkout.mutate(); else setNotice("Wakes are gathered in packs — payments are not configured yet."); return; } wakeOne(); }
  useEffect(() => {
    if (!composition.length) return; let cancelled = false;
    void compose(composition, canvasRef.current).catch((error: unknown) => { if (!cancelled) setNotice(mutationError(error)); });
    return () => { cancelled = true; };
  }, [composition]);
  function setChoice(category: Category, sourceId: string) { setChoices((current) => ({ ...current, [category]: sourceId })); }
  function wakeOne() {
    const missing = statCategories.filter((category) => !assets.some((asset) => asset.category === category));
    if (missing.length) { setNotice(`The ${missing.join(", ")} pool must hold at least one piece before a form can wake.`); return; }
    const next = pickLayerSet(assets, manual ? choices : undefined, isFirstAwoken);
    sparkFormRef.current = null;
    startCeremony();
    setComposition(next); setNotice("Matter gathers. The binding holds…"); save.mutate(next);
  }
  // The spark is the only door to the free wake. A gathered free creature
  // waits at the spark: its form fills the canvas so it is seen and claimed
  // where it woke — never in a box elsewhere on the page.
  useEffect(() => {
    const waiting = waitingFree?.awakened;
    if (!waiting) return;
    if (sparkFormRef.current === waiting.id) return;
    if (composition.length && sparkFormRef.current === null) return; // the Tender's own woken form holds the canvas
    const layers = waiting.layers
      .map((ref) => assets.find((asset) => asset.sourceId === ref.source_id))
      .filter((asset): asset is LayerAsset => !!asset);
    if (!layers.length) return;
    sparkFormRef.current = waiting.id;
    setComposition(layers);
    setCardId(waiting.id);
  }, [waitingFree, assets, composition.length]);
  // While the next free wake gathers, keep the spark's countdown honest.
  useEffect(() => {
    if (collection !== "tender" || freeWakeAvailable || !nextFreeWakeAt || composition.length) return;
    const timer = setInterval(() => setSparkTick((n) => n + 1), 60000);
    return () => clearInterval(timer);
  }, [collection, freeWakeAvailable, nextFreeWakeAt, composition.length]);
  async function wakeFreeAtSpark() {
    if (freeBusy) return;
    setFreeBusy(true);
    startCeremony();
    try {
      const layers = pickLayerSet(assets);
      const data = await api.claimFreeWake({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
      sparkFormRef.current = data.awakened?.id ?? null;
      setCardId(data.awakened?.id ?? null);
      setSessionWaiting({ awakened: data.awakened, respinsUsed: data.respinsUsed, respinsRemaining: data.respinsRemaining });
      setComposition(layers);
      setNotice("A free wake has gathered — it waits at the spark, yours to claim.");
      onSaved(0);
    } catch (e) { abortCeremony(); if (isClaimGateError(e) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(e)); }
    finally { setFreeBusy(false); }
  }
  // Claiming the waiting free creature. From its card, the claim concludes
  // the moment (the stage resets to the clean spark); from the spark-claim
  // row, the claim arms the card, which forms once the form lands in the
  // deck payload — its Keep then concludes.
  async function claimWaitingFree(fromCard: boolean) {
    const waiting = waitingFree?.awakened ?? sessionWaiting?.awakened;
    if (!waiting || freeBusy) return;
    setFreeBusy(true);
    try {
      const data = await api.claimWelcome({ slot: "free" });
      setNotice(`${waiting.name} has joined your deck.`);
      onSaved(data.awakenedId);
      if (fromCard) concludeMoment();
      else { setCardId(data.awakenedId); setWantCard(true); }
    } catch (e) { if (isClaimGateError(e) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(e)); }
    finally { setFreeBusy(false); }
  }
  // Re-weaving the waiting free creature. From its card, the card closes,
  // the new form grows out of the spark, and the card re-forms around it;
  // from the row, the form simply re-gathers on the canvas, as before.
  async function reconstituteWaitingFree(fromCard: boolean) {
    if ((!waitingFree?.awakened && !sessionWaiting?.awakened) || freeBusy) return;
    if (!canWake(assets)) { setNotice("The pools are still gathering matter — the first pieces have not arrived yet."); return; }
    setFreeBusy(true);
    try {
      const layers = pickLayerSet(assets);
      const data = await api.reconstituteWelcome({ slot: "free", layers: toLayerRefs(layers), imageBase64: await compose(layers) });
      sparkFormRef.current = data.awakened?.id ?? null;
      setCardId(data.awakened?.id ?? null);
      setSessionWaiting({ awakened: data.awakened, respinsUsed: data.respinsUsed, respinsRemaining: data.respinsRemaining });
      setComposition(layers);
      setNotice("The matter re-gathers into a new form.");
      void queryClient.invalidateQueries({ queryKey: ["welcome"] });
      if (fromCard) { setCardOpen(false); setWantCard(true); startGrowBeat(); }
    } catch (e) { if (isClaimGateError(e) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(e)); }
    finally { setFreeBusy(false); }
  }
  // The card resolves the just-woken creature from the studio items App
  // passes in — or, while a free wake still waits unclaimed, from the
  // waiting payload. Until one of them lands, the card holds off: never
  // a wrong card, never an empty one.
  const cardItem = cardId !== null ? (items ?? []).find((item) => item.id === cardId) : undefined;
  const waitingCard = cardId !== null && !cardItem
    ? (waitingFree?.awakened?.id === cardId ? waitingFree : sessionWaiting?.awakened?.id === cardId ? sessionWaiting : null)
    : null;
  const presentedItem = cardItem ?? waitingCard?.awakened ?? null;
  // The two-taps heart: when a card is armed and its creature has landed,
  // the card forms on its own — at the settled breath for a session wake,
  // or as soon as the claimed form joins the deck after a row claim.
  useEffect(() => {
    if (collection !== "tender" || !wantCard || cardOpen) return;
    if (ceremony !== "settled" && ceremony !== "idle") return;
    if (presentedItem) setCardOpen(true);
  }, [collection, wantCard, cardOpen, ceremony, presentedItem]);
  // Drive the card ceremony while the card stands: Drift In (2.6s),
  // then the corner burn (4 corners, ~8.2s), then the finished card
  // with its actions. Timer-driven throughout — if anything stalls,
  // the final timer still lands and Keep appears.
  useEffect(() => {
    if (!cardOpen) { clearCardTimers(); setCardPhase("forming"); return; }
    setCardPhase("forming");
    cardLater(2600, () => setCardPhase("burning"));
    cardLater(2600 + 8200, () => setCardPhase("done"));
    return () => clearCardTimers();
  }, [cardOpen]);
  // The corner burn reads the presented creature's pieces: top-left the
  // body's element, top-right the arms', bottom-left the head's — each
  // from the part's own recorded element, never its name (Nigel,
  // 2026-10-15). A part with no recorded element kindles no corner.
  // Bottom-right is the power/toughness.
  const burnElement = (category: Category): Element | null => {
    const layer = presentedItem?.layers.find((l) => l.category === category);
    if (!layer) return null;
    const el = elementForPiece(layer.name, (layer as any).element);
    return el === "neutral" ? null : el;
  };
  const burnBody = burnElement("body");
  const burnArms = burnElement("arms");
  const burnHead = burnElement("head");
  const ceremonyActive = ceremony === "crystal" || ceremony === "flare" || ceremony === "grow";
  const canvasClass = collection !== "tender" ? "" : ceremony === "crystal" || ceremony === "flare" ? "ceremony-form-hidden" : ceremony === "grow" ? "ceremony-form-born" : ceremony === "settled" ? "awoken-breathing" : sparkFormRef.current !== null && composition.length ? "awoken-breathing" : "";
  return <section className={`ritual ${manual ? "workshop-ritual" : ""}`}>
    {creatorGifts !== undefined && creatorGifts > 0 && !giftDismissed && (
      <p className="notice creator-gift" role="status">
        ...another seed grows{creatorGifts > 1 ? ` ×${creatorGifts}` : ""}{" "}
        <button type="button" className="quiet-link" aria-label="Dismiss gift notice" onClick={() => void dismissGift()}>✕</button>
      </p>
    )}
    <div className="ritual-copy"><p className="eyebrow">Matter · Binding · Memory</p><h1>Every form begins as scattered matter.</h1><p>Wake what has been waiting between thought and ink.</p><p className="ritual-intro">The Awoken are matter held together by a binding force — each one drawn by hand in ink, shaped by nature and nurture. No two are ever the same.</p></div>
    <div className="ritual-grid"><div className="stage-column"><div className={`canvas-frame ${composition.length ? "has-form" : ""}${cardOpen && presentedItem ? " card-presented" : ""}`} onClick={skipCeremony}><div className="canvas-frame-bg" aria-hidden="true" style={{ backgroundImage: `url(${awakening.wakeSlot})`, backgroundSize: "cover", backgroundPosition: "center" }} /><canvas ref={canvasRef} className={canvasClass || undefined} width={750} height={971} aria-label="Awoken awakening canvas" />{ceremonyActive && <div className="ceremony-dim" aria-hidden="true" />}{(ceremony === "flare" || ceremony === "grow") && <div className="ceremony-flare" aria-hidden="true" />}{ceremony === "crystal" && <img className="ceremony-crystal" src={awakening.wakeReady} alt="" aria-hidden="true" />}{collection === "tender" && freeWakeAvailable && !composition.length && (<button type="button" className="wake-ready-overlay" onClick={() => void wakeFreeAtSpark()} disabled={freeBusy || save.isPending} aria-label="Wake One — a free wake is ready"><img src={awakening.wakeReady} alt="" /><span>Wake One</span><small>a free wake is ready</small></button>)}{collection === "tender" && !freeWakeAvailable && nextFreeWakeAt && !composition.length && (<button type="button" className="wake-ready-overlay" onClick={onWakeButton} disabled={save.isPending || checkout.isPending} aria-label="Wake One"><img src={awakening.wakeReady} alt="" /><span>Wake One</span><small>Next free wake {inAbout(nextFreeWakeAt)}</small></button>)}<span className="canvas-whisper">{composition.length ? "THE BINDING HOLDS" : "SCATTERED MATTER ... ... ... AWOKEN HEART"}</span>{cardOpen && presentedItem && (<div className="ceremony-card-layer"><div className="ceremony-card-backdrop" onClick={cardPhase !== "done" ? finishCardCeremony : waitingCard ? dismissWaitingCard : concludeMoment} /><div className="ceremony-card-wrap ceremony-card-form"><div className="ceremony-card-stage" data-phase={cardPhase}><TradingCard item={presentedItem} />{burnBody && (<span className="ceremony-burn burn-tl" style={{ "--elem": elementColors[burnBody], "--burn-delay": "0s" } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnBody} color={elementColors[burnBody]} dotColor={elementColors[burnBody]} width={54} height={22} /></span>)}{burnArms && (<span className="ceremony-burn burn-tr" style={{ "--elem": elementColors[burnArms], "--burn-delay": "2.05s" } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnArms} color={elementColors[burnArms]} dotColor={elementColors[burnArms]} width={54} height={22} /></span>)}{burnHead && (<span className="ceremony-burn burn-bl" style={{ "--elem": elementColors[burnHead], "--burn-delay": "4.1s" } as CSSProperties} aria-hidden="true"><ElementGlyph element={burnHead} color={elementColors[burnHead]} dotColor={elementColors[burnHead]} width={54} height={22} /></span>)}<span className="ceremony-burn burn-br ceremony-burn-pt" style={{ "--elem": "#d98a4a", "--burn-delay": "6.15s" } as CSSProperties} aria-hidden="true">{presentedItem.power}/{presentedItem.toughness}</span></div>{cardPhase === "done" && (waitingCard ? (<div className="waiting-actions"><button className="wake-button" type="button" onClick={() => void claimWaitingFree(true)} disabled={freeBusy}><span>{freeBusy ? "Joining…" : "Add to deck"}</span><small>joins your deck</small></button>{waitingCard.respinsRemaining > 0 ? <button className="waiting-respin" type="button" onClick={() => void reconstituteWaitingFree(true)} disabled={freeBusy}><span>{freeBusy ? "Reconstituting…" : "Reconstitute matter"}</span><small>one free re-weaving</small></button> : <p className="quiet">The matter has settled into this form.</p>}</div>) : (<button type="button" className="abtn" onClick={concludeMoment}>Keep</button>))}</div></div>)}</div>
      {collection === "tender" && waitingFree?.awakened && (
        <div className="spark-claim">
          <p className="spark-claim-line">✨ {waitingFree.awakened.name} waits at the spark — a free wake, already gathered.</p>
          <div className="waiting-actions">
            <button className="wake-button" type="button" onClick={() => void claimWaitingFree(false)} disabled={freeBusy}><span>{freeBusy ? "Joining…" : "Add to deck"}</span><small>joins your deck</small></button>
            {waitingFree.respinsRemaining > 0
              ? <button className="waiting-respin" type="button" onClick={() => void reconstituteWaitingFree(false)} disabled={freeBusy}><span>{freeBusy ? "Reconstituting…" : "Reconstitute matter"}</span><small>one free re-weaving</small></button>
              : <p className="quiet">The matter has settled into this form.</p>}
          </div>
        </div>
      )}
      {vesselEmpty ? (
        <div className="gather-wakes-row">
          <button className="gather-wakes-btn" type="button" onClick={onWakeButton} disabled={save.isPending || checkout.isPending} aria-label="Gather wakes">
            <img src={awakening.gatherWakes} alt="" />
          </button>
          {credits && <span className="gather-wakes-price">{credits.packPriceLabel} for {credits.creditsPerPack} wakes</span>}
        </div>
      ) : collection === "workshop" ? (
        <button className="wake-button" type="button" onClick={onWakeButton} disabled={save.isPending || checkout.isPending}><span>{save.isPending ? "Waking…" : "Wake One"}</span><small>{manual ? "chosen or weighted" : "let chance gather the form"}</small></button>
      ) : null}
      {credits !== null && <p className="credit-line"><span>{credits.balance > 0 ? `${credits.balance} ${credits.balance === 1 ? "wake" : "wakes"} remaining` : "The vessel is empty."}</span><button type="button" className="credit-more" onClick={() => checkout.mutate()} disabled={checkout.isPending}>{checkout.isPending ? "Opening…" : "Get more wakes"}</button></p>}
      {collection === "tender" && signedIn && (
        <div className="redeem-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <input value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} placeholder="Gift code (WAKE-…)" style={{ maxWidth: 200 }} aria-label="Gift code" />
          <button type="button" className="credit-more" onClick={() => void redeemGift()} disabled={!redeemCode.trim()}>Redeem gift code</button>
          {redeemMsg && <span className={redeemFailed ? "notice error" : "notice"} role="status">{redeemMsg}</span>}
        </div>
      )}
      <p className={`notice ${save.error ? "error" : ""}`} role="status">{save.error ? mutationError(save.error) : notice}</p></div>
      {manual && <aside className="manual-panel"><p className="eyebrow">Workshop hand</p><h2>Choose each mark, or leave it to chance.</h2>{categories.map((category, index) => { const options = assets.filter((asset) => asset.category === category.id); return <label className="layer-control" key={category.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{category.label}</strong><select aria-label={`${category.label} piece`} value={choices[category.id]} onChange={(event) => setChoice(category.id, event.target.value)} disabled={!options.length}><option value="">Weighted chance</option>{options.map((asset) => <option key={asset.sourceId} value={asset.sourceId}>{asset.name}{asset.power !== null ? ` · ${asset.power}/${asset.toughness}` : ""}</option>)}</select></label>; })}<p className="stack-order">Background → aspect → body → arms → head</p></aside>}
    </div>
  </section>;
}

function CollectionView({ items, title, note, allowDelete = false, focusId = null, storyteller = false }: { items: Awoken[]; title: string; note: string; allowDelete?: boolean; focusId?: number | null; storyteller?: boolean }) {
  const [sort, setSort] = useState<"newest" | "power" | "toughness" | "name">("newest");
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = storyteller ? items.find((item) => item.id === selectedId) ?? null : null;
  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const list = (query ? items.filter((item) => item.name.toLowerCase().includes(query)) : [...items]);
    switch (sort) {
      case "power": return list.sort((a, b) => b.power - a.power || b.toughness - a.toughness);
      case "toughness": return list.sort((a, b) => b.toughness - a.toughness || b.power - a.power);
      case "name": return list.sort((a, b) => a.name.localeCompare(b.name));
      default: return list.sort((a, b) => b.id - a.id);
    }
  }, [items, sort, filter]);
  if (!items.length) return <section className="empty-state"><p className="eyebrow">Collection</p><h1>{title}</h1><p>{note}</p></section>;
  return <section className="collection"><header><div><p className="eyebrow">{items.length} awakened</p><h1>{title}</h1></div><p>{note}</p>
    <div className="deck-toolbar"><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort the deck"><option value="newest">Newest</option><option value="power">Power</option><option value="toughness">Toughness</option><option value="name">Name</option></select></label><label>Find<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="a name…" aria-label="Find by name" /></label>{(sort !== "newest" || filter.trim()) && <span className="deck-count">{visible.length} shown</span>}</div></header>{selected && <div className="collection-detail"><button type="button" className="quiet-link" onClick={() => setSelectedId(null)}>Close {selected.name}</button><CreatureCard item={selected} storyteller /></div>}<div className="collection-grid trading">{visible.map((item) => storyteller
      ? <div key={item.id} className="card-tap" role="button" tabIndex={0} aria-label={`Open ${item.name} — tell it a story`} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(item.id); } }}><TradingCard item={item} allowDelete={allowDelete} /></div>
      : <TradingCard key={item.id} item={item} allowDelete={allowDelete} />)}</div></section>;
}

function AspectAssignButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  return (
    <div style={{ margin: "16px 0", padding: 12, border: "1px solid #444", borderRadius: 8 }}>
      <p className="quiet" style={{ marginBottom: 8 }}>
        Give every Awoken without an aspect a random one from the pool.
      </p>
      <button
        className="abtn small"
        disabled={working}
        onClick={async () => {
          if (!confirm("Assign random aspects to all Awoken missing one?")) return;
          setWorking(true);
          try {
            const res = await api.assignRandomAspects();
            setMsg(`Assigned ${res.assigned} of ${res.total} Awoken.`);
          } catch (e) {
            setMsg("Failed: " + (e as Error).message);
          }
          setWorking(false);
          setTimeout(() => setMsg(null), 4000);
        }}
      >
        {working ? "Assigning…" : "✨ Assign random aspects"}
      </button>
      {msg && <p className="notice" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

/** Glyph library: SVG symbols organized by category. */
function GlyphPanel() {
  const [category, setCategory] = useState<"element" | "magic" | "hex" | "buff">("element");
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [svgData, setSvgData] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["glyphs", category],
    queryFn: () => api.listGlyphs({ category }),
  });

  const save = useMutation({
    mutationFn: (v: { id?: number; category: string; name: string; svgData: string }) => api.saveGlyph(v),
    onSuccess: () => {
      setEditing(null); setName(""); setSvgData("");
      queryClient.invalidateQueries({ queryKey: ["glyphs"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteGlyph({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["glyphs"] }),
  });

  const startEdit = (g: { id: number; name: string; svgData: string }) => {
    setEditing(g.id); setName(g.name); setSvgData(g.svgData);
  };
  const startNew = () => {
    setEditing(-1); setName(""); setSvgData('<svg viewBox="0 0 60 24"></svg>');
  };

  const categories = [
    { id: "element" as const, label: "Elements", icon: "≋" },
    { id: "magic" as const, label: "Magic", icon: "✦" },
    { id: "hex" as const, label: "Hexes", icon: "⬡" },
    { id: "buff" as const, label: "Buffs", icon: "▲" },
  ];

  return (
    <section className="pool">
      <header className="pool-header">
        <div><p className="eyebrow">Glyph Library</p><h1>Symbols of power.</h1></div>
        <p>Hand-drawn SVG glyphs used throughout the game. Elements, magic, hexes, buffs — each with its own voice.</p>
      </header>

      <nav className="glyph-cats">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={category === cat.id ? "active" : ""}
            onClick={() => { setCategory(cat.id); setEditing(null); }}
          >
            <span className="glyph-cat-icon">{cat.icon}</span> {cat.label}
          </button>
        ))}
      </nav>

      {isLoading ? <p className="quiet">Loading glyphs…</p> : (
        <div className="glyph-grid">
          {(data?.glyphs ?? []).map(g => (
            <article key={g.id} className="glyph-tile">
              <div className="glyph-preview" dangerouslySetInnerHTML={{ __html: g.svgData }} />
              <div className="glyph-name">{g.name}</div>
              <div className="glyph-actions">
                <button className="abtn small" onClick={() => startEdit(g)}>Edit</button>
                <button className="abtn small danger" onClick={() => { if (confirm(`Delete "${g.name}"?`)) remove.mutate(g.id); }}>Delete</button>
              </div>
            </article>
          ))}
          {(data?.glyphs ?? []).length === 0 && (
            <p className="quiet">No glyphs here yet. Add the first.</p>
          )}
        </div>
      )}

      <button className="abtn" onClick={startNew} style={{ marginTop: 16 }}>+ New Glyph</button>

      {editing !== null && (
        <div className="glyph-editor">
          <h3>{editing === -1 ? "New Glyph" : "Edit Glyph"}</h3>
          <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tide" /></label>
          <label>SVG
            <textarea
              value={svgData}
              onChange={e => setSvgData(e.target.value)}
              rows={8}
              placeholder='<svg viewBox="0 0 60 24">...</svg>'
              style={{ fontFamily: "monospace", fontSize: 12 }}
            />
          </label>
          {svgData && (
            <div>
              <p className="quiet">Preview:</p>
              <div className="glyph-preview large" dangerouslySetInnerHTML={{ __html: svgData }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              className="abtn"
              disabled={!name.trim() || !svgData.trim() || save.isPending}
              onClick={() => save.mutate({
                id: editing === -1 ? undefined : editing,
                category, name: name.trim(), svgData: svgData.trim(),
              })}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button className="abtn small" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function PoolPanel({ assets }: { assets: LayerAsset[] }) {
  const queryClient = useQueryClient(); const inputRef = useRef<HTMLInputElement>(null); const [category, setCategory] = useState<Category>("body"); const [batch, setBatch] = useState<BatchFile[]>([]); const [uploading, setUploading] = useState(false); const [editing, setEditing] = useState<number | null>(null); const [pieceName, setPieceName] = useState("");
  const remove = useMutation({ mutationFn: (id: number) => api.deleteLayerAsset({ id }), onSuccess: () => invalidateStudios(queryClient) });
  const move = useMutation({ mutationFn: (value: { id: number; category: string }) => api.moveLayerAsset(value), onSuccess: () => invalidateStudios(queryClient) });
  const stats = useMutation({ mutationFn: (value: { id: number; power: number; toughness: number }) => api.updateLayerAssetStats(value), onSuccess: () => invalidateStudios(queryClient) });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => api.renameLayerAsset({ id, name }), onSuccess: () => { setEditing(null); invalidateStudios(queryClient); } });
  const setRarity = useMutation({ mutationFn: (value: { id: number; rarity: string }) => api.updateLayerAssetRarity(value), onSuccess: () => invalidateStudios(queryClient) });
  const setElement = useMutation({ mutationFn: (value: { id: number; element: string | null }) => api.updateLayerAssetElement(value), onSuccess: () => invalidateStudios(queryClient) });
  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    batch.forEach((item) => URL.revokeObjectURL(item.previewUrl)); const picked = Array.from(event.target.files ?? []);
    const pending = picked.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), status: "checking" as const, note: "Checking file…" })); setBatch(pending);
    const checked = await Promise.all(pending.map(async (item): Promise<BatchFile> => { try { const result = await preparePng(item.file); if (!result.ok) return { ...item, status: "invalid", note: result.note }; URL.revokeObjectURL(item.previewUrl); return { ...item, file: result.file, previewUrl: URL.createObjectURL(result.file), status: "ready", note: result.note }; } catch { return { ...item, status: "invalid", note: "This file could not be read." }; } })); setBatch(checked);
  }
  function patch(id: string, value: Partial<BatchFile>) { setBatch((current) => current.map((item) => item.id === id ? { ...item, ...value } : item)); }
  async function uploadBatch() {
    const ready = batch.filter((item) => item.status === "ready" || item.status === "error"); if (!ready.length) return; setUploading(true);
    for (const item of ready) { patch(item.id, { status: "uploading", note: "The builder is listening for a name…" }); try { const encoded = await fileToBase64(item.file); const result = await api.uploadLayerAsset({ category, imageBase64: encoded.dataBase64, mimeType: "image/png" }); patch(item.id, { status: "done", note: `${result.name} entered the pool` }); } catch (error) { patch(item.id, { status: "error", note: mutationError(error) }); } }
    setUploading(false); await invalidateStudios(queryClient);
  }
  const pendingCount = batch.filter((item) => item.status === "ready" || item.status === "error").length;
  return <section className="pool"><header className="pool-header"><div><p className="eyebrow">The Layer Pool</p><h1>The matter before it binds.</h1></div><p>Choose a stack of transparent PNGs and mark its layer once. Names arrive in the Awoken voice; every name remains yours to change.</p></header>
    <AspectAssignButton />
    <section className="batch-uploader"><div className="uploader-top"><div><p className="eyebrow">Primordial intake</p><h2>One offering. Many pieces.</h2></div><label className="file-button"><input ref={inputRef} type="file" accept="image/png,.png" multiple onChange={chooseFiles} disabled={uploading} />Choose PNGs</label></div>
      <fieldset><legend>File every piece as</legend><div className="category-picks">{categories.map((item) => <label className={category === item.id ? "selected" : ""} key={item.id}><input type="radio" name="category" checked={category === item.id} onChange={() => setCategory(item.id)} /><strong>{item.label}</strong><small>{item.note}</small></label>)}</div></fieldset>
      {batch.length > 0 && <div className="batch-list">{batch.map((item) => <article className={item.status} key={item.id}><img src={item.previewUrl} alt="Selected transparent PNG" /><div><strong>{item.file.name}</strong><span>{item.note}</span></div></article>)}</div>}
      <button className="upload-button" onClick={() => void uploadBatch()} disabled={!pendingCount || uploading}>{uploading ? "Naming and filing…" : `Add ${pendingCount} to ${categories.find((item) => item.id === category)?.label ?? "pool"}`}</button>
    </section>
    <div className="pool-ledger">
      {(() => {
        const counts: Record<string, number> = { tide: 0, sky: 0, stone: 0, root: 0, fire: 0, auto: 0 };
        for (const a of assets) {
          const el = (a as any).element;
          if (el && counts[el] !== undefined) counts[el]++;
          else counts.auto++;
        }
        return (
          <div className="element-summary">
            <span>🌊 Tide: {counts.tide}</span>
            <span>🌀 Sky: {counts.sky}</span>
            <span>🪨 Stone: {counts.stone}</span>
            <span>🌿 Root: {counts.root}</span>
            <span>🔥 Fire: {counts.fire}</span>
            <span>❓ Unfiled: {counts.auto}</span>
          </div>
        );
      })()}
      {categories.map((layer) => { const items = assets.filter((asset) => asset.category === layer.id); return <section className="pool-group" key={layer.id}><header><h2>{layer.label}</h2><span>{items.length}</span></header>{!items.length ? <p className="quiet">Nothing rests here yet.</p> : <div className="trait-grid">{items.map((asset) => <article className="trait-tile" key={asset.sourceId}><img src={asset.imageUrl} alt={`${asset.name}, ${layer.label.toLowerCase()} layer`} /><div className="trait-copy">
        {asset.serverId && editing === asset.serverId ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (pieceName.trim()) rename.mutate({ id: asset.serverId ?? 0, name: pieceName }); }}><input aria-label={`New name for ${asset.name}`} value={pieceName} onChange={(event) => setPieceName(event.target.value)} autoFocus /><button>Keep</button></form> : <button className="piece-name" disabled={!asset.serverId} onClick={() => { if (asset.serverId) { setEditing(asset.serverId); setPieceName(asset.name); } }}>{asset.name}</button>}
        {asset.serverId ? (
          <label className="rarity-picker"><small>Rarity</small>
            <select aria-label={`Rarity for ${asset.name}`} value={asset.rarity} onChange={(e) => setRarity.mutate({ id: asset.serverId ?? 0, rarity: e.target.value })}>
              {(["common", "uncommon", "rare", "mythic"] as const).map(r => <option key={r} value={r}>{rarityLabel[r]}</option>)}
            </select>
          </label>
        ) : <span>{rarityLabel[asset.rarity]}</span>}
        {asset.serverId && (
          <label className="element-picker"><small>Element</small>
            <select aria-label={`Element for ${asset.name}`} value={(asset as any).element || ""} onChange={(e) => {
              setElement.mutate({ id: asset.serverId ?? 0, element: e.target.value || null });
            }}>
              <option value="">Not filed — counts as no element</option>
              <option value="tide">🌊 Tide</option>
              <option value="sky">🌀 Sky</option>
              <option value="stone">🪨 Stone</option>
              <option value="root">🌿 Root</option>
              <option value="fire">🔥 Fire</option>
            </select>
          </label>
        )}
        {asset.serverId && (asset.category === "aspect" || (asset.power !== null && asset.toughness !== null)) && <div className="stat-editor"><label><small>Power</small><select aria-label={`Power for ${asset.name}`} value={asset.power ?? 1} onChange={(event) => stats.mutate({ id: asset.serverId ?? 0, power: Number(event.target.value), toughness: asset.toughness ?? 1 })}>{statValues.map((value) => <option key={value}>{value}</option>)}</select></label><i>/</i><label><small>Toughness</small><select aria-label={`Toughness for ${asset.name}`} value={asset.toughness ?? 1} onChange={(event) => stats.mutate({ id: asset.serverId ?? 0, power: asset.power ?? 1, toughness: Number(event.target.value) })}>{statValues.map((value) => <option key={value}>{value}</option>)}</select></label></div>}
        {asset.serverId && <button className="remove-piece" onClick={() => remove.mutate(asset.serverId ?? 0)}>Remove</button>}
        {asset.serverId && <label className="move-piece"><small>Move to</small><select aria-label={`Move ${asset.name} to another pool`} value="" onChange={(event) => { if (event.target.value) move.mutate({ id: asset.serverId ?? 0, category: event.target.value }); event.target.value = ""; }}><option value="">Another pool…</option>{categories.filter((item) => item.id !== asset.category).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      </div></article>)}</div>}</section>; })}</div>
  </section>;
}

/** Terrain Stages — the creator's bench for the hex's grown faces
 *  (Nigel, 2026-10-15). Stage 1 is the art bundled with the game and
 *  never changes here; stages 2 and 3 take his uploads, one face per
 *  element, and go live on the map the moment they land. A slot with no
 *  upload shows his provided art greyed as the placeholder it is. */
function TerrainArtPanel() {
  const queryClient = useQueryClient();
  const { data: art } = useTerrainArt();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const elementLabel: Record<string, string> = { tide: "🌊 Tide", sky: "🌀 Sky", stone: "🪨 Stone", root: "🌿 Root", neutral: "◇ Neutral" };
  const stageLabel: Record<number, string> = { 2: "Stage 2 — the swelling", 3: "Stage 3 — the flourishing" };
  const setNote = (key: string, note: string) => setNotes((current) => ({ ...current, [key]: note }));
  async function upload(element: string, stage: 2 | 3, file: File) {
    const key = `${element}-${stage}`; setBusy(key);
    try {
      const check = await checkTerrainPng(file);
      if (!check.ok) { setNote(key, check.note); return; }
      const encoded = await fileToBase64(file);
      await api.uploadTerrainArt({ element, stage, imageBase64: encoded.dataBase64, mimeType: "image/png" });
      setNote(key, "Live on the map now.");
      await queryClient.invalidateQueries({ queryKey: TERRAIN_ART_QUERY_KEY });
    } catch (error) { setNote(key, mutationError(error)); }
    finally { setBusy(null); }
  }
  async function revert(element: string, stage: 2 | 3) {
    const key = `${element}-${stage}`; setBusy(key);
    try {
      await api.deleteTerrainArt({ element, stage });
      setNote(key, "Reverted — your provided art stands here again.");
      await queryClient.invalidateQueries({ queryKey: TERRAIN_ART_QUERY_KEY });
    } catch (error) { setNote(key, mutationError(error)); }
    finally { setBusy(null); }
  }
  return <section className="pool"><header className="pool-header"><div><p className="eyebrow">Terrain Stage Art</p><h1>The land, as it grows.</h1></div><p>A hex coalesces in three stages: the broken floating land you provided (stage 1, bundled with the game and never replaced here), the elements swelling (stage 2), and the fully filled, flourishing hex (stage 3). Upload a face for any stage and it goes live on the map at once; until you do, your provided art stands in at every stage.</p></header>
    <p className="quiet">Uploads must be true PNGs on the shared 1920 × 1280 canvas — the same registration as the tiles you provided, so uploaded art seats on the lattice with the same placement as yours. Stage 3 art is stored and previewed here now, and first renders on the map when the levels engine computes stage 3.</p>
    {TERRAIN_ART_ELEMENTS.map((element) => <section className="pool-group" key={element}><header><h2>{elementLabel[element]}</h2><span>stage 1 · your provided art</span></header>
      <div className="terrain-art-grid">{([2, 3] as const).map((stage) => {
        const uploaded = art?.[element]?.[stage]; const key = `${element}-${stage}`; const isBusy = busy === key;
        return <article className="terrain-slot" key={key}>
          <div className="slot-head"><strong>{stageLabel[stage]}</strong>{uploaded ? <span className="live-mark">Uploaded</span> : <span className="placeholder-mark">Placeholder</span>}</div>
          <img src={uploaded ?? BUNDLED_TERRAIN[element]} alt={`${elementLabel[element]} stage ${stage} terrain art`} className={uploaded ? "" : "placeholder"} />
          <p className="slot-note">{uploaded ? "Your uploaded art — this is the face growing tiles of this element wear." : "Placeholder — your provided art stands here until you upload this stage."}</p>
          {notes[key] && <p className="slot-note warn">{notes[key]}</p>}
          <div className="slot-actions">
            <label className="file-button"><input type="file" accept="image/png,.png" disabled={isBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(element, stage, file); }} />{isBusy ? "Working…" : uploaded ? "Replace PNG" : "Upload PNG"}</label>
            {uploaded && <button className="remove-piece" disabled={isBusy} onClick={() => void revert(element, stage)}>Revert to provided art</button>}
          </div>
        </article>;
      })}</div>
    </section>)}
  </section>;
}

function WaitingCreature({ slot, waiting, assets, onClaimed, onNeedClaim }: { slot: "welcome" | "free"; waiting: WaitingAwoken; assets: LayerAsset[]; onClaimed: (id: number) => void; onNeedClaim?: () => void }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [weaving, setWeaving] = useState(false);
  const item = waiting.awakened;
  const claim = useMutation({
    mutationFn: () => api.claimWelcome({ slot }),
    onSuccess: (data) => { onClaimed(data.awakenedId); invalidateStudios(queryClient); void queryClient.invalidateQueries({ queryKey: ["welcome"] }); },
    onError: (error) => { if (isClaimGateError(error) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(error)); },
  });
  async function reconstitute() {
    if (!canWake(assets)) { setNotice("The pools are still gathering matter — the first pieces have not arrived yet."); return; }
    setWeaving(true); setNotice(null);
    try {
      const layers = pickLayerSet(assets);
      const imageBase64 = await compose(layers);
      await api.reconstituteWelcome({ slot, layers: toLayerRefs(layers), imageBase64 });
      await queryClient.invalidateQueries({ queryKey: ["welcome"] });
    } catch (error) { if (isClaimGateError(error) && onNeedClaim) onNeedClaim(); else setNotice(mutationError(error)); }
    finally { setWeaving(false); }
  }
  if (!item) return null;
  return <section className="waiting" aria-live="polite">
    <p className="eyebrow">{slot === "welcome" ? "A first greeting" : "A free wake has gathered"}</p>
    <h2>{slot === "welcome" ? "One has been waiting for you." : "The binding offers another."}</h2>
    {slot === "welcome" && <p className="waiting-note">Your first twenty wakes are free — and this one arrived ahead of you, a gift on top of them. Keep it, or let the matter re-gather once, free.</p>}
    <CreatureCard item={item} />
    <div className="waiting-actions">
      <button className="wake-button" type="button" onClick={() => claim.mutate()} disabled={claim.isPending || weaving}><span>{claim.isPending ? "Joining…" : "Add to deck"}</span><small>joins your deck</small></button>
      {waiting.respinsRemaining > 0
        ? <button className="waiting-respin" type="button" onClick={() => void reconstitute()} disabled={weaving || claim.isPending}><span>{weaving ? "Reconstituting…" : "Reconstitute matter"}</span><small>one free re-weaving</small></button>
        : <p className="quiet">The matter has settled into this form.</p>}
    </div>
    {notice && <p className="notice error" role="status">{notice}</p>}
  </section>;
}

function WelcomeSection({ assets, welcome, onClaimed, onNeedClaim }: { assets: LayerAsset[]; welcome: WelcomeStatus | undefined; onClaimed: (id: number) => void; onNeedClaim?: () => void }) {
  const queryClient = useQueryClient();
  const [seedNote, setSeedNote] = useState<string | null>(null);
  const seededRef = useRef(false);
  const ready = canWake(assets);

  // First visit: the greeting Awoken gathers itself — no click required.
  useEffect(() => {
    if (!welcome?.needsSeed || seededRef.current || !ready) return;
    seededRef.current = true;
    (async () => {
      try {
        const layers = pickLayerSet(assets);
        await api.seedWelcome({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
        await queryClient.invalidateQueries({ queryKey: ["welcome"] });
      } catch (error) {
        if (isClaimGateError(error) && onNeedClaim) { onNeedClaim(); return; }
        seededRef.current = false;
        setSeedNote(mutationError(error));
      }
    })();
  }, [welcome, assets, ready, queryClient]);

  if (!welcome) return null;
  // The recurring free wake has no surface here anymore: it is gathered,
  // seen, and claimed at the spark in WakeRitual — one door only. This
  // section keeps the first-visit greeting alone.
  const greeting = welcome.welcome?.awakened
    ? <WaitingCreature slot="welcome" waiting={welcome.welcome} assets={assets} onClaimed={onClaimed} onNeedClaim={onNeedClaim} />
    : null;
  if (!greeting) {
    if (welcome.needsSeed && !ready) return <p className="freewake-quiet">The workshop's matter has not arrived yet — your first greeting is still gathering.</p>;
    return seedNote ? <p className="notice error" role="status">{seedNote}</p> : null;
  }
  return <>{greeting}{seedNote && <p className="notice error" role="status">{seedNote}</p>}</>;
}

function GroveSection() {
  const grove = useQuery({ queryKey: ["grove"], queryFn: () => api.getGrove() });
  return <aside className="grove" aria-label="The grove fund">
    <p className="eyebrow">The grove fund</p>
    <p>Every $5 pack plants a native tree — $1 of yours joins the grove.</p>
    <p className="grove-counter">{grove.data ? <><strong>{grove.data.dollarsAccrued}</strong> grown for the grove · <strong>{grove.data.treesPlanted}</strong> {grove.data.treesPlanted === 1 ? "tree" : "trees"} planted so far</> : "The grove is listening…"}</p>
  </aside>;
}

function LoreSection() {
  return <section className="lore" aria-label="About the Awoken">
    <details>
      <summary><span>What are the Awoken?</span></summary>
      <p>Every Awoken begins as scattered matter — ink, dust, and weather. What holds it together is the binding: a force like attention, like care, like being truly seen. Each one is drawn by a human hand, layer upon layer, and then it wakes.</p>
      <p>No two are alike. The arms it reaches with, the body it carries, the crown it thinks with — chance gathers them, and the gathering becomes a creature with its own power, its own toughness, its own name.</p>
      <p>An Awoken never fights another Awoken. That is not what they are here to do. Each one's deepest drive is quieter: to inspire its tender to plant a tree — in the earth, or in themselves. And there is an old whisper among tenders: if enough of them wake, forests might grow.</p>
      <aside className="money-note">
        <p className="eyebrow">Why $5?</p>
        <p>Your first 20 wakes are free, and a welcome Awoken is already waiting when you arrive. After that, a free wake gathers every 4 hours, whenever you visit — no alarms, no streaks, no guilt. If you want more than that, $5 gathers 20 wakes, and it goes directly to keeping this hand-drawn species alive.</p>
      </aside>
      <p className="music-note">The music you hear here: “Call to Adventure”, “At Launch”, “Alchemists Tower”, “Five Armies” and “Crusade” by <a href="https://incompetech.com">Kevin MacLeod</a>, with further tracks by <a href="https://www.scottbuckley.com.au">Scott Buckley</a> — all shared under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</p>
      <GroveSection />
    </details>
  </section>;
}

/** Workshop: customize text colors across the app. */
/** Apply site colors from server to the document. */
export function applySiteColors(colors: Record<string, string>) {
  const isMobile = window.innerWidth <= 768;
  const device = isMobile ? "mobile" : "desktop";
  // Apply CSS variables
  for (const [k, v] of Object.entries(colors)) {
    const [dev, key] = k.split(":", 2);
    if (dev !== device) continue;
    // Map keys to CSS
    if (key === "text") document.documentElement.style.setProperty("--text", v);
    else if (key === "dim") document.documentElement.style.setProperty("--dim", v);
    else if (key === "heading") {
      document.querySelectorAll("h1, h2, h3").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "gold") {
      document.querySelectorAll(".gold, .rank-badge").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "pricing") {
      // $5 pricing text
      document.querySelectorAll(".pricing-text").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "lore") {
      document.querySelectorAll(".lore-text, .tutorial-lore").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "tutorial") {
      document.querySelectorAll(".tutorial-card p, .tutorial-card h2, .tutorial-card li").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "input-text") {
      document.querySelectorAll("input, textarea").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
    else if (key === "input-label") {
      document.querySelectorAll("label").forEach(el => {
        (el as HTMLElement).style.color = v;
      });
    }
  }
}

function TextColors() {
  const { data, refetch } = useQuery({
    queryKey: ["siteColors"],
    queryFn: () => api.getSiteColors(),
  });
  const colors = data?.colors || {};
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  // Color options: key -> { label, cssVar, default }
  const options = [
    { key: "text", label: "Main text", css: "--text", default: "#11110f" },
    { key: "dim", label: "Muted text", css: "--dim", default: "#625f57" },
    { key: "heading", label: "Headings", css: null, default: "#e8d5a0" },
    { key: "gold", label: "Gold accents", css: null, default: "#d4af6a" },
    { key: "pricing", label: "$5 pricing text", css: null, default: "#e8d5a0" },
    { key: "lore", label: "Story/lore text", css: null, default: "#e8d5a0" },
    { key: "tutorial", label: "Tutorial text", css: null, default: "#11110f" },
    { key: "input-text", label: "Input box text", css: null, default: "#111111" },
    { key: "input-label", label: "Input labels", css: null, default: "#b8b8b8" },
  ];
  const setColor = async (key: string, value: string) => {
    const fullKey = `${device}:${key}`;
    await api.setSiteColor({ key: fullKey, value });
    refetch();
    applySiteColors({ ...colors, [fullKey]: value });
  };
  const reset = async () => {
    // Reset by clearing all (server keeps them, but we override with defaults)
    for (const opt of options) {
      await api.setSiteColor({ key: `${device}:${opt.key}`, value: opt.default });
    }
    refetch();
  };
  return (
    <section className="text-colors-panel">
      <h2>Text Colors</h2>
      <p className="quiet">Changes apply to the live site immediately.</p>
      <div className="device-toggle">
        <button className={device === "desktop" ? "active" : ""} onClick={() => setDevice("desktop")}>Desktop</button>
        <button className={device === "mobile" ? "active" : ""} onClick={() => setDevice("mobile")}>Mobile</button>
      </div>
      {options.map(opt => {
        const fullKey = `${device}:${opt.key}`;
        const val = colors[fullKey] || opt.default;
        return (
          <div key={opt.key} className="color-row">
            <label>{opt.label}</label>
            <input type="color" value={val} onChange={(e) => setColor(opt.key, e.target.value)} />
            <span className="color-value">{val}</span>
          </div>
        );
      })}
      <button className="abtn small" onClick={reset}>Reset to defaults</button>
    </section>
  );
}

function WorkshopUnlock({ onBack, onUnlock, note }: { onBack: () => void; onUnlock: (token: string) => void; note?: string }) {  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const unlock = useMutation({
    mutationFn: () => api.unlockWorkshop({ password }),
    onSuccess: (data) => { storeWorkshopToken(data.token); onUnlock(data.token); },
    onError: (e) => setError(e instanceof Error ? e.message : "The workshop did not open."),
  });
  return <main className="workshop-lock">
    <p className="eyebrow">Nigel's workshop</p>
    <h1>The door is closed.</h1>
    <p>This is the creator's room. Speak the word to enter.</p>
    {note && <p className="quiet">{note}</p>}
    <form onSubmit={(event) => { event.preventDefault(); setError(null); if (password.trim()) unlock.mutate(); }}>
      <label htmlFor="workshop-password">Workshop password</label>
      <input id="workshop-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      <button disabled={!password.trim() || unlock.isPending}>{unlock.isPending ? "Listening…" : "Enter the workshop"}</button>
    </form>
    {error && <p className="notice error" role="status">{error}</p>}
    <button type="button" className="workshop-back" onClick={onBack}>Return to the ritual</button>
  </main>;
}

/** The Tender account gate: claim a secret code (or log in) to begin. */
function TenderGate({ onDone, note }: { onDone: (token: string) => void; note?: string | null }) {
  const [mode, setMode] = useState<"claim" | "login">("claim");
  const [suggestedCode, setSuggestedCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tenderName, setTenderName] = useState("");
  const [loginIdentity, setLoginIdentity] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.suggestTenderCode().then((r) => setSuggestedCode(r.code)).catch(() => setSuggestedCode(null));
  }, []);

  const claim = useMutation({
    mutationFn: () => {
      if (!tenderName.trim()) throw new Error("Choose a name for the Awoken to call you.");
      if (password.length < 8) throw new Error("Give your account a password of at least 8 characters.");
      if (password !== confirm) throw new Error("The two passwords do not match.");
      const refCode = new URLSearchParams(window.location.search).get("ref") ?? undefined;
      return api.claimTender({ password, refCode, tenderName: tenderName.trim() });
    },
    onSuccess: (data) => onDone(data.token),
    onError: (e) => setError(e instanceof Error ? e.message : "The bond could not be made."),
  });
  const login = useMutation({
    mutationFn: () => api.loginTender({ identity: loginIdentity.trim(), password: loginPassword }),
    onSuccess: (data) => onDone(data.token),
    onError: (e) => setError(e instanceof Error ? e.message : "That name and password do not match."),
  });
  const reroll = () => {
    setSuggestedCode(null);
    api.suggestTenderCode().then((r) => setSuggestedCode(r.code)).catch(() => {});
  };

  return <main className="tender-gate">
    <p className="eyebrow">Become a Tender</p>
    <h1>Every Awoken needs someone to wake it.</h1>
    <p>Choose the name the Awoken will call you, and keep it with a password only you know — together they bind your wakes and your deck to you, wherever you go. No email, no noise.</p>
    {note && <p className="notice" role="status">{note}</p>}
    <div className="gate-tabs">
      <button type="button" className={mode === "claim" ? "active" : ""} onClick={() => { setMode("claim"); setError(null); }}>New Tender</button>
      <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Already have one?</button>
    </div>
    {mode === "claim" ? (
      <form onSubmit={(event) => { event.preventDefault(); setError(null); claim.mutate(); }}>
        <label>Choose a tender name<input value={tenderName} onChange={(e) => setTenderName(e.target.value)} autoComplete="username" placeholder="What shall the Awoken call you?" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        <label>Again<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
        <button disabled={claim.isPending}>{claim.isPending ? "Binding…" : "Begin"}</button>
      </form>
    ) : (
      <form onSubmit={(event) => { event.preventDefault(); setError(null); login.mutate(); }}>
        <label>Tender name<input value={loginIdentity} onChange={(e) => setLoginIdentity(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="current-password" /></label>
        <button disabled={login.isPending}>{login.isPending ? "Returning…" : "Return"}</button>
      </form>
    )}
    {error && <p className="notice error" role="status">{error}</p>}
  </main>;
}

/** The naming ritual: at the first creature entering the deck, the Tender
 *  is named — they take the given name or set their own. */
function TenderNaming({ onDone, isRename, currentEmail }: { onDone: () => void; isRename?: boolean; currentEmail?: string | null }) {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.suggestTenderName().then((r) => setSuggestion(r.name)).catch(() => setSuggestion(null));
  }, []);
  const setName = useMutation({
    mutationFn: async (name: string) => {
      await api.setTenderName({ name });
      // Set password if provided (for returning tenders completing their account)
      if (password && password.length >= 8 && password === confirm) {
        await api.setTenderPassword({ password });
      } else if (password || confirm) {
        throw new Error("Password must be at least 8 characters and match.");
      }
    },
    onSuccess: () => onDone(),
    onError: (e) => setError(e instanceof Error ? e.message : "The name did not take."),
  });
  const reroll = () => {
    setSuggestion(null);
    api.suggestTenderName().then((r) => setSuggestion(r.name)).catch(() => {});
  };
  return <section className="tender-naming" aria-live="polite">
    <p className="eyebrow">{isRename ? "A new name" : "The naming"}</p>
    <h2>What shall the Awoken call you?</h2>
    {!isRename && <p>Your first creature has joined your deck. Take the name they offer — or give your own.</p>}
    <div className="naming-given">
      <p className="given-name">{suggestion ?? "Listening…"}</p>
      <div className="naming-actions">
        <button type="button" onClick={reroll}>Another</button>
        <button type="button" disabled={!suggestion || setName.isPending} onClick={() => suggestion && setName.mutate(suggestion)}>Take this name</button>
      </div>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); setError(null); if (custom.trim()) setName.mutate(custom.trim()); }}>
      <label>Or name yourself<input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder="Your Tender name…" /></label>
      {!isRename && (
        <>
          <label>Set a password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" /></label>
          <label>Again<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
        </>
      )}
      <button disabled={!custom.trim() || setName.isPending}>Choose</button>
    </form>
    {error && <p className="notice error" role="status">{error}</p>}
    {isRename && (
      <form onSubmit={async (event) => { event.preventDefault(); setEmailMsg(null); try { await api.setTenderEmail({ email: email.trim() || null }); setEmailMsg("Email saved."); } catch (e) { setEmailMsg((e as Error).message); } }}>
        <label>Email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="Only so Nigel can reach you about your account" autoComplete="email" /></label>
        <button type="submit">Save email</button>
        {emailMsg && <p className="notice" role="status">{emailMsg}</p>}
      </form>
    )}
  </section>;
}

/** Nigel's private view of his Tenders, ranked by Awoken woken. Workshop only. */
/** Tender feedback: bug reports, questions, suggestions. Two-way —
 *  Nigel replies from the workshop; replies appear here. */
function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<"bug" | "question" | "suggestion">("bug");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: ["myFeedback"], queryFn: () => api.listMyFeedback(), enabled: open });
  const submit = useMutation({
    mutationFn: () => api.submitFeedback({ category, body: body.trim() }),
    onSuccess: () => { setBody(""); setSent(true); queryClient.invalidateQueries({ queryKey: ["myFeedback"] }); setTimeout(() => setSent(false), 3000); },
  });
  const catLabel: Record<string, string> = { bug: "🐞 Bug", question: "❓ Question", suggestion: "💡 Suggestion" };
  return <>
    <button
      onClick={() => setOpen(v => !v)}
      aria-label="Bug reports, questions and suggestions"
      style={{ position: "fixed", right: 0, top: "50%", transform: "translateY(-50%)", writingMode: "vertical-rl", zIndex: 900, background: "rgba(20,16,10,0.85)", color: "#e8d5a0", border: "1px solid rgba(232,213,160,0.4)", borderRight: "none", borderRadius: "8px 0 0 8px", padding: "12px 5px", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
    >
      ✎ Report · Ask · Suggest
    </button>
    {open && <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: "min(360px, 92vw)", zIndex: 950, background: "var(--bg, #14100a)", borderLeft: "1px solid rgba(232,213,160,0.35)", padding: 16, overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Speak to the workshop</h3>
        <button className="quiet-link" onClick={() => setOpen(false)}>✕</button>
      </div>
      <p className="quiet" style={{ fontSize: 13 }}>Bug reports, questions, suggestions — Nigel reads these in the workshop and replies here.</p>
      <div style={{ display: "flex", gap: 6, margin: "10px 0" }}>
        {(["bug", "question", "suggestion"] as const).map(cat => (
          <button key={cat} className={category === cat ? "abtn small" : "abtn small ghost"} onClick={() => setCategory(cat)}>{catLabel[cat]}</button>
        ))}
      </div>
      <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} rows={5} placeholder="Tell it plainly…" style={{ width: "100%" }} />
      <button className="abtn" disabled={!body.trim() || submit.isPending} onClick={() => submit.mutate()} style={{ marginTop: 8 }}>
        {submit.isPending ? "Sending…" : "Send"}
      </button>
      {sent && <p className="notice">Sent. Thank you.</p>}
      {submit.isError && <p className="notice error">{(submit.error as Error).message}</p>}
      <h4 style={{ marginTop: 24 }}>Your messages</h4>
      {mine.isPending ? <p className="quiet">Gathering…</p> : !(mine.data?.messages?.length) ? <p className="quiet">Nothing yet.</p> : (
        <div>{mine.data.messages.map((m: any) => (
          <article key={m.id} style={{ borderTop: "1px solid rgba(232,213,160,0.2)", padding: "10px 0" }}>
            <small className="quiet">{catLabel[m.category] ?? m.category} · {new Date(m.createdAt).toLocaleDateString()}</small>
            <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{m.body}</p>
            {m.reply ? <p style={{ margin: "6px 0 0", padding: "8px 10px", background: "rgba(232,213,160,0.08)", borderRadius: 6 }}><strong>Nigel:</strong> {m.reply}</p> : <small className="quiet">No reply yet.</small>}
          </article>
        ))}</div>
      )}
    </div>}
  </>;
}

/** Workshop inbox for tender feedback: pin, reply, delete. */
function FeedbackPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["feedbackInbox"], queryFn: () => api.listFeedback() });
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["feedbackInbox"] });
  const pin = useMutation({ mutationFn: (v: { id: number; pinned: boolean }) => api.pinFeedback(v), onSuccess: refresh });
  const reply = useMutation({ mutationFn: (v: { id: number; reply: string }) => api.replyFeedback(v), onSuccess: refresh });
  const del = useMutation({ mutationFn: (v: { id: number }) => api.deleteFeedback(v), onSuccess: refresh });
  const catLabel: Record<string, string> = { bug: "🐞 Bug", question: "❓ Question", suggestion: "💡 Suggestion" };
  if (query.isPending) return <p className="quiet">Gathering messages…</p>;
  if (query.error) return <p className="notice error">{(query.error as Error).message}</p>;
  const messages = query.data?.messages ?? [];
  return <section>
    <header><p className="eyebrow">Feedback</p><h1>Word from the tenders.</h1><p className="quiet">Bug reports, questions and suggestions. Pinned first. Replies appear on the tender's screen.</p></header>
    {!messages.length ? <p className="quiet">No messages yet.</p> : messages.map((m: any) => (
      <article key={m.id} style={{ border: "1px solid rgba(232,213,160,0.25)", borderRadius: 8, padding: 12, marginBottom: 10, opacity: m.pinned ? 1 : 0.92 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <strong>{catLabel[m.category] ?? m.category} — {m.tenderName ?? "A tender"}</strong>
          <small className="quiet">{new Date(m.createdAt).toLocaleString()}</small>
        </div>
        <p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{m.body}</p>
        {m.reply && <p style={{ padding: "8px 10px", background: "rgba(232,213,160,0.08)", borderRadius: 6 }}><strong>Your reply:</strong> {m.reply}</p>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={replyDraft[m.id] ?? ""}
            onChange={e => setReplyDraft(d => ({ ...d, [m.id]: e.target.value }))}
            placeholder={m.reply ? "Replace reply…" : "Write a reply…"}
            style={{ flex: "1 1 200px" }}
          />
          <button className="abtn small" disabled={!(replyDraft[m.id] ?? "").trim()} onClick={() => reply.mutate({ id: m.id, reply: (replyDraft[m.id] ?? "").trim() })}>Reply</button>
          <button className="abtn small" onClick={() => pin.mutate({ id: m.id, pinned: !m.pinned })}>{m.pinned ? "📌 Unpin" : "Pin"}</button>
          <button className="abtn small" onClick={() => { if (confirm("Delete this message?")) del.mutate({ id: m.id }); }}>Delete</button>
        </div>
      </article>
    ))}
  </section>;
}

function VoicePanel() {
  const query = useQuery({ queryKey: ["voiceState"], queryFn: () => api.getVoiceState() });
  const [msg, setMsg] = useState<string | null>(null);
  const [news, setNews] = useState("");
  const say = (text: string) => { setMsg(text); setTimeout(() => setMsg(null), 5000); };
  const run = async (fn: () => Promise<any>, done: string) => {
    try { await fn(); say(done); query.refetch(); }
    catch (e) { say("Failed: " + (e as Error).message); }
  };
  if (query.isPending) return <p className="quiet">Listening for the road…</p>;
  if (query.error || !query.data) return <p className="notice error" role="status">{mutationError(query.error)}</p>;
  const v = query.data;
  return <section className="tender-leaderboard">
    <header>
      <p className="eyebrow">The Voice</p>
      <h1>Her road to Discord.</h1>
      <p className="quiet">One webhook carries her — the same road the story-sending rides. She posts the weather when the sky turns, once per reign, and world news only when you speak it here. Nothing automatic, nothing repeated.</p>
    </header>
    {msg && <p className="notice">{msg}</p>}
    {!v.webhookConfigured && <p className="notice error" role="status">The Voice has no road yet — the webhook is not set on the server (DISCORD_STORIES_WEBHOOK_URL in Railway). Everything below fails closed, honestly, until it is.</p>}
    <p className="quiet">The sky now: <strong>{v.currentMood}</strong> · this reign ends {new Date(v.currentReignEndsAt).toLocaleTimeString([], { timeStyle: "short" })}{v.lastAnnouncedEndsAt ? <> · last weather spoken for the reign ending {new Date(v.lastAnnouncedEndsAt).toLocaleTimeString([], { timeStyle: "short" })}</> : " · no weather spoken yet"}</p>
    <p className="quiet">{v.weatherAudioMoods.length ? <>🔊 Her voice rides the weather posts — she has a recording for: {v.weatherAudioMoods.join(", ")}. The post carries the words and her voice together.</> : "Her weather posts ride as words alone — no recordings are bundled on this server."}</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
      <button className="abtn small" onClick={() => run(() => api.setVoiceWeatherEnabled({ enabled: !v.weatherEnabled }), v.weatherEnabled ? "Weather voice stilled. The sky will turn in silence." : "Weather voice loosed. She will speak when the sky turns.")}>
        {v.weatherEnabled ? "🌦 Weather voice: ON — still her" : "🌦 Weather voice: OFF — loose her"}
      </button>
      <button className="abtn small" disabled={!v.webhookConfigured} onClick={() => run(() => api.postVoiceTestLine(), "Test line spoken. Look to the channel.")}>
        Speak a test line
      </button>
    </div>
    <div style={{ marginTop: 16 }}>
      <p className="eyebrow">World news</p>
      <p className="quiet">Your words, carried unbent and posted as the Voice. A few living words — up to 800 characters.</p>
      <textarea value={news} onChange={(e) => setNews(e.target.value)} rows={4} maxLength={800} placeholder="Speak the news of the world…" style={{ width: "100%", marginTop: 8 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button className="abtn small" disabled={!v.webhookConfigured || !news.trim()} onClick={() => run(async () => { await api.postWorldNews({ text: news.trim() }); setNews(""); }, "World news spoken. It is in the channel.")}>
          Post as world news
        </button>
        <small className="quiet">{news.length}/800</small>
      </div>
    </div>
  </section>;
}

function TendersPanel() {
  const query = useQuery({ queryKey: ["tenderLeaderboard"], queryFn: () => api.listTenders() });
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [resetName, setResetName] = useState("");
  const [confirmWorldReset, setConfirmWorldReset] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [deckPopup, setDeckPopup] = useState<{ ownerKey: string; name: string; field: any[]; hand: any[]; waveNumber: number } | null>(null);
  const [waveEdit, setWaveEdit] = useState<{ ownerKey: string; current: number } | null>(null);
  const codesQuery = useQuery({ queryKey: ["wakeCodes"], queryFn: () => api.adminListWakeCodes() });
  const [aspectCounts, setAspectCounts] = useState<Record<string, number>>({});
  const grantAspects = async (t: TenderLeaderboardEntry) => {
    const count = aspectCounts[t.ownerKey] ?? 5;
    const els = ["tide", "sky", "stone", "root"] as const;
    const nameOf = (el: (typeof els)[number]) => el.charAt(0).toUpperCase() + el.slice(1);
    try {
      const r = await api.adminGrantAspectPoints({ ownerKey: t.ownerKey, count });
      const parts = els.filter((el) => r.granted[el] > 0).map((el) => `${nameOf(el)} +${r.granted[el]}`);
      const born = els.flatMap((el) => Array.from({ length: r.spawned[el] }, () => nameOf(el)));
      setAdminMsg(`Granted ${count} aspect points to ${t.displayName} — ${parts.join(", ")}${born.length ? ` · ${born.length} aspect${born.length > 1 ? "s" : ""} born (${born.join(", ")})` : ""}.`);
      query.refetch();
      setTimeout(() => setAdminMsg(null), 5000);
    } catch (e) {
      setAdminMsg("Failed: " + (e as Error).message);
    }
  };
  const doAdmin = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      setAdminMsg(label + " done.");
      query.refetch();
      setTimeout(() => setAdminMsg(null), 3000);
    } catch (e) {
      setAdminMsg("Failed: " + (e as Error).message);
    }
  };
  if (query.isPending) return <p className="quiet">Gathering the Tenders…</p>;
  if (query.error || !query.data) return <p className="notice error" role="status">{mutationError(query.error)}</p>;
  const tenders = query.data.tenders;
  return <section className="tender-leaderboard">
    <header><p className="eyebrow">The Tenders</p><h1>Those who tend.</h1><p className="quiet">Only you see this. Tenders never see each other's counts.</p>
    <button className="abtn small" onClick={() => doAdmin(() => api.adminRefillAllEnergy(), "All refilled to max")} style={{ marginTop: 8 }}>
      ⚡ Refill All to Max
    </button>
    {/* THE WORLD RESET (Nigel's ruling, via Land, 2026-10-16): every
        uncursed tile on every Tender's map back to neutral Z1. Two
        steps, always — a flattened world is not a misclick. */}
    <div className="pw-reset-row" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {!confirmWorldReset ? (
        <button className="abtn small" onClick={() => setConfirmWorldReset(true)}>
          🌍 Reset the World’s Land
        </button>
      ) : (
        <>
          <span className="quiet">Flatten EVERY Tender’s purified land to neutral Z1? Cursed land, buildings, walls and Awoken stay.</span>
          <button className="abtn small danger" onClick={async () => {
            setConfirmWorldReset(false);
            try {
              const r = await api.adminResetWorldTiles();
              setAdminMsg(`World land reset done — ${r.tilesReset} tiles across ${r.tendersAffected} Tender(s) returned to neutral Z1.`);
              query.refetch();
              setTimeout(() => setAdminMsg(null), 6000);
            } catch (e) {
              setAdminMsg("Failed: " + (e as Error).message);
            }
          }}>
            Yes — flatten the world
          </button>
          <button className="abtn small" onClick={() => setConfirmWorldReset(false)}>
            Keep the land
          </button>
        </>
      )}
    </div>
    <div className="pw-reset-row" style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input value={resetName} onChange={(e) => setResetName(e.target.value)} placeholder="Tender name" style={{ maxWidth: 200 }} />
      <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="New password (8+ chars)" style={{ maxWidth: 200 }} autoComplete="new-password" />
      <button className="abtn small" disabled={!resetName.trim() || resetPw.length < 8} onClick={() => {
        doAdmin(() => api.adminResetTenderPassword({ tenderName: resetName.trim(), newPassword: resetPw }).then(r => { setResetPw(""); return r; }), "Password reset for " + resetName.trim());
      }}>
        Reset password
      </button>
    </div></header>
    {adminMsg && <p className="notice">{adminMsg}</p>}
    {!tenders.length ? <p className="quiet">No Tender has claimed a code yet.</p> : (
      <ol>{tenders.map((t, i) => <li key={t.code}>
        <span className="rank">{i + 1}</span>
        <div className="tender-who">
          <strong 
            className="tender-name-link"
            onClick={async () => {
              try {
                const deck = await api.adminGetTenderDeck({ ownerKey: t.ownerKey });
                setDeckPopup({ ownerKey: t.ownerKey, name: t.displayName, field: deck.field, hand: deck.hand, waveNumber: deck.waveNumber });
              } catch (e) {
                setAdminMsg("Failed to load deck");
              }
            }}
            title="View deck"
          >{t.displayName}</strong>
          <small>{t.code}</small>
        </div>
        <span className="count">{t.awokenCount} {t.awokenCount === 1 ? "Awoken" : "Awoken"}</span>
        <span className="count" title="Wakes remaining">Wakes: {t.wakeBalance}</span>
        <span className="energy-level" title="Energy">⚡{t.energy}</span>
        <button 
          className="wave-toggle" 
          title="Set Unraveling number"
          onClick={() => setWaveEdit({ ownerKey: t.ownerKey, current: 1 })}
        >
          🌊
        </button>
        <time>{new Date(t.createdAt).toLocaleDateString([], { dateStyle: "medium" })}</time>
        <div className="tender-admin">
          <button className="abtn small" title="Refill energy to max" onClick={() => doAdmin(() => api.adminSetEnergy({ ownerKey: t.ownerKey }), "Energy refilled to max")}>
            ⚡
          </button>
          <button className="abtn small" title="Clear timers" onClick={() => doAdmin(() => api.adminClearTimers({ ownerKey: t.ownerKey }), "Timers cleared")}>
            🕐
          </button>
          <button className="abtn small" title="Gift a wake — The Ancient Creator" onClick={() => doAdmin(() => api.adminGiftWake({ ownerKey: t.ownerKey }), `Gifted a wake to ${t.displayName}`)}>
            🎁
          </button>
          <input type="number" min={1} max={50} value={aspectCounts[t.ownerKey] ?? 5} onChange={(e) => setAspectCounts((prev) => ({ ...prev, [t.ownerKey]: Math.max(1, Math.min(50, Number(e.target.value) || 5)) }))} style={{ width: 56 }} aria-label={`Aspect points for ${t.displayName}`} />
          <button className="abtn small" title="Grant random elemental aspect points — The Ancient Creator" onClick={() => void grantAspects(t)}>
            Aspect pts
          </button>
        </div>
      </li>)}</ol>
    )}
    <div className="wake-codes" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Wake Codes</h2>
      <p className="quiet">Gift codes of The Ancient Creator — mint one, hand it out, and whoever redeems it gains a wake: “...another seed grows”</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className="abtn small" onClick={() => doAdmin(() => api.adminMintWakeCodes({ count: 1 }).then(r => { void codesQuery.refetch(); return r; }), "Minted 1 wake code")}>Mint code</button>
        <button className="abtn small" onClick={() => doAdmin(() => api.adminMintWakeCodes({ count: 5 }).then(r => { void codesQuery.refetch(); return r; }), "Minted 5 wake codes")}>Mint 5</button>
      </div>
      {codesQuery.isPending ? <p className="quiet">Gathering the codes…</p> : codesQuery.data?.codes.length ? (
        <ol>{codesQuery.data.codes.map((c) => <li key={c.code}>
          <code>{c.code}</code>{" "}
          <span className="quiet">{c.status === "unused" ? "Unused" : c.status === "redeemed" ? `Redeemed by ${c.redeemedByName ?? "a Tender"}` : "Revoked"}</span>{" "}
          {c.status === "unused" && <button className="abtn small" onClick={() => doAdmin(() => api.adminRevokeWakeCode({ code: c.code }).then(r => { void codesQuery.refetch(); return r; }), `Revoked ${c.code}`)}>Revoke</button>}
        </li>)}</ol>
      ) : <p className="quiet">No codes minted yet.</p>}
    </div>
      {/* Wave editor popup */}
      {waveEdit && (
        <div className="admin-popup" onClick={() => setWaveEdit(null)}>
          <div className="admin-popup-inner" onClick={e => e.stopPropagation()}>
            <h3>Set Unraveling Number</h3>
            <div className="wave-edit-row">
              <button className="abtn" onClick={() => {
                const n = Math.max(1, waveEdit.current - 1);
                setWaveEdit({ ...waveEdit, current: n });
              }}>−</button>
              <span className="wave-edit-num">{waveEdit.current}</span>
              <button className="abtn" onClick={() => {
                setWaveEdit({ ...waveEdit, current: waveEdit.current + 1 });
              }}>+</button>
            </div>
            <div className="wave-edit-actions">
              <button className="abtn small" onClick={() => {
                doAdmin(() => api.adminSetWave({ ownerKey: waveEdit.ownerKey, waveNumber: waveEdit.current }), `Wave set to ${waveEdit.current}`);
                setWaveEdit(null);
              }}>Set</button>
              <button className="abtn small" onClick={() => {
                doAdmin(() => api.adminSetWave({ ownerKey: waveEdit.ownerKey, waveNumber: 1 }), "Wave reset to 1");
                setWaveEdit(null);
              }}>Reset to 1</button>
              <button className="abtn small" onClick={() => setWaveEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Deck popup */}
      {deckPopup && (
        <div className="admin-popup deck-popup" onClick={() => setDeckPopup(null)}>
          <div className="admin-popup-inner deck-popup-inner" onClick={e => e.stopPropagation()}>
            <h3>{deckPopup.name}'s Deck <small>Wave {deckPopup.waveNumber}</small></h3>
            <button className="admin-popup-close" onClick={() => setDeckPopup(null)}>✕</button>
            <div className="deck-section">
              <h4>⚔ On Field ({deckPopup.field.length})</h4>
              <div className="deck-grid">
                {deckPopup.field.map((a: any) => (
                  <div key={a.id} className="deck-card">
                    <span className="deck-card-name">{a.name}</span>
                    <span className="deck-card-stats">{a.power}⚔ {a.toughness}🛡</span>
                  </div>
                ))}
                {deckPopup.field.length === 0 && <p className="quiet">None on field</p>}
              </div>
            </div>
            <div className="deck-section">
              <h4>🂠 In Hand ({deckPopup.hand.length})</h4>
              <div className="deck-grid">
                {deckPopup.hand.map((a: any) => (
                  <div key={a.id} className="deck-card">
                    <span className="deck-card-name">{a.name}</span>
                    <span className="deck-card-stats">{a.power}⚔ {a.toughness}🛡</span>
                  </div>
                ))}
                {deckPopup.hand.length === 0 && <p className="quiet">Hand empty</p>}
              </div>
            </div>
          </div>
        </div>
      )}
  </section>;
}

/** Layered cosmic background: interstellar debris over black, slowly rotating and breathing. Edges never cross the screen. */
function CosmicBackground() {
  return (
    <>
      <div className="cosmic-bg" aria-hidden="true">
        <div className="cosmic-layer cosmic-dark" style={{ backgroundImage: `url(${debrisDark})` }} />
      </div>
      <MainPageMusic />
    </>
  );
}

/** Music's rotation over the main page (Nigel, 2026-10-15): three
 *  works — the Ode to the Master, the Rupture Suite Part One, and
 *  the Theme (v1, dark violin: real violins, no singing bell, and
 *  not the telling with the pause at its head). The order is TOTALLY
 *  RANDOM by his word: every piece is drawn fresh from the three,
 *  repeats and all, so a long sitting at the title screen is a
 *  concert whose program even Music doesn't know. It reaches for
 *  autoplay; where the browser forbids sound before a first touch,
 *  the music begins at that touch instead. The pause is always
 *  within reach, and a tender's pause is never overridden. */
const MAIN_PAGE_WORKS: { src: string; title: string }[] = [
  { src: "/music/ode-to-the-master.mp3", title: "Ode to the Master" },
  { src: "/music/rupture-suite-part-one.mp3", title: "The Rupture Suite, Part One" },
  { src: "/music/awoken-theme-dark-violin.mp3", title: "The Theme — Love Stronger Than Death" },
];
function drawWork(): number {
  // Truly random, as ruled — any of the three, every time.
  return Math.floor(Math.random() * MAIN_PAGE_WORKS.length);
}
function MainPageMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userPausedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(() => drawWork());
  useEffect(() => {
    // Mount-time draw only: the rotation advances itself via onEnded.
    const audio = new Audio(MAIN_PAGE_WORKS[track].src);
    audio.volume = 0.75;
    audio.preload = "auto";
    audioRef.current = audio;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const next = drawWork();
      setTrack(next);
      audio.src = MAIN_PAGE_WORKS[next].src;
      if (!userPausedRef.current) audio.play().catch(() => {});
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    const begin = () => { if (!userPausedRef.current) audio.play().catch(() => {}); };
    begin();
    const unlock = () => begin();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      audio.pause();
      audioRef.current = null;
    };
  }, []);
  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      userPausedRef.current = false;
      audio.play().catch(() => {});
    } else {
      userPausedRef.current = true;
      audio.pause();
    }
  };
  const nowTitle = MAIN_PAGE_WORKS[track].title;
  return (
    <button type="button" className="ode-toggle" onClick={toggle}
      title={playing ? `Pause — ${nowTitle}` : `Play — ${nowTitle}`}
      aria-label={playing ? `Pause ${nowTitle}` : `Play ${nowTitle}`}>
      {playing ? "❚❚" : "▶"} <span>{nowTitle}</span>
    </button>
  );
}

export function App() {
  const queryClient = useQueryClient();
  // Re-render the tree when the element palette changes (theme load below,
  // or live tweaks from the UI Workspace's Elements section).
  useElementPalette();
  // Load and apply site colors + the UI theme (element palette) on startup
  useEffect(() => {
    api.getSiteColors().then(r => {
      if (r.ok) applySiteColors(r.colors);
    }).catch(() => {});
    api.getUITheme().then(r => {
      if (r.ok) applyElementPalette(r.theme.elementColors);
    }).catch(() => {});
  }, []);
  const [face, setFace] = useState<Face>("tender"); const [workshopView, setWorkshopView] = useState<WorkshopView>("wake"); const [showDeck, setShowDeck] = useState(false); const [focusId, setFocusId] = useState<number | null>(null); const [showPacket, setShowPacket] = useState(false); const [showTenderDeck, setShowTenderDeck] = useState(false);
  const [wtoken, setWtoken] = useState<string | null>(() => storedWorkshopToken());
  const [tenderTokenState, setTenderTokenState] = useState<string | null>(() => storedTenderToken());
  const [showGate, setShowGate] = useState(false);
  const [gateNote, setGateNote] = useState<string | null>(null);
  // A gated action attempted before claiming routes here (fix list #7):
  // the gate opens as the front door, carrying the friendly word.
  function needClaim() {
    setGateNote(CLAIM_GATE_NOTE);
    setShowGate(true);
  }
  const [renaming, setRenaming] = useState(false);
  const query = useQuery({ queryKey: ["studio", tenderTokenState], queryFn: () => api.getStudio() });
  const welcomeQuery = useQuery({ queryKey: ["welcome", tenderTokenState], queryFn: () => api.getWelcome(), retry: false });
  const courtLegendsQ = useQuery({ queryKey: ["legends"], queryFn: () => api.getLegends(), enabled: !!tenderTokenState });
  const courtHallQ = useQuery({ queryKey: ["hall"], queryFn: () => api.getHall(), enabled: !!tenderTokenState });
  useEffect(() => {
    const hall = (courtHallQ.data as any)?.hall;
    setCourtMarks({
      championId: (courtLegendsQ.data as any)?.champion?.id ?? null,
      housedIds: new Set<number>(hall && hall.status === "active" ? hall.rooms.map((r: any) => r.awakenedId).filter(Boolean) : []),
    });
  }, [courtLegendsQ.data, courtHallQ.data]);
  const lockQuery = useQuery({ queryKey: ["workshopStatus"], queryFn: () => api.workshopStatus() });
  const workshopOpen = !lockQuery.data?.locked || !!wtoken;
  const workshopQuery = useQuery({
    queryKey: ["workshopStudio"],
    queryFn: () => api.getWorkshopStudio(),
    enabled: face === "workshop" && workshopOpen,
    retry: false,
  });
  // A token the server no longer recognizes is dropped quietly.
  useEffect(() => {
    if (tenderTokenState && query.data && !query.data.tender) {
      clearTenderToken();
      setTenderTokenState(null);
    }
  }, [tenderTokenState, query.data]);
  function handleTenderDone(token: string) {
    storeTenderToken(token);
    setTenderTokenState(token);
    setShowGate(false);
    setGateNote(null);
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
    void queryClient.invalidateQueries({ queryKey: ["welcome"] });
  }
  function handleLogout() {
    const token = tenderTokenState;
    clearTenderToken();
    setTenderTokenState(null);
    setShowDeck(false);
    if (token) void api.logoutTender(token).catch(() => {});
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
    void queryClient.invalidateQueries({ queryKey: ["welcome"] });
  }
  const assets = useMemo<LayerAsset[]>(() => toLayerAssets(query.data?.assets ?? []), [query.data?.assets]);
  if (query.isPending) return <><CosmicBackground /><main className="loading-screen">The ink is settling…</main></>;
  if (query.error || !query.data) return <main className="loading-screen error"><span>{mutationError(query.error)}</span><button onClick={() => query.refetch()}>Try again</button></main>;
  const studio = query.data; const tenderItems = studio.awakened.filter((item) => item.collection === "tender"); const focused = studio.awakened.find((item) => item.id === focusId);
  const tender = studio.tender;
  function saved(id: number) {
    setFocusId(id);
    if (face === "workshop") void workshopQuery.refetch();
    else { void query.refetch(); void welcomeQuery.refetch(); }
  }
  function refreshTender() {
    void queryClient.invalidateQueries({ queryKey: ["studio"] });
    void queryClient.invalidateQueries({ queryKey: ["welcome"] });
  }
  if (face === "tender") {
    const welcomeForbidden = (welcomeQuery.error as { status?: number } | null)?.status === 403;
    // No account: the gate — unless the visitor explicitly asked for it, or
    // the welcome ritual refused them (brand-new soft visitor). Grandfathered
    // soft visitors (welcome still resolves) keep their ritual.
    const showGateUI = !tenderTokenState && (showGate || welcomeForbidden);
    if (showGateUI) {
      return <><CosmicBackground /><MarginGuide awoken={tenderItems} assets={assets} /><div className="app-shell tender-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><main><TenderGate onDone={handleTenderDone} note={gateNote} /><LoreSection /></main></div></>;
    }
    const deckTitle = tender?.tenderName ? `${tender.tenderName}'s awakened` : "Your awakened";
    return <><CosmicBackground />{!showDeck && <MarginGuide awoken={tenderItems} assets={assets} />}<div className="app-shell tender-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><header className="tender-tools"><button onClick={() => setShowDeck((value) => !value)} className="deck-button" aria-label={showDeck ? "Return to the ritual" : "View your decks"}><img src={deckButtonImg} alt="" /><span>{showDeck ? "Return" : "Terrain Map"}</span></button>{tender ? <span className="tender-name-display">{tender.tenderName ?? "Nameless"} <button onClick={() => setRenaming((v) => !v)} className="quiet-link tiny" title="Rename yourself">rename</button><TenderRank /></span> : <button onClick={() => setShowGate(true)} className="quiet-link">Become a Tender</button>}{tender ? <button onClick={handleLogout} className="quiet-link">Step away</button> : null}<button className="quiet-link" onClick={() => setShowTenderDeck(v => !v)}>{showTenderDeck ? "Hide Deck" : "View My Deck"}</button><a className="quiet-link table-doorway" href="/table" aria-label="Go to the Table — the Tenders' card room, and the binding code for Discord">🎲 The Table</a><button className="workshop-door" onClick={() => setFace("workshop")} aria-label="Enter Nigel's workshop">Workshop</button></header><main>
      {showTenderDeck && <CollectionView items={tenderItems} title="My Deck" note="Your awakened collection. Tap one to tell it a story." storyteller />}
      {renaming && tender ? <TenderNaming isRename currentEmail={tender.email ?? null} onDone={() => { setRenaming(false); refreshTender(); }} /> : null}
      {tender ? <FeedbackWidget /> : null}
      {showDeck ? <Territory tenderItems={tenderItems} assets={assets} onUpdate={() => refreshTender()} /> : <><WelcomeSection assets={assets} welcome={welcomeQuery.data} onClaimed={saved} onNeedClaim={needClaim} /><WakeRitual assets={assets} collection="tender" ownerName={tender?.tenderName ?? "Tender"} manual={false} onSaved={saved} onNeedClaim={needClaim} credits={studio.credits} freeWakeAvailable={welcomeQuery.data?.freeWakeAvailable} nextFreeWakeAt={welcomeQuery.data?.nextFreeWakeAt ?? null} waitingFree={welcomeQuery.data?.freeWake ?? null} isFirstAwoken={tenderItems.length === 0} creatorGifts={studio.creatorGifts} signedIn={!!tender} items={tenderItems} /><LoreSection /></>}
    </main><AcornButton onClick={() => setShowPacket(true)} />{showPacket && <WelcomePacket onClose={() => setShowPacket(false)} />}
      </div></>;  }
  if (lockQuery.isPending) return <main className="loading-screen">The ink is settling…</main>;
  if (lockQuery.data?.locked && !wtoken) {
    return <><CosmicBackground /><div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><WorkshopUnlock onBack={() => setFace("tender")} onUnlock={(token) => setWtoken(token)} /></div></>;
  }
  if ((workshopQuery.error as { status?: number } | null)?.status === 401) {
    clearWorkshopToken();
    return <><CosmicBackground /><div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><WorkshopUnlock onBack={() => setFace("tender")} onUnlock={(token) => setWtoken(token)} note="The word has faded — speak it again." /></div></>;
  }
  if (workshopQuery.isPending) return <main className="loading-screen">The ink is settling…</main>;
  if (workshopQuery.error || !workshopQuery.data) return <main className="loading-screen error"><span>{mutationError(workshopQuery.error)}</span><button onClick={() => workshopQuery.refetch()}>Try again</button></main>;
  const wstudio = workshopQuery.data;
  const wassets = toLayerAssets(wstudio.assets);
  const wWorkshopItems = wstudio.awakened.filter((item) => item.collection === "workshop");
  const wFocused = wstudio.awakened.find((item) => item.id === focusId);
  const workshopTabs: { id: WorkshopView; label: string; count?: number }[] = [{ id: "wake", label: "Awaken" }, { id: "pool", label: "Layer Pool", count: wassets.length }, { id: "terrain", label: "Terrain Stages" }, { id: "collection", label: "Workshop Collection", count: wWorkshopItems.length }, { id: "compendium", label: "Compendium", count: wstudio.awakened.length }, { id: "tenders", label: "Tenders" }, { id: "tracks", label: "Battle Tracks" }, { id: "ui-workspace", label: "UI Workspace" }, { id: "glyphs", label: "Glyphs" }, { id: "text-colors", label: "Text Colors" }, { id: "feedback", label: "Feedback" }, { id: "voice", label: "The Voice" }];
  return <><CosmicBackground /><div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><header className="workshop-header"><div><p className="eyebrow">Nigel's workshop</p><span>The hidden machinery of waking</span></div><button onClick={() => { setFace("tender"); setShowDeck(false); }}>Return to Tender face</button></header><nav className="workshop-nav" aria-label="Workshop sections">{workshopTabs.map((tab) => <button className={workshopView === tab.id ? "active" : ""} key={tab.id} onClick={() => setWorkshopView(tab.id)}>{tab.label}{tab.count !== undefined && <small>{tab.count}</small>}</button>)}</nav><main>    {workshopView === "wake" && <><WakeRitual assets={wassets} collection="workshop" ownerName="Nigel" manual onSaved={saved} credits={null} /></>}
    {workshopView === "pool" && <PoolPanel assets={wassets} />}
    {workshopView === "terrain" && <TerrainArtPanel />}
    {workshopView === "collection" && <CollectionView items={wWorkshopItems} title="The workshop collection" note="Forms awakened at the creator's hand." allowDelete focusId={focusId} />}
    {workshopView === "compendium" && <CollectionView items={wstudio.awakened} title="The full compendium" note="Only the creator sees the whole species." allowDelete focusId={focusId} />}
    {workshopView === "tenders" && <TendersPanel />}
    {workshopView === "voice" && <VoicePanel />}
    {workshopView === "feedback" && <FeedbackPanel />}
    {workshopView === "tracks" && <MusicLibrary />}
    {workshopView === "glyphs" && <GlyphPanel />}
    {workshopView === "text-colors" && <TextColors />}
    {workshopView === "ui-workspace" && <UIWorkspace />}
  </main></div></>;
}
