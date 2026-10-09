// Battleground: interactive wave defense overlay.
// Option A: client plays the battle, server validates the result.
import { useState, useEffect, useRef } from "react";
import FieldAwoken from "./FieldAwoken";
import { api, type Awakened } from "./api";
type FieldAsset = { sourceId: string; name: string; imageUrl: string; category: string };
import { trackPlayer, type TrackData } from "./trackPlayer";
import battlegroundBg from "./assets/battleground-bg.jpg";
import frayImg from "./assets/adversaries/fray.png";
import unravelerImg from "./assets/adversaries/unraveler.png";

interface Defender {
  placementId: number;
  awoken: Awakened;
}

interface WaveInfo {
  waveNumber: number;
  frayCount: number;
  unravelers: number;
  totalPower: number;
}

interface BattlegroundProps {
  defenders: Defender[];  // Field Awoken on the bastion
  wave: WaveInfo;
  hand: Awakened[];  // For reinforcements
  assets: FieldAsset[];
  energy: number;
  maxEnergy: number;
  onBattleEnd: (result: { victory: boolean; survivors: number[] }) => void;
  onClose: () => void;
}

interface Fighter {
  id: string;
  awokenId?: number;
  img?: string;  // For enemies
  x: number; y: number; w: number;
  power: number; tough: number; hp: number; maxHp: number;
  name: string;
  side: "aw" | "en";
  field: boolean;  // True if field defender, false if reinforcement
  awoken?: Awakened;  // For FieldAwoken rendering
}

