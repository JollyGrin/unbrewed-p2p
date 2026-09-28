/**
 * Browser half of scripts/tableplace/render-faces.mjs (issue #1007).
 *
 * esbuild bundles this into the render page; the driver calls
 * `window.__faces.render(job, deck)` once per face and screenshots #stage.
 * Action cards mount the sandbox's own `Card` (the DOM-hybrid render the hand
 * shows), so a face is the sandbox's card by construction, not a copy of it.
 */
import { createRoot, Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Card } from "@/components/CardFactory/Card";
import { getMeasureCanvas } from "@/components/CardFactory/card.helpers";
import {
  CharacterCardSvg,
  characterCardProps,
  RuleCardSvg,
  ruleCardProps,
} from "@/components/CardFactory/character.card";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { faceJobs, FaceJob } from "@/lib/tableplace/faces";

const FONTS = [
  "5px BebasNeueRegular",
  "3.3px ArchivoNarrow",
  "1.8px LeagueGothic",
];

let root: Root | null = null;
const stage = () => document.getElementById("stage") as HTMLElement;

const loadImage = (url: string) =>
  new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => img.decode().then(() => resolve(true), () => resolve(true));
    img.onerror = () => resolve(false);
    img.src = url;
  });

const same = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Art for a character card's top panel: its token portrait, else the art of
 * the first action card that names it, else the hero's portrait. */
const characterArt = (job: FaceJob, deck: DeckImportType) => {
  if (job.kind !== "hero" && job.kind !== "sidekick") return undefined;
  const c = job.character;
  return (
    c.tokenImageUrl ||
    deck.deck_data.cards.find((card) => same(card.characterName, c.name))
      ?.imageUrl ||
    deck.deck_data.hero?.tokenImageUrl ||
    undefined
  );
};

/** Every url the face paints, so the driver can wait on (and report) them. */
const imageUrls = (job: FaceJob, deck: DeckImportType): string[] => {
  if (job.kind === "card")
    return [job.card.cardImage?.url, job.card.imageUrl].filter(
      (u): u is string => !!u,
    );
  if (job.kind === "rule") return [];
  const art = characterArt(job, deck);
  return art ? [art] : [];
};

const face = (job: FaceJob, deck: DeckImportType) => {
  const canvas = getMeasureCanvas()!;
  switch (job.kind) {
    case "card":
      return <Card card={job.card} />;
    case "rule":
      return <RuleCardSvg props={ruleCardProps(job.rule, canvas)} idPrefix="f-" />;
    default:
      return (
        <CharacterCardSvg
          character={job.character}
          kind={job.kind}
          props={characterCardProps(job.character, job.kind, canvas)}
          artUrl={characterArt(job, deck)}
          idPrefix="f-"
        />
      );
  }
};

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
    __faces: {
      jobs: (deck: DeckImportType) => FaceJob[];
      render: (
        job: FaceJob,
        deck: DeckImportType,
      ) => Promise<{ failed: string[] }>;
    };
  }
}

window.__faces = {
  jobs: faceJobs,
  async render(job, deck) {
    // Layout measures text on a canvas: every face must be measured with the
    // real fonts, never the fallback, or the wraps differ from the sandbox.
    await Promise.all(FONTS.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    const urls = imageUrls(job, deck);
    const ok = await Promise.all(urls.map(loadImage));
    root?.unmount();
    root = createRoot(stage());
    flushSync(() => root!.render(face(job, deck)));
    // Card sets its measure canvas in an effect, then renders the svg; an
    // image face has no text to wait for.
    const ready =
      job.kind === "card" && job.card.cardImage?.url ? "svg" : "svg text";
    for (let i = 0; i < 100 && !stage().querySelector(ready); i++)
      await frames(1);
    await Promise.all(
      Array.from(stage().querySelectorAll("image")).map((el) =>
        loadImage(el.getAttribute("href") ?? ""),
      ),
    );
    await frames(3);
    return { failed: urls.filter((_, i) => !ok[i]) };
  },
};
