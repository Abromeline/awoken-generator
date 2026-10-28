// The room itself, mounted by the featherweight front page
// (table-main.tsx) once Discord has answered — or at once, outside
// Discord. Kept as its own module so Vite splits the room's whole
// graph (React, art, styles) into a chunk the front page imports
// only when the door has done its work.
import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Table from "./Table";
import RoomSeat from "./RoomSeat";
import { doorRecordLines } from "./tableSdk";
// THE ROOM'S STYLESHEET (2026-10-28): the homeland's face
// (Territory) stands inside this entry's Room tab, and every
// rule that lays Territory out — the bag's fixed seat, the
// view's fit, the hand, the Pack panel, the Eye's glyph —
// lives in theme.css, which only the homeland's own entry
// imported before tonight: in the room the face rendered
// unstyled (the bag at its art's intrinsic size, the view
// thousands of px tall). theme.css comes FIRST so table.css
// keeps its overrides over the shared ground.
import "./theme.css";
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

// THE DISCORD INTERFACE'S TABS (THE HOMELAND SERVES DISCORD,
// 2026-10-28, with Nigel's two amendments of 11:57):
//   · THE ROOM — the seat itself now: the homeland served
//     whole, with the room layer on it (RoomSeat).
//   · TEST GROUND — the old Table page, kept whole as its own
//     tab (amendment 1: retired from serving the seat, never
//     removed).
//   · CAMPAIGN MODE — the campaign board (the Push 42 3D
//     storyteller board + console) opened as a tab in the same
//     interface (amendment 2): the same Table entered at its
//     campaign door; its internals are untouched.
// Only the open tab is mounted: the old Table's socket and the
// room's polls are effectful, and two live seats in one page
// would seat the same player twice.
type TabId = "room" | "test" | "campaign";
function TableShell() {
  const [tab, setTab] = useState<TabId>("room");
  return (
    <div className="table-shell">
      <nav className="table-tabs" aria-label="The Table's faces">
        <button type="button" data-tab="room" className={tab === "room" ? "active" : ""} onClick={() => setTab("room")}>
          🕯️ The Room
        </button>
        <button type="button" data-tab="test" className={tab === "test" ? "active" : ""} onClick={() => setTab("test")}>
          🧪 Test Ground
        </button>
        <button type="button" data-tab="campaign" className={tab === "campaign" ? "active" : ""} onClick={() => setTab("campaign")}>
          📖 Campaign Mode
        </button>
      </nav>
      <div data-tab-panel={tab}>
        {tab === "room" && <RoomSeat />}
        {tab === "test" && <Table />}
        {tab === "campaign" && <Table campaignDoor />}
      </div>
    </div>
  );
}

export function mountTable(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("missing app root element");
  // No StrictMode here on purpose: the Table's connection is an
  // effectful socket, and a doubled dev mount would seat the same
  // player twice.
  const queryClient = new QueryClient();
  createRoot(rootEl).render(
    <RoomErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TableShell />
      </QueryClientProvider>
    </RoomErrorBoundary>,
  );
}
