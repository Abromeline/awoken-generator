// The room itself, mounted by the featherweight front page
// (table-main.tsx) once Discord has answered — or at once, outside
// Discord. Kept as its own module so Vite splits the room's whole
// graph (React, art, styles) into a chunk the front page imports
// only when the door has done its work.
import { createRoot } from "react-dom/client";
import Table from "./Table";
import "./table.css";

export function mountTable(): void {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("missing app root element");
  // No StrictMode here on purpose: the Table's connection is an
  // effectful socket, and a doubled dev mount would seat the same
  // player twice.
  createRoot(rootEl).render(<Table />);
}
