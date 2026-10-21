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
  shardrain: [
    { key: "diceBase", label: "Dice that always fall (d6)", def: 2 },
    { key: "dicePerLevel", label: "Extra dice per attunement level in the spell's element (d6)", def: 1 },
    { key: "maxHexes", label: "Hexes the rain can cover at the Table", def: 3 },
  ],
  seal: [
    { key: "riposte", label: "Riposte power (harm answered to the striker)", def: 3 },
    { key: "brightBonus", label: "Extra riposte while an Engine burns", def: 1 },
    { key: "stops", label: "Strikes stopped before the Seal goes out", def: 3 },
    { key: "hp", label: "Health rating (base) — each stopped blow costs the blow's power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per attunement level standing in the page, in the cast's element", def: 2 },
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
    { key: "hpPerPoint", label: "Extra health per attunement level standing in the page, in the cast's element", def: 2 },
  ],
  beacon: [
    { key: "darkBonus", label: "Bonus striking the dark on or beside its hexes", def: 1 },
  ],
  lattice: [
    { key: "pinRounds", label: "Rounds the dark stands pinned", def: 2 },
    { key: "hp", label: "Health rating (base) — pinning a dark costs its power", def: 6 },
    { key: "hpPerLevel", label: "Extra health per Tender level of the caster", def: 1 },
    { key: "hpPerPoint", label: "Extra health per attunement level standing in the page, in the cast's element", def: 2 },
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
    { key: "harmPerPoint", label: "Extra harm per attunement level standing in the page, in the cast's element", def: 1 },
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
    blurb: "Mend one of your own standing Awokin. The amount is your heal tier (5 × tier, tier rising every three Tender levels) — the book holds only its price.",
    numbers: {},
    forms: { unaligned: "Heal", tide: "Heal", sky: "Heal", stone: "Heal", root: "Heal", fire: "Heal" },
    builtin: true,
  });
  // THE RUNIC WEAPON (Nigel, 2026-10-19): the Tender's own hand.
  // With his class at Lv 3 he chooses a weapon that floats at
  // his side like an Awokin and lunges on its own at what comes
  // in reach — sword & shield (d6, +3 AC), sword (d10, +1 AC),
  // spear (d6, +1 range), arrow (d4, range 4 — a lone arrow, no
  // bow; it flies itself). Each weapon's one upgrade skill
  // manifests MORE of them. The weapon is the
  // grimoire's FIRST SPELL UNLOCK at Lv 3; the Attune ability it
  // feeds on unlocks at Lv 1, and the weapon takes elemental
  // attunement like an Awokin. Elemental reaches for the company
  // stand beside it: stone 1, root 2, tide 3, sky 4 — and stone
  // and root hands passively raise root and stone walls around
  // the caster against projectiles and advance. (Fire's reach is
  // the Keeper's pencilled 2 until the Keeper of the world rules.)
  //
  // THE CASTING LAW (Nigel, 2026-10-19): class selection means
  // something. Each tender class owns a school of spells —
  // Warden the Ward, Runewright the Rune, Binder the Binding
  // (the Spell school stands unclassed, neutral to all). A cast
  // made IN the caster's school takes +2 on its attack rolls
  // and power rolls, the bonus growing with tender level (+1 at
  // Lv 3, 6, 9 — the Keeper's ladder, awaiting ratification);
  // a CROSS-class spell or rune cast takes -3. And every spell
  // and rune cast now ROLLS for its standing: d20 + that
  // modifier against the spell's CASTING DC, which is the
  // spell's LEVEL + 10. A spell's level lives in its numbers
  // (level, defaulting to 1) and is worked in the workshop like
  // every other number on its page. On a failed roll the Keeper's
  // present call — awaiting the Ancient One's word — is that the
  // energy is spent and the working unravels; abilities (like
  // Attune) are not casts and roll no die.
  // TWO MORE CLASSES (Nigel, 2026-10-19): the WITCH, whose
  // school is the Spell school itself — +2 on spell-school
  // casts and their power rolls, -3 on ward, rune and binding
  // workings. And her POWERING (Nigel, 2026-10-20): when the
  // Witch pours attunement into a working of the spell, rune
  // or ward kind, her pour LAYS TWICE what it costs — the
  // same points spent, twice the depth standing in the
  // working, at the cast and at the push, on both grounds;
  // bindings stand outside the gift. The rate is reckoned
  // once, in pourLaidFor beside the pour's other law in this
  // book, and every pour door calls it. The Spell school stays OPEN even so: a non-witch,
  // non-sage caster still rolls its spells unmodified (±0), for
  // only the ward, rune and binding schools are closed to
  // outsiders. And the SAGE, who owns no school at all: -2 on
  // EVERY cast, spells included (softened from -3 by Nigel's
  // ruling, 2026-10-20 — she is not so weak a caster). Her gift is attunement
  // mastery — when she uses the Attune ability, the ground
  // gains attuneLevel + 2 points while her own attunement pool
  // pays only attuneLevel; the thirty-point cap a hex may hold
  // stands over even her. And her company stands taller for
  // her presence (Nigel, 2026-10-19): Awoken fighting under
  // a Sage gain +2 AC and +2 attack — at the Table, Fate's
  // dice will weigh both exactly. (The Sage is a woman —
  // Nigel's correction, 2026-10-19.)
  // And her own hand (Nigel, 2026-10-20): +2 to her BASE
  // attack roll with the runic weapon — the buff that makes
  // her a viable mid-range melee, hers alone, and separate
  // from her company's blessing above.
  // WARD SIZE (Nigel, 2026-10-19): a ward cast by a TENDER
  // stands 2.75x the size of one cast by an Awokin; wards
  // from low-level Awoken keep the base size. The preview
  // proves it on the tender's own cast (the Springleaf
  // grove's radius x2.75; her summoned saplings heal at
  // half that measure, per the shape ruled the same day).
  // POWERING (Nigel, 2026-10-19): a spell or rune is made
  // stronger by PACKING it with elemental attunement —
  // powering up in the Grimoire is done with attunement
  // energy, and it is EXPENSIVE. That is how a tender
  // attunes their runes to be stronger: pour attunement of
  // the working's hue into it. The cast-time pour in
  // castSpell was this law's first machinery. SEATED
  // (Nigel, 2026-10-20): the machinery now lives where this
  // paragraph always said it belonged — in the Grimoire.
  // Pours go into pages and STAND there (grimoire_
  // attunements); casts on both grounds carry the page's
  // standing level in the cast's element, and no pour is
  // offered or taken at the moment of casting anywhere.
  // The Springleaf (Nigel, reclassed 2026-10-19) — no longer a
  // ward, and no longer a column-breaker: THE BINDING WARD, a
  // heal in the Binding school. Cast it and a grove stands where
  // it is planted; the ground inside a very limited area wears
  // Root aspect artwork as a transparent overlay, its glow
  // shifting and fading, and every ally standing in that glow
  // mends passively. THE SPRINGLEAF'S SHAPE (Nigel,
  // 2026-10-19): the cast costs 3 energy; at the cast an
  // initial BURST heal mends the company within the glow;
  // and the cast summons 1d4 SAPLING groves — each sapling,
  // as it takes root, triggers its own radius heal at HALF
  // the size of the initial burst. The saplings come with
  // the cast; no per-sapling energy is charged. LEVELING
  // the skill increases the heal. The 2026-10-17 columns reading is
  // superseded by this law; the columns engine in actions.ts
  // still answers to the old text until the spells build-out
  // reconciles it. Its glyph is owed — one of the five undrawn
  // roots; meanwhile it wears the drawn Trees glyph.
  spells.push({
    key: "springleaf",
    name: "The Springleaf",
    kind: "binding",
    engine: "springleaf",
    glyphId: null,
    cost: 3,
    blurb: "A grove planted in the Binding school: allies standing in its root-glow — Root aspect art laid transparent on the ground, shifting and fading — mend passively, a little at a time. Unharmed, it seeds sapling groves on neighboring ground, each spreading the glow. Leveling it deepens the heal and widens the spread.",
    numbers: { healPerBreath: 1, radiusHexes: 1, saplingCap: 2, level: 1 },
    forms: { unaligned: "The Springleaf", tide: "Tide Springleaf", sky: "Sky Springleaf", stone: "Stone Springleaf", root: "Root Springleaf", fire: "Fire Springleaf" },
    builtin: true,
  });
  // SHARD RAIN (Nigel, 2026-10-17): its OWN spell, not the Crown
  // Shard's greater form — a rune written over up to three hexes
  // of ground. When the dark stands on its covered ground, the
  // sky opens ONCE: 2d6, plus 1d6 per attunement LEVEL in the
  // spell's element (the caster's level, snapshotted at the
  // cast), rolled as ONE POOL and split between every enemy
  // standing on the covered hexes. Its glyph is owed — one of
  // the five undrawn roots; its rain, though, Nigel has drawn.
  spells.push({
    key: "shardrain",
    name: "Shard Rain",
    kind: "rune",
    engine: "shardrain",
    glyphId: null,
    cost: 5,
    blurb: "A doom written over up to three hexes of ground: when the dark stands on its covered ground, the sky opens once — two dice, plus one more per attunement level in the spell's element — rolled as one pool and split between every enemy standing under it.",
    numbers: {},
    forms: { unaligned: "Shard Rain", tide: "Tide Shard Rain", sky: "Sky Shard Rain", stone: "Stone Shard Rain", root: "Root Shard Rain", fire: "Fire Shard Rain" },
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

// ── Attunement Lives in the Book (Nigel, 2026-10-20) ─────────
// Powering a spell, rune or ward happens HERE, in the
// Grimoire, and nowhere else: the Tender pours elemental
// points from their pools into a page, where the depth STANDS
// (grimoire_attunements), and every cast of that page — at
// the Table, on the land — draws on the page's standing
// attunement in the cast's element. There is no pouring at
// the moment of casting, on either ground: a cast is a cast.
// (The pour at the cast, and the pushing of standing runes,
// stood from 2026-10-17 until this ruling retired them; the
// Attune act on a tile is a different act and stands apart.)
// Only workings whose strength is bought with attunement
// take a pour at all — the holding wards and the gated
// Shard. Binding healing is exempt — it requires energy only.
// Wards and runes that HOLD BACK enemies carry a health
// rating grown from the book's base, the caster's Tender
// level, and the page's standing level in the cast's element;
// the gated Shard's standing level feeds its harm instead.
export const POUR_ENGINES = ["seal", "trees", "lattice", "shard"] as const;

/** A Tender's attunement LEVEL in an element (Nigel, 2026-10-17):
 *  the depth band — ten attunement points per level, L3 at 30+.
 *  0–9 → Lv 0, 10–19 → Lv 1, 20–29 → Lv 2, 30+ → Lv 3. */
export function attunementLevel(points: number): number {
  return Math.min(3, Math.floor(Math.max(0, points) / 10));
}

/** The deepest a page may stand in one element: the top of
 *  the level band — thirty points, Lv 3. A pour that would
 *  carry a page past it lays only to the cap; a page already
 *  there refuses more. */
export const PAGE_DEPTH_CAP = 30;

/** One Tender's whole attunement ledger: the depth standing
 *  in each page, by element — { spellKey: { element: depth } }. */
export async function pageAttunementsFor(ownerKey: string): Promise<Record<string, Record<string, number>>> {
  const rows = await db.select().from(schema.grimoireAttunements)
    .where(eq(schema.grimoireAttunements.ownerKey, ownerKey));
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows as any[]) {
    if (!((r.depth ?? 0) > 0)) continue;
    (out[r.spellKey] ??= {})[r.element] = r.depth;
  }
  return out;
}

/** The depth standing in one page in one element (0 when the
 *  page stands unattuned there). */
export async function pageDepthFor(ownerKey: string, spellKey: string, element: string): Promise<number> {
  const rows = await db.select().from(schema.grimoireAttunements)
    .where(and(
      eq(schema.grimoireAttunements.ownerKey, ownerKey),
      eq(schema.grimoireAttunements.spellKey, spellKey),
      eq(schema.grimoireAttunements.element, element as any)
    )).limit(1);
  return rows.length ? (rows[0].depth ?? 0) : 0;
}

/** Lay depth into a page, clamped at the cap. Returns the
 *  depth the page stands at afterwards. */
export async function layPageDepth(ownerKey: string, spellKey: string, element: string, laid: number): Promise<number> {
  const now = new Date();
  const next = Math.min(PAGE_DEPTH_CAP, (await pageDepthFor(ownerKey, spellKey, element)) + Math.max(0, laid));
  await db.insert(schema.grimoireAttunements)
    .values({ ownerKey, spellKey, element: element as any, depth: next, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.grimoireAttunements.ownerKey, schema.grimoireAttunements.spellKey, schema.grimoireAttunements.element],
      set: { depth: next, updatedAt: now },
    });
  return next;
}

