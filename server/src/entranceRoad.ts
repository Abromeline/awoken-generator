// THE AWARD ROAD — ENTRANCE BUILD 2 (Nigel's build word,
// 2026-11-01: "Build the entrance now"; the design:
// five-minute-entrance-spec-2026-10-31.md + the RULINGS of
// 2026-11-01 appended to five-minute-entrance-decisions-
// 2026-10-31.md).
//
// The entrance player's original twenty wakes are AWARDS:
// "the first 20 to waken rewards for certain beginning
// achievements decided through system tutorials" — "Complete
// the tutorial section gain 5 awoken." Four tutorial sections
// × 5 = the 20, walked in the road's written order:
//
//   1. LEARN THE DOORS — the homeland face's navigation
//      surfaces, actually opened: the terrain map, My Deck,
//      the Skill Zodiac, Aspect Attunement, the Pack, Find
//      my Tender, and an Awokin's orders wheel.
//   2. ORDERS, AND A FIRST FIGHT — a real order given to
//      each of the door's three (a stance ordered, a march,
//      a patrol, a follow order — written by the standing
//      order actions), AND a first battle actually fought in
//      the living battle (their Awoken dealt harm, or stood
//      a defence against an assailant, in settleHomelandBattle).
//   3. THE BEACON LESSON — in order: the beacon lit by the
//      Tender's own hand → doused by their own hand → at
//      least one real battle fought while it stands doused
//      (the standing spawn/battle machinery on its usual
//      clock — nothing scripted, slowed or counted here) →
//      relit by their own hand.
//   4. THE FIRST CASTING — the starting spell chosen at the
//      Door, cast true on their land (a castMapWorking
//      success: the cast's own territory_workings row stands
//      as its artifact; a fizzle writes nothing and is not
//      a casting).
//
// COMPLETION IS REAL OR NOTHING (the build-honestly law):
// every criterion above is read from the server's own record
// of the act — the act-ledger below, written ONLY by the
// standing actions at the chokepoints where the acts
// themselves execute (setLighthouse's switch, the order
// actions, settleHomelandBattle's write-back, castMapWorking's
// success paths), backed where a durable artifact already
// exists (an ordered stance's stance_ordered mark, a cast's
// territory_workings row). No client claim about the past is
// ever believed; the one client-reported stream is the
// navigation ping, fired by the surface's own open handler at
// the moment it opens — the same trust the first-touch lesson
// registry has always run on, and the only moment the server
// can know a surface opened at all.
//
// PAYMENT: on verified completion, exactly +5 wakes land as
// SPENDABLE CREDITS from the pool (entrance_award_pool
// 20 → 15 → 10 → 5 → 0), once per section. The completion
// row is the ledger of record: it is written before the
// grant, its `paid` flag flips only with the grant, and the
// grant itself carries a per-section reference the credit
// ledger refuses to honour twice — retries and re-reads can
// never pay twice. Sections pay IN THE WRITTEN ORDER: a
// later section's acts, truly done early, are remembered by
// the ledger and honoured when its turn comes, but no
// section pays ahead of the ones before it.
//
// SCOPE: the road exists ONLY for entrance accounts (the
// Door's mark, visitors.entrance) whose door is walked
// (entrance_step = "done"). Every reader here answers "not
// the road" for anyone else and changes nothing; every
// recorder stands silent for them. Legacy accounts are
// untouched and never see a section.
import { sqlite } from "./store.js";
import { entranceStateFor, ENTRANCE_SPELL_NAMES } from "./entrance.js";
import { alreadyCredited, creditBalance, grantCredits } from "./credits.js";

/** Wakes paid per completed section (Nigel: "Complete the
 *  tutorial section gain 5 awoken"). */
export const ROAD_PAY = 5;

/** The road's four sections, in the written order. */
export const ROAD_SECTIONS = [1, 2, 3, 4] as const;
export type RoadSection = (typeof ROAD_SECTIONS)[number];

/** SECTION 1's doors: the navigation surfaces of the homeland
 *  face, by the names the face itself gives them — the Terrain
 *  Map (Territory itself), My Deck (the collection book), the
 *  Skill Zodiac, Aspect Attunement, the Pack (the map's bag),
 *  Find my Tender (the compass), and the orders wheel opened
 *  by tapping a fielded Awokin. */
