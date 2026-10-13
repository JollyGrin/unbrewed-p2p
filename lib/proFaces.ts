/**
 * Hero and sidekick faces for the repo-hosted Pro decks on /table (#1421).
 *
 * The rules-locked snapshots carry `cardImage` on the action cards but not on
 * the hero or sidekick, so `previewOf` refuses every Pro deck. The finished
 * faces do exist next to the deck's art (`hero-card.webp`,
 * `sidekick-<name>.webp`). Rather than a hand-kept list, the art folder is
 * read from the snapshot's own card images and each face is probed on the
 * static host; a deck with no such file simply has no face and stays refused.
 *
 * Only decks whose ACTION cards all ship a `cardImage` are probed: a deck
 * drawn from the generated card template (imageUrl only) never lists, even if
 * a stray hero file turns up.
 */
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { slug } from "@/lib/tableplace/faceJobs";
import type { FaceResolver } from "@/lib/tableplace/types";

const ART_ROOT = "/evergreen-decks/art/";

/** The deck's art folder, when every action card carries its own card image. */
export const artDirOf = (deck: DeckImportType): string | null => {
  const actions = deck.deck_data.cards.filter(
    (c) => !c.isCharacterCard && (c.quantity ?? 1) > 0,
  );
  if (!actions.length) return null;
  const dirs = new Set<string>();
  for (const card of actions) {
    const url = card.cardImage?.url;
    if (!url || !url.startsWith(ART_ROOT)) return null;
    dirs.add(url.slice(0, url.lastIndexOf("/") + 1));
  }
  // one folder per deck; a deck spread over several has no single hero folder
  return dirs.size === 1 ? [...dirs][0] : null;
};

const exists = async (url: string): Promise<boolean> => {
  try {
    const res = await axios.head(url);
    return res.status === 200;
  } catch {
    return false;
  }
};

/** The faces beside a Pro deck's art; null when it has no hero face. */
export const probeProFaces = async (
  deck: DeckImportType,
): Promise<FaceResolver | null> => {
  const dir = artDirOf(deck);
  if (!dir) return null;
  const heroUrl = `${dir}hero-card.webp`;
  const sidekickUrl = `${dir}sidekick-${slug(deck.deck_data.sidekick?.name)}.webp`;
  const [hero, sidekick] = await Promise.all([
    exists(heroUrl),
    exists(sidekickUrl),
  ]);
  if (!hero) return null;
  return Object.assign((): string | null => null, {
    hero: () => heroUrl,
    sidekick: () => (sidekick ? sidekickUrl : null),
  }) as FaceResolver;
};

/** Face resolvers for the Pro decks that have them, keyed by deck object. */
export const useProFaces = (
  decks: DeckImportType[] | undefined,
): Map<DeckImportType, FaceResolver> | undefined => {
  const [found, setFound] = useState<{
    decks: DeckImportType[];
    faces: Map<DeckImportType, FaceResolver>;
  }>();
  useEffect(() => {
    if (!decks) return;
    let live = true;
    void Promise.all(decks.map(probeProFaces)).then((resolvers) => {
      if (!live) return;
      const faces = new Map<DeckImportType, FaceResolver>();
      resolvers.forEach((r, i) => r && faces.set(decks[i], r));
      setFound({ decks, faces });
    });
    return () => {
      live = false;
    };
  }, [decks]);
  return useMemo(
    () => (found && found.decks === decks ? found.faces : undefined),
    [found, decks],
  );
};
