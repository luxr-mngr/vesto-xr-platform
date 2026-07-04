#!/usr/bin/env node
// Single source of truth for the app version is this repo's root package.json.
// Run `npm run version:sync` after bumping it to propagate that value into the
// workspace package.jsons, the Worker's wrangler.toml, and the web app's
// visible version constant (CLAUDE.md's release/version-bump rule).
// `npm run version:check` verifies without writing — exits non-zero on drift.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const checkOnly = process.argv.includes("--check");
const version = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).version;

const mismatches = [];

function apply(relPath, pattern, render) {
  const path = join(rootDir, relPath);
  const raw = readFileSync(path, "utf8");
  const match = raw.match(pattern);
  if (!match) throw new Error(`Could not find a version reference in ${relPath}`);
  if (match[1] === version) return;

  if (checkOnly) {
    mismatches.push(`${relPath} (${match[1]})`);
    return;
  }
  writeFileSync(path, render(raw));
  console.log(`Updated ${relPath} -> ${version}`);
}

function syncPackageJson(relPath) {
  apply(
    relPath,
    /"version":\s*"([^"]*)"/,
    (raw) => raw.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)
  );
}

apply(
  "apps/api/wrangler.toml",
  /^APP_VERSION = "([^"]*)"$/m,
  (raw) => raw.replace(/^APP_VERSION = "[^"]*"$/m, `APP_VERSION = "${version}"`)
);

apply(
  "apps/web/src/lib/version.ts",
  /export const APP_VERSION = "([^"]*)";/,
  (raw) => raw.replace(/export const APP_VERSION = "[^"]*";/, `export const APP_VERSION = "${version}";`)
);

syncPackageJson("apps/web/package.json");
syncPackageJson("apps/api/package.json");

if (checkOnly && mismatches.length > 0) {
  console.error(`Version mismatch (root package.json is ${version}): ${mismatches.join(", ")}`);
  console.error("Run `npm run version:sync` to fix.");
  process.exit(1);
}

if (!checkOnly) {
  console.log(`All version references now match root package.json (${version}).`);
}
