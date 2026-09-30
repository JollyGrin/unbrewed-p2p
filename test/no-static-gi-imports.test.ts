import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..");
const DIRS = ["components", "pages", "lib", "test"];
const ALLOWED = new Set([
  "lib/icons/gameIcons.ts",
  // Render-equality test compares the local copies against the real set.
  "components/Icons/gi.test.tsx",
]);
// Matches `from "react-icons/gi"`, `import("react-icons/gi")`, `require(...)`.
const GI_IMPORT = /(from\s*|import\s*\(\s*|require\s*\(\s*)["']react-icons\/gi(\/[^"']*)?["']/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(name) ? [p] : [];
  });
}

describe("react-icons/gi stays lazy", () => {
  it("is only imported by lib/icons/gameIcons.ts", () => {
    const offenders = DIRS.flatMap((d) => walk(join(ROOT, d)))
      .filter((f) => f !== __filename)
      .filter((f) => !ALLOWED.has(relative(ROOT, f)))
      .filter((f) => GI_IMPORT.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("gameIcons.ts reaches the set only via dynamic import()", () => {
    const src = readFileSync(join(ROOT, "lib/icons/gameIcons.ts"), "utf8");
    expect(src).not.toMatch(/from\s*["']react-icons\/gi["']/);
    expect(src).toMatch(/import\(\s*["']react-icons\/gi["']\s*\)/);
  });
});
