#!/usr/bin/env python3
"""Bake the Skill Zodiac v2 (Nigel's build order, 2026-10-22)
from its source of record — the design node table
~/workspace/zodiac-tree-design-v2-nodes.csv (194 stars, 208
points) — into server/src/zodiacData.ts.

The CSV carries no coordinates, so the wheel is laid out
deterministically here: the Heart at the centre, its ring
innermost; each of the five class-tailored pathways in its
own 72° sector (first god's arm on the inner band, the
relationship keystone, the second god's arm on the outer
band, the capstone at the sector's outer point); the shared
rim as the outermost ring. rim1's predecessor is "any
capstone", so it roads from all five capstones.

`class_pathway` in the CSV is the road a star is TAILORED
to — never an eligibility field (Nigel: no skill is
class-locked). The legacy fields the living-wheel machinery
still carries (pool/gate/requires/el/att/syn) are written at
their neutral values: one pool ("tree"), no gates. A star's
`requires` names its road predecessors as a SET — the star
is buyable when ANY of them is held. Chain stars list one;
the five stars of the connecting ring (the second star of
each first arm, Nigel 2026-10-22) list their chain
predecessor plus their sideways ring neighbours, so a
walker can step from road to road at shallow depth. The
rim's first star requires nothing and is reached by its
five capstone roads instead.

Run: python3 scripts/gen-zodiac-data.py — writes
server/src/zodiacData.ts. Do not edit the output by hand.
"""
import csv, json, math, os

SRC = os.path.expanduser("~/workspace/zodiac-tree-design-v2-nodes.csv")
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "src", "zodiacData.ts")

CX = CY = 360.0

def point(angle_deg: float, radius: float) -> tuple[float, float]:
    """Angle measured clockwise from the top of the wheel."""
    a = math.radians(angle_deg)
    return (round(CX + radius * math.sin(a), 1), round(CY - radius * math.cos(a), 1))

rows = list(csv.DictReader(open(SRC)))
by_id = {r["id"]: r for r in rows}
assert len(rows) == 194, f"expected 194 stars, found {len(rows)}"
total_cost = sum(int(r["point_cost"]) for r in rows)
assert total_cost == 208, f"expected 208 points, found {total_cost}"

PATHWAYS = ["Warden", "Runewright", "Binder", "Witch", "Sage"]  # sector order, clockwise from the top
SECTOR_OF = {p: p.lower() for p in PATHWAYS}

coords: dict[str, tuple[float, float]] = {}
coords["heart"] = (CX, CY)
ring = [r for r in rows if r["god_half"] == "Heart" and r["id"] != "heart"]
ring.sort(key=lambda r: int(r["id"][1:]))
for i, r in enumerate(ring):
    coords[r["id"]] = point(i * (360.0 / len(ring)), 58)

for pi, pathway in enumerate(PATHWAYS):
    centre = pi * 72.0
    prow = [r for r in rows if r["class_pathway"] == pathway]
    assert len(prow) == 34, f"{pathway}: expected 34 stars, found {len(prow)}"
    arm_a = sorted((r for r in prow if "_a" in r["id"]), key=lambda r: int(r["id"].split("_a")[1]))
    arm_b = sorted((r for r in prow if "_b" in r["id"]), key=lambda r: int(r["id"].split("_b")[1]))
    keystone = next(r for r in prow if r["kind"] == "keystone")
    capstone = next(r for r in prow if r["kind"] == "capstone")
    assert len(arm_a) == 16 and len(arm_b) == 16, f"{pathway}: arms must hold 16 stars each"
    if pathway == "Sage":
        # THE FORK (Nigel, 2026-10-22): the Sage road splits
        # at the trap rung into two strands that rejoin at
        # her keystone. The strands are drawn side by side
        # inside her sector: SWALLOW THE HEART's strand
        # (sustain/blood/company) on one line, the Summoner's
        # Power strand (summon/attunement-depth) on the
        # other, both running from the rung (r 106) out to
        # the keystone's threshold (r 200). Other roads stay
        # single chains — the fork is the Sage's alone.
        coords["s_a1"] = point(centre - 30, 100)
        swallow = ["s_a2", "s_a4", "s_a5", "s_a6", "s_a8", "s_a9", "s_a10", "s_a12", "s_a13", "s_a15", "s_a16"]
        summon = ["s_a3", "s_a7", "s_a11", "s_a14"]
        for idx, sid in enumerate(swallow):
            coords[sid] = point(centre - 24 + idx * 0.4, 106 + idx * (94.0 / (len(swallow) - 1)))
        for idx, sid in enumerate(summon):
            coords[sid] = point(centre - 12 + idx * 0.4, 106 + idx * (94.0 / (len(summon) - 1)))
    else:
        for j, r in enumerate(arm_a):
            coords[r["id"]] = point(centre - 30 + j * (24.0 / 15), 100 + j * (95.0 / 15))
    coords[keystone["id"]] = point(centre, 216)
    for j, r in enumerate(arm_b):
        coords[r["id"]] = point(centre + 6 + j * (24.0 / 15), 236 + j * (69.0 / 15))
    coords[capstone["id"]] = point(centre, 324)

