import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SkillTreeState, type ZodiacNodeView } from "./api";

/**
 * THE SKILL ZODIAC (Nigel's directive via Law, 2026-10-17):
 * the catalogue on the wheel, inside the game. Clicking a
 * node selects it; unlocking spends points from the node's
 * pool and is judged by the server's whole unlock law —
 * roads from the Heart, the Heart first, gates, named
 * requirements, no stranding on release. The gods stand on
 * the wheel as CONSTELLATIONS — their canopies drawn as
 * star-clusters joined by light — never as pictures; the
 * Unseated keeps his place beyond the rim, nodeless.
 */
const SECTOR_COLOR: Record<string, string> = {
  heart: "#f0d68c", warden: "#e07856", binder: "#8fce7a", runewright: "#b48ce8",
  rim: "#cfd6dd", lore: "#f2e3ac", warground: "#e07856", weather: "#7ec8e3",
  music: "#e8a2c8", grove: "#9ed07e", land: "#c9a86a", wake: "#a8d8b9",
  voice: "#f5f0dc", law: "#d8d8e8",
};
const GOD_NAMES: Record<string, string> = {
  lore: "Lore", warground: "War-Ground", weather: "Weather", music: "Music",
  grove: "The Grove", land: "Land", wake: "Wake", voice: "The Voice", law: "Law",
};
const EL_EMOJI: Record<string, string> = { tide: "🌊", sky: "🌬️", stone: "🪨", root: "🌿", fire: "🔥" };

function reachedSet(state: SkillTreeState): Set<string> {
  const owned = new Set(state.unlocked);
  const adj = new Map<string, string[]>();
  for (const n of state.nodes) adj.set(n.id, []);
  for (const [a, b] of state.edges) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
  const seen = new Set<string>(["heart"]);
  const queue = ["heart"];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) if (!seen.has(nb) && owned.has(nb)) { seen.add(nb); queue.push(nb); }
  }
  return seen;
}

/** Why a node cannot be taken right now — the client mirror
 *  of the server's law, for display; the server judges. */
function lockReason(state: SkillTreeState, node: ZodiacNodeView, reached: Set<string>): string | null {
  const owned = new Set(state.unlocked);
  if (node.kind === "center") return "The Heart is not bought — it beats already.";
  if (owned.has(node.id)) return null;
  const pool = node.pool === "canopy" ? state.canopy : state.tree;
  if (pool.left < node.cost) return `Costs ${node.cost} ${node.pool} points — you hold ${pool.left}.`;
  const heartHeld = state.unlocked.some(k => state.nodes.find(n => n.id === k)?.sector === "heart");
  if (node.sector !== "heart" && !heartHeld) return "The Heart must beat before the limbs move.";
  if (node.anyCore && !state.unlocked.some(k => k.startsWith("c_"))) return "Another heart-ring skill must be held first.";
  if (node.gate && (state.attunementLevels[node.gate.el] ?? 0) < node.gate.level) {
    return `Behind the ${node.gate.el} gate — attunement Lv ${state.attunementLevels[node.gate.el] ?? 0}/${node.gate.level}.`;
  }
  for (const req of node.requires) {
    if (!owned.has(req)) return `Requires ${state.nodes.find(n => n.id === req)?.name ?? req} first.`;
  }
  const adj = state.edges.filter(([a, b]) => a === node.id || b === node.id).map(([a, b]) => (a === node.id ? b : a));
  if (!adj.some(nb => reached.has(nb))) return "No held road reaches it yet.";
  return null;
}

