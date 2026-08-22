import type { ComponentProps } from "react";
import { Link, Text, Tooltip } from "@chakra-ui/react";
import { TbExternalLink } from "react-icons/tb";
import type { PopularDeckMeta } from "@/lib/constants/top-decks";

/**
 * Where a deck's "by <author>" credit points.
 *
 * An explicit `sourceUrl` wins: an evergreen deck can have a real source page
 * off unmatched.cards (Grievous and Darth Vader both live on the-unmatched.club
 * — #428, #533). Otherwise community decks derive their unmatched.cards page
 * from the deck id. Evergreen originals with no source page return undefined and
 * the credit renders as plain text rather than a dead link.
 *
 * `sourceUrl` also wins for a deck that HAS an unmatched.cards page but is
 * credited elsewhere: Skull Kid is mirrored from unmatched.cards `zmGV` yet is
 * attributed to its authors' the-unmatched.club publication (#665), so the
 * id-derived link must never override an explicit one.
 */
export const deckAttributionHref = (deck: PopularDeckMeta): string | undefined =>
  deck.sourceUrl ??
  (deck.original ? undefined : `https://unmatched.cards/decks/${deck.id}`);

/** "the-unmatched.club" out of a full attribution URL, for link copy. */
const siteOf = (href: string) =>
  href.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

/**
 * The one "by <author>" credit for a community/fan deck, shared by every surface
 * that shows a deck (the game page's hero splash and the landing roster). Every
 * deck with a tile entry gets it — this is not a per-deck opt-in, so a newly
 * wired deck credits its author with no extra work.
 *
 * Rendered as a plain `Text` so a caller can size it for its own surface; the
 * defaults match the game page's splash panel, which is where this started.
 */
export const DeckAttribution = ({
  deck,
  fontSize = "0.8rem",
  fontStyle = "italic",
  opacity = 0.85,
  ...rest
}: {
  deck: PopularDeckMeta;
  fontSize?: string;
  fontStyle?: string;
  opacity?: number;
} & Omit<ComponentProps<typeof Text>, "deck">) => {
  const href = deckAttributionHref(deck);
  const site = href ? siteOf(href) : "";
  return (
    <Text
      fontStyle={fontStyle}
      fontSize={fontSize}
      color="brand.parchment"
      opacity={opacity}
      noOfLines={1}
      {...rest}
    >
      by{" "}
      {/* stopPropagation keeps the link inert toward a click-to-pick or
          click-to-lock wrapper — the landing's roster tile is exactly that. */}
      {href ? (
        <Tooltip
          label={`View ${deck.author}'s deck on ${site}`}
          hasArrow
          placement="top"
          openDelay={150}
        >
          <Link
            href={href}
            isExternal
            aria-label={`View ${deck.author}'s deck on ${site} (opens in a new tab)`}
            onClick={(e) => e.stopPropagation()}
            color="inherit"
            textDecoration="underline"
            sx={{ textUnderlineOffset: "0.15em" }}
            _hover={{ color: "brand.accent", opacity: 1 }}
            display="inline-flex"
            alignItems="center"
            gap="0.2rem"
          >
            {deck.author}
            <TbExternalLink size="0.7rem" />
          </Link>
        </Tooltip>
      ) : (
        deck.author
      )}
    </Text>
  );
};
