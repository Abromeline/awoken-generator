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
 *  v2 (2026-10-22) is the 194-star tree; v3 is the same
 *  tree continued the same day (Nigel, 2026-10-22 14:07):
 *  forks on every road, the deep ring, the lure audit and
 *  the step rulings folded in. A persisted graph from an
 *  older writing is not folded forward — it is replaced
 *  by the seed (the store's migration clears the old held
 *  skills alongside, exactly once, so every spent point is
 *  refunded whole). */
export const ZODIAC_WHEEL_VERSION = 3;

export const FX_PALETTE: { verb: string; label: string; hint: string; hasElement?: boolean }[] = [
  { verb: "tenderHp", label: "Tender HP", hint: "the Tender's own body, at the Table and on the map's standing" },
  { verb: "heal", label: "Healing done", hint: "added to every mending the Tender works" },
  { verb: "tableEnergy", label: "Max energy at the Table", hint: "the seat's purse, and the Bastion's pool share" },
  { verb: "company", label: "Travelling company", hint: "spots beyond the party's base 3 — the wheel's party stars carry this clause (+1 from the Heart, +2 on a road's second arm) — and how many Awokin may stand at the Table at once" },
  { verb: "party", label: "Party level", hint: "a count the party's width is no longer reckoned from (Nigel, 2026-10-22: each party star is a spot, carried as a company clause); kept on the palette for the Starwright's hand" },
  { verb: "attunement", label: "Attunement granted", hint: "standing points in a hue, raising levels, gates and pour caps", hasElement: true },
  { verb: "fellHarvest", label: "Harvest of the fell", hint: "energy when your Awokin fell the dark at the Table" },
  { verb: "roundEnergy", label: "Breath of rounds", hint: "energy returning at each battle round's start" },
  { verb: "roundMend", label: "Mending of rounds", hint: "the Tender's own HP knit at each battle round's start" },
  { verb: "tenderSkin", label: "Thickened skin", hint: "strikes against the bare Tender blunted, never below 1" },
  { verb: "firstWorkingDiscount", label: "Steady hand", hint: "the battle's first ward or rune costs this much less" },
  // ── THE EFFECTS WIRING (Recovery #1, Nigel 2026-10-23
  // "1. wire and fix"): the v2 wheel's own grants, carried
  // as clauses at their deepened values (step × depth tier)
  // and read by name at their points of use. Three of these
  // verbs are carried sums whose final seam is NOT yet in
  // the world, named plainly here and in the build report:
  // "study" and "aim" wait on the Tender's CHOICE of the one
  // school / one rune weapon (no pick, and no storage for a
  // pick, exists anywhere yet — the sums accrue and are
  // provable, and no reader pretends otherwise); "attuneDepth"
  // waits on a ruling for what a lay's "depth" is (the
  // attunement system holds points and stages, no depth
  // measure); "lifeGiver" waits on the Life buildings
  // themselves (the buildings build). Their clauses seed
  // NOW so the day those seams land, the sums are already
  // standing.
  { verb: "tenderAc", label: "Tender AC", hint: "the bare Tender's armour class, both grounds" },
  { verb: "tenderAb", label: "Tender attack bonus", hint: "the Tender's own weapon strikes, both grounds" },
  { verb: "awokinAc", label: "Awokin AC", hint: "added to a standing Awokin's toughness when the dark strikes it" },
  { verb: "awokinAb", label: "Awokin attack bonus", hint: "added to a standing Awokin's strike roll" },
  { verb: "awokinRegen", label: "Awokin regeneration", hint: "HP per battle beat (2.8 s) returning to the Tender's standing Awokin" },
  { verb: "buildSpeed", label: "Build speed", hint: "percent of build time struck off every building and Hall upgrade" },
  { verb: "plantGrowth", label: "Plant growth", hint: "percent faster: tray growth under a standing press, and the crops' regrowth" },
  { verb: "attunementRate", label: "Attunement rate", hint: "extra points laid per point spent at the Attune doors, both grounds" },
  { verb: "attuneDepth", label: "Attune depth", hint: "carried, unread — see the note above" },
  { verb: "lifeGiver", label: "Life Giver", hint: "carried, unread — Life buildings are not built yet" },
  { verb: "returnHome", label: "Return", hint: "Awokin saved whole from a dissipation, per event" },
  { verb: "summoner", label: "Summoner's Power", hint: "added to the summon cast's reckoning at the Table and on the map" },
  { verb: "critChance", label: "Critical reach", hint: "the critical threshold falls this far below a natural 20" },
  { verb: "critDamage", label: "Critical deepening", hint: "half-multiples added to a critical's 2× damage (amount 1 = +0.5×)" },
  { verb: "runeDamage", label: "Rune damage", hint: "added to a written rune's power at the cast, both grounds" },
  { verb: "wardHp", label: "Ward health", hint: "added to a raised ward's health rating, both grounds" },
  { verb: "shieldDice", label: "Shield dice", hint: "extra shield dice in a summoned Awokin's pool — the parts' dice, rolled again in their order" },
  { verb: "hpOnKill", label: "Swallow the Heart", hint: "HP to the Tender and every standing Awokin of theirs when their side makes a kill" },
  { verb: "mercy", label: "Miscast mercy (the star)", hint: "percent of a fizzled cast's spent energy returned — the zodiac clause, not the Witch's own gift" },
  { verb: "study", label: "Study", hint: "carried, unread — waits on the Tender's choice of the one school" },
  { verb: "aim", label: "Aim", hint: "carried, unread — waits on the Tender's choice of the one rune weapon" },
];
const PALETTE_VERBS = new Set(FX_PALETTE.map(p => p.verb));
const ELEMENTS = new Set(["tide", "sky", "stone", "root", "fire"]);

