/**
 * WORKING FACES — the one binding (Nigel's tap, 2026-10-24
 * 23:40: "Bind them all — the three enemy faces and the six
 * workings' faces"). Six workings carried true art bound to
 * their CASTS only, and stood faceless on the surfaces that
 * show a working's face — the Grimoire's pages and the
 * grounds' wheels opened them on an owed frame and a ✦.
 * This module is the binding of record: working key → the
 * working's own art, consumed by every face map the game
 * keeps (the book's FACE_BY_KEY, the homeland's
 * GRIM_BUNDLED, the Table's GLYPHS, the workshop's
 * GRIMOIRE_BUNDLED) and carried in the book's own data by
 * glyph assetKey (server/src/grimoire.ts, THE BOUND FACES),
 * so the Grimoire's next building inherits the association
 * itself, not any one surface's patch.
 *
 * The faces, each the working's own art and nothing else:
 *  - SHARD RAIN — the falling rain itself: Nigel's
 *    shard-rain.gif, the cast effect's own file, animated
 *    wherever the surface animates an image.
 *  - BATS — a still of the swarm: frame 35 of its own
 *    43-frame sequence (workingFx), three bats in three
 *    wing poses. The sequence remains the cast's art; a
 *    face is a still of it, as the Fray's bundled still
 *    stands beside its walk.
 *  - HOLD RUNE — its formed rune: slot 33 of the condensed
 *    game copy, the last form/hover slot — the rune whole,
 *    hanging as it hangs over its target (the hover holds
 *    these bytes across its held slots).
 *  - RUNE SHATTER — the greatest of its three pieces
 *    (piece 2, the rune's banded heart). The pieces remain
 *    the cast's own projectiles; the face is the largest
 *    true fragment of the broken rune, never another
 *    working's art and never a whole rune invented for it.
 *  - BULWARK — Nigel's Shield piece (bulwark-shield.png),
 *    the same file its standing shields wear on the field.
 *  - BLACK GATE — Nigel's Black Gate piece
 *    (black-gate.png), the same file its standing wall
 *    wears: pure black carried in alpha, cropped to its
 *    drawn shape.
 * No drawn-rune glyph was invented for any of the six —
 * if Nigel draws glyph faces by his own hand, the
 * workshop re-points their pages like any other page's.
 */
import { ANIMATED_GLYPH } from "./effects";
import { BATS_FRAMES, HOLD_RUNE_FRAMES, SHATTER_PIECES } from "./workingFx";
import bulwarkShieldImg from "./assets/effects/bulwark-shield.png";
import blackGateImg from "./assets/effects/black-gate.png";

/** Working key → its bound face. The keys are the book's
 *  spell keys and, by the book's binding, its glyph
 *  assetKeys — one name on every road. */
export const WORKING_FACE: Record<string, string> = {
  shardrain: ANIMATED_GLYPH.shardrain,
  bats: BATS_FRAMES[34],
  holdrune: HOLD_RUNE_FRAMES[32],
  shatter: SHATTER_PIECES[1],
  bulwark: bulwarkShieldImg,
  blackgate: blackGateImg,
};