/** The measure a cast of this page carries (Nigel, 2026-10-20):
 *  the page's attunement LEVEL in the cast's element — the
 *  standing depth read through the book's band, the same 0–3
 *  measure the cast-time pour was capped at, now read off the
 *  page instead of paid at the cast. 0 for unaligned casts
 *  (no element to draw on) and for workings that take no
 *  attunement. Both grounds call this, so the reading
 *  cannot drift. */
export async function pagePourFor(ownerKey: string, spell: GrimoireSpell, hue: string): Promise<number> {
  if (!(POUR_ENGINES as readonly string[]).includes(spell.engine)) return 0;
  if (!hue || hue === "unaligned") return 0;
  return attunementLevel(await pageDepthFor(ownerKey, spell.key, hue));
}

/** The health a holding working is raised with, snapshotted at
 *  the cast: the book's base + a measure per Tender level + a
 *  measure per level of the page's standing attunement in the
 *  cast's element (the `pour` a cast carries now). 0 for
 *  workings that do not hold. */
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

/** THE GIFTS AT THE BOOK'S DOOR (Nigel, 2026-10-20): the one
 *  reckoning of what a pour into a Grimoire page LAYS, for
 *  what it costs. THE WITCH'S POWERING: when a Witch pours
 *  attunement into a page of the spell, rune or ward kind,
 *  her pour LAYS twice what it costs — the same points leave
 *  her pool, twice the depth stands in the page. THE SAGE'S
 *  MASTERY: her pours lay +2 beyond what she pays — the
 *  depth she was first proven at the Table's push, re-homed
 *  to the book with the pour itself. The gifts run by the
 *  page's KIND: spell, rune and ward pages drink deep of
 *  them; BINDINGS stand outside both, as they stand outside
 *  the pour itself (binding healing is energy only). Every
 *  other class lays what it spends. The two gifts never meet
 *  on one caster, and this door — the Grimoire's — is the
 *  reckoning's only caller now: there is no pouring at a
 *  cast or at a standing working any more, on either ground. */
export function pourLaidFor(classKey: string | null | undefined, kind: string | null | undefined, wanted: number): number {
  if (wanted <= 0) return wanted;
  if (kind !== "spell" && kind !== "rune" && kind !== "ward") return wanted;
  if (classKey === "witch") return wanted * 2;
  if (classKey === "sage") return wanted + 2;
  return wanted;
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
