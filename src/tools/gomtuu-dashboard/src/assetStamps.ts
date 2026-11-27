import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cache busting for the frontend. GitHub Pages serves every file with
 * max-age=600, so after a deploy a browser keeps running the old scripts and
 * styles for up to 10 minutes. A reload does revalidate index.html, so
 * index.html carries a content hash on every file it loads, and an import
 * map does the same for the imports between modules.
 */

const STAMP_LENGTH = 10;

/** Content hash of each top-level .js/.css file in the frontend directory. */
export function computeStamps(publicDir: string): Record<string, string> {
  const stamps: Record<string, string> = {};
  for (const file of readdirSync(publicDir).sort()) {
    if (!/\.(js|css)$/.test(file)) continue;
    const content = readFileSync(join(publicDir, file), "utf8").replace(/\r\n/g, "\n");
    stamps[file] = createHash("sha256").update(content, "utf8").digest("hex").slice(0, STAMP_LENGTH);
  }
  return stamps;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stampIndexHtml(html: string, stamps: Record<string, string>): string {
  let out = html;
  for (const [file, stamp] of Object.entries(stamps)) {
    out = out.replace(new RegExp(`((?:href|src)=")${escapeRegExp(file)}(?:\\?v=[^"]*)?"`, "g"), `$1${file}?v=${stamp}"`);
  }

  const imports: Record<string, string> = {};
  for (const [file, stamp] of Object.entries(stamps)) {
    if (file.endsWith(".js") && file !== "config.js") imports[`./${file}`] = `./${file}?v=${stamp}`;
  }
  const nl = html.includes("\r\n") ? "\r\n" : "\n";
  const map = JSON.stringify({ imports }, null, 2).replace(/\r?\n/g, `${nl}  `);
  return out.replace(/<script type="importmap">[^]*?<\/script>/, () => `<script type="importmap">${nl}  ${map}${nl}  </script>`);
}
