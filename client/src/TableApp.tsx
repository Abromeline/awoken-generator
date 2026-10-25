// The room itself, mounted by the featherweight front page
// (table-main.tsx) once Discord has answered — or at once, outside
// Discord. Kept as its own module so Vite splits the room's whole
// graph (React, art, styles) into a chunk the front page imports
// only when the door has done its work.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Table from "./Table";
import { doorRecordLines } from "./tableSdk";
import "./table.css";

// THE ERROR NET (Nigel, 2026-10-24): the room once had no
// error boundary at all, so a single throw in its render —
// or in an effect as it committed — tore the whole React
// tree down and left table.css's brown standing empty:
// no card, no words, no guard alive to name the step (his
// Discord launch: the boot card vanished, "then I get the
// brown empty screen", four minutes of silence). This
// boundary is the net under the room: a fault in the room
// lands HERE, standing on the room's own themed ground,
// speaking the error's own words and the door record —
// never a mute brown page. It exposes the fault; the fix
// for whatever it names is separate work.
type RoomFaultState = { error: Error | null; componentStack: string };

class RoomErrorBoundary extends Component<{ children: ReactNode }, RoomFaultState> {
  state: RoomFaultState = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<RoomFaultState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    // The console keeps the full telling as well — the card
    // below is for the player; this is for whoever debugs.
    console.error("The Table's room hit a fault:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    let record = "(door record unavailable)";
    try { record = doorRecordLines().join("\n"); } catch { /* the card still stands */ }
    const words = [
      error.message || String(error),
      error.stack && error.stack !== error.message ? `\n${error.stack}` : "",
      componentStack ? `\nWhere it stood:${componentStack}` : "",
    ].join("");
    return (
      <div className="table-door-wrap">
        <div className="table-door room-fault">
          <h1>🕯️ The Table</h1>
          <p>
            The room hit a fault and could not stand. What it said as it fell is
            below — those words name what broke.
          </p>
          <p className="error-line" style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{words}</p>
          <p className="quiet" style={{ whiteSpace: "pre-wrap", textAlign: "left", fontSize: 12, opacity: 0.75 }}>
            {"Door record:\n" + record}
          </p>
          <button className="table-btn" onClick={() => window.location.reload()}>Try the door again</button>
        </div>
      </div>
    );
  }
}

export function mountTable(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("missing app root element");
  // No StrictMode here on purpose: the Table's connection is an
  // effectful socket, and a doubled dev mount would seat the same
  // player twice.
  createRoot(rootEl).render(
    <RoomErrorBoundary>
      <Table />
    </RoomErrorBoundary>,
  );
}
