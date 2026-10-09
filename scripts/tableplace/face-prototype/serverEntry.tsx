/**
 * Server half of the D1 prototype (#1045): the sandbox's own card SVG
 * components, string-rendered in Node — no DOM, no Chromium.
 *
 * `CardSvg` and the character/rule cards are pure SVG whose only browser need
 * is a 2D canvas for `measureText` during layout. render.mjs passes a
 * `@napi-rs/canvas` (Skia, the same text stack as Chrome) with the card fonts
 * registered, so the wraps are computed exactly as the sandbox computes them.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { CardSvg } from "@/components/CardFactory/card.factory";
import {
  calculateProps,
  MeasureCanvas,
} from "@/components/CardFactory/card.helpers";
import {
  CharacterCardSvg,
  characterCardProps,
  RuleCardSvg,
  ruleCardProps,
} from "@/components/CardFactory/character.card";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { faceJobs, FaceJob } from "@/lib/tableplace/faceJobs";

export { faceJobs };

const same = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Same art pick as the removed build script (#1007). */
export const characterArt = (job: FaceJob, deck: DeckImportType) => {
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

/** Layout props for one face, for checking Node's wraps against Chrome's. */
export const faceLayout = (job: FaceJob, canvas: MeasureCanvas) =>
  job.kind === "card"
    ? calculateProps(job.card, canvas)
    : job.kind === "rule"
      ? ruleCardProps(job.rule, canvas)
      : characterCardProps(job.character, job.kind, canvas);

/** Every face's layout in a deck, keyed by faceJobs key. */
export const layoutsOf = (deck: DeckImportType, canvas: MeasureCanvas) =>
  Object.fromEntries(faceJobs(deck).map((job) => [job.key, faceLayout(job, canvas)]));

/** The face as a standalone SVG document (63x88 viewBox). */
export const faceSvg = (
  job: FaceJob,
  deck: DeckImportType,
  canvas: MeasureCanvas,
  width: number,
  height: number,
): string => {
  switch (job.kind) {
    case "card":
      return renderToStaticMarkup(
        <CardSvg
          card={job.card}
          props={calculateProps(job.card, canvas)}
          width={width}
          height={height}
          idPrefix="f-"
        />,
      );
    case "rule":
      return renderToStaticMarkup(
        <RuleCardSvg props={ruleCardProps(job.rule, canvas)} idPrefix="f-" />,
      );
    default:
      return renderToStaticMarkup(
        <CharacterCardSvg
          character={job.character}
          kind={job.kind}
          props={characterCardProps(job.character, job.kind, canvas)}
          artUrl={characterArt(job, deck)}
          idPrefix="f-"
        />,
      );
  }
};