rim = sorted((r for r in rows if r["god_half"] == "Rim"), key=lambda r: int(r["id"][3:]))
for j, r in enumerate(rim):
    coords[r["id"]] = point(j * (360.0 / len(rim)) + 15, 347)

capstone_ids = [next(r["id"] for r in rows if r["class_pathway"] == p and r["kind"] == "capstone") for p in PATHWAYS]

out = []
edges: list[list[str]] = []
for r in rows:
    nid = r["id"]
    pathway = r["class_pathway"]
    if nid == "heart" or r["god_half"] == "Heart":
        sector = "heart"
    elif r["god_half"] == "Rim":
        sector = "rim"
    else:
        sector = SECTOR_OF[pathway]
    pred = r["roads_from"].strip()
    requires: list[str] = []
    if pred == "any capstone":
        for c in capstone_ids:
            edges.append([c, nid])
    elif pred and pred != "—":
        for p in (s.strip() for s in pred.split(";")):
            assert p in by_id, f"{nid}: roads_from '{p}' is not a star"
            # The centre is a road, never a requirement: the
            # Heart beats already and cannot be held, so a
            # star roading from it (h1) requires nothing —
            # the road itself, judged against the reached
            # set, is its opening.
            if p != "heart":
                requires.append(p)
            edges.append([p, nid])
    x, y = coords[nid]
    out.append({
        "id": nid, "name": r["name"], "kind": r["kind"], "sector": sector,
        "x": x, "y": y, "effect": r["effect"], "syn": "",
        "el": None, "att": 0, "pool": "tree", "cost": int(r["point_cost"]),
        "gate": None, "requires": requires, "anyCore": False,
        "pathway": "" if pathway == "—" else pathway,
        "god": r["god_half"], "tier": r["depth_tier"], "step": r["step"],
        "grant": r["deepened_grant"],
    })

out.sort(key=lambda z: z["id"])
# Roads are undirected pairs; the ring's stars name each
# other, so the same road arrives from both sides — keep one.
edge_list = sorted({tuple(sorted(e)) for e in edges})
edge_list = [list(e) for e in edge_list]
ts = """/**
 * THE SKILL ZODIAC — the v2 wheel and its unlock law.
 * GENERATED by scripts/gen-zodiac-data.py from the design
 * source of record (zodiac-tree-design-v2-nodes.csv, the
 * 194-star tree Nigel ordered built 2026-10-22). Do not
 * edit by hand; re-run the generator. 194 nodes, %d roads,
 * 208 points in the whole wheel.
 *
 * NO SKILL IS CLASS-LOCKED: `pathway` names the class a
 * road is tailored to; it is never an eligibility field.
 * A star's deepened grant (the Deepening Rule) rides as
 * display text in `grant` — wiring grants into live game
 * effects is a separate build, and no fx clauses are
 * seeded here, so nothing pretends to an effect it does
 * not yet have.
 */
export interface ZodiacNode {
  id: string; name: string; kind: string; sector: string;
  x: number; y: number; effect: string; syn: string;
  el: string | null;
  att: number;
  pool: "tree" | "canopy"; cost: number;
  gate: { el: string; level: number } | null;
  requires: string[];
  anyCore: boolean;
  /** The class this star's road is tailored to ("" for the
   *  Heart and the rim). Tailoring only — never a lock. */
  pathway: string;
  /** The god whose arm the star stands on. */
  god: string;
  /** The Deepening Rule depth tier, as written in the design. */
  tier: string;
  /** "ruled" or "step open" — whether the star's step is settled. */
  step: string;
  /** The deepened grant text (step x tier), shown in the detail view. */
  grant: string;
}
export const ZODIAC_NODES: ZodiacNode[] = %s;
export const ZODIAC_EDGES: [string, string][] = %s;
export const ZODIAC_BY_ID = new Map(ZODIAC_NODES.map(n => [n.id, n]));
export const ZODIAC_ADJ: Record<string, string[]> = (() => {
  const adj: Record<string, string[]> = {};
  for (const n of ZODIAC_NODES) adj[n.id] = [];
  for (const [a, b] of ZODIAC_EDGES) { adj[a]?.push(b); adj[b]?.push(a); }
  return adj;
})();
""" % (len(edge_list), json.dumps(out, indent=1), json.dumps(edge_list))
with open(DEST, "w") as f:
    f.write(ts)
print(f"wrote {DEST}: {len(out)} nodes, {len(edge_list)} edges, {total_cost} points")
