import { useEffect, useRef } from "react";
import meteorRain from "./assets/meteor-rain.gif";

// AWOKIN — the front-page title (Nigel, 2026-10-20). It hangs over the
// wake ceremony on the front page only: mounted inside WakeRitual's
// canvas frame (tender collection) and above the gate card. The meteor
// crosses the A at its crossbar, hung slightly low, at the angle of the
// golden spiral: after fonts load, the spiral r = k·φ^(−2θ/π) is built
// with its root at the wake crystal's heart and its outer end pinned to
// the A span's crossbar point, wound so its sweep climbs the right side
// (the annotated geometry plate); the meteor's fall follows the
// spiral's tangent at that pinned endpoint. No spiral is drawn — the
// geometry is felt, not seen. When no crystal can be measured (the
// gate face, or the wake clock still counting), the strip keeps the
// clean plate's cut: a −66° rotation, flagged in data-source.
const FALLBACK_ROTATION = -66;
const PHI = (1 + Math.sqrt(5)) / 2;

export default function FrontTitle() {
  const rootRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLSpanElement>(null);
  const meteorRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const aSpan = aRef.current;
    const meteor = meteorRef.current;
    if (!root || !aSpan || !meteor) return;
    let raf = 0;
    let disposed = false;
    const apply = () => {
      if (disposed) return;
      const frame = root.closest(".canvas-frame");
      const crystal = frame?.querySelector<HTMLImageElement>(
        ".wake-ready-overlay img, .ceremony-crystal",
      );
      // The A span's crossbar point: centre-x, ~66% down the span.
      const ar = aSpan.getBoundingClientRect();
      const px = ar.left + ar.width / 2;
      const py = ar.top + ar.height * 0.66;
      let rotation = FALLBACK_ROTATION;
      let source = "fallback";
      if (crystal && !crystal.complete) {
        // The star is still arriving — re-measure the moment it lands.
        crystal.addEventListener("load", schedule, { once: true });
      }
      if (crystal) {
        const cr = crystal.getBoundingClientRect();
        if (cr.width > 0 && cr.height > 0) {
          const cx = cr.left + cr.width / 2;
          const cy = cr.top + cr.height / 2;
          const dx = px - cx;
          const dy = py - cy;
          const radius = Math.hypot(dx, dy);
          if (radius > 1) {
            const alpha = Math.atan2(dy, dx);
            const k = radius / Math.pow(PHI, (-2 * alpha) / Math.PI);
            const pointAt = (theta: number) => {
              const r = k * Math.pow(PHI, (-2 * theta) / Math.PI);
              return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
            };
            const ahead = pointAt(alpha + 0.005);
            const behind = pointAt(alpha - 0.005);
            const travel =
              (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI;
            // The strip's native fall is straight down (bright head at
            // its foot), so the strip turns travel − 90 to lie on it.
            rotation = travel - 90;
            source = "spiral";
            root.dataset.travel = travel.toFixed(2);
          }
        }
      }
      meteor.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
      root.dataset.angle = rotation.toFixed(2);
      root.dataset.source = source;
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    schedule();
    if (typeof document !== "undefined" && document.fonts?.ready) {
      void document.fonts.ready.then(() => schedule()).catch(() => {});
    }
    window.addEventListener("resize", schedule);
    const frame = root.closest(".canvas-frame");
    const observer = frame ? new MutationObserver(schedule) : null;
    if (frame && observer) {
      observer.observe(frame, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "src"],
      });
    }
    const timers = [400, 1200, 2500].map((ms) => window.setTimeout(schedule, ms));
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div className="front-title" ref={rootRef} role="img" aria-label="Awokin" data-source="fallback" data-angle={FALLBACK_ROTATION}>
      <span className="front-title-a" ref={aRef}>
        A
        <img ref={meteorRef} className="front-title-meteor" src={meteorRain} alt="" aria-hidden="true" />
      </span>
      WOKIN
    </div>
  );
}