/** Stars whose workings are ALSO Keeper-wired in code, beyond
 *  any clauses they carry. The v2 wheel's stars carry NO
 *  bespoke wiring yet — their grants are display text until
 *  the effects build seats them — so this stands empty
 *  rather than naming stars that no longer stand. */
export const BESPOKE_IDS: string[] = [];

/** The seed's clause-writing. Every clause below is a
 *  star's own grant carried at its DEEPENED value — the
 *  step its text names × its depth tier (Heart and first
 *  arm ×1, second arm ×2, capstone and rim ×3) — and
 *  accrual is PER STAR (Nigel, 2026-10-23 13:12): each
 *  held star carrying an effect adds its amount, and the
 *  sums (skills.ts fxSum) are what the points of use read.
 *  The party stars came first (Nigel, 2026-10-22 20:24:
 *  "each party star is a spot: +1, second-arm stars +2"):
 *  h5; w_b2, w_b7, w_b10, w_b16; r_b4, r_b8, r_b16; b_b3,
 *  b_b6, b_b12; wi_b7, wi_b11 — thirteen stars, and
 *  party.ts reckons the party's width from the same sum
 *  companyCapFor reads for the Table's standing band.
 *  THE EFFECTS WIRING (Recovery #1, 2026-10-23) seats the
 *  rest of the wheel's own texts the same way — every
 *  amount derived from the star's own effect text and
 *  tier in zodiacData, never from a paraphrase. NOT
 *  seeded, by their own records: the class-company
 *  deepening stars (Warden / Runewright / Binder / Sage /
 *  Witch company texts — Recovery #7's build, which codes
 *  the company bonuses themselves) and the two step-open
 *  Witch gifts (wi_b5, wi_b12), which carry no figures
 *  anywhere in the record. (A graph already persisted at
 *  this wheel's version serves as it stands, so these
 *  clauses reach such a saved wheel only through THE
 *  EFFECTS-FX PASS below, as the party clauses reached
 *  it through theirs.) */
