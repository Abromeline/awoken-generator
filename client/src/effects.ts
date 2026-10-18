/** Dreamed battle effects (Nigel's dream rounds, 2026-10-17):
 *  element projectiles, the towers' beam of searing light, and the
 *  Written Light's glyphs animated from Nigel's own masters.
 *  The projectile and beam sprites were dreamed as light on pure
 *  black for screen blending — but in play the blend could never
 *  engage (the projectile wrapper's filter/transform isolates the
 *  sprite in its own stacking context, so it blended against a
 *  transparent backdrop and the black painted as a solid box).
 *  Since 2026-10-18 they ship as animated WebP with the black keyed
 *  into true alpha (soft luminance key, RGB un-premultiplied), so
 *  no blending is needed anywhere they render. The glyph GIFs
 *  carry true transparency and slot into the same sockets the
 *  static glyph PNGs used. */
import projTide from "./assets/effects/proj-tide.webp";
import projSky from "./assets/effects/proj-sky.webp";
import projStone from "./assets/effects/proj-stone.webp";
import projRoot from "./assets/effects/proj-root.webp";
import projFire from "./assets/effects/proj-fire.webp";
import projUnaligned from "./assets/effects/proj-unaligned.webp";
import beam from "./assets/effects/beam.webp";
import glyphSeal from "./assets/effects/glyph-seal.gif";
import glyphTrees from "./assets/effects/glyph-trees.gif";
import glyphLattice from "./assets/effects/glyph-lattice.gif";
import glyphShard from "./assets/effects/glyph-shard.gif";
import shardRain from "./assets/effects/shard-rain.gif";

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
  shardrain: shardRain,
};
