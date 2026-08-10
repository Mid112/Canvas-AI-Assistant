import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = path.join(rootDir, "app/backend/.venv/bin/python");
const script = path.join(rootDir, "test/e2e/ensure_admin.py");
const resetScript = path.join(rootDir, "test/e2e/reset_canvas_connections.py");

/** Prefer a non-empty env value; otherwise use the e2e default. */
function envOr(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value ? value : fallback;
}

/** CI must supply DATABASE_URL (isolated Postgres). Never fall back to :5433. */
function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (value) {
    return value;
  }
  if (process.env.CI) {
    throw new Error(
      "DATABASE_URL must be set in CI (isolated e2e Postgres). " +
        "Refusing to fall back to localhost:5433.",
    );
  }
  return "postgresql+asyncpg://appuser:localdev@localhost:5433/appdb";
}

export default async function globalSetup() {
  execFileSync(python, [resetScript], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(),
      CANVAS_TOKEN_ENCRYPTION_KEY: envOr(
        "CANVAS_TOKEN_ENCRYPTION_KEY",
        "ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4=",
      ),
    },
  });

  execFileSync(python, [script], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(),
      SECRET_KEY: envOr("SECRET_KEY", "localdevsecret"),
      // Must match playwright.config.ts webServer defaults so Settings() loads
      // the same key the backend process uses in CI / local e2e.
      CANVAS_TOKEN_ENCRYPTION_KEY: envOr(
        "CANVAS_TOKEN_ENCRYPTION_KEY",
        "ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4=",
      ),
      ADMIN_EMAIL: envOr("ADMIN_EMAIL", "admin@example.com"),
      ADMIN_PASSWORD: envOr("ADMIN_PASSWORD", "AdminPass123!"),
      ADMIN_NAME: envOr("ADMIN_NAME", "Administrator"),
    },
  });
}
