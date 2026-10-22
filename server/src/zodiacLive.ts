/**
 * THE LIVING WHEEL (2026-10-18) — the Skill Zodiac as the
 * Ancient One may re-write it. The baked graph (zodiacData.ts,
 * generated from the design sources) is the wheel's FIRST
 * writing and its seed; from the first boot onward the living
 * graph lives in ui_config ("zodiac.graph") and the workshop's
 * Starwright panel edits it — nodes, roads, costs, gates, and
 * EFFECT CLAUSES — with every change live in the game at the
 * moment it is saved. No push, no deploy: his stars, his sky.
 *
 * Effect clauses are the invention vocabulary: a node carries
 * clauses { verb, amount, el? } and the game's derivations
 * (skills.ts) sum them over what a Tender holds. A brand-new
 * star with { verb: "tenderHp", amount: 7 } truly grants +7
 * Tender HP. The palette is the honest boundary: new VERBS
 * are new seams, and seams are still the Keeper's code — but
 * new combinations, strengths, and placements are his alone.
 * A few keystones also carry Keeper-wired workings beyond
 * their clauses (BESPOKE_IDS); the panel labels them so.
 */
import { sqlite } from "./store.js";
import { ZODIAC_NODES, ZODIAC_EDGES, type ZodiacNode } from "./zodiacData.js";

export interface FxClause { verb: string; amount: number; el?: string | null }
export interface LiveNode extends ZodiacNode { fx: FxClause[] }
export interface ZodiacGraph { nodes: LiveNode[]; edges: [string, string][]; v?: number }

/** The writing of the wheel this code seeds and serves.
 *  v2 (2026-10-22) is the 194-star tree; a persisted graph
 *  from an older writing is not folded forward — it is
 *  replaced by the seed (the store's migration clears the
 *  old held skills alongside, exactly once). */
export const ZODIAC_WHEEL_VERSION = 2;

export const FX_PALETTE: { verb: string; label: string; hint: string; hasElement?: boolean }[] = [
  { verb: "tenderHp", label: "Tender HP", hint: "the Tender's own body, at the Table and on the map's standing" },
  { verb: "heal", label: "Healing done", hint: "added to every mending the Tender works" },
  { verb: "tableEnergy", label: "Max energy at the Table", hint: "the seat's purse, and the Bastion's pool share" },
  { verb: "company", label: "Travelling company", hint: "how many Awokin may stand at the Table at once" },
  { verb: "party", label: "Party level", hint: "one level of the Party skill — party spots are 3, +1 for every 3 party levels, plus the Muster stars" },
  { verb: "attunement", label: "Attunement granted", hint: "standing points in a hue, raising levels, gates and pour caps", hasElement: true },
  { verb: "fellHarvest", label: "Harvest of the fell", hint: "energy when your Awokin fell the dark at the Table" },
  { verb: "roundEnergy", label: "Breath of rounds", hint: "energy returning at each battle round's start" },
  { verb: "roundMend", label: "Mending of rounds", hint: "the Tender's own HP knit at each battle round's start" },
  { verb: "tenderSkin", label: "Thickened skin", hint: "strikes against the bare Tender blunted, never below 1" },
  { verb: "firstWorkingDiscount", label: "Steady hand", hint: "the battle's first ward or rune costs this much less" },
];
const PALETTE_VERBS = new Set(FX_PALETTE.map(p => p.verb));
const ELEMENTS = new Set(["tide", "sky", "stone", "root", "fire"]);

/** Stars whose workings are ALSO Keeper-wired in code, beyond
 *  any clauses they carry. The v2 wheel's stars carry NO
 *  bespoke wiring yet — their grants are display text until
 *  the effects build seats them — so this stands empty
 *  rather than naming stars that no longer stand. */
export const BESPOKE_IDS: string[] = [];

/** The seed's clause-writing. The v2 wheel seeds NO clauses:
 *  a v2 star's deepened grant is its displayed text (the
 *  Deepening Rule), and wiring those grants into live effects
 *  is a separate build. Seeding invented clauses here would
 *  dress unwired stars as working ones, so the seed is
 *  honestly empty; the fx readers in skills.ts sum over held
 *  clauses and return 0s until the effects build writes real
 *  ones (the Starwright may also write clauses by hand). */
const SEED_FX: Record<string, FxClause[]> = {};
function seedGraph(): ZodiacGraph {
  const nodes: LiveNode[] = ZODIAC_NODES.map(n => {
    const fx: FxClause[] = [...(SEED_FX[n.id] ?? [])];
    if (n.el && n.att > 0) fx.push({ verb: "attunement", el: n.el, amount: n.att });
    return { ...n, fx };
  });
  return { nodes, edges: ZODIAC_EDGES.map(e => [e[0], e[1]] as [string, string]), v: ZODIAC_WHEEL_VERSION };
}

const CONFIG_KEY = "zodiac.graph";
let cache: ZodiacGraph | null = null;

function persist(g: ZodiacGraph): void {
  const value = JSON.stringify(g);
  const existing = sqlite.prepare("SELECT key FROM ui_config WHERE key = ?").get(CONFIG_KEY);
  if (existing) sqlite.prepare("UPDATE ui_config SET value = ?, updated_at = ? WHERE key = ?").run(value, Date.now(), CONFIG_KEY);
  else sqlite.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, ?)").run(CONFIG_KEY, value, Date.now());
}

