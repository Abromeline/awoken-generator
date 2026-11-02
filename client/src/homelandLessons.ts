// ACORN'S LINE — THE HOMELAND'S LESSONS (the homeland tutorial
// redo, Nigel 2026-10-23 23:23: the homeland tutorial redone
// "with the new rules"; the first-visit party lesson and the
// way back, 23:33; under the tutorial SHAPE LAW, 23:37: "cut
// the tutorial down as much as possible so that tenders don't
// have to read paragraphs of text at a time. Tutorials for
// each system can be spread out separately and only trigger
// when that system is triggered for the first time.").
//
// So there is NO tour here and no walkthrough dump — the old
// twelve-step Territory tutorial card is GONE, whole. In its
// place: nine short lessons, one per homeland system, each a
// line or two in the teacher's standing voice (game first,
// lore as seasoning — the whisper's and the packet's cadence:
// direct, gentle, second person), each naming the button or
// control it teaches, each fired ONCE at that system's first
// touch on the terrain map and never again. The registry is
// the front screen's own, EXTENDED: the same server table
// (front_lessons_seen), the same routes, the same owner key
// (see server/src/frontLessons.ts). A lesson never blocks its
// system — it speaks alongside the first touch, dismissible,
// and the system works read or unread.
//
// The words below are DRAFTS for Nigel's ear, printed in full
// in this build's commit so he can strike from the commit
// alone.
//
// ONLY the homeland's systems live here. The front screen's
// lessons stand in frontLessons.ts; the Table is NOT taught
// here at all — this is the homeland's line.
// THE SEED'S BATTLE LESSON IS DELIBERATELY ABSENT: the seed's
// battle shape (its hold's wave referee) stands STOPPED on a
// fork awaiting Nigel's word, and no lesson here teaches a
// dying system. The "seed" lesson below teaches only the
// ground truth that survives any ruling — the claim at
// twenty, the seed as rebuilding heart — at the seed hold's
// first touch; how the hold's fight runs is taught by NO
// lesson until the fork is ruled.
//
// THE GROWTH-LESSONS (added 2026-10-25, the growth cycle
// build): the fork was ruled (2026-10-24: the risings ride
// the engine; feeding is the only ladder; the whole package
// ratified 19:21) — and with the ruling came three lessons
// of the seed's GROWTH, designed into the ratified spec: a
// step slips in at each stage of the FIRST seed's first
// growth, once per Tender, only the first seed teaches —
// the draw and the first-temper defence at first entry,
// the widening light at the Sapling, PROTECTION in the
// moment it arrives at the Beacon. They teach the growth,
// never the battle: the ABSENT paragraph above stands.
// (The Sapling lesson's attunement half waits on the
// attunement feeding channel — an open pencil, unbuilt;
// the lesson speaks only of the energy road that stands.)
export const HOMELAND_LESSONS = [
  {
    key: "party",
    system: "The party of three at your shoulder (the first-visit party lesson: changing the party inside the real party controls)",
    text: "Your first three stand as your party, at your shoulder. To change it, tap the 🌳 door at the left — your book's Party tab adds and returns Awokin.",
  },
  {
    key: "return",
    system: "The way back (the map's return button, which now reads RETURN)",
    text: "The way home stands above: the map's button now reads RETURN. Tap it, and you are back at the spark.",
  },
  {
    key: "safehex",
    system: "The safe hex and the respawn (one safe hex, always; wake at the bastion, or on it)",
    text: "One hex is always safe — your rebuilding ground. Fall, and you wake at your bastion; with no bastion, you wake on that safe hex.",
  },
  {
    key: "battle",
    system: "The battle you can watch (the living battle on the open map: real wanderers, beat by beat)",
    text: "The dark are real wanderers with drawn faces. The fight runs beat by beat while the map stands open — strikes fly from the fight itself.",
  },
  {
    key: "cast",
    system: "Casting by range (no hex-lock; the readied working STAYS readied)",
    text: "Ready a working, then tap the land — range from where you stand is the only gate. It stays readied: cast, cast, cast, until you choose another.",
  },
  {
    key: "orders",
    system: "The single-Awoken wheel (one Awokin's orders, at its first opening)",
    text: "One Awokin's wheel: March, Attack, Defend, Follow — pick one and it is obeyed at once. March arms your next tap on the land.",
  },
  {
    key: "group",
    system: "The group orders (drag a box; the company's wheel appears)",
    text: "Drag a box around a company and their orders appear: March together, Attack, Defend, Follow — one wheel, obeyed by all.",
  },
  {
    key: "warning",
    system: "The warning with teeth (the first step toward the cursed lands)",
    text: "Care, Tender: you step toward the cursed lands before level 3, before twenty held — the dark here presses harder.",
  },
  {
    key: "seed",
    system: "The First Seed, honestly (its ground truth only — the seed's battle lesson is deferred until the fork is ruled)",
    text: "Twenty held — the starseed can be claimed by your first three. The seed is your rebuilding heart: the ground its hold wins turns yours.",
  },
  {
    key: "seedfeed",
    system: "The seed's draw (the growth cycle: feeding begins — the Tender's own stand on the first seed's hex, and the risings' first-temper defence; the company's passive draw was struck by Nigel 2026-10-25 — feeding is the Tender on the hex alone)",
    text: "Stand on the seed's own hex yourself — while you stand there it drinks from your purse, and spending stirs the dark. Risings come at the first temper only, while it feeds.",
  },
  {
    key: "seedsapling",
    system: "The Sapling of Light (the growth cycle: the first seed's second stage — its light widens and the ring purifies, at the first reaching of it)",
    text: "The seed wakes a Sapling of Light — its light widens, and the six hexes around it purify. Feed it on with energy, toward the Beacon.",
  },
  {
    key: "seedbeacon",
    system: "The Beacon (the growth cycle: the first seed's third stage — PROTECTION arrives, taught in the moment it arrives)",
    text: "A Beacon stands — protection is yours to light. The Lighthouse panel holds your banked minutes: light it, and the dark is driven off until the burn ends.",
  },
  // THE AWARD ROAD'S PLAY-ALONG (ENTRANCE BUILD 2, 2026-11-02;
  // drafts for Nigel's polish, printed verbatim in the build
  // report): the entrance tutorial's lines, spoken by the
  // companions through this same whisper. They fire IN STEP
  // with the acts — a section's opening when it becomes the
  // road's standing lesson, the beacon lesson's dark and
  // fought moments as they land, a completion in the breath
  // its five wakes pay — never a lesson in front of play.
  // The road's watcher touches these keys for ENTRANCE
  // ACCOUNTS ONLY; no legacy flow ever touches them, so
  // veterans are never served the road's lines.
  {
    key: "roadstart",
    system: "The award road opens (the entrance tutorial: four sections, five wakes each)",
    text: "We three walk with you while you learn this land. Each lesson lived earns five wakes — twenty in all, waiting in your award pool.",
  },
  {
    key: "road1start",
    system: "Section 1 — learn the doors (the homeland face's navigation surfaces)",
    text: "First, learn the ways around: the map, your deck, the star tree, attunement, the pack. Find yourself on the land — and tap one of us to open the wheel.",
  },
  {
    key: "road1done",
    system: "Section 1 complete — five wakes paid",
    text: "Every door known. Five wakes are yours — they wait at Wake One, spendable now.",
  },
  {
    key: "road2start",
    system: "Section 2 — orders, and a first fight",
    text: "Now, orders: give each of us an order — a stance, a march, a patrol — then stand with us in a first fight; we hold where you set us.",
  },
  {
    key: "road2done",
    system: "Section 2 complete — five wakes paid",
    text: "Orders given, and a battle stood together. Five more wakes are yours.",
  },
  {
    key: "road3start",
    system: "Section 3 — the beacon lesson (light it, douse it, fight in the dark, relight it)",
    text: "The beacon lesson: light it, douse it, fight what the dark sends, and light it again. Kills buy the light — your bank holds what your battles have won.",
  },
  {
    key: "road3dark",
    system: "The beacon lesson — the dousing (the dark comes at the game's own pace)",
    text: "Dark now, by your own hand — what comes, comes at the game's own pace, so stand ready: this fight is the lesson.",
  },
  {
    key: "road3fought",
    system: "The beacon lesson — fought in the dark (relight it)",
    text: "You fought in the dark, and stood. Now relight the beacon — end the lesson in light.",
  },
  {
    key: "road3done",
    system: "Section 3 complete — five wakes paid",
    text: "Doused, fought, relit — the beacon's law is in your hands now. Five more wakes are yours.",
  },
  {
    key: "road4start",
    system: "Section 4 — the first casting (the starting spell chosen at the Door)",
    text: "Last, your spell — the one you chose at the door. Cast it true, once, on your land.",
  },
  {
    key: "road4done",
    system: "Section 4 complete — five wakes paid, the last of the twenty",
    text: "It answers you. Five more wakes — the last of the twenty.",
  },
  {
    key: "roaddone",
    system: "The award road walked — all twenty wakes stand spendable",
    text: "The road is walked: all twenty wakes stand spendable at Wake One. What you wake with them still teaches as it grows — level three stands at this road's end.",
  },
] as const;

export type HomelandLessonKey = (typeof HOMELAND_LESSONS)[number]["key"];
export type HomelandLesson = (typeof HOMELAND_LESSONS)[number];

/** The once-only reckoning, plain — the front registry's own
 *  shape, mirrored exactly: a touched system teaches only
 *  when its lesson has never been served to this Tender. A
 *  seen lesson, an unknown key — silence. Kept free of React
 *  and the network so the drive can evaluate it as written. */
export function pickHomelandLesson(seenKeys: string[], touchedKey: string): HomelandLesson | null {
  const lesson = HOMELAND_LESSONS.find((l) => l.key === touchedKey) ?? null;
  if (!lesson) return null;
  if (seenKeys.includes(touchedKey)) return null;
  return lesson;
}
