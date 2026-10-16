import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const clientDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: clientDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(clientDir, "index.html"),
        // THE TABLE — the Discord Activity's page (its own entry so the
        // Activity loads the room, not the whole Awoken app).
        table: resolve(clientDir, "table.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/blobs": "http://localhost:3000",
      "/table/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
