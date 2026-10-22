import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, GRIMOIRE_POUR_ENGINES, GRIMOIRE_PAGE_SLOTS, GRIMOIRE_SLOT_COST, type GrimoireSpell, type SkillTreeState, type ZodiacNodeView } from "./api";
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
  witch: "#e8a2c8", sage: "#9ed07e",
  rim: "#cfd6dd", lore: "#f2e3ac", warground: "#e07856", weather: "#7ec8e3",
  music: "#e8a2c8", grove: "#9ed07e", land: "#c9a86a", wake: "#a8d8b9",
  voice: "#f5f0dc", law: "#d8d8e8", party: "#8ce8d4",
};
/** The v2 wheel's sector labels: the five class-tailored
 *  roads and the shared rim (2026-10-22). The gods no longer
 *  stand as their own sectors — each god's stars are an arm
 *  of a road, named in the star's own detail. */
const SECTOR_LABEL: Record<string, string> = {
  warden: "Warden", runewright: "Runewright", binder: "Binder",
  witch: "Witch", sage: "Sage", rim: "The Rim",
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
/** Points as the Grimoire's pour system shows them: two
 *  decimal places at most, no long tails (Nigel, 2026-10-20). */
const fmtPts = (n: number) => String(Math.round((n ?? 0) * 100) / 100);

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
  if (state.tree.left < node.cost) return `Costs ${node.cost} points — you hold ${state.tree.left}.`;
  const heartHeld = state.unlocked.some(k => state.nodes.find(n => n.id === k)?.sector === "heart");
  if (node.sector !== "heart" && !heartHeld) return "The Heart must beat before the limbs move.";
  if (node.requires.length > 0 && !node.requires.some(req => owned.has(req))) {
    return `Requires ${node.requires.map(req => state.nodes.find(n => n.id === req)?.name ?? req).join(" or ")} first.`;
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
  // RESET SKILL POINTS (Nigel, 2026-10-22): one tap, no
  // confirmation — the act is undone by re-buying, and the
  // standing law keeps unasked gates out of core flows.
  const resetM = useMutation({
    mutationFn: () => api.resetSkillPoints(),
    onSuccess: (st) => { apply(st); setMsg("Every skill point is back in your purse — the wheel stands unwritten before you."); },
    onError: (e: any) => setMsg(e?.message ?? "The wheel refused."),
  });
  // THE INBOX (workshop→tender letters, ruled 2026-10-20):
  // the Message button in the character card opens it; the
  // unread count riding that button is a living readout.
  const inboxQ = useQuery({ queryKey: ["tenderMessages"], queryFn: () => api.getTenderMessages() });
  const markReadM = useMutation({
    mutationFn: (id: number) => api.markTenderMessageRead(id),
    onSuccess: (st) => qc.setQueryData(["tenderMessages"], st),
    onError: (e: any) => setCharErr(e?.message ?? "The letter refused to open."),
  });
  // ── THE CHARACTER MENU (Phase C): the Zodiac screen is the
  // character hub — profile card on the right with Profile |
  // Inventory | Grimoire tabs. Every pour/buy/wield refreshes
  // the tender record so the card never lies.
  const [tab, setTab] = useState<"profile" | "inventory" | "grimoire" | "party" | "messages">("profile");
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
  // ATTUNE A PAGE (Nigel, 2026-10-20; the slots, 2026-10-21):
  // powering lives in the Grimoire — a page's eight slots are
  // filled here, one element at a time at 4 points the slot,
  // and casts on both grounds carry the filled slots of the
  // cast's element. The book refreshes after every fill so
  // the standing never lies.
  const attunePageM = useMutation({
    mutationFn: (a: { spellKey: string; element: ElementKey }) => api.attuneGrimoirePage(a),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["grimoire"] });
      void qc.invalidateQueries({ queryKey: ["tenderExp"] });
      charOk(`${grimoireQ.data?.spells.find(s => s.key === r.spellKey)?.name ?? r.spellKey} — a ${r.element} slot stands filled (${r.spent} pts paid); the page now holds ${r.filled} of ${GRIMOIRE_PAGE_SLOTS} slots.`);
    },
    onError: charFail,
  });
  // ── THE PARTY (Nigel, 2026-10-20; built 2026-10-21): the
  // party stands in this tab. The arrangement here is the
  // plain working draft — spots in a row, the deck beneath —
  // standing until Nigel's own frame replaces it. Filling an
  // open spot draws from the full deck list the server
  // serves; returning a member benches it back to the deck.
  // The party is set from TWO surfaces of this hub — its own
  // tab and the Profile tab (Nigel, 2026-10-21) — over this
  // one query and the same doors; no divergent state.
  const partyQ = useQuery({ queryKey: ["party"], queryFn: () => api.getParty(), enabled: tab === "party" || tab === "profile" });
  const [filling, setFilling] = useState(false);
  const addPartyM = useMutation({
    mutationFn: (id: number) => api.addToParty({ awakenedId: id }),
    onSuccess: (v, id) => {
      qc.setQueryData(["party"], v);
      setFilling(false);
      // Mid-battle (build 2): the fill started a
      // reinforcements road instead of landing — say so,
      // in the words the player will watch for, price and
      // all: the road charged the Awokin's summon price,
      // and it comes back whole if the battle ends first.
      if (v.reinforcement) {
        charOk(`${v.reinforcement.name} is on its way to your party — ✦${v.reinforcement.cost} paid for the road. The road takes four minutes, and it lands only while the battle at the Table still stands; if the battle ends first, the ✦ comes back whole. And the price is paid twice over, by the road's balance: ✦${v.reinforcement.cost} to call it, and its summon price again to summon it when it arrives.`);
      } else {
        charOk(`${v.members.find(m => m.awakenedId === id)?.name ?? "The Awokin"} joins your party — it follows you now.`);
      }
    },
    onError: charFail,
  });
  const removePartyM = useMutation({
    mutationFn: (id: number) => api.removeFromParty({ awakenedId: id }),
    onSuccess: (v, id) => {
      qc.setQueryData(["party"], v);
      charOk(`${v.deck.find(d => d.awakenedId === id)?.name ?? "The Awokin"} returns to the deck.`);
    },
    onError: charFail,
  });
  const partyBusy = addPartyM.isPending || removePartyM.isPending;
  const charBusy = wieldM.isPending || attuneM.isPending || buyNodeM.isPending || attunePageM.isPending;
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
    return Object.keys(SECTOR_LABEL).map(sector => {
      const fan = state.nodes.filter(n => n.sector === sector);
      if (!fan.length) return null;
      const cx = fan.reduce((s2, n) => s2 + n.x, 0) / fan.length;
      const cy = fan.reduce((s2, n) => s2 + n.y, 0) / fan.length;
      return { god: sector, cx, cy };
    }).filter(Boolean) as { god: string; cx: number; cy: number }[];
  }, [state]);
  const classArt = exp?.classKey ? TENDER_CLASSES[exp.classKey as TenderClassId] ?? null : null;
  const wieldedKey = (exp?.weaponKey as WeaponKey | null) ?? null;
  const tenderName = studioQ.data?.tender?.tenderName ?? "Nameless Tender";
  const arsenalOf = (key: string) => exp?.arsenal.find(w => w.key === key);
  /** The filled slots of one page, with its fill controls —
   *  rendered wherever the page is listed (the Spells tab
   *  and the Runes/Wards tab alike). Pages whose strength is
   *  not bought with attunement render nothing; the tabs say
   *  so in words instead. A fill spends 4 points of that
   *  element's pool and stands one slot of it in the page;
   *  a page holds eight slots in all, of whatever mix. */
  const pageAttunementBlock = (s: GrimoireSpell) => {
    if (!(GRIMOIRE_POUR_ENGINES as readonly string[]).includes(s.engine) || !exp) return null;
    const standing = grimoireQ.data?.pageAttunements?.[s.key] ?? {};
    const held = ELEMENTS.filter(el => (standing[el] ?? 0) > 0);
    const total = held.reduce((n, el) => n + (standing[el] ?? 0), 0);
    const pips = held.flatMap(el => Array.from({ length: standing[el] ?? 0 }, () => el));
    return (
      <div className="page-attune">
        <div className="attune-row" aria-label={`${s.name} attunement slots`}>
          <span>Slots {total} of {GRIMOIRE_PAGE_SLOTS}:</span>
          {total ? pips.map((el, i) => (
            <span key={i} className="attune-node lit" title={`a filled ${el} slot — casts of this page in ${el} carry it`}>{EL_EMOJI[el] ?? ""}</span>
          )) : <span>— all eight empty; every cast of this page goes bare</span>}
        </div>
        {held.map(el => (
          <div key={el} className="attune-row">
            <span>{EL_EMOJI[el] ?? ""} {el} ×{standing[el]} — a cast of this page in {el} gains +{standing[el]} power and +{standing[el]} health</span>
          </div>
        ))}
        <div className="weapon-actions" role="group" aria-label={`Fill a slot of ${s.name}`}>
          {ELEMENTS.map(el => {
            const pool = exp.pools[el] ?? 0;
            return (
              <button key={el} type="button" className="zodiac-btn" disabled={charBusy || total >= GRIMOIRE_PAGE_SLOTS || pool < GRIMOIRE_SLOT_COST}
                onClick={() => attunePageM.mutate({ spellKey: s.key, element: el })}>
                {EL_EMOJI[el] ?? ""} {el} — fill a slot for {GRIMOIRE_SLOT_COST} pts (pool {fmtPts(pool)}){total >= GRIMOIRE_PAGE_SLOTS ? " · page full" : ""}
              </button>
            );
          })}
        </div>
        <p className="zodiac-note small">Eight slots stand in each page. Filling one costs {GRIMOIRE_SLOT_COST} points of that element's pool, and the slot stands: every cast of this page in that slot's element carries +1 power and +1 health per filled slot, and the spell's own level rides every cast's roll. A filled slot cannot be emptied or changed yet. The Witch's doubled attunement and the Sage's +2 priced the old way of powering a page; how they bend slots is not ruled yet, so today every hand fills at the same {GRIMOIRE_SLOT_COST} points.</p>
      </div>
    );
  };

  return (
    <div className="zodiac-overlay" role="dialog" aria-label="The Skill Zodiac">
      <div className="zodiac-head">
        <h2>🌳 The Skill Zodiac</h2>
        {state && (
          <div className="zodiac-pools">
            <span>🌳 Tree <strong>{state.tree.left}</strong>/{state.tree.total}</span>
            <span>Tender Lv {state.level} · +{state.pointsPerLevel} 🌳 per level</span>
            <button type="button" className="zodiac-btn" disabled={state.tree.spent === 0 || resetM.isPending} onClick={() => resetM.mutate()}>Reset Skill Points</button>
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
              return <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke={bothHeld ? "#f0d68c" : "#4a4f63"}
                strokeWidth={bothHeld ? 2 : 1} opacity={bothHeld ? 0.95 : 0.5} />;
            })}
            {godLabels.map(({ god, cx, cy }) => (
              <text key={god} x={cx} y={cy} textAnchor="middle" fontSize={13} fill={SECTOR_COLOR[god] ?? "#d8d8e8"} opacity={0.85} style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>{SECTOR_LABEL[god]}</text>
            ))}
            {state.nodes.map(n => {
              const owned = state.unlocked.includes(n.id);
              const reason = lockReason(state, n, reached);
              const r = n.kind === "center" ? 13 : n.kind === "keystone" || n.kind === "capstone" || n.kind === "crown" || n.kind === "summon" ? 9 : n.kind === "notable" ? 7 : 5.5;
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
                <p className="zodiac-kind">{selected.kind === "center" ? "The Heart" : `${selected.kind} · ${selected.pathway ? `${selected.pathway} road` : selected.sector}${selected.god ? ` · ${selected.god}` : ""}${selected.el ? ` · ${selected.el}` : ""} · ${selected.cost} pt${selected.cost > 1 ? "s" : ""}`}</p>
                <p className="zodiac-effect">{selected.effect}</p>
                {selected.grant && selected.grant !== selected.effect && !selected.grant.startsWith("—") && <p className="zodiac-effect">{selected.grant}</p>}
                {selected.syn && <p className="zodiac-syn">{selected.syn}</p>}
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
                      : <button type="button" className="zodiac-btn take" disabled={unlockM.isPending} onClick={() => unlockM.mutate(selected.id)}>Unlock — {selected.cost} pt{selected.cost > 1 ? "s" : ""}</button>}
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
              <button type="button" className="zodiac-btn character-messages-btn" aria-pressed={tab === "messages"} onClick={() => setTab("messages")}>
                ✉ Messages{inboxQ.data && inboxQ.data.unread > 0 ? <> — <strong>{inboxQ.data.unread} unread</strong> ●</> : ""}
              </button>
            </div>
            <div className="character-tabs" role="tablist" aria-label="Character menu tabs">
              {(["profile", "inventory", "grimoire", "party"] as const).map(t => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={`character-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t === "profile" ? "Profile" : t === "inventory" ? "Inventory" : t === "grimoire" ? "Grimoire" : "Party"}</button>
              ))}
            </div>
            {charMsg && <p className="character-msg" role="status">{charMsg}</p>}
            {charErr && <p className="zodiac-lock" role="alert">{charErr}</p>}

            {tab === "messages" && (
              <div className="character-pane">
                <h4>✉ Letters from the workshop</h4>
                {inboxQ.isLoading ? <p className="zodiac-note">The ledger is opening…</p> : !inboxQ.data || inboxQ.data.messages.length === 0 ? (
                  <p className="zodiac-note">No letters yet. When the workshop writes to you, its words will wait here.</p>
                ) : (
                  <ol className="tender-inbox">
                    {inboxQ.data.messages.map(m => (
                      <li key={m.id} className={m.readAt == null ? "unread" : undefined}>
                        <p className="tender-inbox-when">{new Date(m.sentAt).toLocaleString()}{m.readAt == null ? " · ● new" : ""}</p>
                        <p className="tender-inbox-body">{m.body}</p>
                        {m.readAt == null && (
                          <button type="button" className="zodiac-btn" disabled={markReadM.isPending} onClick={() => markReadM.mutate(m.id)}>Mark as read</button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

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
                {/* THE PARTY, SET FROM THE PROFILE TOO (Nigel,
                    2026-10-21): a second surface over the same
                    membership — the same query, the same doors
                    (getParty / addToParty / removeFromParty),
                    the same spots and deck as the Party tab.
                    No new mechanics, no second state. */}
                <h4>Your party</h4>
                <p className="zodiac-note small">The same party the Party tab keeps — set it from either surface; the membership is one ledger. The spots are reckoned: 3 to start, +1 for every 3 party levels, plus your Muster stars.</p>
                {partyQ.isLoading && <p className="zodiac-note small">Your party is gathering…</p>}
                {partyQ.data && (
                  <>
                    <p>{partyQ.data.size} of {partyQ.data.cap} spots filled · Party Lv {partyQ.data.partyLevel ?? 0}</p>
                    {(partyQ.data.incoming ?? []).length > 0 && (
                      <p className="zodiac-note small">
                        {(partyQ.data.incoming ?? []).map(i => (
                          <span key={i.awakenedId}>🚶 {i.name} is on its way to your party — it joins when its road completes, while the battle at the Table still stands. The ✦{i.cost} paid for its road comes back whole if the battle ends first. Calling it cost its summon price; summoning it when it arrives costs its summon price again. </span>
                        ))}
                      </p>
                    )}
                    <div className="party-spots">
                      {Array.from({ length: partyQ.data.cap }, (_, i) => {
                        const m = partyQ.data!.members[i];
                        return m ? (
                          <div key={m.awakenedId} className="party-spot filled">
                            <img src={m.imageUrl} alt="" />
                            <strong>{m.name}</strong>
                            <span>Lv {m.level ?? "?"} · ⚔ {m.power} · 🛡 {m.toughness}</span>
                            <button type="button" className="zodiac-btn" disabled={partyBusy} onClick={() => removePartyM.mutate(m.awakenedId)}>Return to the deck</button>
                          </div>
                        ) : (
                          <button key={`open-${i}`} type="button" className="party-spot open" disabled={partyBusy} onClick={() => setFilling(true)}>
                            Open spot — tap to fill it from your deck
                          </button>
                        );
                      })}
                    </div>
                    {filling && (
                      <div className="party-deck">
                        <h4>Your deck — the whole roster</h4>
                        {partyQ.data.deck.length === 0 ? (
                          <p className="zodiac-note small">Every Awokin you hold already stands in the party.</p>
                        ) : (
                          <ul className="character-list">
                            {partyQ.data.deck.map(d => (
                              <li key={d.awakenedId} className="party-deck-row">
                                <img className="party-thumb" src={d.imageUrl} alt="" />
                                <span><strong>{d.name}</strong> — Lv {d.level ?? "?"} · ⚔ {d.power} · 🛡 {d.toughness}</span>
                                <button type="button" className="zodiac-btn" disabled={partyBusy || partyQ.data!.size >= partyQ.data!.cap} onClick={() => addPartyM.mutate(d.awakenedId)}>Add to the party</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button type="button" className="quiet-link" onClick={() => setFilling(false)}>Not now</button>
                      </div>
                    )}
                  </>
                )}
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

            {tab === "party" && (
              <div className="character-pane">
                <h4>Your party</h4>
                <p className="zodiac-note small">The party stands here, in your Zodiac. Its members follow you — at the Table and on your land. An Awokin you give orders to, a march or a patrol, leaves the party; one standing on a field can be added back from that field. Fielding a member still happens where it always has: summoned at the Table, deployed on your land. The party is who you can summon — no one outside it takes the field. And while a battle stands at the Table, filling an open spot here does not land at once: the Awokin travels the reinforcements road — four minutes, at its summon price in ✦ (its ⚔ power, at least 1) — and joins only if the battle still stands when it arrives; if the battle ends first, the ✦ comes back whole. The price is paid twice over, and that is the road's balance, kept by ruling: the summon price to call the Awokin, and the summon price again to summon it onto the field when it arrives.</p>
                {partyQ.isLoading && <p className="zodiac-note">Your party is gathering…</p>}
                {partyQ.isError && <p className="zodiac-lock">The party would not gather — try again in a moment.</p>}
                {partyQ.data && (
                  <>
                    <p>{partyQ.data.size} of {partyQ.data.cap} spots filled.</p>
                    <p className="zodiac-note small">The spots are reckoned: 3 to start, +1 for every 3 party levels (your Party skill stands at level {partyQ.data.partyLevel ?? 0} → +{partyQ.data.levelBonus ?? 0}), +{partyQ.data.musterBonus ?? 0} from your Muster stars. Party levels are bought on the wheel — the Party stars, a type of their own, running south of the Heart, one skill point a level.</p>
                    {(partyQ.data.incoming ?? []).length > 0 && (
                      <p className="zodiac-note small">
                        {(partyQ.data.incoming ?? []).map(i => (
                          <span key={i.awakenedId}>🚶 {i.name} is on its way to your party — it joins when its road completes, while the battle at the Table still stands. The ✦{i.cost} paid for its road comes back whole if the battle ends first. Calling it cost its summon price; summoning it when it arrives costs its summon price again. </span>
                        ))}
                      </p>
                    )}
                    <div className="party-spots">
                      {Array.from({ length: partyQ.data.cap }, (_, i) => {
                        const m = partyQ.data!.members[i];
                        return m ? (
                          <div key={m.awakenedId} className="party-spot filled">
                            <img src={m.imageUrl} alt="" />
                            <strong>{m.name}</strong>
                            <span>Lv {m.level ?? "?"} · ⚔ {m.power} · 🛡 {m.toughness}</span>
                            <button type="button" className="zodiac-btn" disabled={partyBusy} onClick={() => removePartyM.mutate(m.awakenedId)}>Return to the deck</button>
                          </div>
                        ) : (
                          <button key={`open-${i}`} type="button" className="party-spot open" disabled={partyBusy} onClick={() => setFilling(true)}>
                            Open spot — tap to fill it from your deck
                          </button>
                        );
                      })}
                    </div>
                    {filling && (
                      <div className="party-deck">
                        <h4>Your deck — the whole roster</h4>
                        {partyQ.data.deck.length === 0 ? (
                          <p className="zodiac-note small">Every Awokin you hold already stands in the party.</p>
                        ) : (
                          <ul className="character-list">
                            {partyQ.data.deck.map(d => (
                              <li key={d.awakenedId} className="party-deck-row">
                                <img className="party-thumb" src={d.imageUrl} alt="" />
                                <span><strong>{d.name}</strong> — Lv {d.level ?? "?"} · ⚔ {d.power} · 🛡 {d.toughness}</span>
                                <button type="button" className="zodiac-btn" disabled={partyBusy || partyQ.data!.size >= partyQ.data!.cap} onClick={() => addPartyM.mutate(d.awakenedId)}>Add to the party</button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button type="button" className="quiet-link" onClick={() => setFilling(false)}>Not now</button>
                      </div>
                    )}
                  </>
                )}
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
                    <p className="zodiac-note small">Powering lives in this book (Nigel, 2026-10-20; the slots, 2026-10-21): a page's eight attunement slots are filled here, and every cast of that page — at the Table and on your land — carries the page's filled slots of the cast's element, each +1 power and +1 health. Nothing is poured at the moment of casting any more.</p>
                    <p className="casting-law">Casting law: <strong>+2</strong> within your school, <strong>−3</strong> across the closed schools (the Sage pays −3 on every cast; the Spell school stays open to all). Every cast rolls d20 + gift against the working's level + 10, and a failed cast still spends its energy.</p>
                    {grimoireQ.isLoading && <p className="zodiac-note">The book is opening…</p>}
                    {grimoireQ.isError && <p className="zodiac-lock">The book would not open — try again in a moment.</p>}
                    <ul className="character-list spells">
                      {(grimoireQ.data?.spells ?? []).filter(s => s.kind === "spell" || s.kind === "binding").map(s => (
                        <li key={s.key}><strong>{s.name}</strong> — school: {s.kind} · Lv {s.numbers?.level ?? 1} · cost {s.cost}{s.blurb ? <><br /><span>{s.blurb}</span></> : null}{pageAttunementBlock(s)}</li>
                      ))}
                    </ul>
                    <p className="zodiac-note small">Binding pages take no attunement — their strength is not bought with points. The pages that drink are the holding wards and the Crown Shard, under Runes/Wards.</p>
                    {grimoireQ.data && grimoireQ.data.spells.length === 0 && <p className="zodiac-note">No spells are written in the book yet.</p>}
                  </div>
                )}

                {grimTab === "runes" && (
                  <div>
                    <p className="zodiac-note small">These pages are cast on the land and at the Table — and powered HERE, in the book: fill a page's slots with an element and every cast of it in that element carries those slots, +1 power and +1 health apiece, with the spell's own level riding the cast's roll. There is no pouring at the cast, and standing workings can no longer be pushed.</p>
                    <ul className="character-list">
                      <li>Ward &amp; Rune arts: <strong>{exp.wardRuneUnlocked ? "unlocked" : "locked"}</strong> — {exp.wardRuneUnlocked ? "opened at Tender Lv 3." : `opens at Tender Lv 3 (you are Lv ${exp.level}).`}</li>
                    </ul>
                    {grimoireQ.isLoading && <p className="zodiac-note">The book is opening…</p>}
                    {grimoireQ.isError && <p className="zodiac-lock">The book would not open — try again in a moment.</p>}
                    <ul className="character-list spells">
                      {(grimoireQ.data?.spells ?? []).filter(s => s.kind === "ward" || s.kind === "rune").map(s => (
                        <li key={s.key}><strong>{s.name}</strong> — school: {s.kind} · Lv {s.numbers?.level ?? 1} · cost {s.cost}{s.blurb ? <><br /><span>{s.blurb}</span></> : null}{pageAttunementBlock(s)}</li>
                      ))}
                    </ul>
                    <h4>The filling energy — attunement pools</h4>
                    <ul className="character-list">
                      {ELEMENTS.map(el => <li key={el}>{EL_EMOJI[el]} {el}: <strong>{fmtPts(exp.pools[el] ?? 0)}</strong> pts · attunement Lv {state?.attunementLevels[el] ?? 0}</li>)}
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
