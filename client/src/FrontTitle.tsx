import meteorRain from "./assets/meteor-rain.gif";

// AWOKIN — the front-page title (Nigel, 2026-10-20). It hangs over the
// wake ceremony on the front page only: mounted inside WakeRitual's
// canvas frame (tender collection) and above the gate card. The meteor
// crosses the A in the approved clean plate's exact cut, locked
// verbatim: the strip sits inside the A span at left 50%, top 46%,
// turned −66°, 1.4em tall (see .front-title-meteor in theme.css) —
// identical on both mounts, with no live geometry re-deriving it, so
// the treatment Nigel verified in the plate is the treatment that
// ships. (The golden-spiral construction that used to turn the strip
// per-layout was struck at his word, 2026-10-20: preview and reality
// must be the same thing.)
export default function FrontTitle() {
  return (
    <div className="front-title" role="img" aria-label="Awokin">
      <span className="front-title-a">
        A
        <img className="front-title-meteor" src={meteorRain} alt="" aria-hidden="true" />
      </span>
      WOKIN
    </div>
  );
}
