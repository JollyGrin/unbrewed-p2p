/**
 * @jest-environment node
 */
import fs from "fs";
import path from "path";

import { colors } from "@/styles/style";

// IRL Mode is installable to the home screen (#800) — and ONLY IRL Mode: the
// manifest + Apple tags live on /irl alone, so no other page can be installed.

const root = path.join(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const manifest = JSON.parse(read("public/irl.webmanifest"));

/** width × height straight from a PNG's IHDR chunk. */
const pngSize = (rel: string) => {
  const buf = fs.readFileSync(path.join(root, "public", rel));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [rel] : [];
  });

describe("IRL Mode web app manifest", () => {
  it("is scoped to /irl and opens standalone", () => {
    expect(manifest.start_url).toBe("/irl");
    expect(manifest.scope).toBe("/irl");
    expect(manifest.display).toBe("standalone");
    expect(manifest.short_name).toBe("IRL Mode");
  });

  it("uses the brand purples", () => {
    expect(manifest.background_color).toBe(colors.brand.surfaceDim);
    expect(manifest.theme_color).toBe(colors.brand.secondary);
  });

  it("points at icons that exist at their declared size and stay small", () => {
    const icons: { src: string; sizes: string; purpose?: string }[] =
      manifest.icons;
    expect(icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect(icons.filter((i) => i.purpose === "maskable")).toHaveLength(1);
    for (const icon of icons) {
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    expect(pngSize("irl-icons/apple-touch-icon.png")).toBe("180x180");
    for (const file of fs.readdirSync(path.join(root, "public/irl-icons"))) {
      const bytes = fs.statSync(path.join(root, "public/irl-icons", file)).size;
      expect(bytes).toBeLessThan(40 * 1024);
    }
  });

  it("is linked from the /irl page and nowhere else", () => {
    const linking = ["pages", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((rel) => /irl\.webmanifest|apple-touch-icon/.test(read(rel)));
    expect(linking).toEqual([path.join("pages", "irl.tsx")]);
  });
});
