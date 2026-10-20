// EnergyTimer: Glowing orb counting down to the next +1 energy.
// The interval is the workshop's timer.energyRegenMinutes (online rate),
// loaded from game config — never a hardcoded guess.
//
// The globe houses FEEDING now (Nigel, 2026-10-18): while a warden
// is chosen on the field, the orb wears a lit feed-ready face and a
// tap feeds that warden 10✦ (Territory owns the feed itself — this
// component only carries the face and the tap). With no warden
// chosen, no feed props arrive and the orb is its present self.
import { useState, useEffect } from "react";
import { api } from "./api";

interface EnergyTimerProps {
  feedName?: string | null;
  onFeed?: () => void;
  refreshBump?: number;
}

export default function EnergyTimer({ feedName = null, onFeed, refreshBump = 0 }: EnergyTimerProps) {
  const [energy, setEnergy] = useState(0);
  const [maxEnergy, setMaxEnergy] = useState(10);
  const [regenSeconds, setRegenSeconds] = useState(240);
  const [secondsLeft, setSecondsLeft] = useState(240);

  useEffect(() => {
    api.call("getGameConfig", {}).then((cfg: any) => {
      const mins = cfg?.timers?.energyRegenMinutes ?? 4;
      setRegenSeconds(mins * 60);
      setSecondsLeft(mins * 60);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { energy: e, maxEnergy: m } = await api.getEnergy();
        setEnergy(e);
        setMaxEnergy(m);
        // Estimate time to next +1 (no exact server timestamp, so we
        // count down the configured interval and refresh on interval)
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // A feed landed (Territory bumped): re-read the globe's own number.
  useEffect(() => {
    if (!refreshBump) return;
    api.getEnergy().then(({ energy: e, maxEnergy: m }) => {
      setEnergy(e);
      setMaxEnergy(m);
    }).catch(() => {});
  }, [refreshBump]);

  useEffect(() => {
    if (energy >= maxEnergy) return; // full, no timer needed
    const timer = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          // Refresh energy when timer hits 0
          api.getEnergy().then(({ energy: e, maxEnergy: m }) => {
            setEnergy(e);
            setMaxEnergy(m);
          }).catch(() => {});
          return regenSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [energy, maxEnergy, regenSeconds]);

  const isFull = energy >= maxEnergy;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = 1 - secondsLeft / regenSeconds; // 0 to 1

  return (
    <div className={`energy-orb ${isFull ? "full" : "charging"}${feedName ? " feed-ready" : ""}`}
    onClick={feedName && onFeed ? () => onFeed() : undefined}
    title={
      feedName
        ? `Feed ${feedName} — 10✦ becomes XP`
        : isFull
        ? `Energy full (${energy}/${maxEnergy})`
        : `+1 energy in ${mins}:${secs.toString().padStart(2, "0")}`
    }>
      <svg viewBox="0 0 60 60" className="energy-orb-ring">
        {!isFull && (
          <circle
            cx="30" cy="30" r="26"
            fill="none" stroke="#88ccff" strokeWidth="3"
            strokeDasharray={`${progress * 163.3} 163.3`}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
            className="energy-orb-progress"
          />
        )}
      </svg>
      <div className="energy-orb-center">
        <span className="energy-orb-value"><span className="spark-glow">✦</span>{energy}</span>
        {!isFull && (
          <span className="energy-orb-timer">{mins}:{secs.toString().padStart(2, "0")}</span>
        )}
      </div>
      {energy === 0 && (
        <div className="energy-empty-badge" title="Out of energy — binders have dropped to defense">
          OUT OF ENERGY
        </div>
      )}
    </div>
  );
}
