// ── The Grimoire (Nigel, 2026-10-17) ────────────────────
// The Written Light, kept as a living book in the workshop:
// every glyph image sorted (ward / rune / binding / spell) and
// assigned to a spell; every spell's cost and numbers tuned in
// the workshop and read by the world — the Table's referee and
// the territory map alike — instead of living in code. State is
// one JSON document in ui_config ("grimoire.state"); an
// in-memory cache serves the referee's hot paths, refreshed at
// every Table message and round, and at boot. The seed is the
// Written Light exactly as it was first seated: ten roots and
// Heal, their numbers the ones the game already played by.

import { and, eq } from "drizzle-orm";
import { db, schema } from "./store.js";
import { WORKING_DEFS } from "./workings.js";

export type GlyphSort = "ward" | "rune" | "binding" | "spell" | "unsorted";
export type SpellKind = "ward" | "rune" | "binding" | "spell";

export interface GrimoireGlyph {
  id: string;
  name: string;
  /** Bundled client asset key (e.g. "seal") for built-in glyphs. */
  assetKey: string | null;
  /** Served URL for uploaded glyphs (/blobs/…). */
  imageUrl: string | null;
  sort: GlyphSort;
  spellKey: string | null;
  builtin: boolean;
}

export interface GrimoireSpell {
  key: string;
  name: string;
  kind: SpellKind;
  /** The mechanic this spell runs in the world. "none" = named
   *  and numbered in the book, not yet seated in any referee. */
  engine: string;
  glyphId: string | null;
  cost: number;
  blurb: string;
  numbers: Record<string, number>;
  forms: Record<string, string>;
  builtin: boolean;
}

export interface GrimoireState { glyphs: GrimoireGlyph[]; spells: GrimoireSpell[] }

/** The number fields each engine carries — labels for the
 *  workshop editor, defaults for new spells. */
