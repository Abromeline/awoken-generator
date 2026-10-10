import { useState, useEffect, useRef } from "react";
import { api, Awakened } from "./api";
import TwinBirth from "./TwinBirth";
import battlegroundBg from "./assets/battleground-bg.jpg";

interface Fighter extends Awakened {
  ownerKey: string;
  hp: number;
  maxHp: number;
}

interface Enemy {
  id: number;
  name: string;
  power: number;
  hp: number;
  maxHp: number;
}

export default function ConfluenceBattle({
  sessionId,
  onClose,
}: {
  sessionId: number;
  onClose: () => void;
}) {
  const [fighters, setFighters] = useState<Fighter[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [log, setLog] = useState<string[]>(["The Unraveling comes..."]);
  const [phase, setPhase] = useState<"loading" | "battle" | "victory" | "defeat">("loading");
  const [round, setRound] = useState(0);
  const [twin, setTwin] = useState<any>(null);
  const battleRef = useRef<{ fighters: Fighter[]; enemies: Enemy[] } | null>(null);
  const battleAudio = useRef<HTMLAudioElement | null>(null);

  // Battle music from the workshop library
  useEffect(() => {
    let cancelled = false;
    api.getRandomBattleTrack().then(res => {
      if (cancelled || !res.track) return;
      battleAudio.current = new Audio(res.track.trackData);
      battleAudio.current.volume = 0.35;
      battleAudio.current.loop = true;
      battleAudio.current.play().catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; battleAudio.current?.pause(); battleAudio.current = null; };
  }, []);

  useEffect(() => {
    api.getConfluenceRoster({ sessionId }).then(data => {
      const fs: Fighter[] = data.fighters.map((f: any) => ({
        ...f,
        hp: f.toughness * 3,
        maxHp: f.toughness * 3,
      }));
      // Enemies scaled to combined roster power
      const totalPower = fs.reduce((s, f) => s + f.power, 0);
      const enemyCount = Math.max(2, Math.min(6, Math.ceil(fs.length * 1.2)));
      const en: Enemy[] = Array.from({ length: enemyCount }, (_, i) => ({
        id: i,
        name: i % 3 === 0 ? "Unraveler" : "Fray",
        power: i % 3 === 0 ? 4 : 2,
        hp: 8 + Math.floor(totalPower / enemyCount),
        maxHp: 8 + Math.floor(totalPower / enemyCount),
      }));
      battleRef.current = { fighters: fs, enemies: en };
      setFighters(fs);
      setEnemies(en);
      setPhase("battle");
    }).catch(() => setLog(["Couldn't load the battle."]));
  }, [sessionId]);

  useEffect(() => {
    if (phase !== "battle" || !battleRef.current) return;
    const timer = setInterval(() => {
      const b = battleRef.current!;
      const aliveFighters = b.fighters.filter(f => f.hp > 0);
      const aliveEnemies = b.enemies.filter(e => e.hp > 0);

      if (aliveEnemies.length === 0) {
        clearInterval(timer);
        setPhase("victory");
        setLog(l => [...l, "THE WAVE BREAKS!"]);
        // Resolve on server
        api.resolveConfluence({ sessionId, victory: true }).then(res => {
          if (res.twin) setTwin({ ...res.twin, sessionId });
        }).catch(() => {});
        return;
      }
      if (aliveFighters.length === 0) {
        clearInterval(timer);
        setPhase("defeat");
        setLog(l => [...l, "The Awoken disperse..."]);
        api.resolveConfluence({ sessionId, victory: false }).catch(() => {});
        return;
      }

      // One round: each alive fighter hits a random enemy, each alive enemy hits a random fighter
      const newLog: string[] = [];
      for (const f of aliveFighters) {
        const targets = b.enemies.filter(e => e.hp > 0);
        if (!targets.length) break;
        const t = targets[Math.floor(Math.random() * targets.length)];
        t.hp -= f.power;
        newLog.push(`${f.name} strikes ${t.name} for ${f.power}`);
      }
      for (const e of aliveEnemies) {
        if (e.hp <= 0) continue;
        const targets = b.fighters.filter(f => f.hp > 0);
        if (!targets.length) break;
        const t = targets[Math.floor(Math.random() * targets.length)];
        t.hp -= e.power;
        newLog.push(`${e.name} hits ${t.name} for ${e.power}`);
      }
      setFighters([...b.fighters]);
      setEnemies([...b.enemies]);
      setLog(l => [...l.slice(-4), ...newLog.slice(0, 3)]);
      setRound(r => r + 1);
    }, 1200);
    return () => clearInterval(timer);
  }, [phase, sessionId]);

  if (twin) {
    return <TwinBirth twin={twin} sessionId={twin.sessionId} onClaimed={onClose} />;
  }

  return (
    <div className="confluence-battle-overlay">
      <div className="battleground-bg" style={{ backgroundImage: `url(${battlegroundBg})` }} />
      <div className="confluence-battle">
        <div className="cb-header">
          <h2>🌀 Confluence Battle</h2>
          <span className="cb-round">Round {round}</span>
          <button className="packet-close" onClick={onClose}>✕</button>
        </div>

        {phase === "loading" && <div className="cb-loading">Gathering the Awoken...</div>}

        {(phase === "battle" || phase === "victory" || phase === "defeat") && (
          <>
            <div className="cb-sides">
              <div className="cb-fighters">
                <h3>Awoken ({fighters.filter(f => f.hp > 0).length}/{fighters.length})</h3>
                {fighters.map(f => (
                  <div key={f.id} className={`cb-fighter ${f.hp <= 0 ? "fallen" : ""}`}>
                    <img src={f.image_url} alt={f.name} />
                    <div className="cb-fighter-info">
                      <div className="cb-fighter-name">{f.name}</div>
                      <div className="cb-hp-bar">
                        <div className="cb-hp-fill" style={{ width: `${Math.max(0, f.hp / f.maxHp * 100)}%` }} />
                      </div>
                      <div className="cb-stats">{f.power}⚔ {f.toughness}🛡</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cb-vs">⚔</div>
              <div className="cb-enemies">
                <h3>Unraveling ({enemies.filter(e => e.hp > 0).length}/{enemies.length})</h3>
                {enemies.map(e => (
                  <div key={e.id} className={`cb-enemy ${e.hp <= 0 ? "fallen" : ""}`}>
                    <div className="cb-enemy-name">{e.name}</div>
                    <div className="cb-hp-bar enemy">
                      <div className="cb-hp-fill" style={{ width: `${Math.max(0, e.hp / e.maxHp * 100)}%` }} />
                    </div>
                    <div className="cb-stats">{e.power}⚔</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cb-log">
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>

            {phase === "victory" && !twin && (
              <div className="cb-result victory">✦ Victory! The twin stirs... ✦</div>
            )}
            {phase === "defeat" && (
              <div className="cb-result defeat">
                Defeat — but you stood together.
                <button className="abtn small" onClick={onClose} style={{ marginLeft: 12 }}>Return</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
