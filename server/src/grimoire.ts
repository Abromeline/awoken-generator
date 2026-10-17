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

import { eq } from "drizzle-orm";
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
  seal: [
    { key: "riposte", label: "Riposte power (harm answered to the striker)", def: 3 },
    { key: "brightBonus", label: "Extra riposte while an Engine burns", def: 1 },
    { key: "stops", label: "Strikes stopped before the Seal goes out", def: 3 },
  ],
  engine: [
    { key: "energyPerRound", label: "Energy to its tender each round", def: 1 },
  ],
  standard: [
    { key: "strikeBonus", label: "Strike bonus on either hex it divides", def: 1 },
  ],
  trees: [
    { key: "hp", label: "Health the Trees take before breaking", def: 8 },
    { key: "brightHpBonus", label: "Extra health while an Engine burns", def: 2 },
    { key: "regrow", label: "Health regrown each round", def: 2 },
  ],
  beacon: [
    { key: "darkBonus", label: "Bonus striking the dark on or beside its hexes", def: 1 },
  ],
  lattice: [
    { key: "pinRounds", label: "Rounds the dark stands pinned", def: 2 },
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

/** Load the stored book into the cache (or the seed, if the
 *  workshop has never saved). Never writes on a read. */
export async function refreshGrimoire(): Promise<GrimoireState> {
  try {
    const rows = await db.select().from(schema.uiConfig).where(eq(schema.uiConfig.key, CONFIG_KEY));
    const raw = rows[0]?.value as string | undefined;
    if (raw) {
      const parsed = JSON.parse(raw) as GrimoireState;
      if (parsed && Array.isArray(parsed.glyphs) && Array.isArray(parsed.spells)) {
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
