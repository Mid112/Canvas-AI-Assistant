import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Playwright CI can run the backend on a non-default port to avoid stale
// processes on self-hosted runners; local dev keeps the usual :8000 target.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: path.resolve(__dirname, "./public"),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api/v1": {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
});
