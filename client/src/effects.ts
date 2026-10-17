/** Dreamed battle effects (Nigel's dream rounds, 2026-10-17):
 *  element projectiles, the towers' beam of searing light, and the
 *  Written Light's glyphs animated from Nigel's own masters.
 *  Projectiles and the beam are light on black — they render with
 *  screen blending where they're shown. The glyph GIFs carry true
 *  transparency and slot into the same sockets the static glyph
 *  PNGs used. */
import projTide from "./assets/effects/proj-tide.gif";
import projSky from "./assets/effects/proj-sky.gif";
import projStone from "./assets/effects/proj-stone.gif";
import projRoot from "./assets/effects/proj-root.gif";
import projFire from "./assets/effects/proj-fire.gif";
import projUnaligned from "./assets/effects/proj-unaligned.gif";
import beam from "./assets/effects/beam.gif";
import glyphSeal from "./assets/effects/glyph-seal.gif";
import glyphTrees from "./assets/effects/glyph-trees.gif";
import glyphLattice from "./assets/effects/glyph-lattice.gif";
import glyphShard from "./assets/effects/glyph-shard.gif";

/** Projectile sprite per element, plus the unaligned gold spark. */
export const PROJECTILE_GIF: Record<string, string> = {
  tide: projTide,
  sky: projSky,
  stone: projStone,
  root: projRoot,
  fire: projFire,
  unaligned: projUnaligned,
};

/** The towers' beam of searing light. */
export const BEAM_GIF = beam;

/** Animated forms of the standing glyphs, keyed by engine — the
 *  Seal's slow turn, the Trees multiplying, the Lattice's shimmer,
 *  the Shard's fall. Engines not listed keep their static art. */
export const ANIMATED_GLYPH: Record<string, string> = {
  seal: glyphSeal,
  trees: glyphTrees,
  lattice: glyphLattice,
  shard: glyphShard,
};
