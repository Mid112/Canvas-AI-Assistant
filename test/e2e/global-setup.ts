import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = path.join(rootDir, "app/backend/.venv/bin/python");
const script = path.join(rootDir, "test/e2e/ensure_admin.py");

export default async function globalSetup() {
  execFileSync(python, [script], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql+asyncpg://appuser:localdev@localhost:5433/appdb",
      ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? "admin@example.com",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "AdminPass123!",
      ADMIN_NAME: process.env.ADMIN_NAME ?? "Administrator",
    },
  });
}