const SEED_FX: Record<string, FxClause[]> = {
  h5: [{ verb: "company", amount: 1 }],
  w_b2: [{ verb: "company", amount: 2 }],
  w_b7: [{ verb: "company", amount: 2 }],
  w_b10: [{ verb: "company", amount: 2 }],
  w_b16: [{ verb: "company", amount: 2 }],
  r_b4: [{ verb: "company", amount: 2 }],
  r_b8: [{ verb: "company", amount: 2 }],
  r_b16: [{ verb: "company", amount: 2 }],
  b_b3: [{ verb: "company", amount: 2 }],
  b_b6: [{ verb: "company", amount: 2 }],
  b_b12: [{ verb: "company", amount: 2 }],
  wi_b7: [{ verb: "company", amount: 2 }],
  wi_b11: [{ verb: "company", amount: 2 }],
  b_a1: [{ verb: "plantGrowth", amount: 5 }],
  b_a10: [{ verb: "wardHp", amount: 1 }],
  b_a11: [{ verb: "buildSpeed", amount: 5 }],
  b_a12: [{ verb: "attunementRate", amount: 1 }],
  b_a13: [{ verb: "lifeGiver", amount: 1 }],
  b_a14: [{ verb: "plantGrowth", amount: 5 }],
  b_a15: [{ verb: "buildSpeed", amount: 5 }],
  b_a16: [{ verb: "lifeGiver", amount: 1 }],
  b_a2: [{ verb: "plantGrowth", amount: 5 }],
  b_a3: [{ verb: "attunementRate", amount: 1 }],
  b_a4: [{ verb: "awokinRegen", amount: 1 }],
  b_a5: [{ verb: "buildSpeed", amount: 5 }],
  b_a6: [{ verb: "plantGrowth", amount: 5 }],
  b_a7: [{ verb: "lifeGiver", amount: 1 }],
  b_a8: [{ verb: "attunementRate", amount: 1 }],
  b_a9: [{ verb: "plantGrowth", amount: 5 }],
  b_b1: [{ verb: "returnHome", amount: 2 }],
  b_b10: [{ verb: "awokinRegen", amount: 2 }],
  b_b11: [{ verb: "attuneDepth", amount: 2 }],
  b_b14: [{ verb: "attuneDepth", amount: 2 }],
  b_b15: [{ verb: "summoner", amount: 2 }],
  b_b16: [{ verb: "returnHome", amount: 2 }],
  b_b2: [{ verb: "attuneDepth", amount: 2 }],
  b_b4: [{ verb: "wardHp", amount: 2 }],
  b_b5: [{ verb: "attuneDepth", amount: 2 }],
  b_b8: [{ verb: "attuneDepth", amount: 2 }],
  b_b9: [{ verb: "summoner", amount: 2 }],
  b_c: [{ verb: "attuneDepth", amount: 3 }],
  h1: [{ verb: "attunementRate", amount: 1 }],
  h10: [{ verb: "aim", amount: 1 }],
  h11: [{ verb: "awokinAb", amount: 1 }],
  h2: [{ verb: "tenderAc", amount: 1 }],
  h3: [{ verb: "tenderAb", amount: 1 }],
  h4: [{ verb: "awokinRegen", amount: 1 }],
  h6: [{ verb: "buildSpeed", amount: 5 }],
  h7: [{ verb: "awokinAc", amount: 1 }],
  h8: [{ verb: "study", amount: 1 }],
  h9: [{ verb: "returnHome", amount: 1 }],
  r_a1: [{ verb: "runeDamage", amount: 1 }],
  r_a10: [{ verb: "aim", amount: 1 }],
  r_a11: [{ verb: "runeDamage", amount: 1 }],
  r_a12: [{ verb: "attunementRate", amount: 1 }],
  r_a13: [{ verb: "study", amount: 1 }],
  r_a14: [{ verb: "aim", amount: 1 }],
  r_a15: [{ verb: "runeDamage", amount: 1 }],
  r_a16: [{ verb: "attunementRate", amount: 1 }],
  r_a2: [{ verb: "runeDamage", amount: 1 }],
  r_a3: [{ verb: "aim", amount: 1 }],
  r_a4: [{ verb: "aim", amount: 1 }],
  r_a5: [{ verb: "attunementRate", amount: 1 }],
  r_a6: [{ verb: "study", amount: 1 }],
  r_a7: [{ verb: "runeDamage", amount: 1 }],
  r_a8: [{ verb: "attunementRate", amount: 1 }],
  r_a9: [{ verb: "study", amount: 1 }],
  r_b1: [{ verb: "summoner", amount: 2 }],
  r_b10: [{ verb: "summoner", amount: 2 }],
  r_b11: [{ verb: "study", amount: 2 }],
  r_b12: [{ verb: "tenderAb", amount: 2 }],
  r_b13: [{ verb: "returnHome", amount: 2 }],
  r_b14: [{ verb: "summoner", amount: 2 }],
  r_b15: [{ verb: "critChance", amount: 2 }],
  r_b2: [{ verb: "tenderAb", amount: 2 }],
  r_b3: [{ verb: "returnHome", amount: 2 }],
  r_b5: [{ verb: "study", amount: 2 }],
  r_b6: [{ verb: "awokinAb", amount: 2 }],
  r_b7: [{ verb: "summoner", amount: 2 }],
  r_b9: [{ verb: "runeDamage", amount: 2 }],
  r_c: [{ verb: "runeDamage", amount: 3 }],
  rim1: [{ verb: "attunementRate", amount: 3 }],
  rim10: [{ verb: "attuneDepth", amount: 3 }],
  rim11: [{ verb: "attunementRate", amount: 3 }],
  rim12: [{ verb: "attunementRate", amount: 3 }],
  rim2: [{ verb: "attuneDepth", amount: 3 }],
  rim3: [{ verb: "summoner", amount: 3 }],
  rim4: [{ verb: "plantGrowth", amount: 15 }],
  rim5: [{ verb: "lifeGiver", amount: 3 }],
  rim6: [{ verb: "runeDamage", amount: 3 }],
  rim7: [{ verb: "wardHp", amount: 3 }],
  rim8: [{ verb: "study", amount: 3 }],
  rim9: [{ verb: "aim", amount: 3 }],
  s_a1: [{ verb: "plantGrowth", amount: 5 }],
  s_a10: [{ verb: "lifeGiver", amount: 1 }],
  s_a11: [{ verb: "attuneDepth", amount: 1 }],
  s_a13: [{ verb: "buildSpeed", amount: 5 }],
  s_a14: [{ verb: "attuneDepth", amount: 1 }],
  s_a16: [{ verb: "plantGrowth", amount: 5 }],
  s_a2: [{ verb: "hpOnKill", amount: 1 }],
  s_a3: [{ verb: "summoner", amount: 1 }],
  s_a5: [{ verb: "plantGrowth", amount: 5 }],
  s_a6: [{ verb: "lifeGiver", amount: 1 }],
  s_a7: [{ verb: "attuneDepth", amount: 1 }],
  s_a9: [{ verb: "plantGrowth", amount: 5 }],
  s_b1: [{ verb: "attuneDepth", amount: 2 }],
  s_b10: [{ verb: "attuneDepth", amount: 2 }],
  s_b11: [{ verb: "study", amount: 2 }],
  s_b12: [{ verb: "attunementRate", amount: 2 }],
  s_b13: [{ verb: "critChance", amount: 2 }],
  s_b14: [{ verb: "attuneDepth", amount: 2 }],
  s_b15: [{ verb: "aim", amount: 2 }],
  s_b16: [{ verb: "attuneDepth", amount: 2 }],
  s_b2: [{ verb: "study", amount: 2 }],
  s_b3: [{ verb: "attunementRate", amount: 2 }],
  s_b4: [{ verb: "critChance", amount: 2 }],
  s_b5: [{ verb: "attuneDepth", amount: 2 }],
  s_b6: [{ verb: "study", amount: 2 }],
  s_b7: [{ verb: "attunementRate", amount: 2 }],
  s_b9: [{ verb: "aim", amount: 2 }],
  s_c: [{ verb: "attuneDepth", amount: 3 }],
  w_a1: [{ verb: "tenderAc", amount: 1 }],
  w_a10: [{ verb: "study", amount: 1 }],
  w_a11: [{ verb: "wardHp", amount: 1 }],
  w_a12: [{ verb: "tenderAc", amount: 1 }],
  w_a13: [{ verb: "aim", amount: 1 }],
  w_a14: [{ verb: "buildSpeed", amount: 5 }],
  w_a15: [{ verb: "tenderAb", amount: 1 }],
  w_a16: [{ verb: "tenderAc", amount: 1 }],
  w_a2: [{ verb: "wardHp", amount: 1 }],
  w_a3: [{ verb: "tenderAc", amount: 1 }],
  w_a4: [{ verb: "study", amount: 1 }],
  w_a5: [{ verb: "buildSpeed", amount: 5 }],
  w_a6: [{ verb: "tenderAc", amount: 1 }],
  w_a7: [{ verb: "aim", amount: 1 }],
  w_a8: [{ verb: "wardHp", amount: 1 }],
  w_a9: [{ verb: "tenderAb", amount: 1 }],
  w_b1: [{ verb: "awokinAc", amount: 2 }],
  w_b11: [{ verb: "shieldDice", amount: 2 }],
  w_b12: [{ verb: "returnHome", amount: 2 }],
  w_b13: [{ verb: "awokinRegen", amount: 2 }],
  w_b14: [{ verb: "awokinAb", amount: 2 }],
  w_b15: [{ verb: "critChance", amount: 2 }],
  w_b3: [{ verb: "returnHome", amount: 2 }],
  w_b5: [{ verb: "returnHome", amount: 2 }],
  w_b6: [{ verb: "shieldDice", amount: 2 }],
  w_b8: [{ verb: "awokinAb", amount: 2 }],
  w_b9: [{ verb: "awokinRegen", amount: 2 }],
  w_c: [{ verb: "returnHome", amount: 3 }],
  wi_a1: [{ verb: "study", amount: 1 }],
  wi_a10: [{ verb: "aim", amount: 1 }],
  wi_a11: [{ verb: "critChance", amount: 1 }],
  wi_a12: [{ verb: "study", amount: 1 }],
  wi_a13: [{ verb: "tenderAb", amount: 1 }],
  wi_a14: [{ verb: "aim", amount: 1 }],
  wi_a15: [{ verb: "attunementRate", amount: 1 }],
  wi_a16: [{ verb: "study", amount: 1 }],
  wi_a2: [{ verb: "mercy", amount: 25 }],
  wi_a3: [{ verb: "attunementRate", amount: 1 }],
  wi_a4: [{ verb: "critChance", amount: 1 }],
  wi_a5: [{ verb: "study", amount: 1 }],
  wi_a6: [{ verb: "aim", amount: 1 }],
  wi_a7: [{ verb: "tenderAb", amount: 1 }],
  wi_a8: [{ verb: "awokinRegen", amount: 1 }],
  wi_a9: [{ verb: "study", amount: 1 }],
  wi_b1: [{ verb: "attunementRate", amount: 2 }],
  wi_b10: [{ verb: "study", amount: 2 }],
  wi_b13: [{ verb: "attunementRate", amount: 2 }],
  wi_b14: [{ verb: "awokinAc", amount: 2 }],
  wi_b15: [{ verb: "awokinAb", amount: 2 }],
  wi_b16: [{ verb: "study", amount: 2 }],
  wi_b2: [{ verb: "awokinAb", amount: 2 }],
  wi_b3: [{ verb: "critChance", amount: 2 }],
  wi_b4: [{ verb: "shieldDice", amount: 2 }],
  wi_b6: [{ verb: "awokinRegen", amount: 2 }],
  wi_b9: [{ verb: "awokinAb", amount: 2 }],
  wi_c: [{ verb: "returnHome", amount: 3 }],
};
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

