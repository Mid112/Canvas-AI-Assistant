import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test as base } from "@playwright/test";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = path.join(rootDir, "app/backend/.venv/bin/python");
const resetScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "reset_canvas_connections.py",
);

function databaseUrl(): string {
  return (
    process.env.DATABASE_URL?.trim() ||
    "postgresql+asyncpg://appuser:localdev@localhost:5433/appdb"
  );
}

function resetCanvasConnections() {
  execFileSync(python, [resetScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(),
      CANVAS_TOKEN_ENCRYPTION_KEY:
        process.env.CANVAS_TOKEN_ENCRYPTION_KEY?.trim() ||
        "ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4=",
    },
  });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    try {
      await use(page);
    } finally {
      resetCanvasConnections();
    }
  },
});

export { expect };
