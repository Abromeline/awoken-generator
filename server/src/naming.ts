// Standalone replacements for the runtime's `ctx.inference.complete` calls.
// The original app asked an LLM for (a) a mystical piece name on upload and
// (b) a one-sentence birth-record flavor text on save. Here both come from
// curated in-voice pools — deterministic, offline, and stylistically steady.

const armNames = [
  "The Long Reaching", "Branches of Quiet Rain", "The Inkward Hands", "Limbs of the Far Bell",
  "The Patient Grasp", "Boughs Beneath Moonwater", "The Hollow Embrace", "Arms of Returning",
  "The Manyfold Reach", "Blackroot Gesture", "The Unfurling", "Hands of the First Weather",
  "The Between-Limbs", "Reach of the Waking Tide", "The Slow Embrace", "Fingers of Dark Water",
  "The Upward Yearning", "Limbs of Gathered Night",
];
const bodyNames = [
  "Vessel of Still Earth", "The Bound Hollow", "House of Soft Thunder", "The Listening Torso",
  "Rooted Chamber", "Vessel of the Pale Current", "The Remembering Form", "Body of Held Rain",
  "The Quiet Monolith", "Chamber of New Moss", "The Gathered Matter", "Hull of the First Pond",
  "The Weighted Calm", "Body of Buried Bells", "The Patient Mountain",
];
const headNames = [
  "Crown of First Thought", "The Rain-Reader", "Face of the Unlit Moon", "The Listening Crown",
  "Head of Small Stars", "The Dreaming Aperture", "Crown of Rootlight", "The Witness Above",
  "The Opened Seed", "Face of the Deep Bell", "The Soft Oracle", "Crown of Returning Birds",
  "The First Awakening", "Brow of the Still Pool", "The Upward Lantern", "Face of New Weather",
];
const backgroundNames = [
  "The World Beneath", "Field of First Weather", "The Pale Expanse", "Where It Stood",
  "The Quiet Ground", "Horizon of Wet Ink", "The Held Distance", "Country of the Binding",
];
const auraNames = [
  "The Binding Force", "Breath of the Between", "The Held Shimmer", "Veil of Becoming",
  "The Warm Dark", "Shiver of Arrival", "The Kept Light",
];

const pools: Record<string, string[]> = {
  arms: armNames, body: bodyNames, head: headNames, background: backgroundNames, aura: auraNames,
};

/** Pick a mystical name for a new piece, preferring one not already in use. */
export function mysticalPieceName(category: string, usedNames: Set<string>): string {
  const pool = pools[category] ?? ["A Mark of the Binding"];
  const unused = pool.filter((name) => !usedNames.has(name));
  const source = unused.length ? unused : pool;
  return source[Math.floor(Math.random() * source.length)];
}

const flavorTemplates = [
  "From scattered matter, {matter} learned the shape of staying.",
  "The binding gathered {matter}, and it did not fall apart.",
  "It woke wearing {matter} like weather wears the sky.",
  "Every form begins as scattered matter; this one began as {matter}.",
  "{matter} held, and the holding became a life.",
  "Between one thought and the next, {matter} chose a body.",
  "It arrived the way rain arrives: {matter}, all at once.",
  "The quiet taught {matter} how to be a creature.",
  "What was scattered is scattered no longer; {matter} remains.",
  "It dreamed of {matter} before it had a name for dreaming.",
  "The ink remembers being {matter}, and so it woke.",
  "{matter} bound itself, and the binding sang softly.",
];

/** One short birth-record sentence in the Awoken voice (8–22 words). */
export function birthFlavorText(pieceNames: string[]): string {
  const matter = pieceNames.length ? pieceNames.join(", ") : "unknown matter";
  const template = flavorTemplates[Math.floor(Math.random() * flavorTemplates.length)];
  return template.replace("{matter}", matter);
}
