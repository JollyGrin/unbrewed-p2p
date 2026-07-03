import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";

/**
 * Bundled token icon library: the full game-icons.net set (~4k icons) that
 * ships inside react-icons/gi. Loaded lazily so the game page doesn't pay for
 * the icon chunk until the board renders, and fully offline — no CORS, no CDN.
 */
export type GameIconSet = Record<string, IconType>;

let loadedIcons: GameIconSet | null = null;
let iconsPromise: Promise<GameIconSet> | null = null;

export function loadGameIcons(): Promise<GameIconSet> {
  iconsPromise ??= import("react-icons/gi").then((mod) => {
    loadedIcons = mod as unknown as GameIconSet;
    return loadedIcons;
  });
  return iconsPromise;
}

export function useGameIcons(): GameIconSet | null {
  const [icons, setIcons] = useState<GameIconSet | null>(loadedIcons);
  useEffect(() => {
    let alive = true;
    loadGameIcons().then((set) => alive && setIcons(set));
    return () => {
      alive = false;
    };
  }, []);
  return icons;
}

/** "GiFireShield" -> "fire shield", used for search + display. */
export function iconLabel(name: string): string {
  return name
    .replace(/^Gi/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
}

let labelCache: { name: string; label: string }[] | null = null;

function iconIndex(icons: GameIconSet) {
  labelCache ??= Object.keys(icons)
    .filter((name) => name.startsWith("Gi"))
    .map((name) => ({ name, label: iconLabel(name) }));
  return labelCache;
}

/** Every query word must appear in the icon's humanized label. */
export function searchIcons(
  icons: GameIconSet,
  query: string,
  limit = 96,
): string[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const index = iconIndex(icons);
  if (words.length === 0) return index.slice(0, limit).map((i) => i.name);

  const out: string[] = [];
  for (const { name, label } of index) {
    if (words.every((w) => label.includes(w))) {
      out.push(name);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const svgCache = new Map<string, string>();

export type IconSvgOpts = {
  color?: string;
  size: number;
  /** Render as a color disc with the icon knocked out of it. */
  cutout?: boolean;
  /** Unique, css-safe id for the cutout mask (required when cutout). */
  maskId?: string;
};

/**
 * Render an icon to a standalone SVG string for injection into the d3 board.
 * react-icons draw with fill="currentColor", so setting the color prop (which
 * lands as style="color:…") tints the whole icon. Cutout mode wraps the icon
 * in an SVG mask so it punches a hole through a colored disc.
 */
export function iconToSvg(
  icons: GameIconSet,
  name: string,
  { color, size, cutout, maskId }: IconSvgOpts,
): string | null {
  const Icon = icons[name];
  if (!Icon) return null;

  const fill = color ?? "#2C1831";

  if (!cutout) {
    const key = `${name}|${fill}|${size}`;
    const hit = svgCache.get(key);
    if (hit) return hit;
    const svg = renderToStaticMarkup(createElement(Icon, { size, color: fill }));
    svgCache.set(key, svg);
    return svg;
  }

  const id = maskId ?? "cut";
  const key = `${name}|${fill}|${size}|cut|${id}`;
  const hit = svgCache.get(key);
  if (hit) return hit;

  // Icon drawn black inside the mask = transparent in the final disc.
  const pad = Math.round(size * 0.18);
  const iconMarkup = renderToStaticMarkup(
    createElement(Icon, { size: size - pad * 2, color: "#000" }),
  ).replace(/^<svg /, `<svg x="${pad}" y="${pad}" `);

  const half = size / 2;
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <mask id="${id}">
    <circle cx="${half}" cy="${half}" r="${half - 1}" fill="#fff" />
    ${iconMarkup}
  </mask>
  <circle cx="${half}" cy="${half}" r="${half - 1}" fill="${fill}" mask="url(#${id})" />
</svg>`;
  svgCache.set(key, svg);
  return svg;
}
