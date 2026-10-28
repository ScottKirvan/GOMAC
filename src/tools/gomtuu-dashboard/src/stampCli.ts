import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeStamps, stampIndexHtml } from "./assetStamps.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const indexPath = join(publicDir, "index.html");
const before = readFileSync(indexPath, "utf8");
const after = stampIndexHtml(before, computeStamps(publicDir));
if (after !== before) writeFileSync(indexPath, after);
console.log(after === before ? "index.html already stamped" : "index.html stamped");