export const ENGINE_NUMBER_FIELDS: Record<string, { key: string; label: string; def: number }[]> = {
  springleaf: [],
  seal: [
    { key: "riposte", label: "Riposte power (harm answered to the striker)", def: 3 },
    { key: "brightBonus", label: "Extra riposte while an Engine burns", def: 1 },
    { key: "stops", label: "Strikes stopped before the Seal goes out", def: 3 },
    { key: "hp", label: "Health rating (base) — each stopped blow costs the blow's power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  engine: [
    { key: "energyPerRound", label: "Energy to its tender each round", def: 1 },
  ],
  standard: [
    { key: "strikeBonus", label: "Strike bonus on either hex it divides", def: 1 },
  ],
  trees: [
    { key: "hp", label: "Health rating (base) the Trees take before breaking", def: 8 },
    { key: "brightHpBonus", label: "Extra health while an Engine burns", def: 2 },
    { key: "regrow", label: "Health regrown each round", def: 2 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  beacon: [
    { key: "darkBonus", label: "Bonus striking the dark on or beside its hexes", def: 1 },
  ],
  lattice: [
    { key: "pinRounds", label: "Rounds the dark stands pinned", def: 2 },
    { key: "hp", label: "Health rating (base) — pinning a dark costs its power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per elemental point poured in at the cast", def: 2 },
  ],
  blade: [
    { key: "power", label: "Harm to everything on its ground", def: 6 },
    { key: "brightBonus", label: "Extra harm while an Engine burns", def: 1 },
    { key: "charges", label: "Times it springs before it is spent", def: 2 },
  ],
  blades: [
    { key: "power", label: "Harm on each planted hex", def: 3 },
    { key: "brightBonus", label: "Extra harm while an Engine burns", def: 1 },
    { key: "maxTargets", label: "Hexes it may be planted on at once", def: 3 },
  ],
  shard: [
    { key: "minPower", label: "Least power that wakes the Shard", def: 5 },
    { key: "multiplier", label: "Harm = greatest power × this", def: 2 },
    { key: "harmPerPoint", label: "Extra harm per elemental point poured in at the cast (the gated working's pour is capped)", def: 1 },
  ],
  coil: [
    { key: "energyPerDark", label: "Energy per dark thrown back", def: 1 },
    { key: "energyCap", label: "Most energy one Coil returns", def: 3 },
  ],
  heal: [],
  none: [],
};

export const ENGINE_KEYS = Object.keys(ENGINE_NUMBER_FIELDS);

const SEED_NUMBERS: Record<string, Record<string, number>> = Object.fromEntries(
  Object.entries(ENGINE_NUMBER_FIELDS).map(([engine, fields]) => [
    engine,
    Object.fromEntries(fields.map(f => [f.key, f.def])),
  ]),
);

/** The book as it first opens: the Written Light, seated. */
export function defaultGrimoire(): GrimoireState {
  const glyphs: GrimoireGlyph[] = [];
  const spells: GrimoireSpell[] = [];
  for (const def of Object.values(WORKING_DEFS) as any[]) {
    const glyphId = `glyph-${def.key}`;
    glyphs.push({
      id: glyphId,
      name: def.root,
      assetKey: def.key,
      imageUrl: null,
      sort: def.kind === "ward" ? "ward" : "rune",
      spellKey: def.key,
      builtin: true,
    });
    spells.push({
      key: def.key,
      name: def.root,
      kind: def.kind,
      engine: def.key,
      glyphId,
      cost: def.cost,
      blurb: def.blurb,
      numbers: { ...(SEED_NUMBERS[def.key] ?? {}) },
      forms: { ...def.forms },
      builtin: true,
    });
  }
  // Heal — the first binding working. Its amount is not a
  // number in this book: it is the Tender's heal tier, by law.
  spells.push({
    key: "heal",
    name: "Heal — the Binding Light",
    kind: "binding",
    engine: "heal",
    glyphId: null,
    cost: 2,
    blurb: "Mend one of your own standing Awoken. The amount is your heal tier (5 × tier, tier rising every three Tender levels) — the book holds only its price.",
    numbers: {},
    forms: { unaligned: "Heal", tide: "Heal", sky: "Heal", stone: "Heal", root: "Heal", fire: "Heal" },
    builtin: true,
  });
  // The Springleaf Ward (Nigel, 2026-10-17) — written into the
  // book ahead of its referee: it stands in a marching column's
  // path, stops it, and turns it back three hexes in a random
  // direction, before the column re-roads for its original goal.
  // Columns do not march yet, so no engine runs it; the book says
  // so plainly (engine "none") and it wakes when the marching pass
  // is built. Its glyph is owed — one of the five undrawn roots.
  spells.push({
    key: "springleaf",
    name: "The Springleaf Ward",
    kind: "ward",
    engine: "springleaf",
    glyphId: null,
    cost: 3,
    blurb: "Stands in the path of an incoming column of enemies, stops it, and redirects it back three hexes in a random direction — before the column reroutes to its original goal. Its referee woke with the columns: cast it on the land a column's traced line crosses, and the line breaks on it.",
    numbers: {},
    forms: { unaligned: "The Springleaf Ward", tide: "Tide Springleaf", sky: "Sky Springleaf", stone: "Stone Springleaf", root: "Root Springleaf", fire: "Fire Springleaf" },
    builtin: true,
  });
  return { glyphs, spells };
}

const CONFIG_KEY = "grimoire.state";
let cache: GrimoireState | null = null;

/** The book as the world reads it right now (sync, cached). */
export function grimoireNow(): GrimoireState {
  if (!cache) cache = defaultGrimoire();
  return cache;
}

export function spellByKey(key: string): GrimoireSpell | null {
  return grimoireNow().spells.find(s => s.key === key) ?? null;
}

export function healSpell(): GrimoireSpell | null {
  return grimoireNow().spells.find(s => s.engine === "heal") ?? null;
}

// ── The Pour and the Health Rating (Nigel, 2026-10-17) ──────
// At the cast of a ward or rune, the Tender may pour elemental
// points of the poured hue into the working. The pour is the
// limiting hand: points spent into workings are points not
// spent birthing or deepening aspects. Binding healing is
// exempt — it requires energy only. Wards and runes that HOLD
// BACK enemies carry a health rating grown from the book's
// base, the caster's Tender level, and the pour; the gated
// Shard takes a capped pour that feeds its harm instead.
export const POUR_ENGINES = ["seal", "trees", "lattice", "shard"] as const;

/** A Tender's attunement LEVEL in an element (Nigel, 2026-10-17):
 *  the depth band — ten attunement points per level, L3 at 30+.
 *  0–9 → Lv 0, 10–19 → Lv 1, 20–29 → Lv 2, 30+ → Lv 3. */
export function attunementLevel(points: number): number {
  return Math.min(3, Math.floor(Math.max(0, points) / 10));
}

/** How deeply a Tender may pour into a working at its cast
 *  (Nigel, 2026-10-17): their attunement LEVEL in the POURED
 *  element — no deeper. The book's old pourCap no longer
 *  governs; the level alone is the cap. 0 for workings that
 *  take no pour and for unaligned casts (no element to pour). */
export function pourCapFor(spell: GrimoireSpell, pools: Record<string, number>, hue: string): number {
  if (!(POUR_ENGINES as readonly string[]).includes(spell.engine)) return 0;
  if (!hue || hue === "unaligned") return 0;
  return attunementLevel(pools[hue] ?? 0);
}

/** The health a holding working is raised with, snapshotted at
 *  the cast: the book's base + a measure per Tender level + a
 *  measure per point poured. 0 for workings that do not hold. */
export function hpForCast(spell: GrimoireSpell, tenderLevel: number, pour: number, bright: boolean): number {
  const n = spell.numbers ?? {};
  if (spell.engine === "seal" || spell.engine === "lattice") {
    return Math.max(1, Math.floor((n.hp ?? 6) + (n.hpPerLevel ?? 1) * tenderLevel + (n.hpPerPoint ?? 2) * pour));
  }
  if (spell.engine === "trees") {
    return Math.max(1, Math.floor((n.hp ?? 8) + (bright ? (n.brightHpBonus ?? 2) : 0) + (n.hpPerLevel ?? 1) * tenderLevel + (n.hpPerPoint ?? 2) * pour));
  }
  return 0;
}

/** Spend attunement points of one element from a Tender's pool
 *  (the same pools that birth and deepen aspects). Returns the
 *  points the pool held when it could not pay. */
export async function spendAttunement(ownerKey: string, element: string, points: number): Promise<{ ok: boolean; held: number }> {
  if (points <= 0) return { ok: true, held: 0 };
  const rows = await db.select().from(schema.aspectAttunement)
    .where(and(
      eq(schema.aspectAttunement.ownerKey, ownerKey),
      eq(schema.aspectAttunement.element, element as any)
    )).limit(1);
  const held = rows.length ? (rows[0].points ?? 0) : 0;
  if (held < points) return { ok: false, held };
  await db.update(schema.aspectAttunement)
    .set({ points: held - points, updatedAt: new Date() })
    .where(and(
      eq(schema.aspectAttunement.ownerKey, ownerKey),
      eq(schema.aspectAttunement.element, element as any)
    ));
  return { ok: true, held };
}

/** Read a Tender's attunement pools (for cast surfaces). */
export async function attunementPools(ownerKey: string): Promise<Record<string, number>> {
  const rows = await db.select().from(schema.aspectAttunement)
    .where(eq(schema.aspectAttunement.ownerKey, ownerKey));
  const out: Record<string, number> = {};
  for (const r of rows as any[]) out[r.element] = Math.floor(r.points ?? 0);
  return out;
}

/** Load the stored book into the cache (or the seed, if the
 *  workshop has never saved). Never writes on a read. A stored
 *  book is brought current in memory: number traits the book has
 *  grown since it was saved (the pour and health traits, Nigel
 *  2026-10-17) arrive at their defaults without touching a single
 *  tuned value, and built-in spells written since (the Springleaf)
 *  are appended by key. The workshop's next save persists both. */
export async function refreshGrimoire(): Promise<GrimoireState> {
  try {
    const rows = await db.select().from(schema.uiConfig).where(eq(schema.uiConfig.key, CONFIG_KEY));
    const raw = rows[0]?.value as string | undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as GrimoireState;
      if (parsed && Array.isArray(parsed.glyphs) && Array.isArray(parsed.spells)) {
        const seed = defaultGrimoire();
        for (const spell of parsed.spells) {
          spell.numbers = spell.numbers ?? {};
          for (const f of ENGINE_NUMBER_FIELDS[spell.engine] ?? []) {
            if (typeof spell.numbers[f.key] !== "number" || !Number.isFinite(spell.numbers[f.key])) {
              spell.numbers[f.key] = f.def;
            }
          }
          // The pour answers to the Tender's attunement level
          // alone now (Nigel, 2026-10-17) — a stored book pourCap
          // is retired wherever it lingers.
          delete spell.numbers.pourCap;
          // The Springleaf woke with the columns (2026-10-17): a
          // stored book still calling it unwritten (engine
          // "none") is woken to its true engine at refresh.
          if (spell.key === "springleaf" && spell.engine === "none") spell.engine = "springleaf";
        }
        for (const seedSpell of seed.spells) {
          if (seedSpell.builtin && !parsed.spells.some(s => s.key === seedSpell.key)) {
            parsed.spells.push(seedSpell);
          }
        }
        cache = parsed;
        return cache;
      }
    }
  } catch { /* fall through to the seed */ }
  cache = defaultGrimoire();
  return cache;
}

/** Persist the whole book (workshop saves only) and refresh
 *  the cache the world reads. */
export async function saveGrimoire(state: GrimoireState): Promise<void> {
  const value = JSON.stringify(state);
  const existing = await db.select().from(schema.uiConfig).where(eq(schema.uiConfig.key, CONFIG_KEY));
  if (existing.length) {
    await db.update(schema.uiConfig).set({ value }).where(eq(schema.uiConfig.key, CONFIG_KEY));
  } else {
    await db.insert(schema.uiConfig).values({ key: CONFIG_KEY, value });
  }
  cache = state;
}
