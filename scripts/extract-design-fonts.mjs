#!/usr/bin/env node
// Extracts the "Wanted Sans Variable" self-hosted webfont from a Claude Design
// canvas HTML export (a standalone single-file export that embeds fonts as
// base64-encoded resources plus escaped @font-face CSS text).
//
// The export embeds two independent representations of the same fonts:
//   1. An unescaped JSON-ish resource manifest with entries shaped like:
//        "<uuid>":{"mime":"font/woff2","compressed":false,"data":"<base64>"}
//   2. A JS/JSON string literal containing the actual @font-face CSS rules,
//      with quotes backslash-escaped because it's embedded inside a string:
//        @font-face{font-family:\"Wanted Sans Variable\";...src:url(\"<uuid>\")...}
//
// We cross-reference the two: only uuids that appear in BOTH a font/woff2
// manifest entry AND a "Wanted Sans Variable" @font-face rule are extracted
// (the manifest also holds an unrelated icon font as font/otf + font/ttf
// pairs, which must be skipped).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const sourcePath = process.argv[2];
if (!sourcePath) {
  console.error(
    "Usage: node scripts/extract-design-fonts.mjs <path-to-exported-design-html>"
  );
  process.exit(1);
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

console.log(`Reading source file: ${sourcePath}`);
const html = fs.readFileSync(sourcePath, "utf8");
console.log(`Read ${(html.length / 1024 / 1024).toFixed(2)} MB`);

// --- 1. Parse the resource manifest for font/woff2 entries -----------------
// "<uuid>":{"mime":"font/woff2","compressed":<bool>,"data":"<base64>"}
const UUID = "[0-9a-fA-F-]{36}";
const manifestRe = new RegExp(
  `"(${UUID})":\\{"mime":"font\\/woff2","compressed":(?:true|false),"data":"([A-Za-z0-9+/=]*)"\\}`,
  "g"
);

const woff2Manifest = new Map(); // uuid -> base64 data
let mMatch;
while ((mMatch = manifestRe.exec(html))) {
  woff2Manifest.set(mMatch[1], mMatch[2]);
}
console.log(`Found ${woff2Manifest.size} font/woff2 manifest entries`);

// --- 2. Parse the escaped @font-face rules for "Wanted Sans Variable" ------
const fontFaceRe = new RegExp(
  `@font-face\\{font-family:\\\\"Wanted Sans Variable\\\\";font-style:normal;font-display:swap;font-weight:([^;]+);src:url\\(\\\\"(${UUID})\\\\"\\) format\\(\\\\"woff2-variations\\\\"\\);unicode-range:([^}]*)\\}`,
  "g"
);

const fontFaceRules = []; // { weight, uuid, unicodeRange }
let fMatch;
while ((fMatch = fontFaceRe.exec(html))) {
  fontFaceRules.push({
    weight: fMatch[1],
    uuid: fMatch[2],
    unicodeRange: fMatch[3],
  });
}
console.log(
  `Found ${fontFaceRules.length} "Wanted Sans Variable" @font-face rules`
);

if (fontFaceRules.length === 0 || woff2Manifest.size === 0) {
  console.error(
    "No Wanted Sans Variable font-face rules or font/woff2 manifest entries found. " +
      "The source file's structure may not match what this script expects."
  );
  process.exit(1);
}

// --- 3. Cross-reference, decode, write .woff2 files -------------------------
const outDir = path.join(repoRoot, "public", "fonts", "wanted-sans");
fs.mkdirSync(outDir, { recursive: true });

const WOFF2_MAGIC = "wOF2";
let filesWritten = 0;
let totalBytes = 0;
let unmatched = 0;
const cssRules = [];

for (const rule of fontFaceRules) {
  const base64 = woff2Manifest.get(rule.uuid);
  if (!base64) {
    unmatched++;
    console.warn(
      `WARNING: no font/woff2 manifest entry for uuid ${rule.uuid} referenced by an @font-face rule; skipping.`
    );
    continue;
  }

  const buffer = Buffer.from(base64, "base64");
  const magic = buffer.subarray(0, 4).toString("ascii");
  if (magic !== WOFF2_MAGIC) {
    console.warn(
      `WARNING: decoded data for uuid ${rule.uuid} does not start with WOFF2 magic bytes (got ${JSON.stringify(
        magic
      )}); skipping.`
    );
    continue;
  }

  const outFile = path.join(outDir, `${rule.uuid}.woff2`);
  fs.writeFileSync(outFile, buffer);
  filesWritten++;
  totalBytes += buffer.length;

  cssRules.push(
    `@font-face{font-family:"Wanted Sans Variable";font-style:normal;font-display:swap;font-weight:${rule.weight};src:url("/fonts/wanted-sans/${rule.uuid}.woff2") format("woff2-variations");unicode-range:${rule.unicodeRange}}`
  );
}

// --- 4. Write app/wanted-sans.css -------------------------------------------
const cssPath = path.join(repoRoot, "app", "wanted-sans.css");
const cssHeader =
  "/* GENERATED FILE — do not edit by hand. Regenerate with: node scripts/extract-design-fonts.mjs <source-html-path> */\n";
fs.writeFileSync(cssPath, cssHeader + cssRules.join("\n") + "\n");

// --- 5. Summary --------------------------------------------------------------
console.log("");
console.log("Summary:");
console.log(`  Font files written: ${filesWritten}`);
console.log(`  Total bytes: ${totalBytes} (${(totalBytes / 1024).toFixed(1)} KB)`);
console.log(`  @font-face rules written to app/wanted-sans.css: ${cssRules.length}`);
if (unmatched > 0) {
  console.log(`  Unmatched/skipped rules: ${unmatched}`);
}
console.log(`  Output directory: ${outDir}`);
console.log(`  Output CSS: ${cssPath}`);
