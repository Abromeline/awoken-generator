// AspectCelebration: Full-screen epic aspect application sequence.
// Phase 1: Elemental burst particles from center
// Phase 2: Awoken card pops up, aspect fades in over 1s
// Phase 3: Golden glow + chime (pitch by level), stats buff, level badge
import { useState, useEffect, useRef } from "react";
import { elementPalette, type ElementName } from "./palette";

interface Props {
  awoken: any;
  aspect: any;
  element: string;
  newLevel: number;
  oldPower: number;
  oldToughness: number;
  newPower: number;
  newToughness: number;
  onDone: () => void;
}

// Element colors come from the ONE canonical palette (./palette) — the
// same scheme the cards, ceremony, and attunement UI use, theme-tweakable
// from the UI Workspace. (This file once kept a brighter private palette;
// it was unified 2026-10-13.)

const ELEMENT_PARTICLES: Record<string, string[]> = {
  tide: ["~", "≈", "∿", "💧"],
  sky: ["🌀", "💨", "✦", "○"],
  stone: ["◆", "▲", "⬢", "▪"],
  root: ["🌿", "🍃", "❀", "✿"],
  fire: ["🔥", "✹", "➶", "•"],
};

export default function AspectCelebration({ awoken, aspect, element, newLevel, oldPower, oldToughness, newPower, newToughness, onDone }: Props) {
  const [phase, setPhase] = useState<"burst" | "card" | "glow">("burst");
  const [particles, setParticles] = useState<any[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  const color = elementPalette[element as ElementName] || "#d4af6a";
  const glyphs = ELEMENT_PARTICLES[element] || ["✦"];
  const roman = ["", "I", "II", "III"][newLevel] || newLevel;

  // Phase 1: spawn burst particles
  useEffect(() => {
    const parts = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 20,
      y: 50 + (Math.random() - 0.5) * 20,
      dx: (Math.random() - 0.5) * 60,
      dy: (Math.random() - 0.5) * 60 - 20,
      size: 16 + Math.random() * 24,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.6,
    }));
    setParticles(parts);
    const t1 = setTimeout(() => setPhase("card"), 1200);
    return () => clearTimeout(t1);
  }, []);

  // Phase 2 → 3: card shown, aspect fades in over 1s, then glow + chime
  useEffect(() => {
    if (phase === "card") {
      const t = setTimeout(() => {
        setPhase("glow");
        playChime(newLevel);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const playChime = (level: number) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioRef.current;
      // Higher level = higher pitch + more harmonics
      const baseFreq = 440 + (level - 1) * 110;
      const notes = [baseFreq, baseFreq * 1.25, baseFreq * 1.5].slice(0, level + 1);
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 1.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 1.5);
      });
    } catch {}
  };

  return (
    <div className="aspect-celebration" onClick={onDone}>
      {phase === "burst" && (
        <div className="celebration-burst">
          {particles.map(p => (
            <span
              key={p.id}
              className="burst-particle"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                fontSize: p.size,
                color,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                ["--dx" as any]: `${p.dx}vw`,
                ["--dy" as any]: `${p.dy}vh`,
              }}
            >
              {p.glyph}
            </span>
          ))}
          <div className="burst-title" style={{ color }}>
            {element.toUpperCase()} ASPECT
          </div>
        </div>
      )}

      {(phase === "card" || phase === "glow") && (
        <div className={`celebration-card ${phase === "glow" ? "golden-glow" : ""}`}>
          <div className="celebration-card-art">
            <img src={awoken.image_url} alt={awoken.name} className="celebration-awoken-img" />
            <img
              src={aspect.imageUrl || aspect.image_url}
              alt={aspect.name}
              className="celebration-aspect-img"
              style={{ animationDuration: "1s" }}
            />
          </div>
          <div className="celebration-info">
            <div className="celebration-name">{awoken.name}</div>
            <div className="celebration-aspect-level" style={{ color }}>
              {element.toUpperCase()} {roman}
            </div>
            <div className="celebration-stats">
              <span className="stat-old">⚔{oldPower} 🛡{oldToughness}</span>
              <span className="stat-arrow">→</span>
              <span className="stat-new">⚔{newPower} 🛡{newToughness}</span>
            </div>
            {phase === "glow" && (
              <div className="celebration-tap-hint">tap to continue</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
