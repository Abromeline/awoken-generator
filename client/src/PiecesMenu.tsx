/** THE PIECES MENU (2026-10-28, the pieces-faces-menu build) —
 *  the construction's choosing seat, built as ONE self-contained
 *  component on purpose: today it lives inside the homeland's
 *  building menu (the ONE DOOR of Nigel's ruling — the
 *  construction toggle and its tool bar are struck, whole), and
 *  the Stone Cast build moves THIS SAME MENU, unchanged, inside
 *  a Stone Awoken's building ability tab and closes the
 *  free-standing door. Nothing here knows where it is mounted:
 *  it is handed the tool in hand, the placing mode, and the
 *  work's spoken line, and it answers with picks.
 *
 *  THE CHOICES WEAR HIS ARTWORK (Nigel, 2026-10-27: "give it
 *  one door and but keep the pieces menu but use my artwork
 *  for the pieces ui"): every piece choice is a button made
 *  FROM that piece's own drawn face — the triangle by its
 *  wedge, the square by his slab, the walls by their drawings
 *  (PIECE_MENU_FACES in buildingFaces.ts) — never a glyph icon
 *  or a text-only row. Taking away is not a piece and carries
 *  no face; it keeps its plain button, as does the placing
 *  mode's switch. */
import { PIECE_MENU_FACES } from "./buildingFaces";

export type PieceTool = "triangle" | "square" | "wall" | "door" | "halfwall" | "narrow" | "remove";
export type WallKind = "wall" | "door" | "halfwall" | "narrow";
export const WALL_KINDS: WallKind[] = ["wall", "door", "halfwall", "narrow"];
export const isWallKind = (tool: string): tool is WallKind =>
  tool === "wall" || tool === "door" || tool === "halfwall" || tool === "narrow";

const PIECES: { tool: PieceTool; label: string }[] = [
  { tool: "triangle", label: "Triangle floor" },
  { tool: "square", label: "Square foundation" },
  { tool: "wall", label: "Wall" },
  { tool: "halfwall", label: "Half wall" },
  { tool: "narrow", label: "Narrow wall" },
  { tool: "door", label: "Door wall" },
];

export function PiecesMenu(props: {
  tool: PieceTool;
  onPick: (tool: PieceTool) => void;
  placeMode: "snap" | "free";
  onPlaceMode: (mode: "snap" | "free") => void;
  note: string;
  /** A piece is in hand — the placement stands on the land. */
  active: boolean;
  onDone: () => void;
}) {
  const { tool, onPick, placeMode, onPlaceMode, note, active, onDone } = props;
  return (
    <div className="pieces-menu">
      <h4 className="pieces-menu-title">The construction — pieces</h4>
      <div className="piece-choices">
        {PIECES.map(({ tool: t, label }) => (
          <button key={t} type="button" data-tool={t}
            className={`piece-choice ${tool === t ? "in-hand" : ""}`}
            aria-pressed={tool === t}
            onClick={() => onPick(t)}>
            <img src={PIECE_MENU_FACES[t]} alt="" draggable={false} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="pieces-menu-row">
        <button type="button" data-tool="remove"
          className={`piece-choice plain ${tool === "remove" ? "in-hand" : ""}`}
          aria-pressed={tool === "remove"}
          onClick={() => onPick("remove")}>
          ⌫ Take away
        </button>
        {/* THE PLACING MODE (Nigel, 2026-10-26): the player's own
            switch, moved here from the struck bar — the menu is
            its home now. Snap together: pieces click edge-to-edge
            onto the standing work, never onto the world. Free
            place: no snapping at all. */}
        <button type="button"
          className={`piece-choice plain place-mode ${placeMode === "free" ? "in-hand" : ""}`}
          aria-pressed={placeMode === "free"}
          title={placeMode === "snap"
            ? "Pieces snap to each other, edge to edge — never to the world. Tap to place freely instead: no snapping at all."
            : "Free place: pieces land exactly where you tap and do not snap together. Tap to return to snapping pieces together."}
          onClick={() => onPlaceMode(placeMode === "snap" ? "free" : "snap")}>
          {placeMode === "snap" ? "🧲 Snap together" : "✥ Free place"}
        </button>
        {active && (
          <button type="button" className="piece-choice plain done" onClick={onDone}>Done</button>
        )}
      </div>
      {note && <p className="pieces-menu-note">{note}</p>}
    </div>
  );
}