/** ── THE PARTY-FX PASS (Nigel's choice, 2026-10-22 20:51:
 *  "Build the surgical refresh, then push both together") ──
 *  A world whose wheel was already saved before the party
 *  wiring (bb107a0) serves its persisted graph as it stands,
 *  so the thirteen party stars stand there with empty
 *  clauses and every party in that world reads the bare 3.
 *  This pass carries the clauses into such a saved wheel —
 *  ONCE per world, keyed by its stamp in ui_config. When
 *  the stamp is absent, the seed's own fx are written onto
 *  the party stars standing in the persisted graph — the
 *  stars SEED_FX itself names, read from the seed, never a
 *  second copy of the grants — and the stamp is written.
 *  When the stamp stands, the pass does nothing, ever
 *  again, so a Starwright's later hand on those stars is
 *  safe from it.
 *
 *  The surgery is exactly this wide and no wider: only the
 *  thirteen party stars' fx arrays may change. No node's
 *  name, cost, roads or place; no other node's clauses; no
 *  Tender's held skills, points or party; no wheel-version
 *  bump and no refund. A party star absent from a saved
 *  graph is skipped — the pass adds no stars. It runs
 *  inside zodiacGraph(), the one door every graph read
 *  passes through, before the graph is first served. */
const PARTY_FX_STAMP_KEY = "zodiac.partyFxPass";
const PARTY_FX_STAMP = "party-fx-2026-10-22";

