import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const appDir = path.resolve(__dirname, "../../app");
const frontendDir = path.resolve(appDir, "frontend");
const frontendNodeModules = path.resolve(frontendDir, "node_modules");

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(frontendDir, "src"),
      "@test": path.resolve(__dirname),
      react: path.resolve(frontendNodeModules, "react"),
      "react-dom": path.resolve(frontendNodeModules, "react-dom"),
      "react/jsx-runtime": path.resolve(
        frontendNodeModules,
        "react/jsx-runtime",
      ),
      "react/jsx-dev-runtime": path.resolve(
        frontendNodeModules,
        "react/jsx-dev-runtime",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    fs: {
      allow: [appDir, frontendDir],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      allowExternal: true,
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: [path.join(frontendDir, "src/**/*.{ts,tsx}")],
      exclude: [
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.d.ts",
        path.join(frontendDir, "src/main.tsx"),
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 75,
        functions: 75,
      },
    },
  },
});
