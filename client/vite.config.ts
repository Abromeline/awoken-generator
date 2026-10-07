import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const clientDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: clientDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/blobs": "http://localhost:3000",
    },
  },
});
