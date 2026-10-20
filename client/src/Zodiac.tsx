import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type SkillTreeState, type ZodiacNodeView } from "./api";
import { TENDER_CLASSES, type TenderClassId } from "./tenderArt";
import { WEAPONS, WEAPON_ORDER, weaponImg, type WeaponKey } from "./weaponArt";

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
const ELEMENTS = ["root", "tide", "sky", "stone", "fire"] as const;
type ElementKey = (typeof ELEMENTS)[number];
/** Reach law (Phase C): an attuned weapon reaches as its element
 *  reaches; unattuned, it keeps its base reach. */
const ELEMENT_REACH: Record<string, number> = { stone: 1, root: 2, fire: 2, tide: 3, sky: 4 };
const BASE_REACH: Record<string, number> = { swordshield: 1, sword: 1, spear: 2, arrow: 4 };
const SIGNATURES: Record<string, { name: string; desc: string }> = {
  arrow: { name: "Pierce", desc: "+1 target per pass" },
  spear: { name: "Longshaft", desc: "+1 hex reach" },
  sword: { name: "Keen", desc: "+2 damage" },
  swordshield: { name: "Aegis", desc: "+1 AC" },
};
const ROMAN = ["0", "I", "II", "III", "IV"];

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

export default function Zodiac({ onClose, onChooseClass }: { onClose: () => void; onChooseClass?: () => void }) {
  const expQ = useQuery({ queryKey: ["tenderExp"], queryFn: () => api.getTenderExp() });
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
  // ── THE CHARACTER MENU (Phase C): the Zodiac screen is the
  // character hub — profile card on the right with Profile |
  // Inventory | Grimoire tabs. Every pour/buy/wield refreshes
  // the tender record so the card never lies.
  const [tab, setTab] = useState<"profile" | "inventory" | "grimoire">("profile");
  const [grimTab, setGrimTab] = useState<"weapons" | "spells" | "runes">("weapons");
  const [charMsg, setCharMsg] = useState("");
  const [charErr, setCharErr] = useState("");
  const studioQ = useQuery({ queryKey: ["zodiacStudio"], queryFn: () => api.getStudio() });
  const grimoireQ = useQuery({ queryKey: ["grimoire"], queryFn: () => api.getGrimoire(), enabled: tab === "grimoire" });
  const refreshProgress = () => { void qc.invalidateQueries({ queryKey: ["tenderExp"] }); void qc.invalidateQueries({ queryKey: ["skillTree"] }); };
  const charOk = (m: string) => { setCharMsg(m); setCharErr(""); refreshProgress(); };
  const charFail = (e: any) => setCharErr(e?.message ?? "The record refused.");
  const wieldM = useMutation({
    mutationFn: (k: WeaponKey) => api.wieldWeapon({ weaponKey: k }),
    onSuccess: (r) => charOk(`${WEAPONS[r.weaponKey as WeaponKey]?.name ?? r.weaponKey} is in hand.`),
    onError: charFail,
  });
  const attuneM = useMutation({
    mutationFn: (a: { weaponKey: WeaponKey; element: ElementKey }) => api.attuneWeapon(a),
    onSuccess: (r) => charOk(`${WEAPONS[r.weaponKey as WeaponKey]?.name ?? r.weaponKey} attuned to ${r.element} at depth ${ROMAN[r.depth] ?? r.depth} — ${r.cost} pt${r.cost === 1 ? "" : "s"} poured.`),
    onError: charFail,
  });
  const buyNodeM = useMutation({
    mutationFn: (a: { weaponKey: WeaponKey; node: "manifest" | "signature" }) => api.buyWeaponNode(a),
    onSuccess: (r) => charOk(`${r.node === "manifest" ? "Manifest" : "Signature"} node taken for ${WEAPONS[r.weaponKey as WeaponKey]?.name ?? r.weaponKey} — ${r.cost} ${r.element} pts spent.`),
    onError: charFail,
  });
  const charBusy = wieldM.isPending || attuneM.isPending || buyNodeM.isPending;
  const exp = expQ.data;
  /** Which pool a node buy would draw on — the client mirror of
   *  the server's law (attuned element, else the richest pool);
   *  the server judges. */
  const payPoolFor = (w: { element: string | null; depth: number }) => {
    if (!exp) return { el: null as string | null, points: 0 };
    if (w.depth >= 1 && w.element) return { el: w.element, points: exp.pools[w.element] ?? 0 };
    let best: string | null = null; let bestPts = 0;
    for (const el of ELEMENTS) { const p = exp.pools[el] ?? 0; if (p > bestPts) { best = el; bestPts = p; } }
    return { el: best, points: bestPts };
  };
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
  const classArt = exp?.classKey ? TENDER_CLASSES[exp.classKey as TenderClassId] ?? null : null;
  const wieldedKey = (exp?.weaponKey as WeaponKey | null) ?? null;
  const tenderName = studioQ.data?.tender?.tenderName ?? "Nameless Tender";
  const arsenalOf = (key: string) => exp?.arsenal.find(w => w.key === key);

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
      {expQ.data && !expQ.data.classKey && (
        <p className="zodiac-note class-gate-note">✦ No class chosen yet — the Class Gate stands: your avatar shows nowhere and the Table will not seat you until you choose. {onChooseClass && <button type="button" className="quiet-link" onClick={onChooseClass}>Choose your class</button>}</p>
      )}
      {treeQ.isLoading && <p className="zodiac-note">The wheel is being hung…</p>}
      {treeQ.isError && <p className="zodiac-note">The wheel would not turn — try again in a moment.</p>}
      <div className="character-layout">
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
      <aside className="character-card" aria-label="Character menu">
        {!exp ? <p className="zodiac-note">Your record is gathering…</p> : (
          <>
            <div className="character-head">
              {classArt ? <img className="character-avatar" src={classArt.idle} alt="" /> : <div className="character-avatar character-avatar-none" role="img" aria-label="No class chosen yet" title="No class chosen yet — the choosing waits at Lv 3, through the ✦ door on your sheet">✦</div>}
              <div className="character-id">
                <h3>{tenderName}</h3>
                <p className="zodiac-kind">{classArt ? `${classArt.icon} The ${classArt.label}` : "No class chosen"} · Tender Lv {exp.level}</p>
                <p className="character-exp">{exp.totalExp} EXP · {exp.lifetimeWakes} lifetime wakes</p>
                {wieldedKey ? (
                  <p className="character-wield"><img src={weaponImg(wieldedKey)} alt="" /> Wielding <strong>{WEAPONS[wieldedKey].name}</strong> (d{WEAPONS[wieldedKey].die} · {WEAPONS[wieldedKey].note})</p>
                ) : <p className="character-wield">No weapon in hand yet.</p>}
              </div>
            </div>
            <div className="character-tabs" role="tablist" aria-label="Character menu tabs">
              {(["profile", "inventory", "grimoire"] as const).map(t => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={`character-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t === "profile" ? "Profile" : t === "inventory" ? "Inventory" : "Grimoire"}</button>
              ))}
            </div>
            {charMsg && <p className="character-msg" role="status">{charMsg}</p>}
            {charErr && <p className="zodiac-lock" role="alert">{charErr}</p>}

            {tab === "profile" && (
              <div className="character-pane">
                <h4>The choosing record</h4>
                <ul className="character-list">
                  <li>Class: <strong>{classArt ? `The ${classArt.label}` : "not chosen yet"}</strong></li>
                  <li>Free second-thoughts rite: <strong>{!exp.classKey ? "waits for the choosing" : exp.classRiteAvailable ? "still available" : "spent"}</strong></li>
                  <li>Reclass tokens held: <strong>{exp.reclassTokens}</strong></li>
                  <li>Lifetime wakes: <strong>{exp.lifetimeWakes}</strong></li>
                  <li>Heal: tier {exp.healTier} ({exp.healAmount} HP) · Max Tender HP {exp.maxTenderHp}</li>
                </ul>
                <h4>Arsenal at a glance</h4>
                <p className="zodiac-note small">Read-only here — powering and wielding live in the Grimoire tab.</p>
                <ul className="character-list">
                  {WEAPON_ORDER.map(key => { const w = arsenalOf(key); if (!w) return null; return (
                    <li key={key} className={exp.weaponKey === key ? "in-hand" : ""}>
                      <strong>{WEAPONS[key].name}</strong> — Lv {w.level} · {w.xp} xp · {w.element ? `${EL_EMOJI[w.element] ?? ""} ${w.element} depth ${ROMAN[w.depth] ?? w.depth}` : "unattuned"}
                      {" "}· Manifest {w.manifest ? "✓" : "·"} · Signature {w.signature ? "✓" : "·"}{exp.weaponKey === key ? " · ⚔ in hand" : ""}
                    </li>); })}
                </ul>
              </div>
            )}

            {tab === "inventory" && (
              <div className="character-pane">
                <h4>Aspect pools</h4>
                <ul className="character-list">
                  {ELEMENTS.map(el => <li key={el}>{EL_EMOJI[el]} {el}: <strong>{exp.pools[el] ?? 0}</strong> pts · attunement Lv {state?.attunementLevels[el] ?? 0}</li>)}
                </ul>
                <h4>Attunement standing</h4>
                <p>{ELEMENTS.map(el => `${el} ${state?.attunement[el] ?? exp.pools[el] ?? 0}`).join(" · ")}</p>
                <h4>Wake credits</h4>
                <p>{studioQ.data ? <><strong>{studioQ.data.credits.balance}</strong> wake{studioQ.data.credits.balance === 1 ? "" : "s"} remaining</> : "Gathering…"}</p>
                <h4>Arsenal summary</h4>
                <ul className="character-list">
                  {WEAPON_ORDER.map(key => { const w = arsenalOf(key); if (!w) return null; return (
                    <li key={key}>{WEAPONS[key].name}: Lv {w.level} · {w.element ? `${w.element} ${ROMAN[w.depth] ?? w.depth}` : "unattuned"} · M{w.manifest ? "✓" : "—"} S{w.signature ? "✓" : "—"}{exp.weaponKey === key ? " · in hand" : ""}</li>); })}
                </ul>
              </div>
            )}

            {tab === "grimoire" && (
              <div className="character-pane">
                <div className="character-tabs sub" role="tablist" aria-label="Grimoire tabs">
                  {(["weapons", "spells", "runes"] as const).map(t => (
                    <button key={t} type="button" role="tab" aria-selected={grimTab === t} className={`character-tab${grimTab === t ? " active" : ""}`} onClick={() => setGrimTab(t)}>{t === "weapons" ? "Weapons" : t === "spells" ? "Spells" : "Runes/Wards"}</button>
                  ))}
                </div>

                {grimTab === "weapons" && (
                  <div className="weapon-tree">
                    <p className="zodiac-note small">One tree, four branches. Damage rises +1 per weapon level. Attunement pours follow the ladder: from depth D the next node costs D+1 points of that element, cap IV — pouring a different element starts that weapon over at depth I for 1 pt. Manifest and Signature each cost a flat 3 pts (from the attuned element's pool, or your richest pool when unattuned).</p>
                    {WEAPON_ORDER.map(key => { const w = arsenalOf(key); if (!w) return null; const sig = SIGNATURES[key]; const reach = w.element && w.depth >= 1 ? (ELEMENT_REACH[w.element] ?? BASE_REACH[key]) : BASE_REACH[key]; const pay = payPoolFor(w); const nextCost = w.depth + 1; return (
                      <section key={key} className={`weapon-branch${exp.weaponKey === key ? " in-hand" : ""}`}>
                        <header>
                          <img src={weaponImg(key)} alt="" />
                          <div><h5>{WEAPONS[key].name}</h5><p>d{WEAPONS[key].die} · {WEAPONS[key].note} · {WEAPONS[key].blurb}</p></div>
                          {exp.weaponKey === key ? <span className="weapon-held">⚔ In hand</span> : <button type="button" className="zodiac-btn" disabled={charBusy || !exp.classKey} onClick={() => wieldM.mutate(key)}>Wield</button>}
                        </header>
                        <p>Level <strong>{w.level}</strong> · {w.xp} xp · damage <strong>+{w.level}</strong> (+1 per level) · Reach <strong>{reach}</strong> {w.element && w.depth >= 1 ? `(${w.element} reach while attuned)` : "(base reach)"}</p>
                        <div className="attune-row" aria-label={`${WEAPONS[key].name} attunement`}>
                          <span>Attunement {w.element ? `${EL_EMOJI[w.element] ?? ""} ${w.element}` : "— none"}:</span>
                          {[1, 2, 3, 4].map(d => <span key={d} className={`attune-node${w.depth >= d ? " lit" : ""}`} title={`Node ${ROMAN[d]}`}>{ROMAN[d]}</span>)}
                        </div>
                        {w.depth >= 4 ? <p className="zodiac-held">Attunement at its deepest (IV).</p> : w.element ? (
                          <div className="weapon-actions">
                            <button type="button" className="zodiac-btn take" disabled={charBusy || (exp.pools[w.element] ?? 0) < nextCost} onClick={() => attuneM.mutate({ weaponKey: key, element: w.element as ElementKey })}>Pour {w.element} — node {ROMAN[w.depth + 1]} for {nextCost} pt{nextCost === 1 ? "" : "s"} (pool {exp.pools[w.element] ?? 0})</button>
                            <details className="weapon-switch"><summary>Start a different element over (resets depth, 1 pt)</summary>
                              <div className="weapon-actions">{ELEMENTS.filter(el => el !== w.element).map(el => <button key={el} type="button" className="zodiac-btn" disabled={charBusy || (exp.pools[el] ?? 0) < 1} onClick={() => attuneM.mutate({ weaponKey: key, element: el })}>{EL_EMOJI[el]} {el} — 1 pt</button>)}</div>
                            </details>
                          </div>
                        ) : (
                          <div className="weapon-actions">{ELEMENTS.map(el => <button key={el} type="button" className="zodiac-btn" disabled={charBusy || (exp.pools[el] ?? 0) < 1} onClick={() => attuneM.mutate({ weaponKey: key, element: el })}>{EL_EMOJI[el]} Attune {el} — node I for 1 pt (pool {exp.pools[el] ?? 0})</button>)}</div>
                        )}
                        <div className="weapon-nodes">
                          <div className="weapon-node">
                            <strong>Manifest</strong><span> — casts +1 copy</span>
                            {w.manifest ? <p className="zodiac-held">✓ Owned</p> : <><button type="button" className="zodiac-btn take" title="Manifest casts +1 copy" disabled={charBusy || !exp.classKey || pay.points < 3} onClick={() => buyNodeM.mutate({ weaponKey: key, node: "manifest" })}>Buy Manifest — 3 pts</button><p className="zodiac-note small">{pay.el ? `Pays from your ${pay.el} pool (${pay.points}).` : "No aspect pool holds points yet."}{pay.points < 3 ? " Needs 3." : ""}</p></>}
                          </div>
                          <div className="weapon-node">
                            <strong>Signature · {sig.name}</strong><span> — {sig.desc}</span>
                            {w.signature ? <p className="zodiac-held">✓ Owned</p> : <><button type="button" className="zodiac-btn take" title={`${sig.name}: ${sig.desc}`} disabled={charBusy || !exp.classKey || pay.points < 3} onClick={() => buyNodeM.mutate({ weaponKey: key, node: "signature" })}>Buy {sig.name} — 3 pts</button><p className="zodiac-note small">{pay.el ? `Pays from your ${pay.el} pool (${pay.points}).` : "No aspect pool holds points yet."}{pay.points < 3 ? " Needs 3." : ""}</p></>}
                          </div>
                        </div>
                      </section>); })}
                    {!exp.classKey && <p className="zodiac-lock">The arsenal opens with your class — choose a class first.</p>}
                  </div>
                )}

                {grimTab === "spells" && (
                  <div>
                    <p className="zodiac-note small">The book's record — read-only. Spell powering machinery does not exist yet, so nothing here pours or buys; this tab does not pretend otherwise.</p>
                    <p className="casting-law">Casting law: <strong>+2</strong> within your school, <strong>−3</strong> across the closed schools (the Sage pays −3 on every cast; the Spell school stays open to all). Every cast rolls d20 + gift against the working's level + 10, and a failed cast still spends its energy.</p>
                    {grimoireQ.isLoading && <p className="zodiac-note">The book is opening…</p>}
                    {grimoireQ.isError && <p className="zodiac-lock">The book would not open — try again in a moment.</p>}
                    <ul className="character-list spells">
                      {(grimoireQ.data?.spells ?? []).map(s => (
                        <li key={s.key}><strong>{s.name}</strong> — school: {s.kind} · Lv {s.numbers?.level ?? 1} · cost {s.cost}{s.blurb ? <><br /><span>{s.blurb}</span></> : null}</li>
                      ))}
                    </ul>
                    {grimoireQ.data && grimoireQ.data.spells.length === 0 && <p className="zodiac-note">No spells are written in the book yet.</p>}
                  </div>
                )}

                {grimTab === "runes" && (
                  <div>
                    <p className="zodiac-note small">Read-only standing — ward and rune workings are cast on the land and at the Table, not powered from this page.</p>
                    <ul className="character-list">
                      <li>Ward &amp; Rune arts: <strong>{exp.wardRuneUnlocked ? "unlocked" : "locked"}</strong> — {exp.wardRuneUnlocked ? "opened at Tender Lv 3." : `opens at Tender Lv 3 (you are Lv ${exp.level}).`}</li>
                      <li>Ward workings in the book: <strong>{(grimoireQ.data?.spells ?? []).filter(s => s.kind === "ward").length}</strong> · Rune workings: <strong>{(grimoireQ.data?.spells ?? []).filter(s => s.kind === "rune").length}</strong></li>
                    </ul>
                    <h4>The filling energy — attunement pools</h4>
                    <ul className="character-list">
                      {ELEMENTS.map(el => <li key={el}>{EL_EMOJI[el]} {el}: <strong>{exp.pools[el] ?? 0}</strong> pts · attunement Lv {state?.attunementLevels[el] ?? 0}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </aside>
      </div>
    </div>
  );
}