export default function Battleground({ defenders, wave, hand, assets, energy, maxEnergy, onBattleEnd, onClose }: BattlegroundProps) {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [enemies, setEnemies] = useState<Fighter[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState("The Unraveling comes...");

  const [energyLeft, setEnergyLeft] = useState(energy);
  const [deck, setDeck] = useState(hand.slice(0, 6));
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [attacking, setAttacking] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [victory, setVictory] = useState<boolean | null>(null);

  // Initialize fighters from defenders + wave
  useEffect(() => {
    const aw: Fighter[] = defenders.map((d, i) => ({
      id: `a-${d.awoken.id}`,
      awokenId: d.awoken.id,
      x: 5 + i * 10, y: 25, w: 16,
      power: d.awoken.power, tough: d.awoken.toughness,
      hp: d.awoken.toughness, maxHp: d.awoken.toughness,
      name: d.awoken.name, side: "aw", field: true,
      awoken: d.awoken,
    }));
    const en: Fighter[] = [];
    for (let i = 0; i < wave.frayCount; i++) {
      en.push({
        id: `e-fray-${i}`, img: "fray",
        x: 58 + i * 6, y: 25, w: 12,
        power: 2, tough: 0, hp: 3, maxHp: 3,
        name: "Fray", side: "en", field: false,
      });
    }
    for (let i = 0; i < wave.unravelers; i++) {
      en.push({
        id: `e-unrav-${i}`, img: "unraveler",
        x: 60 + i * 8, y: 12, w: 14,
        power: 4, tough: 0, hp: 6, maxHp: 6,
        name: "Unraveler", side: "en", field: false,
      });
    }
    setFighters(aw);
    setEnemies(en);

    // Random battle track
    api.getRandomBattleTrack().then(({ track }) => {
      if (track) trackPlayer.play(JSON.parse(track.trackData) as TrackData);
    }).catch(() => {});

    return () => trackPlayer.stop();
  }, []);

  // Initiative: 12 - power
  const getInit = (f: Fighter) => 12 - f.power;

  const buildTurnOrder = () => {
    const all = [...fighters, ...enemies].filter(f => f.hp > 0);
    all.sort((a, b) => getInit(b) - getInit(a) || Math.random() - 0.5);
    setTurnOrder(all.map(f => f.id));
    setTurnIndex(0);
  };

  const doAttack = (atk: Fighter, def: Fighter) => {
    setSelected(null);
    setAttacking(atk.id);
    setTimeout(() => setAttacking(null), 600);
    const dmg = Math.max(1, atk.power - def.tough);
    setLog(`${atk.name} strikes ${def.name} for ${dmg}!`);
    // Apply damage
    if (def.side === "en") {
      setEnemies(prev => prev.map(e => e.id === def.id ? { ...e, hp: Math.max(0, e.hp - dmg) } : e));
    } else {
      setFighters(prev => prev.map(f => f.id === def.id ? { ...f, hp: Math.max(0, f.hp - dmg) } : f));
    }
    // Counterattack after delay (only if defender was enemy and survives are left)
    setTimeout(() => {
      setEnemies(currentEnemies => {
        const alive = currentEnemies.filter(e => e.hp > 0);
        if (alive.length === 0) {
          return currentEnemies;
        }
        // Random alive enemy counterattacks a random alive fighter
        const attacker = alive[Math.floor(Math.random() * alive.length)];
        setFighters(currentFighters => {
          const targets = currentFighters.filter(f => f.hp > 0);
          if (targets.length === 0) {
              return currentFighters;
          }
          const target = targets[Math.floor(Math.random() * targets.length)];
          const edmg = Math.max(1, attacker.power - target.tough);
          setLog(`${attacker.name} strikes back at ${target.name} for ${edmg}!`);
          return currentFighters.map(f =>
            f.id === target.id ? { ...f, hp: Math.max(0, f.hp - edmg) } : f
          );
        });
        return currentEnemies;
      });
    }, 900);
  };

  // Check for battle end whenever fighters or enemies change
  useEffect(() => {
    if (victory !== null) return; // Already resolved
    if (fighters.length === 0 && enemies.length === 0) return; // Not initialized
    // Count alive — must have at least one enemy to exist for victory to be valid
    const aliveFighters = fighters.filter(f => f.hp > 0).length;
    const aliveEnemies = enemies.filter(e => e.hp > 0).length;
    const totalEnemies = enemies.length;
    // Only trigger if battle actually started (enemies were created) and now all dead
    if (totalEnemies > 0 && aliveEnemies === 0 && aliveFighters > 0) {
      // Victory!
      setVictory(true);
      setSimRunning(false);
      trackPlayer.stop();
      const survivors = fighters.filter(f => f.hp > 0 && f.field).map(f => f.awokenId!);
      setLog("THE WAVE BREAKS!");
      setTimeout(() => onBattleEnd({ victory: true, survivors }), 2500);
    } else if (totalEnemies > 0 && aliveFighters === 0 && aliveEnemies > 0) {
      // Defeat — all fighters dead but enemies remain
      setVictory(false);
      setSimRunning(false);
      trackPlayer.stop();
      setLog("THE LINE FALLS...");
      setTimeout(() => onBattleEnd({ victory: false, survivors: [] }), 2500);
    }
  }, [fighters, enemies]);

  const [birthing, setBirthing] = useState<number | null>(null);

  const playCard = (index: number) => {
    const card = deck[index];
    const isNewborn = card.name.toLowerCase().includes("newborn") || card.field_born === 1;
    const cost = isNewborn ? 0 : 2 + Math.floor((card.power - 1) / 3);
    if (energyLeft < cost) return;
    if (isNewborn) {
      // Birth ritual: the dot sparkles and expands into the Awoken
      setBirthing(card.id);
      setLog("Something stirs in the card...");
      setTimeout(() => {
        setEnergyLeft(e => e - cost);
        const newFighter: Fighter = {
          id: `a-birth-${Date.now()}`,
          awokenId: card.id,
          x: 5 + fighters.length * 10, y: 25, w: 16,
          power: card.power, tough: card.toughness,
          hp: card.toughness, maxHp: card.toughness,
          name: card.name, side: "aw", field: false,
          awoken: card,
        };
        setFighters(prev => [...prev, newFighter]);
        setDeck(prev => prev.filter((_, i) => i !== index));
        setBirthing(null);
        setLog(`${card.name} is born!`);
      }, 1500);
      return;
    }
    setEnergyLeft(e => e - cost);
    const newFighter: Fighter = {
      id: `a-reinf-${Date.now()}`,
      awokenId: card.id,
      x: 5 + Math.random() * 15, y: 18 + Math.random() * 12, w: 13,
      power: card.power, tough: card.toughness,
      hp: card.toughness, maxHp: card.toughness,
      name: card.name, side: "aw", field: false,
      awoken: card,
    };
    setFighters(prev => [...prev, newFighter]);
    setDeck(prev => prev.filter((_, i) => i !== index));
    setLog(`${card.name} reinforces! (returns to hand after)`);
  };

  return (
    <div className="battleground-overlay">
      <div className="battleground-bg" style={{ backgroundImage: `url(${battlegroundBg})` }} />
      <div className="battle-hud">
        <div className="energy-display">⚡ {energyLeft}/{maxEnergy}</div>
        <button className="abtn small" onClick={onClose}>✕ Retreat</button>
      </div>
      <div className="battle-log">{log}</div>
      <div className="battle-field">
        {fighters.filter(f => f.hp > 0).map(f => (
          <div
            key={f.id}
            className={`battle-fighter ${selected === f.id ? "selected" : ""} ${f.hp < f.maxHp * 0.25 ? "critical" : ""} ${attacking === f.id ? "attacking" : ""}`}
            style={{ left: `${f.x}%`, bottom: `${f.y}%`, width: `${f.w}%` }}
            onClick={() => setSelected(selected === f.id ? null : f.id)}
          >
            {f.awoken && (
              <svg viewBox="0 0 100 130" style={{ width: "100%", height: "auto", display: "block" }}>
                <FieldAwoken awoken={f.awoken} assets={assets} x={0} y={0} width={100} height={130} />
              </svg>
            )}
            <div className="fighter-stats">{f.power}⚔ {f.tough}🛡</div>
            <div className="thermometer">
              <div className="thermo-fill" style={{ height: `${(f.hp / f.maxHp) * 100}%` }} />
              <div className="thermo-bulb" />
            </div>
            {f.field && <div className="field-badge">⚔</div>}
          </div>
        ))}
        {enemies.filter(e => e.hp > 0).map(e => (
          <div
            key={e.id}
            className={`battle-fighter enemy ${e.hp < e.maxHp * 0.25 ? "critical" : ""} ${attacking === e.id ? "attacking" : ""}`}
            style={{ left: `${e.x}%`, bottom: `${e.y}%`, width: `${e.w}%` }}
            onClick={() => {
              if (selected) {
                const atk = fighters.find(f => f.id === selected);
                if (atk) doAttack(atk, e);
              }
            }}
          >
            <img
              src={e.img === "fray" ? frayImg : unravelerImg}
              alt={e.name}
              style={{ width: "100%", height: "auto", display: "block", filter: "hue-rotate(320deg) saturate(2)" }}
            />
            <div className="fighter-stats">❤{e.hp}/{e.maxHp}</div>
            <div className="thermometer enemy-thermo">
              <div className="thermo-fill" style={{ height: `${(e.hp / e.maxHp) * 100}%` }} />
              <div className="thermo-bulb" />
            </div>
          </div>
        ))}
      </div>
      <div className="battle-deck">
        {deck.map((card, i) => {
          const isNewborn = card.name.toLowerCase().includes("newborn") || card.field_born === 1;
          const cost = isNewborn ? 0 : 2 + Math.floor((card.power - 1) / 3);
          const isBirthing = birthing === card.id;
          return (
            <div
              key={card.id}
              className={`deck-card-mini ${isNewborn ? "newborn" : ""} ${isBirthing ? "birthing" : ""}`}
              onClick={() => playCard(i)}
              style={{ opacity: energyLeft >= cost ? 1 : 0.4 }}
            >
              {!isNewborn && <div className="mini-cost">⚡{cost}</div>}
              {isNewborn ? (
                <>
                  <div className="newborn-dot" />
                  <div className="mini-name" style={{ color: "#ffd700" }}>✦ Newborn</div>
                  <div className="mini-stats" style={{ fontSize: 8 }}>tap to birth</div>
                </>
              ) : (
                <>
                  <div className="mini-name">{card.name}</div>
                  <div className="mini-stats">{card.power}⚔ {card.toughness}🛡</div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {victory !== null && (
        <div className="victory-overlay">
          <div className="victory-text">{victory ? "THE WAVE BREAKS" : "THE LINE FALLS"}</div>
        </div>
      )}
    </div>
  );
}