export function zodiacGraph(): ZodiacGraph {
  if (cache) return cache;
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(CONFIG_KEY) as { value: string } | undefined;
    if (row?.value) {
      const parsed = JSON.parse(row.value) as ZodiacGraph;
      // A persisted wheel of the CURRENT writing serves as it
      // stands (the Starwright's edits live there). A wheel
      // from an older writing — no version stamp, or a stamp
      // behind this code's — is replaced by the v2 seed: the
      // old tree is gone whole, not folded forward.
      if (parsed.v === ZODIAC_WHEEL_VERSION && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && parsed.nodes.length > 0) {
        cache = parsed;
        return cache;
      }
    }
  } catch { /* a wounded doc falls back to the first writing */ }
  cache = seedGraph();
  try { persist(cache); } catch { /* the seed still serves from memory */ }
  return cache;
}

export function liveNodes(): LiveNode[] { return zodiacGraph().nodes; }
export function liveEdges(): [string, string][] { return zodiacGraph().edges; }
export function liveById(): Map<string, LiveNode> { return new Map(zodiacGraph().nodes.map(n => [n.id, n])); }
export function liveAdj(): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  for (const n of zodiacGraph().nodes) adj[n.id] = [];
  for (const [a, b] of zodiacGraph().edges) { (adj[a] ??= []).push(b); (adj[b] ??= []).push(a); }
  return adj;
}

// ── The Starwright's edits ──────────────────────────────────

function cleanStr(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max);
}
function cleanNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function sanitizeNode(raw: any, existingIds: Set<string>): LiveNode {
  const id = cleanStr(raw?.id, 60).trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error("A star's id is lowercase letters, numbers and underscores — it is the name the game's ledger knows it by.");
  const el = raw?.el && ELEMENTS.has(String(raw.el)) ? String(raw.el) : null;
  const gate = raw?.gate && ELEMENTS.has(String(raw.gate.el))
    ? { el: String(raw.gate.el), level: Math.round(cleanNum(raw.gate.level, 0, 3, 1)) }
    : null;
  const fx: FxClause[] = [];
  if (Array.isArray(raw?.fx)) {
    for (const c of raw.fx) {
      if (!c || !PALETTE_VERBS.has(String(c.verb))) continue;
      const verb = String(c.verb);
      const needsEl = FX_PALETTE.find(p => p.verb === verb)?.hasElement;
      fx.push({
        verb,
        amount: Math.round(cleanNum(c.amount, -100, 999, 0)),
        el: needsEl ? (c.el && ELEMENTS.has(String(c.el)) ? String(c.el) : "stone") : null,
      });
    }
  }
  const requires: string[] = Array.isArray(raw?.requires)
    ? [...new Set(raw.requires.map((r: any) => cleanStr(r, 60).trim().toLowerCase()) as string[])].filter(r => !!r && r !== id && existingIds.has(r))
    : [];
  return {
    id,
    name: cleanStr(raw?.name, 80) || id,
    kind: cleanStr(raw?.kind, 20) || "minor",
    sector: cleanStr(raw?.sector, 30) || "heart",
    x: cleanNum(raw?.x, 0, 720, 360),
    y: cleanNum(raw?.y, 0, 720, 360),
    effect: cleanStr(raw?.effect, 600),
    syn: cleanStr(raw?.syn, 600),
    el,
    att: Math.round(cleanNum(raw?.att, 0, 99, 0)),
    pool: raw?.pool === "canopy" ? "canopy" : "tree",
    cost: Math.round(cleanNum(raw?.cost, 0, 99, 1)),
    gate,
    requires,
    anyCore: !!raw?.anyCore,
    pathway: cleanStr(raw?.pathway, 30),
    god: cleanStr(raw?.god, 40),
    tier: cleanStr(raw?.tier, 40),
    step: cleanStr(raw?.step, 20),
    grant: cleanStr(raw?.grant, 600),
    fx,
  };
}

export function upsertNode(raw: any): LiveNode {
  const g = zodiacGraph();
  const ids = new Set(g.nodes.map(n => n.id));
  const node = sanitizeNode(raw, ids);
  const at = g.nodes.findIndex(n => n.id === node.id);
  if (at >= 0) g.nodes[at] = node; else g.nodes.push(node);
  persist(g);
  return node;
}

export function deleteNode(id: string): { ok: true; removedEdges: number } {
  if (id === "heart") throw new Error("The Heart cannot be unwritten — every road begins there.");
  const g = zodiacGraph();
  const before = g.edges.length;
  g.nodes = g.nodes.filter(n => n.id !== id);
  g.edges = g.edges.filter(([a, b]) => a !== id && b !== id);
  // A star unwritten is a skill unheld: its ledger rows go too,
  // so no Tender keeps a ghost's gift.
  try { sqlite.prepare("DELETE FROM tender_skills WHERE skill_key = ?").run(id); } catch { /* table may not exist in a bare boot */ }
  persist(g);
  return { ok: true, removedEdges: before - g.edges.length };
}

export function addEdge(a: string, b: string): { ok: true; edges: number } {
  const g = zodiacGraph();
  const ids = new Set(g.nodes.map(n => n.id));
  if (!ids.has(a) || !ids.has(b)) throw new Error("A road joins two stars that stand in the sky.");
  if (a === b) throw new Error("A star cannot road to itself.");
  if (!g.edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) g.edges.push([a, b]);
  persist(g);
  return { ok: true, edges: g.edges.length };
}

export function deleteEdge(a: string, b: string): { ok: true; edges: number } {
  const g = zodiacGraph();
  g.edges = g.edges.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
  persist(g);
  return { ok: true, edges: g.edges.length };
}

export function resetGraph(): ZodiacGraph {
  cache = seedGraph();
  persist(cache);
  return cache;
}
