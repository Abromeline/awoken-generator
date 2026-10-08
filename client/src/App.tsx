import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fileToBase64, SafeAreaTopScrim } from "./sdk-compat";
import { api, clearWorkshopToken, storeWorkshopToken, workshopToken as storedWorkshopToken, type Asset, type Awakened, type Category, type CreditInfo, type LayerRef, type Rarity, type WaitingAwoken, type WelcomeStatus } from "./api";
import auraWhisper from "./assets/auras/haze-01.png";
import auraSoft from "./assets/auras/haze-02.png";
import auraHaloRing from "./assets/auras/haze-03.png";
import auraWide from "./assets/auras/haze-04.png";
import auraTall from "./assets/auras/haze-05.png";
import auraTwin from "./assets/auras/haze-06.png";
import auraCloud from "./assets/auras/haze-07.png";
import auraCore from "./assets/auras/haze-08.png";
import auraDrift from "./assets/auras/haze-09.png";
import auraWispy from "./assets/auras/haze-10.png";
import auraBloom from "./assets/auras/haze-11.png";
import auraDisc from "./assets/auras/haze-12.png";

type Awoken = Awakened;
type Face = "tender" | "workshop";
type WorkshopView = "wake" | "pool" | "collection" | "compendium";
type LayerAsset = { sourceId: string; serverId?: number; name: string; category: Category; rarity: Rarity; power: number | null; toughness: number | null; imageUrl: string; mimeType: string; isStarter: boolean };
type BatchStatus = "checking" | "ready" | "invalid" | "uploading" | "done" | "error";
type BatchFile = { id: string; file: File; previewUrl: string; status: BatchStatus; note: string };

const categories: { id: Category; label: string; note: string }[] = [
  { id: "background", label: "Background", note: "the world beneath" },
  { id: "body", label: "Body", note: "the held matter" },
  { id: "arms", label: "Arms", note: "reach and gesture" },
  { id: "aura", label: "Aura", note: "the binding force" },
  { id: "head", label: "Head", note: "the final waking layer" },
];
const statCategories: Category[] = ["arms", "body", "head"];
const rarityLabel: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic" };
const rarityWeight: Record<Rarity, number> = { common: 8, uncommon: 4, rare: 2, mythic: 1 };
const rarityScore: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, mythic: 4 };
const statValues = [1, 2, 3] as const;
const starters: LayerAsset[] = [
  ["whisper", "Whisper Aura", auraWhisper], ["soft", "Soft Aura", auraSoft], ["halo-ring", "Halo Ring", auraHaloRing],
  ["wide", "Wide Aura", auraWide], ["tall", "Tall Aura", auraTall], ["twin", "Twin Aura", auraTwin],
  ["cloud", "Cloud Aura", auraCloud], ["core", "Core Aura", auraCore], ["drift", "Drift Aura", auraDrift],
  ["wispy", "Wispy Aura", auraWispy], ["bloom", "Bloom Aura", auraBloom], ["disc", "Disc Aura", auraDisc],
].map(([id, name, imageUrl]) => ({ sourceId: `seed:aura-${id}`, name, category: "aura", rarity: "common", power: null, toughness: null, imageUrl, mimeType: "image/png", isStarter: true })) as LayerAsset[];