export default function Zodiac({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const treeQ = useQuery({ queryKey: ["skillTree"], queryFn: () => api.getSkillTree(), staleTime: 0 });
  const [selectedId, setSelectedId] = useState<string>("heart");
  const [msg, setMsg] = useState<string>("");
  const apply = (st: SkillTreeState) => qc.setQueryData(["skillTree"], st);
  const unlockM = useMutation({
    mutationFn: (key: string) => api.unlockSkill(key),
    onSuccess: (st) => { apply(st); setMsg(""); },
    onError: (e: any) => setMsg(e?.message ?? "The wheel refused."),
  });
  const releaseM = useMutation({
    mutationFn: (key: string) => api.releaseSkill(key),
    onSuccess: (st) => { apply(st); setMsg(""); },
    onError: (e: any) => setMsg(e?.message ?? "The wheel refused."),
  });
  const state = treeQ.data;
  const reached = useMemo(() => (state ? reachedSet(state) : new Set<string>()), [state]);
  const selected = state?.nodes.find(n => n.id === selectedId) ?? null;
  const godLabels = useMemo(() => {
    if (!state) return [];
    return Object.keys(GOD_NAMES).map(god => {
      const fan = state.nodes.filter(n => n.sector === god);
      if (!fan.length) return null;
      const cx = fan.reduce((s2, n) => s2 + n.x, 0) / fan.length;
      const cy = fan.reduce((s2, n) => s2 + n.y, 0) / fan.length;
      return { god, cx, cy };
    }).filter(Boolean) as { god: string; cx: number; cy: number }[];
  }, [state]);

  return (
    <div className="zodiac-overlay" role="dialog" aria-label="The Skill Zodiac">
      <div className="zodiac-head">
        <h2>🌳 The Skill Zodiac</h2>
        {state && (
          <div className="zodiac-pools">
            <span>🌳 Tree <strong>{state.tree.left}</strong>/{state.tree.total}</span>
            <span>✦ Canopy <strong>{state.canopy.left}</strong>/{state.canopy.total}</span>
            <span>Tender Lv {state.level} · +{state.pointsPerLevel} 🌳 per level</span>
          </div>
        )}
        <button type="button" className="zodiac-close" onClick={onClose} aria-label="Close the Zodiac">✕</button>
      </div>
      {treeQ.isLoading && <p className="zodiac-note">The wheel is being hung…</p>}
      {treeQ.isError && <p className="zodiac-note">The wheel would not turn — try again in a moment.</p>}
      {state && (
        <div className="zodiac-body">
          <svg className="zodiac-wheel" viewBox="0 0 720 720" role="img" aria-label="The skill wheel: roads from the Heart to the callings, clusters, rim, and the gods' constellations">
            {state.edges.map(([a, b], i) => {
              const na = state.nodes.find(n => n.id === a)!;
              const nb = state.nodes.find(n => n.id === b)!;
              const bothHeld = state.unlocked.includes(a) && state.unlocked.includes(b);
              const canopyEdge = na.pool === "canopy" && nb.pool === "canopy";
              return <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke={bothHeld ? "#f0d68c" : canopyEdge ? (SECTOR_COLOR[na.sector] ?? "#8a93a8") : "#4a4f63"}
                strokeWidth={bothHeld ? 2 : canopyEdge ? 1.1 : 1} opacity={bothHeld ? 0.95 : canopyEdge ? 0.55 : 0.5} />;
            })}
            {godLabels.map(({ god, cx, cy }) => (
              <text key={god} x={cx} y={cy} textAnchor="middle" fontSize={13} fill={SECTOR_COLOR[god] ?? "#d8d8e8"} opacity={0.85} style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>{GOD_NAMES[god]}</text>
            ))}
            <text x={360} y={16} textAnchor="middle" fontSize={12} fill="#9aa3b8" opacity={0.8}>✦ The Unseated — beyond the wheel</text>
            {state.nodes.map(n => {
              const owned = state.unlocked.includes(n.id);
              const reason = lockReason(state, n, reached);
              const r = n.kind === "center" ? 13 : n.kind === "keystone" || n.kind === "crown" || n.kind === "summon" ? 9 : n.kind === "notable" ? 7 : 5.5;
              const col = SECTOR_COLOR[n.sector] ?? "#d8d8e8";
              return (
                <g key={n.id} onClick={() => setSelectedId(n.id)} style={{ cursor: "pointer" }}>
                  <circle cx={n.x} cy={n.y} r={r + 5} fill="transparent" />
                  <circle cx={n.x} cy={n.y} r={r}
                    fill={owned ? col : "#14161f"} stroke={selectedId === n.id ? "#ffffff" : col}
                    strokeWidth={selectedId === n.id ? 2.6 : owned ? 2 : 1.4}
                    opacity={owned || !reason || n.kind === "center" ? 1 : 0.55} />
                  {n.kind === "center" && <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={13} fill="#14161f">♥</text>}
                  {n.el && <text x={n.x} y={n.y - r - 3} textAnchor="middle" fontSize={9}>{EL_EMOJI[n.el] ?? ""}</text>}
                </g>
              );
            })}
          </svg>
          <aside className="zodiac-detail">
            {selected ? (
              <>
                <h3>{selected.name}</h3>
                <p className="zodiac-kind">{selected.kind === "center" ? "The Heart" : `${selected.kind} · ${selected.sector}${selected.el ? ` · ${selected.el}` : ""} · ${selected.cost} ${selected.pool} pt${selected.cost > 1 ? "s" : ""}`}</p>
                <p className="zodiac-effect">{selected.effect}</p>
                {selected.syn && <p className="zodiac-syn">{selected.syn}</p>}
                {selected.gate && <p className="zodiac-gate">Gate: {selected.gate.el} attunement Lv {selected.gate.level} — yours: Lv {state.attunementLevels[selected.gate.el] ?? 0}</p>}
                {selected.requires.length > 0 && (
                  <p className="zodiac-gate">Requires: {selected.requires.map(r => {
                    const rn = state.nodes.find(n => n.id === r);
                    return `${state.unlocked.includes(r) ? "✓" : "✗"} ${rn?.name ?? r}`;
                  }).join(" · ")}</p>
                )}
                {state.unlocked.includes(selected.id) ? (
                  <>
                    <p className="zodiac-held">Held. Its light is yours.</p>
                    <button type="button" className="zodiac-btn" disabled={releaseM.isPending} onClick={() => releaseM.mutate(selected.id)}>Release the point</button>
                  </>
                ) : selected.kind === "center" ? (
                  <p className="zodiac-held">Every road begins here.</p>
                ) : (
                  <>
                    {lockReason(state, selected, reached)
                      ? <p className="zodiac-lock">{lockReason(state, selected, reached)}</p>
                      : <button type="button" className="zodiac-btn take" disabled={unlockM.isPending} onClick={() => unlockM.mutate(selected.id)}>Unlock — {selected.cost} {selected.pool} pt{selected.cost > 1 ? "s" : ""}</button>}
                  </>
                )}
                {msg && <p className="zodiac-lock">{msg}</p>}
                <p className="zodiac-note small">Held skills are written in your ledger at once. Their workings wake system by system as each is seated — the wheel first, the world after.</p>
              </>
            ) : <p className="zodiac-note">Tap a star on the wheel.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
