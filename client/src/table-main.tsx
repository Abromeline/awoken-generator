import { createRoot } from "react-dom/client";
import Table from "./Table";
import "./table.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing app root element");
}

// No StrictMode here on purpose: the Table's connection is an effectful
// socket, and a doubled dev mount would seat the same player twice.
createRoot(rootEl).render(<Table />);
