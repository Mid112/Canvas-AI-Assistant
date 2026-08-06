// Script note: verifies frontend test dependencies are installed before Vitest runs.

import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const minimumNodeVersion = [22, 13, 0];

function currentNodeVersionParts() {
  return process.versions.node.split(".").map((part) => Number(part));
}

function nodeVersionIsSupported() {
  const current = currentNodeVersionParts();
  for (const [index, minimumPart] of minimumNodeVersion.entries()) {
    const currentPart = current[index] ?? 0;
    if (currentPart > minimumPart) {
      return true;
    }
    if (currentPart < minimumPart) {
      return false;
    }
  }
  return true;
}

if (!nodeVersionIsSupported()) {
  console.error(
    `Frontend tests require Node >=22.13.0. Current version is ${process.versions.node}. ` +
      `Run "nvm use" from the repo root or install Node 22.13.0 before running Vitest.`,
  );
  process.exit(1);
}

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