function partyFxStamped(): boolean {
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(PARTY_FX_STAMP_KEY) as { value: string } | undefined;
    return row?.value === PARTY_FX_STAMP;
  } catch { return false; }
}

function stampPartyFxPass(): void {
  const existing = sqlite.prepare("SELECT key FROM ui_config WHERE key = ?").get(PARTY_FX_STAMP_KEY);
  if (existing) sqlite.prepare("UPDATE ui_config SET value = ?, updated_at = ? WHERE key = ?").run(PARTY_FX_STAMP, Date.now(), PARTY_FX_STAMP_KEY);
  else sqlite.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, ?)").run(PARTY_FX_STAMP_KEY, PARTY_FX_STAMP, Date.now());
}

/** Write the seed's clauses onto the party stars standing
 *  in a saved graph. Returns true when any star's clauses
 *  moved. */
function carryPartyFx(g: ZodiacGraph): boolean {
  const seedById = new Map(seedGraph().nodes.map(n => [n.id, n]));
  let moved = false;
  for (const n of g.nodes) {
    if (!(n.id in SEED_FX)) continue;
    const s = seedById.get(n.id);
    if (!s) continue;
    if (JSON.stringify(n.fx) !== JSON.stringify(s.fx)) {
      n.fx = s.fx.map(c => ({ ...c }));
      moved = true;
    }
  }
  return moved;
}

