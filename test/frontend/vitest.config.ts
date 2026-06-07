import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
const appDir = path.resolve(__dirname, "../../app");

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(appDir, "frontend/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
  },
});