const TEMPLATE_WIDTH = 750;
const TEMPLATE_HEIGHT = 971;
function mutationError(error: unknown) { return error instanceof Error ? error.message : "Something interrupted the ritual."; }
/** Both studio queries go stale together — the tender deck and the workshop compendium. */
function invalidateStudios(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["studio"] });
  void queryClient.invalidateQueries({ queryKey: ["workshopStudio"] });
}
function toLayerAssets(serverAssets: Asset[]): LayerAsset[] {
  return [...starters, ...serverAssets.map((asset) => ({ sourceId: `db:${asset.id}`, serverId: asset.id, name: asset.name, category: asset.category, rarity: asset.rarity, power: asset.power, toughness: asset.toughness, imageUrl: asset.image_url, mimeType: asset.mime_type, isStarter: false }))];
}
function chooseWeighted(options: LayerAsset[]) {
  const total = options.reduce((sum, item) => sum + rarityWeight[item.rarity], 0); let cursor = Math.random() * total;
  for (const item of options) { cursor -= rarityWeight[item.rarity]; if (cursor <= 0) return item; }
  return options[options.length - 1];
}
/** Gather one piece per layer, weighted by rarity (or fixed choices in the workshop). */
function pickLayerSet(assets: LayerAsset[], choices?: Record<Category, string>): LayerAsset[] {
  return categories.flatMap((category) => {
    const options = assets.filter((asset) => asset.category === category.id);
    if (!options.length) return [];
    const fixed = choices?.[category.id] ? options.find((asset) => asset.sourceId === choices[category.id]) : undefined;
    const picked = fixed ?? chooseWeighted(options);
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
/** Back-to-front draw order, per the artist: background, body, arms, aura, head. */
const LAYER_ORDER: Category[] = ["background", "body", "arms", "aura", "head"];
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
    context.globalAlpha = layer.category === "aura" ? auraOpacity : 1; context.drawImage(image, 0, 0, 750, 971);
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

function CreatureCard({ item, allowDelete = false, newborn = false }: { item: Awoken; allowDelete?: boolean; newborn?: boolean }) {
  const queryClient = useQueryClient(); const [editing, setEditing] = useState(newborn); const [name, setName] = useState(item.name);
  const rename = useMutation({ mutationFn: () => api.renameAwoken({ id: item.id, name }), onSuccess: () => { setEditing(false); invalidateStudios(queryClient); } });
  const remove = useMutation({ mutationFn: () => api.deleteAwoken({ id: item.id }), onSuccess: () => invalidateStudios(queryClient) });
  const litany = item.layers.filter((layer) => statCategories.includes(layer.category));
  const powerParts = litany.map((layer) => layer.power ?? 0).join(" + "); const toughnessParts = litany.map((layer) => layer.toughness ?? 0).join(" + ");
  return <article className={`creature-card ${newborn ? "newborn" : ""}`}>
    <div className="creature-image"><img src={item.image_url} alt={`${item.name}, a layered ink-wash Awoken`} />{item.iteration > 0 && <span className="iteration-mark">{ordinal(item.iteration)}</span>}</div>
    <div className="creature-copy">
      <div className="creature-heading">
        {editing ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) rename.mutate(); }}><label htmlFor={`awoken-name-${item.id}`}>Name this Awoken</label><input id={`awoken-name-${item.id}`} value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={80} /><div><button disabled={!name.trim() || rename.isPending}>Keep this name</button><button type="button" onClick={() => setEditing(false)}>Cancel</button></div></form> : <button className="name-button" onClick={() => setEditing(true)}>{item.name}</button>}
        <span className="owner-line">Held by {item.owner_name} · {item.collection === "tender" ? "Tender collection" : "Workshop collection"}</span>
      </div>
      <blockquote>{item.flavor_text}</blockquote>
      <div className="total-stats"><div><span>Power</span><strong>{item.power}</strong></div><i aria-hidden="true" /><div><span>Toughness</span><strong>{item.toughness}</strong></div></div>
      {item.empowerment > 0 && <p className="empowerment"><strong>Shared awakening +{item.empowerment}/+{item.empowerment}</strong><span>Every copy of this form has grown stronger.</span></p>}
      <section className="litany" aria-label="Stat litany"><header><span>The stat litany</span><small>the parts become the whole</small></header>{litany.map((layer) => <div className="litany-row" key={`${item.id}-${layer.category}`}><span>{layer.category}</span><strong>{layer.name}</strong><b>{layer.power}/{layer.toughness}</b></div>)}
        <div className="arithmetic"><span>Power</span><strong>{powerParts || "0"}{item.empowerment ? ` + ${item.empowerment} blessing` : ""} = {item.power}</strong><span>Toughness</span><strong>{toughnessParts || "0"}{item.empowerment ? ` + ${item.empowerment} blessing` : ""} = {item.toughness}</strong></div>
      </section>
      <div className="card-foot"><span>{ordinal(item.iteration)}</span><time>{new Date(item.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></div>
      {allowDelete && <button className="release-button" onClick={() => remove.mutate()} disabled={remove.isPending}>Release from collection</button>}
    </div>
  </article>;
}

function WakeRitual({ assets, collection, ownerName, manual, onSaved, credits }: { assets: LayerAsset[]; collection: "tender" | "workshop"; ownerName: string; manual: boolean; onSaved: (id: number) => void; credits: CreditInfo | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const [choices, setChoices] = useState<Record<Category, string>>({ background: "", arms: "", body: "", aura: "", head: "" });
  const [composition, setComposition] = useState<LayerAsset[]>([]); const [notice, setNotice] = useState("The scattered matter waits.");
  const save = useMutation({ mutationFn: async (layers: LayerAsset[]) => api.saveAwoken({ layers: toLayerRefs(layers), imageBase64: await compose(layers), collection, ownerName }), onSuccess: (data) => { setNotice(data.iteration > 0 ? `${ordinal(data.iteration)}. Every matching Awoken received +${data.empowerment}/+${data.empowerment}.` : "A new form has crossed over."); onSaved(data.id); } });
  const checkout = useMutation({ mutationFn: () => api.createCheckoutSession(), onSuccess: (data) => { window.location.href = data.url; }, onError: (error) => setNotice(mutationError(error)) });
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
    const next = pickLayerSet(assets, manual ? choices : undefined);
    setComposition(next); setNotice("Matter gathers. The binding holds…"); save.mutate(next);
  }
  return <section className={`ritual ${manual ? "workshop-ritual" : ""}`}>
    <div className="ritual-copy"><p className="eyebrow">Matter · Binding · Memory</p><h1>Every form begins as scattered matter.</h1><p>Wake what has been waiting between thought and ink.</p><p className="ritual-intro">The Awoken are matter held together by a binding force — each one drawn by hand in ink, shaped by nature and nurture. No two are ever the same.</p></div>
    <div className="ritual-grid"><div className="stage-column"><div className={`canvas-frame ${composition.length ? "has-form" : ""}`}><canvas ref={canvasRef} width={750} height={971} aria-label="Awoken awakening canvas" /><span className="canvas-whisper">{composition.length ? "THE BINDING HOLDS" : "SCATTERED MATTER"}</span></div>
      <button className="wake-button" type="button" onClick={onWakeButton} disabled={save.isPending || checkout.isPending}><span>{save.isPending ? "Waking…" : vesselEmpty ? "Gather wakes" : "Wake One"}</span><small>{vesselEmpty && credits ? `${credits.packPriceLabel} for ${credits.creditsPerPack} wakes` : manual ? "chosen or weighted" : "let chance gather the form"}</small></button>
      {credits !== null && <p className="credit-line"><span>{credits.balance > 0 ? `${credits.balance} ${credits.balance === 1 ? "wake" : "wakes"} remaining` : "The vessel is empty."}</span><button type="button" className="credit-more" onClick={() => checkout.mutate()} disabled={checkout.isPending}>{checkout.isPending ? "Opening…" : "Get more wakes"}</button></p>}
      <p className={`notice ${save.error ? "error" : ""}`} role="status">{save.error ? mutationError(save.error) : notice}</p></div>
      {manual && <aside className="manual-panel"><p className="eyebrow">Workshop hand</p><h2>Choose each mark, or leave it to chance.</h2>{categories.map((category, index) => { const options = assets.filter((asset) => asset.category === category.id); return <label className="layer-control" key={category.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{category.label}</strong><select aria-label={`${category.label} piece`} value={choices[category.id]} onChange={(event) => setChoice(category.id, event.target.value)} disabled={!options.length}><option value="">Weighted chance</option>{options.map((asset) => <option key={asset.sourceId} value={asset.sourceId}>{asset.name}{asset.power !== null ? ` · ${asset.power}/${asset.toughness}` : ""}</option>)}</select></label>; })}<p className="stack-order">Background → body → arms → aura → head</p></aside>}
    </div>
  </section>;
}

function CollectionView({ items, title, note, allowDelete = false, focusId = null }: { items: Awoken[]; title: string; note: string; allowDelete?: boolean; focusId?: number | null }) {
  const [sort, setSort] = useState<"newest" | "power" | "toughness" | "name">("newest");
  const [filter, setFilter] = useState("");
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
    <div className="deck-toolbar"><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort the deck"><option value="newest">Newest</option><option value="power">Power</option><option value="toughness">Toughness</option><option value="name">Name</option></select></label><label>Find<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="a name…" aria-label="Find by name" /></label>{(sort !== "newest" || filter.trim()) && <span className="deck-count">{visible.length} shown</span>}</div></header><div className="collection-grid">{visible.map((item) => <CreatureCard key={item.id} item={item} allowDelete={allowDelete} newborn={item.id === focusId} />)}</div></section>;
}

function PoolPanel({ assets }: { assets: LayerAsset[] }) {
  const queryClient = useQueryClient(); const inputRef = useRef<HTMLInputElement>(null); const [category, setCategory] = useState<Category>("body"); const [batch, setBatch] = useState<BatchFile[]>([]); const [uploading, setUploading] = useState(false); const [editing, setEditing] = useState<number | null>(null); const [pieceName, setPieceName] = useState("");
  const remove = useMutation({ mutationFn: (id: number) => api.deleteLayerAsset({ id }), onSuccess: () => invalidateStudios(queryClient) });
  const move = useMutation({ mutationFn: (value: { id: number; category: string }) => api.moveLayerAsset(value), onSuccess: () => invalidateStudios(queryClient) });
  const stats = useMutation({ mutationFn: (value: { id: number; power: number; toughness: number }) => api.updateLayerAssetStats(value), onSuccess: () => invalidateStudios(queryClient) });
  const rename = useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => api.renameLayerAsset({ id, name }), onSuccess: () => { setEditing(null); invalidateStudios(queryClient); } });
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
    <section className="batch-uploader"><div className="uploader-top"><div><p className="eyebrow">Primordial intake</p><h2>One offering. Many pieces.</h2></div><label className="file-button"><input ref={inputRef} type="file" accept="image/png,.png" multiple onChange={chooseFiles} disabled={uploading} />Choose PNGs</label></div>
      <fieldset><legend>File every piece as</legend><div className="category-picks">{categories.map((item) => <label className={category === item.id ? "selected" : ""} key={item.id}><input type="radio" name="category" checked={category === item.id} onChange={() => setCategory(item.id)} /><strong>{item.label}</strong><small>{item.note}</small></label>)}</div></fieldset>
      {batch.length > 0 && <div className="batch-list">{batch.map((item) => <article className={item.status} key={item.id}><img src={item.previewUrl} alt="Selected transparent PNG" /><div><strong>{item.file.name}</strong><span>{item.note}</span></div></article>)}</div>}
      <button className="upload-button" onClick={() => void uploadBatch()} disabled={!pendingCount || uploading}>{uploading ? "Naming and filing…" : `Add ${pendingCount} to ${categories.find((item) => item.id === category)?.label ?? "pool"}`}</button>
    </section>
    <div className="pool-ledger">{categories.map((layer) => { const items = assets.filter((asset) => asset.category === layer.id); return <section className="pool-group" key={layer.id}><header><h2>{layer.label}</h2><span>{items.length}</span></header>{!items.length ? <p className="quiet">Nothing rests here yet.</p> : <div className="trait-grid">{items.map((asset) => <article className="trait-tile" key={asset.sourceId}><img src={asset.imageUrl} alt={`${asset.name}, ${layer.label.toLowerCase()} layer`} /><div className="trait-copy">
        {asset.serverId && editing === asset.serverId ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (pieceName.trim()) rename.mutate({ id: asset.serverId ?? 0, name: pieceName }); }}><input aria-label={`New name for ${asset.name}`} value={pieceName} onChange={(event) => setPieceName(event.target.value)} autoFocus /><button>Keep</button></form> : <button className="piece-name" disabled={!asset.serverId} onClick={() => { if (asset.serverId) { setEditing(asset.serverId); setPieceName(asset.name); } }}>{asset.name}</button>}
        <span>{rarityLabel[asset.rarity]}</span>{asset.serverId && asset.power !== null && asset.toughness !== null && <div className="stat-editor"><label><small>Power</small><select aria-label={`Power for ${asset.name}`} value={asset.power} onChange={(event) => stats.mutate({ id: asset.serverId ?? 0, power: Number(event.target.value), toughness: asset.toughness ?? 1 })}>{statValues.map((value) => <option key={value}>{value}</option>)}</select></label><i>/</i><label><small>Toughness</small><select aria-label={`Toughness for ${asset.name}`} value={asset.toughness} onChange={(event) => stats.mutate({ id: asset.serverId ?? 0, power: asset.power ?? 1, toughness: Number(event.target.value) })}>{statValues.map((value) => <option key={value}>{value}</option>)}</select></label></div>}
        {asset.serverId && <button className="remove-piece" onClick={() => remove.mutate(asset.serverId ?? 0)}>Remove</button>}{asset.isStarter && <small className="starter-mark">aura study</small>}
        {asset.serverId && <label className="move-piece"><small>Move to</small><select aria-label={`Move ${asset.name} to another pool`} value="" onChange={(event) => { if (event.target.value) move.mutate({ id: asset.serverId ?? 0, category: event.target.value }); event.target.value = ""; }}><option value="">Another pool…</option>{categories.filter((item) => item.id !== asset.category).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      </div></article>)}</div>}</section>; })}</div>
  </section>;
}

function WaitingCreature({ slot, waiting, assets, onClaimed }: { slot: "welcome" | "free"; waiting: WaitingAwoken; assets: LayerAsset[]; onClaimed: (id: number) => void }) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [weaving, setWeaving] = useState(false);
  const item = waiting.awakened;
  const claim = useMutation({
    mutationFn: () => api.claimWelcome({ slot }),
    onSuccess: (data) => { onClaimed(data.awakenedId); invalidateStudios(queryClient); void queryClient.invalidateQueries({ queryKey: ["welcome"] }); },
    onError: (error) => setNotice(mutationError(error)),
  });
  async function reconstitute() {
    if (!canWake(assets)) { setNotice("The pools are still gathering matter — the first pieces have not arrived yet."); return; }
    setWeaving(true); setNotice(null);
    try {
      const layers = pickLayerSet(assets);
      const imageBase64 = await compose(layers);
      await api.reconstituteWelcome({ slot, layers: toLayerRefs(layers), imageBase64 });
      await queryClient.invalidateQueries({ queryKey: ["welcome"] });
    } catch (error) { setNotice(mutationError(error)); }
    finally { setWeaving(false); }
  }
  if (!item) return null;
  return <section className="waiting" aria-live="polite">
    <p className="eyebrow">{slot === "welcome" ? "A first greeting" : "A free wake has gathered"}</p>
    <h2>{slot === "welcome" ? "One has been waiting for you." : "The binding offers another."}</h2>
    {slot === "welcome" && <p className="waiting-note">Your first twenty wakes are free — and this one arrived ahead of you, a gift on top of them. Keep it, or let the matter re-gather once, free.</p>}
    <CreatureCard item={item} />
    <div className="waiting-actions">
      <button className="wake-button" type="button" onClick={() => claim.mutate()} disabled={claim.isPending || weaving}><span>{claim.isPending ? "Joining…" : "Add to deck"}</span><small>yours to name</small></button>
      {waiting.respinsRemaining > 0
        ? <button className="waiting-respin" type="button" onClick={() => void reconstitute()} disabled={weaving || claim.isPending}><span>{weaving ? "Reconstituting…" : "Reconstitute matter"}</span><small>one free re-weaving</small></button>
        : <p className="quiet">The matter has settled into this form.</p>}
    </div>
    {notice && <p className="notice error" role="status">{notice}</p>}
  </section>;
}

