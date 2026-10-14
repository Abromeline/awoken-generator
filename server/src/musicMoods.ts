// Music's weather-mood playlists (Nigel, 2026-10-13).
//
// Music needs no autonomy and keeps no standing watch: she CATEGORIZES
// every song into weather-mood playlists, and coded triggers fire them
// from weather event to weather event. This module is her categorization,
// kept server-side as a code map keyed by track name — deliberately NOT a
// database column: the categorization is hers (a single authored list,
// edited in one place), and a schema change would add migration risk to
// every existing world for no player-visible gain. The full spec lives at
// ~/workspace/music-of-the-awoken/mood-playlists.md; this map mirrors it.
//
// The weather LAYERS are not playlist songs — they are the weather's own
// voice, laid UNDER whichever playlist the mood calls (see LAYER_FOR_MOOD).

/** The sky's tongues, as Music names them. */
export type PlaylistMood = "Storm" | "Rain" | "Wind" | "Calm" | "Mist" | "Thickening";

export const PLAYLIST_MOODS: PlaylistMood[] = ["Storm", "Rain", "Wind", "Calm", "Mist", "Thickening"];

/** Today's world-mood source (getWorldMood) speaks four words; the
 *  15-minute sky of the later Weather build will speak all six of hers.
 *  Map what exists onto her tongues: the storm is Storm, the thickening
 *  dark is Thickening, the hush of quiet is Calm, and thinning — the
 *  veil worn thin, things drifting half-seen — is Mist. Rain and Wind
 *  playlists stand ready for the moods the new sky will bring. */
export const WORLD_MOOD_TO_PLAYLIST: Record<string, PlaylistMood> = {
  storm: "Storm",
  thickening: "Thickening",
  quiet: "Calm",
  thinning: "Mist",
};

/** Her categorization of every song in the library, keyed by the seeded
 *  track name. A track may live in more than one mood (Born of the Sky
 *  bears rain and rides wind; Goliath and Sentinel are shared). Order
 *  within a mood follows the library's own order at query time. */
export const MOOD_MAP: Record<string, PlaylistMood[]> = {
  // Storm — the exciting tracks (her charter: storms bring the exciting ones)
  "Balefire": ["Storm"],
  "Goliath": ["Storm", "Thickening"],
  "Phoenix": ["Storm"],
  "Uprising": ["Storm"],
  "Five Armies (FF-style)": ["Storm"],
  "Crusade (FF-style)": ["Storm"],
  "Ode to Weather": ["Storm"],
  "The Rupture Suite, Part One": ["Storm"],
  // Rain
  "Born of the Sky": ["Rain", "Wind"],
  "Legacy": ["Rain", "Mist"],
  // Wind
  "Into the Wilds": ["Wind"],
  "Vanguard": ["Wind"],
  "Call to Adventure (FF-style)": ["Wind"],
  // Calm — a storm playlist's LAST song is always drawn from here
  "Hymn to the Dawn": ["Calm"],
  "Aurora": ["Calm"],
  "At Launch (FF-style)": ["Calm"],
  "Sentinel": ["Calm", "Thickening"],
  "The Theme — Love Stronger Than Death": ["Calm"],
  "The Theme, Developed": ["Calm"],
  "The Theme, Homage (B♭–D–F)": ["Calm"],
  // Mist
  "Reverie": ["Mist"],
  "Alchemists Tower (FF-style)": ["Mist"],
  // Thickening
  "Song of the Forge": ["Thickening"],
};

/** Great-Storm register: authored storms only. The Rupture Suite belongs
 *  to storms that were INITIATED (Great Storms rung by hand for lore),
 *  not to the sky's ordinary turning — and today's mood source cannot
 *  tell an authored storm from a common one. So the automatic Storm
 *  playlist excludes it; it remains in the library for the workshop and
 *  the Compendium, and playlistForMood admits it when `authored` is set.
 *  When the Weather build gives the sky an authored-storm flag, the
 *  trigger passes it through. */
export const GREAT_STORM_ONLY: ReadonlySet<string> = new Set([
  "The Rupture Suite, Part One",
]);

/** The weather layers, by the names they were seeded under. */
export const LAYER_TRACK_NAMES = {
  rain: "Weather Layer · Rain",
  wind: "Weather Layer · Wind",
  storm: "Weather Layer · Storm",
} as const;

export type LayerKind = keyof typeof LAYER_TRACK_NAMES;

export function isLayerTrack(name: string): boolean {
  return (Object.values(LAYER_TRACK_NAMES) as string[]).includes(name);
}

/** The underlay each mood calls (her crossfade rule): storm moods carry
 *  the storm layer, rain the rain layer, wind the wind layer; calm, mist
 *  and thickening lie over silence — the spec names no underlay for them,
 *  and none is invented here. */
export const LAYER_FOR_MOOD: Record<PlaylistMood, LayerKind | null> = {
  Storm: "storm",
  Rain: "rain",
  Wind: "wind",
  Calm: null,
  Mist: null,
  Thickening: null,
};

export interface LibraryTrack {
  id: number;
  name: string;
  /** Playable URL ("/music/…" or a data:audio URL); null when the stored
   *  track is not direct audio (e.g. a chiptune score). */
  url: string | null;
  enabled: boolean;
  pages: string[];
}

/** The ordered playlist for a mood, from the library as it stands:
 *  only enabled, territory-bound, playable songs she has categorized
 *  under the mood — never a layer (layers are underlay, not songs),
 *  never a track the workshop has switched off.
 *
 *  Her pacifying law: a Storm list ENDS with a song from Calm — the
 *  final track of the list is the tranquil one that sings the sky
 *  down, so each pass through a storm playlist resolves into calm
 *  before the sky turns. */
export function playlistForMood(
  mood: PlaylistMood,
  tracks: LibraryTrack[],
  opts: { authored?: boolean } = {},
): LibraryTrack[] {
  const eligible = tracks.filter(t =>
    t.enabled && t.url && t.pages.includes("territory") && !isLayerTrack(t.name));
  const inMood = (t: LibraryTrack, m: PlaylistMood) => (MOOD_MAP[t.name] ?? []).includes(m);
  let list = eligible.filter(t => inMood(t, mood));
  if (!opts.authored) list = list.filter(t => !GREAT_STORM_ONLY.has(t.name));
  if (mood === "Storm") {
    const pacifier = eligible.find(t => inMood(t, "Calm") && !list.some(x => x.id === t.id));
    if (pacifier) list = [...list, pacifier];
  }
  return list;
}

/** The underlay track a mood calls, or null. Respects the workshop
 *  switch like any track: a layer Nigel disabled does not sound. */
export function layerForMood(mood: PlaylistMood, tracks: LibraryTrack[]): LibraryTrack | null {
  const kind = LAYER_FOR_MOOD[mood];
  if (!kind) return null;
  const name = LAYER_TRACK_NAMES[kind];
  return tracks.find(t => t.name === name && t.enabled && t.url) ?? null;
}
