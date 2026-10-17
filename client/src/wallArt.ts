/** Nigel's wall pieces (2026-10-16, sent through the File Post):
 *  each edge of his stone ring (Walls.png) and thorn ring
 *  (Walls 2.png) cut as its own piece — he drew them as
 *  separate layers, one wall of a hex built at a time.
 *  Every piece seats by its own two endpoints: (x1,y1) and
 *  (x2,y2) are the piece's hex corners in its own pixels,
 *  mapped onto the map edge's corners by similarity. */
import wall0 from "./assets/walls/wall-0.png";
import wall1 from "./assets/walls/wall-1.png";
import wall2 from "./assets/walls/wall-2.png";
import wall3 from "./assets/walls/wall-3.png";
import wall4 from "./assets/walls/wall-4.png";
import wall5 from "./assets/walls/wall-5.png";
import thorn0 from "./assets/walls/thorn-0.png";
import thorn1 from "./assets/walls/thorn-1.png";
import thorn2 from "./assets/walls/thorn-2.png";
import thorn3 from "./assets/walls/thorn-3.png";
import thorn4 from "./assets/walls/thorn-4.png";
import thorn5 from "./assets/walls/thorn-5.png";
export interface WallPiece { src: string; w: number; h: number; x1: number; y1: number; x2: number; y2: number }
export const WALL_STYLES: Record<"stone" | "spire", WallPiece[]> = {
  stone: [{ src: wall0, w: 482, h: 93, x1: 28.4, y1: 48.0, x2: 457.6, y2: 48.0 }, { src: wall1, w: 267, h: 275, x1: 23.6, y1: 24.0, x2: 256.8, y2: 265.5 }, { src: wall2, w: 282, h: 273, x1: 274.3, y1: 7.5, x2: 49.5, y2: 259.5 }, { src: wall3, w: 464, h: 134, x1: 457.0, y1: 104.5, x2: 6.3, y2: 102.5 }, { src: wall4, w: 287, h: 264, x1: 239.8, y1: 259.0, x2: 10.3, y2: 9.0 }, { src: wall5, w: 275, h: 280, x1: 10.3, y1: 270.0, x2: 252.9, y2: 28.5 }],
  spire: [{ src: thorn0, w: 461, h: 259, x1: 19.3, y1: 139.0, x2: 464.2, y2: 139.0 }, { src: thorn1, w: 296, h: 242, x1: 55.2, y1: -18.5, x2: 296.9, y2: 231.9 }, { src: thorn2, w: 291, h: 254, x1: 292.4, y1: 7.4, x2: 59.4, y2: 268.6 }, { src: thorn3, w: 475, h: 165, x1: 476.9, y1: 121.1, x2: 9.8, y2: 118.9 }, { src: thorn4, w: 304, h: 286, x1: 256.3, y1: 276.4, x2: 18.4, y2: 17.4 }, { src: thorn5, w: 316, h: 278, x1: 17.9, y1: 268.9, x2: 269.3, y2: 18.5 }],
};