export const ROAD_NAV_SURFACES = ["map", "deck", "zodiac", "aspects", "pack", "find", "wheel"] as const;
export type RoadNavSurface = (typeof ROAD_NAV_SURFACES)[number];

/** The acts the road's ledger witnesses. */
export type RoadEventKind = "nav" | "order" | "battle" | "lit" | "doused" | "cast";

type RoadEvent = { kind: string; detail: string | null; at: number };

/** Section 3's stages, in the lesson's own order. */
export type BeaconStage = "to-light" | "to-douse" | "to-fight" | "to-relight" | "done";

/** Record one real act. Written ONLY by the standing actions
 *  at the moment the act executes; stands silent for every
 *  account the Door did not mark, and never throws — the road
 *  witnesses the game, it never breaks it. */
export function recordRoadEvent(ownerKey: string, kind: RoadEventKind, detail?: string): void {
  try {
    if (!entranceStateFor(ownerKey).entrance) return;
    sqlite.prepare("INSERT INTO entrance_road_events (owner_key, kind, detail, at) VALUES (?, ?, ?, ?)")
      .run(ownerKey, kind, detail ?? null, Date.now());
  } catch { /* the road never breaks the act it witnesses */ }
}

function eventsFor(ownerKey: string): RoadEvent[] {
  try {
    return sqlite.prepare("SELECT kind, detail, at FROM entrance_road_events WHERE owner_key = ? ORDER BY id ASC")
      .all(ownerKey) as RoadEvent[];
  } catch {
    return [];
  }
}

/** The door's three: the first three Awoken this account ever
 *  woke (the door's waking is the only road to a first three —
 *  the general Wake One stands refused until the door is
 *  done, and the greeter folds into the three). */
function trioIdsFor(ownerKey: string): number[] {
  try {
    return (sqlite.prepare("SELECT id FROM awakened WHERE owner_key = ? ORDER BY id ASC LIMIT 3")
      .all(ownerKey) as { id: number }[]).map((r) => Number(r.id));
  } catch {
    return [];
  }
}

/** The beacon lesson's state machine, walked over the event
 *  ledger in order. A `doused` event only exists as a
 *  transition from lit (setLighthouse's witness records
 *  transitions, not states), and a relight that arrives before
 *  any battle closes the doused window unlearned — the stage
 *  returns to "to-douse" and the lesson can be lived again. */
export function beaconStageFor(events: RoadEvent[]): BeaconStage {
  let stage: BeaconStage = "to-light";
  for (const e of events) {
    if (e.kind === "lit") {
      if (stage === "to-light") stage = "to-douse";
      else if (stage === "to-fight") stage = "to-douse"; // relit before fighting: window closed, lesson unlearned
      else if (stage === "to-relight") stage = "done";
    } else if (e.kind === "doused") {
      if (stage === "to-douse") stage = "to-fight";
    } else if (e.kind === "battle") {
      if (stage === "to-fight") stage = "to-relight";
    }
  }
  return stage;
}

interface RoadFacts {
  events: RoadEvent[];
  navOpened: Set<string>;
  trioIds: number[];
  orderedIds: Set<number>;
  battleFought: boolean;
  beaconStage: BeaconStage;
  spellKey: string | null;
  castDone: boolean;
}

