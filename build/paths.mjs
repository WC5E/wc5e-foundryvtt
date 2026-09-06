import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.dirname(BUILD_DIR);
export const MODULE_DIR = path.join(REPO_ROOT, "module");

export const readModuleManifest = () => JSON.parse(fs.readFileSync(path.join(MODULE_DIR, "module.json"), "utf8"));
