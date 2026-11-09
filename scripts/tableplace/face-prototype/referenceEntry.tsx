/**
 * Browser half of reference.mjs: mounts the sandbox's own `Card` (the
 * DOM-hybrid render the hand and /bag grid show) so the prototype has a
 * ground truth to be compared against. Lifted from the removed #1007
 * faceEntry.tsx, action cards only.
 */
import { createRoot, Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Card } from "@/components/CardFactory/Card";
import {
  calculateProps,
  getMeasureCanvas,
} from "@/components/CardFactory/card.helpers";
import {
  characterCardProps,
  ruleCardProps,
} from "@/components/CardFactory/character.card";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { faceJobs, FaceJob } from "@/lib/tableplace/faceJobs";

const FONTS = ["5px BebasNeueRegular", "3.3px ArchivoNarrow", "1.8px LeagueGothic"];

let root: Root | null = null;
const stage = () => document.getElementById("stage") as HTMLElement;

const loadImage = (url: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(true), () => resolve(true));
    img.onerror = () => resolve(false);
    img.src = url;
  });

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const tick = (left: number): void => {
      if (left) requestAnimationFrame(() => tick(left - 1));
      else resolve();
    };
    tick(n);
  });

declare global {
  interface Window {
    __ref: {
      jobs: (deck: DeckImportType) => FaceJob[];
      render: (job: FaceJob) => Promise<unknown>;
      layouts: (deck: DeckImportType) => Promise<Record<string, unknown>>;
    };
  }
}

/** Layout of every face in a deck, keyed by faceJobs key. */
export const layoutsOf = (deck: DeckImportType, canvas: HTMLCanvasElement) =>
  Object.fromEntries(
    faceJobs(deck).map((job) => [
      job.key,
      job.kind === "card"
        ? calculateProps(job.card, canvas)
        : job.kind === "rule"
          ? ruleCardProps(job.rule, canvas)
          : characterCardProps(job.character, job.kind, canvas),
    ]),
  );

window.__ref = {
  jobs: faceJobs,
  async layouts(deck) {
    await Promise.all(FONTS.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return layoutsOf(deck, getMeasureCanvas()!);
  },
  async render(job) {
    if (job.kind !== "card") throw new Error("reference renders action cards only");
    await Promise.all(FONTS.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    if (job.card.imageUrl) await loadImage(job.card.imageUrl);
    root?.unmount();
    root = createRoot(stage());
    flushSync(() => root!.render(<Card card={job.card} />));
    for (let i = 0; i < 100 && !stage().querySelector("svg text"); i++)
      await frames(1);
    await frames(3);
    return calculateProps(job.card, getMeasureCanvas()!);
  },
};