function factsFor(ownerKey: string, spellKey: string | null): RoadFacts {
  const events = eventsFor(ownerKey);
  const navOpened = new Set(events.filter((e) => e.kind === "nav").map((e) => e.detail ?? ""));
  const trioIds = trioIdsFor(ownerKey);
  const orderedIds = new Set<number>(
    events.filter((e) => e.kind === "order").map((e) => Number(e.detail)).filter((n) => Number.isFinite(n)),
  );
  // The durable backing mark: an Awokin whose stance was ever
  // ORDERED carries stance_ordered on its placement still.
  try {
    const rows = sqlite.prepare(
      "SELECT awakened_id FROM field_placements WHERE owner_key = ? AND stance_ordered = 1",
    ).all(ownerKey) as { awakened_id: number }[];
    for (const r of rows) orderedIds.add(Number(r.awakened_id));
  } catch { /* the event ledger already carries the orders */ }
  // The cast's artifact: a successful castMapWorking writes
  // the working's row (a fizzle writes nothing) — the event
  // recorded at the cast and the row agree.
  let castRow = false;
  if (spellKey) {
    try {
      castRow = !!sqlite.prepare(
        "SELECT id FROM territory_workings WHERE owner_key = ? AND spell_key = ? LIMIT 1",
      ).get(ownerKey, spellKey);
    } catch { /* fall through to the event alone */ }
  }
  return {
    events,
    navOpened,
    trioIds,
    orderedIds,
    battleFought: events.some((e) => e.kind === "battle"),
    beaconStage: beaconStageFor(events),
    spellKey,
    castDone: castRow || events.some((e) => e.kind === "cast" && e.detail === spellKey),
  };
}

function criteriaMet(section: RoadSection, facts: RoadFacts): boolean {
  switch (section) {
    case 1:
      return ROAD_NAV_SURFACES.every((s) => facts.navOpened.has(s));
    case 2:
      return facts.trioIds.length === 3
        && facts.trioIds.every((id) => facts.orderedIds.has(id))
        && facts.battleFought;
    case 3:
      return facts.beaconStage === "done";
    case 4:
      return !!facts.spellKey && facts.castDone;
  }
}

export interface RoadSectionView {
  n: RoadSection;
  done: boolean;
  active: boolean;
  /** The section's live facts, for the face's progress lines. */
  progress: {
    navOpened?: string[];
    navTotal?: number;
    ordersGiven?: number;
    ordersTotal?: number;
    battleFought?: boolean;
    beaconStage?: BeaconStage;
    spellKey?: string | null;
    spellName?: string | null;
    cast?: boolean;
  };
}

export interface RoadStateView {
  entrance: boolean;
  /** The door is walked; the road stands open. */
  begun: boolean;
  finished: boolean;
  awardPool: number;
  spendableCredits: number;
  sections: RoadSectionView[];
}

const NOT_THE_ROAD: RoadStateView = {
  entrance: false, begun: false, finished: false, awardPool: 0, spendableCredits: 0, sections: [],
};

interface SectionRow { section: number; paid: number }

/** Pay one completed section, exactly once: the grant carries
 *  its reference (the credit ledger honours a reference once),
 *  the pool falls by the same five, and the section's `paid`
 *  flag flips only in this breath — a pass that finds the row
 *  unpaid pays it; a pass that finds it paid moves on. */
async function paySection(ownerKey: string, section: RoadSection): Promise<void> {
  const reference = `entrance-road:${ownerKey}:section:${section}`;
  if (!(await alreadyCredited(reference))) {
    await grantCredits(ownerKey, ROAD_PAY, "entrance-road", reference);
  }
  sqlite.prepare("UPDATE entrance_road_sections SET paid = 1 WHERE owner_key = ? AND section = ?")
    .run(ownerKey, section);
  sqlite.prepare("UPDATE visitors SET entrance_award_pool = MAX(0, entrance_award_pool - ?) WHERE visitor_id = ?")
    .run(ROAD_PAY, ownerKey);
}

/** THE ROAD'S RECKONING: read the facts, complete and pay in
 *  the written order, and answer the road as it now stands.
 *  Called by the road's own read, by the navigation ping, and
 *  at the tail of the standing actions the road witnesses —
 *  so a completion lands in the breath of the act that earns
 *  it, and a re-read can never pay twice. */
