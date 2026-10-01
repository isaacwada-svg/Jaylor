#!/usr/bin/env node
/**
 * Flags candidate hardcoded, user-facing English strings in the app's own
 * (authenticated) screens and shared components -- the ones PR M's local
 * languages work is meant to eventually cover. Platform admin routes are
 * excluded on purpose (admin.*.tsx stays English, per the PR M spec).
 *
 * This is a heuristic, not a full AST-aware i18n linter: it looks for JSX
 * text content, common text-bearing props (label/placeholder/title/
 * aria-label/description), and toast.*() calls whose argument starts with a
 * capital letter -- the same patterns used for PR M's pre-build survey, kept
 * here as a repeatable script so future PRs can track the remaining count
 * instead of re-deriving it by hand each time.
 *
 * Usage: node scripts/check-hardcoded-strings.mjs [--json]
 * Exit code is always 0 -- this reports, it doesn't fail the build (there is
 * no realistic "zero" target yet; see docs/translations.md for what's wired
 * so far and what's left).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const INCLUDE_DIRS = ["src/routes/_authenticated", "src/components/jaylor"];
// Pre-auth screens that are part of PR M's scope (sign in/up, onboarding)
// even though they live outside src/routes/_authenticated.
const INCLUDE_FILES = ["src/routes/auth.tsx", "src/routes/onboarding.tsx"];
const EXCLUDE_FILE_PATTERNS = [/^admin/, /^admin\.stores/, /^admin-ai/];
const EXCLUDE_DIR_SEGMENTS = ["ui"]; // shadcn primitives, not app screens

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIR_SEGMENTS.includes(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(p));
    else if (entry.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function isExcluded(relPath) {
  const base = relPath.split("/").pop() ?? "";
  return EXCLUDE_FILE_PATTERNS.some((re) => re.test(base));
}

function countStrings(src) {
  let count = 0;
  const jsxText = src.match(/>[ \t]*[A-Z][a-zA-Z0-9 ,.'!?%:;&-]{2,80}[ \t]*</g) || [];
  count += jsxText.length;
  const props =
    src.match(/\b(placeholder|label|title|aria-label|description)=["'][A-Za-z][^"']{2,80}["']/g) ||
    [];
  count += props.length;
  const toasts = src.match(/toast\.(error|success|info|warning)\(\s*["']/g) || [];
  count += toasts.length;
  return count;
}

function usesI18nFramework(src) {
  return /useT\(|useAppT\(|useLanguage\(|useAppLanguage\(|useOrderStatusLabel\(|useRoleLabel\(/.test(
    src,
  );
}

const files = new Set();
for (const dir of INCLUDE_DIRS) {
  const abs = join(ROOT, dir);
  try {
    for (const f of walk(abs)) files.add(f);
  } catch {
    // directory doesn't exist, skip
  }
}
for (const f of INCLUDE_FILES) files.add(join(ROOT, f));

let totalFiles = 0;
let totalStrings = 0;
let wiredFiles = 0;
const perFile = [];

for (const f of [...files].sort()) {
  const rel = relative(ROOT, f);
  if (isExcluded(rel)) continue;
  const src = readFileSync(f, "utf8");
  const count = countStrings(src);
  if (count === 0) continue;
  totalFiles++;
  totalStrings += count;
  const wired = usesI18nFramework(src);
  if (wired) wiredFiles++;
  perFile.push({ file: rel, count, wired });
}

const asJson = process.argv.includes("--json");

if (asJson) {
  console.log(JSON.stringify({ totalFiles, totalStrings, wiredFiles, perFile }, null, 2));
} else {
  console.log(`Hardcoded-string scan (app screens + shared components, admin excluded)\n`);
  console.log(`Files with candidate hardcoded strings: ${totalFiles}`);
  console.log(
    `Of those, files already using the i18n framework (partially or fully): ${wiredFiles}`,
  );
  console.log(`Total candidate hardcoded strings remaining: ${totalStrings}\n`);
  console.log("Top 15 files by count:");
  for (const { file, count, wired } of perFile.sort((a, b) => b.count - a.count).slice(0, 15)) {
    console.log(`  ${String(count).padStart(4)}  ${wired ? "[wired]" : "       "}  ${file}`);
  }
}
