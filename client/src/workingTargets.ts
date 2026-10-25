// ── TARGET PROFILES (Nigel, 2026-10-24 22:20–22:27) ────────
// Every homeland working declares what a cast may be aimed
// at, and the map's click router (Territory.tsx) reads these
// declarations and NOTHING else — no handler grows its own
// idea of what a click means ever again. (The capture this
// replaced: the planted Single Blade's click-to-loose road
// sat in front of every enemy click and answered readied
// spells in the Blade's own name — "no single blade working
// ready" over a readied Heal. The profiles are the cure.)
//
// SEVEN PROFILES, in Nigel's naming:
//   ENEMY     — a dark thing
//   GROUND    — a point on the ground
//   AREA      — a stretch of ground
//   LINE      — a line laid on the ground
//   ALLY      — one of your own Awokin
//   SELF      — the caster herself
//   NO TARGET — the working looses itself; the click only
//               fires it (summoning's shape, and Bats')
//
// THE KIND DEFAULTS (Nigel, 2026-10-24 22:27): "we should
// make all wards line working [works for the lore nicely] —
// runes are ground — and binding are area and ground
// generally — whilst spells are area ground line and enemy
// and target — we also need a target category for self."
// So every WARD declares LINE, every RUNE declares GROUND,
// BINDINGS declare AREA and GROUND, and SPELLS declare by
// their own behaviour. A working may declare MORE THAN ONE
// profile; the router accepts a click when what was clicked
// matches ANY of them.
//
// THE FIGHTS, flagged rather than bent (the build report
// names them for Nigel's word):
//  · HEAL is a binding that mends ONE named Awokin: it
//    carries the binding GROUND (its tap names the hex
//    whose wounded it mends, its standing road) beside
//    ALLY — but no AREA, for it has no stretch of ground
//    anywhere in it.
//  · THE HOLD RUNE and THE SINGLE BLADE are runes — GROUND
//    by the default — yet both bite a foe at the cast. The
//    foe they take is the one standing on the ground the
//    tap names, as their own refusals have always taught
//    ("name the hex it stands on"): their enemy is reached
//    THROUGH their ground, never by the enemy click itself.
//  · SELF stands EMPTY among the book's workings today —
//    no homeland working is cast on the caster herself.
//    The category stands in the router's law regardless,
//    the day one is written.

export type TargetProfile = "enemy" | "ground" | "area" | "line" | "ally" | "self" | "none";

/** What a click was ON, as the router reckons it: one of
 *  the wandering dark (its figure, or the ground it stands
 *  on named by a tap), one of your own Awokin (her figure),
 *  or the ground itself. */
export type ClickKind = "enemy" | "ally" | "ground";

/** The profiles each ENGINE declares — the one declaration
 *  per working. A grimoire spell runs an engine, and custom
 *  pages written in the workshop choose among these same
 *  engines, so a page's profile follows its engine whole. */
export const ENGINE_TARGET_PROFILES: Record<string, TargetProfile[]> = {
  // WARDS — all LINE, no exceptions (Nigel, 2026-10-24
  // 22:27), and the line is a T (22:35): ONE click aims a
  // ward completely — the click point is the line's
  // centre, the line runs perpendicular to the
  // caster→click axis there, and its length follows the
  // caster's warding level. Every ward casts this way:
  // the Seal, the Engine, the Standard, the Trees, the
  // Beacon, Bulwark's shields and the Black Gate alike
  // (the server lays the T; wards raised before it keep
  // the edge they stand on).
  seal: ["line"],
  engine: ["line"],
  standard: ["line"],
  trees: ["line"],
  beacon: ["line"],
  bulwark: ["line"],
  blackgate: ["line"],
  // RUNES — all GROUND (Nigel, 2026-10-24 22:27): writings
  // on a hex's ground, every one. The Blade's cast writes
  // its ground (and flies into a foe standing at the aim,
  // reached through that ground — see the fights above);
  // the Hold Rune names the ground a foe stands on.
  lattice: ["ground"],
  blade: ["ground"],
  springblade: ["ground"],
  blades: ["ground"],
  shard: ["ground"],
  coil: ["ground"],
  holdrune: ["ground"],
  // BINDINGS — AREA and GROUND generally (Nigel,
  // 2026-10-24 22:27): the Springleaf is planted on
  // ground (GROUND) and mends over her glow (AREA), the
  // default exactly. Heal is the flagged fight above.
  springleaf: ["area", "ground"],
  heal: ["ally", "ground"],
  // SPELLS — by their own behaviour (Nigel, 2026-10-24
  // 22:27: "spells are area ground line and enemy and
  // target"): Shard Rain is written over a stretch of
  // ground (AREA); Bats is loosed at the field and hunts
  // alone (NO TARGET); Rune Shatter is a straight shot at
  // a target (ENEMY) that is also fired at named ground —
  // its stream stands where it was loosed (GROUND).
  shardrain: ["area"],
  bats: ["none"],
  shatter: ["enemy", "ground"],
};

/** The kind defaults, for a page whose engine declares
 *  nothing of its own (a page the book has not seated —
 *  engine "none": the server refuses the cast in its own
 *  words, and the router only has to let the click reach
 *  that answer by a lawful road). */
export const KIND_TARGET_PROFILES: Record<string, TargetProfile[]> = {
  ward: ["line"],
  rune: ["ground"],
  binding: ["area", "ground"],
  spell: ["ground"],
};

/** The one reading of a working's targets: its engine's
 *  declaration, else its kind's default. */
export function targetProfilesFor(spell: { engine: string; kind: string }): TargetProfile[] {
  return ENGINE_TARGET_PROFILES[spell.engine] ?? KIND_TARGET_PROFILES[spell.kind] ?? ["ground"];
}

/** Each profile in the player's words — what a refusal
 *  names when it says what the readied working targets. */
export const TARGET_PROFILE_WORDS: Record<TargetProfile, string> = {
  enemy: "an enemy",
  ground: "the ground",
  area: "a stretch of ground",
  line: "a line on the ground",
  ally: "one of your own Awokin",
  self: "yourself",
  none: "no target at all — it looses itself",
};

/** Per-engine target words, where a working's own tongue
 *  says it plainer than its profile's: the Hold Rune is
 *  aimed at the ground a foe stands on, and says so. */
export const ENGINE_TARGET_WORDS: Record<string, string> = {
  holdrune: "the ground a foe stands on",
};

/** What a working targets, in one breath of player words,
 *  for the router's naming refusals. */
export function targetWordsFor(spell: { engine: string; kind: string }): string {
  const own = ENGINE_TARGET_WORDS[spell.engine];
  if (own) return own;
  const words = targetProfilesFor(spell).map((p) => TARGET_PROFILE_WORDS[p]);
  return [...new Set(words)].join(" or ");
}

/** The router's one question: does this working take a
 *  click of this kind? GROUND, AREA and LINE are all named
 *  by taps on the ground (a point, the stretch it covers,
 *  the line it runs); SELF and NO TARGET take any click,
 *  for the click only fires them. */
export function profileAccepts(profiles: TargetProfile[], click: ClickKind): boolean {
  for (const p of profiles) {
    if (p === "self" || p === "none") return true;
    if (p === "enemy" && click === "enemy") return true;
    if (p === "ally" && click === "ally") return true;
    if ((p === "ground" || p === "area" || p === "line") && click === "ground") return true;
  }
  return false;
}
