import path from "path";
import { defineConfig } from "vitest/config";

const appDir = path.resolve(__dirname, "../../app");
const frontendDir = path.resolve(appDir, "frontend");
const frontendNodeModules = path.resolve(frontendDir, "node_modules");
const isCi = process.env.CI === "true";

// Coverage include/exclude are glob patterns, which always use "/" —
// path.join() on Windows returns "\"-separated paths, which silently match
// zero files (0% coverage reported, no threshold failure, no error) instead
// of throwing. Normalize separately from the OS-native paths above, which
// are fine as-is since aliasing/fs.allow aren't glob matching.
const toGlobPath = (value: string) => value.split(path.sep).join("/");
const frontendGlobDir = toGlobPath(frontendDir);

export default defineConfig({
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
    fileParallelism: !isCi,
    maxWorkers: isCi ? 1 : undefined,
    minWorkers: isCi ? 1 : undefined,
    testTimeout: isCi ? 10000 : 5000,
    coverage: {
      provider: "v8",
      allowExternal: true,
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: [`${frontendGlobDir}/src/**/*.{ts,tsx}`],
      exclude: [
        "**/*.{test,spec}.{ts,tsx}",
        "**/*.d.ts",
        `${frontendGlobDir}/src/main.tsx`,
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
