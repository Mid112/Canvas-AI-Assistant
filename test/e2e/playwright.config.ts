import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const backendDir = path.join(rootDir, "app/backend");
const frontendDir = path.join(rootDir, "app/frontend");
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const reuseExistingServer = !process.env.CI;

/** Prefer a non-empty env value; otherwise use the e2e default. */
function envOr(key: string, fallback: string): string {
  const value = process.env[key]?.trim();
  return value ? value : fallback;
}

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  globalSetup: "./global-setup.ts",
  webServer: [
    {
      command: `${path.join(backendDir, ".venv/bin/python")} -m uvicorn app.main:app --host 0.0.0.0 --port 8000`,
      cwd: backendDir,
      url: "http://localhost:8000/docs",
      reuseExistingServer,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: envOr(
          "DATABASE_URL",
          "postgresql+asyncpg://appuser:localdev@localhost:5433/appdb",
        ),
        SECRET_KEY: envOr("SECRET_KEY", "localdevsecret"),
        DEBUG: "true",
        BACKEND_CORS_ORIGINS: "http://localhost:5173",
        CANVAS_API_URL: envOr("CANVAS_API_URL", "http://localhost:3000"),
        CANVAS_TOKEN_ENCRYPTION_KEY: envOr(
          "CANVAS_TOKEN_ENCRYPTION_KEY",
          "ebcquOyeXkl8geXIi5sS4BYEeh1mYSdWHiSuBkXr9T4=",
        ),
        ADMIN_EMAIL: envOr("ADMIN_EMAIL", "admin@example.com"),
        ADMIN_PASSWORD: envOr("ADMIN_PASSWORD", "AdminPass123!"),
        ADMIN_NAME: envOr("ADMIN_NAME", "Administrator"),
      },
    },
    {
      command: "npm run dev -- --host 0.0.0.0 --port 5173",
      cwd: frontendDir,
      url: baseURL,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
