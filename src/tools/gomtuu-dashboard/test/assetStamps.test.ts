import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeStamps, stampIndexHtml } from "../src/assetStamps.js";

const PUBLIC_DIR = join(import.meta.dirname, "..", "public");

const html = `<link rel="stylesheet" href="style.css" />
<script type="importmap">{}</script>
<script src="config.js"></script>
<script type="module" src="app.js?v=old"></script>`;

describe("computeStamps", () => {
  it("produces identical stamps regardless of CRLF vs LF line endings", () => {
    const dir = mkdtempSync(join(tmpdir(), "stamps-test-"));
    try {
      writeFileSync(join(dir, "style.css"), "body {\n  color: red;\n}\n");
      const lfStamps = computeStamps(dir);
      writeFileSync(join(dir, "style.css"), "body {\r\n  color: red;\r\n}\r\n");
      const crlfStamps = computeStamps(dir);
      expect(crlfStamps).toEqual(lfStamps);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("stampIndexHtml", () => {
  const stamps = { "app.js": "aaaa", "config.js": "cccc", "render.js": "rrrr", "style.css": "ssss" };

  it("adds each file's stamp to the links that load it", () => {
    const out = stampIndexHtml(html, stamps);
    expect(out).toContain('href="style.css?v=ssss"');
    expect(out).toContain('src="config.js?v=cccc"');
    expect(out).toContain('src="app.js?v=aaaa"');
  });

  it("maps every module to its stamped address, so imports between modules miss stale caches too", () => {
    const out = stampIndexHtml(html, stamps);
    const map = JSON.parse(out.match(/<script type="importmap">([^]*?)<\/script>/)![1]!);
    expect(map.imports).toEqual({
      "./app.js": "./app.js?v=aaaa",
      "./render.js": "./render.js?v=rrrr",
    });
  });

  it("is stable when run again", () => {
    const once = stampIndexHtml(html, stamps);
    expect(stampIndexHtml(once, stamps)).toBe(once);
  });

  it("preserves CRLF line endings when input uses CRLF", () => {
    const crlfHtml = html.replace(/\n/g, "\r\n");
    const out = stampIndexHtml(crlfHtml, stamps);
    expect(out).not.toMatch(/(?<!\r)\n/);
    expect(stampIndexHtml(out, stamps)).toBe(out);
  });
});

describe("public/index.html", () => {
  it("is stamped with the current contents of every file it loads (run `npm run stamp` if this fails)", () => {
    const current = readFileSync(join(PUBLIC_DIR, "index.html"), "utf8");
    expect(current).toBe(stampIndexHtml(current, computeStamps(PUBLIC_DIR)));
  });
});