/** ── THE EFFECTS-FX PASS (Recovery #1, 2026-10-23) ─────
 *  The party pass's twin, for the effects wiring: a world
 *  whose wheel was saved before this build serves its
 *  persisted graph as it stands, so the 164 stars wired
 *  today would stand there with empty clauses and every
 *  effect would read zero. This pass carries the seed's
 *  clauses into such a saved wheel — ONCE per world,
 *  keyed by its own stamp, in the party pass's exact
 *  shape: only the wired stars' fx arrays may change,
 *  written from the seed itself, never a second copy of
 *  the grants; a wired star absent from a saved graph is
 *  skipped; the party stars are NOT this pass's business
 *  (theirs stands above), and no node's name, cost, roads
 *  or place moves, no held skill or point is touched, and
 *  there is no wheel-version bump and no refund. When the
 *  stamp stands, the pass does nothing, ever again, so a
 *  Starwright's later hand on those stars is safe. */
const EFFECTS_FX_STAMP_KEY = "zodiac.effectsFxPass";
const EFFECTS_FX_STAMP = "effects-fx-2026-10-23";
/** The stars this pass may touch: every seeded star whose
 *  clauses carry at least one verb beyond "company" (the
 *  party stars' own pass owns the pure-company thirteen;
 *  b_b3's kin are among them and carry company alone). */