export async function evaluateEntranceRoad(ownerKey: string): Promise<RoadStateView> {
  const door = entranceStateFor(ownerKey);
  if (!door.entrance) return { ...NOT_THE_ROAD };
  const begun = door.step === "done";
  const facts = factsFor(ownerKey, door.spellKey);
  const rows = new Map<number, SectionRow>(
    (sqlite.prepare("SELECT section, paid FROM entrance_road_sections WHERE owner_key = ?")
      .all(ownerKey) as SectionRow[]).map((r) => [Number(r.section), r]),
  );

  if (begun) {
    for (const n of ROAD_SECTIONS) {
      let row = rows.get(n);
      if (!row) {
        if (!criteriaMet(n, facts)) break; // the written order: later sections wait their turn
        sqlite.prepare("INSERT OR IGNORE INTO entrance_road_sections (owner_key, section, completed_at, paid) VALUES (?, ?, ?, 0)")
          .run(ownerKey, n, Date.now());
        row = { section: n, paid: 0 };
        rows.set(n, row);
      }
      if (row.paid !== 1) await paySection(ownerKey, n);
    }
  }

  const after = entranceStateFor(ownerKey);
  const doneSet = new Set(rows.keys());
  const active = ROAD_SECTIONS.find((n) => !doneSet.has(n)) ?? null;
  const spellName = door.spellKey
    ? ((ENTRANCE_SPELL_NAMES as Record<string, string>)[door.spellKey] ?? door.spellKey)
    : null;
  const sections: RoadSectionView[] = ROAD_SECTIONS.map((n) => {
    const view: RoadSectionView = { n, done: doneSet.has(n), active: begun && active === n, progress: {} };
    if (n === 1) view.progress = { navOpened: ROAD_NAV_SURFACES.filter((s) => facts.navOpened.has(s)), navTotal: ROAD_NAV_SURFACES.length };
    if (n === 2) view.progress = {
      ordersGiven: facts.trioIds.filter((id) => facts.orderedIds.has(id)).length,
      ordersTotal: facts.trioIds.length,
      battleFought: facts.battleFought,
    };
    if (n === 3) view.progress = { beaconStage: facts.beaconStage };
    if (n === 4) view.progress = { spellKey: door.spellKey, spellName, cast: facts.castDone };
    return view;
  });
  return {
    entrance: true,
    begun,
    finished: ROAD_SECTIONS.every((n) => doneSet.has(n)),
    awardPool: after.awardPool,
    spendableCredits: await creditBalance(ownerKey),
    sections,
  };
}

/** The witness's poke: after a standing action the road
 *  watches, let the reckoning run so a completion (and its
 *  five wakes) land in the act's own breath. Never throws. */
export async function pokeEntranceRoad(ownerKey: string): Promise<void> {
  try { await evaluateEntranceRoad(ownerKey); } catch { /* the road never breaks the act it witnesses */ }
}

/** Has the road BEGUN for this account — has any act the road
 *  witnesses landed on its ledger, or any section completed?
 *  A pure read of the two ledgers (no reckoning, no payment):
 *  the Table asks it to judge a standing, and a read must
 *  never pay or witness in the asking. */
export function roadBegunFor(ownerKey: string): boolean {
  try {
    const sections = sqlite.prepare("SELECT COUNT(*) AS n FROM entrance_road_sections WHERE owner_key = ?")
      .get(ownerKey) as { n: number };
    if (Number(sections?.n ?? 0) > 0) return true;
    const events = sqlite.prepare("SELECT COUNT(*) AS n FROM entrance_road_events WHERE owner_key = ?")
      .get(ownerKey) as { n: number };
    return Number(events?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/** THE TUTORIAL WAITING AT HOME (the Discord Door amendment,
 *  Nigel's ruling of 2026-11-08: "if they join through the
 *  discord door without an account they get their first 3
 *  awoken at the discord table with a button that will start
 *  their tutorial back at their 'home'"): the Table's reading
 *  of who the button is FOR — an account claimed through the
 *  Discord door (the mark's door record reads "discord"),
 *  its door walked (step "done": its three stand, minted to
 *  it), and its road at home not yet begun. The moment any
 *  road act lands at home the answer turns false and the
 *  button leaves the Table; a homeland-first or legacy
 *  account never reads true. A pure read — like the reckoning,
 *  it changes nothing, and at the Table nothing is ever
 *  witnessed or paid by it. */
export function tutorialHomeWaitingFor(ownerKey: string): boolean {
  const door = entranceStateFor(ownerKey);
  if (!door.entrance || door.door !== "discord" || door.step !== "done") return false;
  return !roadBegunFor(ownerKey);
}
