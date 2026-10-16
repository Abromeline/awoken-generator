import { createRoot } from "react-dom/client";
import Table from "./Table";
import "./table.css";
import { knockEarly } from "./tableSdk";

// Knock BEFORE React renders (audit verdict, 2026-10-16): Discord's
// handshake window is tighter than a React boot, so the SDK is
// constructed and the knock sent at module scope, first thing.
knockEarly();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing app root element");
}

// No StrictMode here on purpose: the Table's connection is an effectful
// socket, and a doubled dev mount would seat the same player twice.
createRoot(rootEl).render(<Table />);