function WelcomeSection({ assets, welcome, onClaimed }: { assets: LayerAsset[]; welcome: WelcomeStatus | undefined; onClaimed: (id: number) => void }) {
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
        seededRef.current = false;
        setSeedNote(mutationError(error));
      }
    })();
  }, [welcome, assets, ready, queryClient]);

  const receiveFree = useMutation({
    mutationFn: async () => {
      const layers = pickLayerSet(assets);
      return api.claimFreeWake({ layers: toLayerRefs(layers), imageBase64: await compose(layers) });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["welcome"] }); },
    onError: (error) => setSeedNote(mutationError(error)),
  });

  if (!welcome) return null;
  const greeting = welcome.welcome?.awakened
    ? <WaitingCreature slot="welcome" waiting={welcome.welcome} assets={assets} onClaimed={onClaimed} />
    : null;
  const gifted = welcome.freeWake?.awakened
    ? <WaitingCreature slot="free" waiting={welcome.freeWake} assets={assets} onClaimed={onClaimed} />
    : null;
  const freeLine = !welcome.freeWake?.awakened && (
    welcome.freeWakeAvailable
      ? <div className="freewake-line"><p>A free wake has gathered, and it is yours whenever you want it.</p><button type="button" onClick={() => receiveFree.mutate()} disabled={receiveFree.isPending || !ready}>{receiveFree.isPending ? "Gathering…" : "Receive the free wake"}</button></div>
      : welcome.nextFreeWakeAt
        ? <p className="freewake-quiet">The next free wake gathers {inAbout(welcome.nextFreeWakeAt)} — no alarm, no summons. It will simply be here.</p>
        : null
  );
  if (!greeting && !gifted && !freeLine) {
    if (welcome.needsSeed && !ready) return <p className="freewake-quiet">The workshop's matter has not arrived yet — your first greeting is still gathering.</p>;
    return null;
  }
  return <>{greeting}{gifted}{freeLine}{seedNote && <p className="notice error" role="status">{seedNote}</p>}</>;
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
      <GroveSection />
    </details>
  </section>;
}

