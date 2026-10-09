// EnergyTimer: Glowing orb with 12-minute refill countdown.
// Energy regenerates +1 every 12 minutes, up to max, automatically.
import { useState, useEffect } from "react";
import { api } from "./api";

export default function EnergyTimer() {
  const [energy, setEnergy] = useState(0);
  const [maxEnergy, setMaxEnergy] = useState(10);
  const [secondsLeft, setSecondsLeft] = useState(240); // 4 min = 240s (online, 1/3 of 12min)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { energy: e, maxEnergy: m } = await api.getEnergy();
        setEnergy(e);
        setMaxEnergy(m);
        // Estimate time to next +1 (we don't have exact server timestamp,
        // so we count down from 12min and refresh on interval)
      } catch {}
    };
    fetch();
    const interval = setInterval(fetch, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

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
          return 240;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [energy, maxEnergy]);

  const isFull = energy >= maxEnergy;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progress = 1 - secondsLeft / 240; // 0 to 1

  return (
    <div className={`energy-orb ${isFull ? "full" : "charging"}`} title={
      isFull 
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
        <span className="energy-orb-value">⚡{energy}</span>
        {!isFull && (
          <span className="energy-orb-timer">{mins}:{secs.toString().padStart(2, "0")}</span>
        )}
      </div>
    </div>
  );
}
