import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = resolve(testDir, "node_modules");
const targetPath = resolve(testDir, "../../app/frontend/node_modules");

function linkPointsToTarget() {
  if (!existsSync(linkPath)) {
    return false;
  }

  try {
    const linkTarget = resolve(dirname(linkPath), readlinkSync(linkPath));
    return linkTarget === targetPath;
  } catch {
    return false;
  }
}

if (existsSync(linkPath) && !linkPointsToTarget()) {
  rmSync(linkPath, { recursive: true, force: true });
}

if (!existsSync(linkPath)) {
  if (!existsSync(targetPath)) {
    console.error(
      `Missing frontend dependencies at ${targetPath}. Run "npm install" in app/frontend first.`,
    );
    process.exit(1);
  }

  const type = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(targetPath, linkPath, type);
}