const EFFECTS_FX_IDS = new Set(Object.keys(SEED_FX).filter(id => (SEED_FX[id] ?? []).some(c => c.verb !== "company")));

function effectsFxStamped(): boolean {
  try {
    const row = sqlite.prepare("SELECT value FROM ui_config WHERE key = ?").get(EFFECTS_FX_STAMP_KEY) as { value: string } | undefined;
    return row?.value === EFFECTS_FX_STAMP;
  } catch { return false; }
}

function stampEffectsFxPass(): void {
  const existing = sqlite.prepare("SELECT key FROM ui_config WHERE key = ?").get(EFFECTS_FX_STAMP_KEY);
  if (existing) sqlite.prepare("UPDATE ui_config SET value = ?, updated_at = ? WHERE key = ?").run(EFFECTS_FX_STAMP, Date.now(), EFFECTS_FX_STAMP_KEY);
  else sqlite.prepare("INSERT INTO ui_config (key, value, updated_at) VALUES (?, ?, ?)").run(EFFECTS_FX_STAMP_KEY, EFFECTS_FX_STAMP, Date.now());
}

/** Write the seed's clauses onto the wired stars standing
 *  in a saved graph. Returns true when any star's clauses
 *  moved. */
function carryEffectsFx(g: ZodiacGraph): boolean {
  const seedById = new Map(seedGraph().nodes.map(n => [n.id, n]));
  let moved = false;
  for (const n of g.nodes) {
    if (!EFFECTS_FX_IDS.has(n.id)) continue;
    const s = seedById.get(n.id);
    if (!s) continue;
    if (JSON.stringify(n.fx) !== JSON.stringify(s.fx)) {
      n.fx = s.fx.map(c => ({ ...c }));
      moved = true;
    }
  }
  return moved;
}

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
        // THE PARTY-FX PASS: a saved wheel from before the
        // party wiring gains the thirteen party stars'
        // clauses here — once, under its stamp, before the
        // graph is served. A wounded pass leaves the graph
        // exactly as it stands.
        try {
          if (!partyFxStamped()) {
            if (carryPartyFx(cache)) persist(cache);
            stampPartyFxPass();
          }
        } catch { /* the graph serves as it stands */ }
        // THE EFFECTS-FX PASS: the same surgery, one stamp
        // over — a saved wheel from before the effects
        // wiring gains the 164 wired stars' clauses here,
        // once, before the graph is served.
        try {
          if (!effectsFxStamped()) {
            if (carryEffectsFx(cache)) persist(cache);
            stampEffectsFxPass();
          }
        } catch { /* the graph serves as it stands */ }
        return cache;
      }
    }
  } catch { /* a wounded doc falls back to the first writing */ }
  cache = seedGraph();
  try { persist(cache); } catch { /* the seed still serves from memory */ }
  // A fresh world is born already carrying the clauses; the
  // stamp still stands, so its saved wheel is never mistaken
  // for a stale one on a later boot.
  try { stampPartyFxPass(); } catch { /* the seed still serves from memory */ }
  try { stampEffectsFxPass(); } catch { /* the seed still serves from memory */ }
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
