import { hasFieldedSidekick } from "@/components/DeckPool/PoolFns";
import { BoardToken, DEFAULT_TOKEN_SIZE, clampLabel } from "./position.type";

/** A deck fighter that can be offered as a one-press image token. */
export type HeroTokenSource = {
  kind: "hero" | "sidekick";
  name: string;
  imageUrl: string;
};

type Fighter = { name?: string | null; tokenImageUrl?: string | null };

/** Only `https` art is offered: relative and http paths won't load everywhere. */
const usableImage = (url?: string | null): string | undefined => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The hero, and an enabled sidekick, that carry a usable `tokenImageUrl`.
 * Empty when the deck has none, which hides the library button.
 */
export const heroTokenSources = (
  deckData?: {
    hero?: Fighter | null;
    sidekick?: (Fighter & { hp?: number | null; quantity?: number | null }) | null;
  } | null,
): HeroTokenSource[] => {
  const out: HeroTokenSource[] = [];
  const hero = deckData?.hero;
  const heroUrl = usableImage(hero?.tokenImageUrl);
  if (hero && heroUrl) out.push({ kind: "hero", name: hero.name?.trim() || "Hero", imageUrl: heroUrl });

  const sidekick = deckData?.sidekick;
  const sidekickUrl = usableImage(sidekick?.tokenImageUrl);
  if (sidekick && sidekickUrl && hasFieldedSidekick(sidekick))
    out.push({ kind: "sidekick", name: sidekick.name?.trim() || "Sidekick", imageUrl: sidekickUrl });
  return out;
};

/** Round, labelled image piece. `imageUrl` stays set so older clients draw it. */
export const heroToken = (
  source: HeroTokenSource,
): Omit<BoardToken, "id" | "x" | "y"> => ({
  imageUrl: source.imageUrl,
  clip: "circle",
  label: clampLabel(source.name),
  size: DEFAULT_TOKEN_SIZE,
  h: DEFAULT_TOKEN_SIZE,
});
