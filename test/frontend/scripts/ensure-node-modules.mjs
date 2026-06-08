import { existsSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = resolve(testDir, "node_modules");
const targetPath = resolve(testDir, "../../app/node_modules");

if (existsSync(linkPath)) {
  process.exit(0);
}

const type = process.platform === "win32" ? "junction" : "dir";
symlinkSync(targetPath, linkPath, type);
