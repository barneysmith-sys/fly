import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "frontend/dist");

rmSync(resolve(root, "assets"), { recursive: true, force: true });
mkdirSync(resolve(root, "assets"), { recursive: true });
cpSync(resolve(dist, "assets"), resolve(root, "assets"), { recursive: true });
cpSync(resolve(dist, "index.html"), resolve(root, "index.html"));
cpSync(resolve(dist, "404.html"), resolve(root, "404.html"));
cpSync(resolve(dist, "favicon.svg"), resolve(root, "favicon.svg"));
writeFileSync(resolve(root, ".nojekyll"), "");