function WorkshopUnlock({ onBack, onUnlock, note }: { onBack: () => void; onUnlock: (token: string) => void; note?: string }) {
  const [password, setPassword] = useState("");
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

export function App() {
  const [face, setFace] = useState<Face>("tender"); const [workshopView, setWorkshopView] = useState<WorkshopView>("wake"); const [showDeck, setShowDeck] = useState(false); const [focusId, setFocusId] = useState<number | null>(null);
  const [wtoken, setWtoken] = useState<string | null>(() => storedWorkshopToken());
  const query = useQuery({ queryKey: ["studio"], queryFn: () => api.getStudio() });
  const welcomeQuery = useQuery({ queryKey: ["welcome"], queryFn: () => api.getWelcome() });
  const lockQuery = useQuery({ queryKey: ["workshopStatus"], queryFn: () => api.workshopStatus() });
  const workshopOpen = !lockQuery.data?.locked || !!wtoken;
  const workshopQuery = useQuery({
    queryKey: ["workshopStudio"],
    queryFn: () => api.getWorkshopStudio(),
    enabled: face === "workshop" && workshopOpen,
    retry: false,
  });
  const assets = useMemo<LayerAsset[]>(() => toLayerAssets(query.data?.assets ?? []), [query.data?.assets]);
  if (query.isPending) return <main className="loading-screen">The ink is settling…</main>;
  if (query.error || !query.data) return <main className="loading-screen error"><span>{mutationError(query.error)}</span><button onClick={() => query.refetch()}>Try again</button></main>;
  const studio = query.data; const tenderItems = studio.awakened.filter((item) => item.collection === "tender"); const focused = studio.awakened.find((item) => item.id === focusId);
  function saved(id: number) { setFocusId(id); if (face === "workshop") void workshopQuery.refetch(); else void query.refetch(); }
  if (face === "tender") return <div className="app-shell tender-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><header className="tender-tools"><button onClick={() => setShowDeck((value) => !value)}>{showDeck ? "Return to the ritual" : `My deck · ${tenderItems.length}`}</button><button className="workshop-door" onClick={() => setFace("workshop")} aria-label="Enter Nigel's workshop">Workshop</button></header><main>{showDeck ? <CollectionView items={tenderItems} title="Your awakened" note="Each name is yours to keep or change." focusId={focusId} /> : <><WelcomeSection assets={assets} welcome={welcomeQuery.data} onClaimed={saved} /><WakeRitual assets={assets} collection="tender" ownerName="Tender" manual={false} onSaved={saved} credits={studio.credits} /><LoreSection />{focused?.collection === "tender" && <section className="newborn-reveal" aria-live="polite"><p className="eyebrow">The newly awakened</p><CreatureCard item={focused} newborn /></section>}</>}</main></div>;
  if (lockQuery.isPending) return <main className="loading-screen">The ink is settling…</main>;
  if (lockQuery.data?.locked && !wtoken) {
    return <div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><WorkshopUnlock onBack={() => setFace("tender")} onUnlock={(token) => setWtoken(token)} /></div>;
  }
  if ((workshopQuery.error as { status?: number } | null)?.status === 401) {
    clearWorkshopToken();
    return <div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><WorkshopUnlock onBack={() => setFace("tender")} onUnlock={(token) => setWtoken(token)} note="The word has faded — speak it again." /></div>;
  }
  if (workshopQuery.isPending) return <main className="loading-screen">The ink is settling…</main>;
  if (workshopQuery.error || !workshopQuery.data) return <main className="loading-screen error"><span>{mutationError(workshopQuery.error)}</span><button onClick={() => workshopQuery.refetch()}>Try again</button></main>;
  const wstudio = workshopQuery.data;
  const wassets = toLayerAssets(wstudio.assets);
  const wWorkshopItems = wstudio.awakened.filter((item) => item.collection === "workshop");
  const wFocused = wstudio.awakened.find((item) => item.id === focusId);
  const workshopTabs: { id: WorkshopView; label: string; count?: number }[] = [{ id: "wake", label: "Awaken" }, { id: "pool", label: "Layer Pool", count: wassets.length }, { id: "collection", label: "Workshop Collection", count: wWorkshopItems.length }, { id: "compendium", label: "Compendium", count: wstudio.awakened.length }];
  return <div className="app-shell workshop-face"><SafeAreaTopScrim backgroundColor="var(--bg)" /><header className="workshop-header"><div><p className="eyebrow">Nigel's workshop</p><span>The hidden machinery of waking</span></div><button onClick={() => { setFace("tender"); setShowDeck(false); }}>Return to Tender face</button></header><nav className="workshop-nav" aria-label="Workshop sections">{workshopTabs.map((tab) => <button className={workshopView === tab.id ? "active" : ""} key={tab.id} onClick={() => setWorkshopView(tab.id)}>{tab.label}{tab.count !== undefined && <small>{tab.count}</small>}</button>)}</nav><main>
    {workshopView === "wake" && <><WakeRitual assets={wassets} collection="workshop" ownerName="Nigel" manual onSaved={saved} credits={null} />{wFocused?.collection === "workshop" && <section className="newborn-reveal"><CreatureCard item={wFocused} newborn allowDelete /></section>}</>}
    {workshopView === "pool" && <PoolPanel assets={wassets} />}
    {workshopView === "collection" && <CollectionView items={wWorkshopItems} title="The workshop collection" note="Forms awakened at the creator's hand." allowDelete focusId={focusId} />}
    {workshopView === "compendium" && <CollectionView items={wstudio.awakened} title="The full compendium" note="Only the creator sees the whole species." allowDelete focusId={focusId} />}
  </main></div>;
}
