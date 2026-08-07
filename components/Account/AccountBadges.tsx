/**
 * The badge case on /account (issue #577) — the whole catalog as a grid, with
 * the unlocked ones wearable.
 *
 * Three decisions shape it:
 *
 * 1. **Locked badges are shown, not hidden.** A case with three medallions and
 *    eight grey outlines tells a player what there is to go after; a case with
 *    three medallions tells them nothing. The API sends the same progress hint
 *    for locked and unlocked alike (`"Play 25 games (12/25)"`), so a locked tile
 *    can say exactly how far off it is.
 * 2. **Selecting is a toggle, not a dialog.** Click an unlocked badge to wear
 *    it, click the one you're wearing to take it off. Nothing is optimistic —
 *    the server owns the unlock check, so the tile only moves once it agrees.
 * 3. **Nothing fails loudly.** A dead API, a 503 and a refused pick all land on
 *    the same quiet line the stats block uses. The worst outcome of a broken
 *    cosmetic write is that the badge didn't change.
 */
import { Box, Flex, Text } from "@chakra-ui/react";

import { BadgeGlyph } from "@/components/Badges/BadgeGlyph";
import { Badge } from "@/lib/account/badges";
import { BadgeCaseState, selectBadge } from "@/lib/account/useBadges";

const NOTICE: Record<"locked" | "unsaved", string> = {
  // The client's catalog is a render hint; the server is the authority. The
  // honest reading of a 422 is "your page is behind", not "you cheated".
  locked: "That badge isn't unlocked yet — your record may have moved since this page loaded.",
  unsaved: "Couldn't save that just now. Everything else works — try again in a moment.",
};

/**
 * One tile. A locked badge is a `<div>`, not a disabled button: there is nothing
 * to press, and a focusable control that refuses every press is worse for a
 * keyboard than no control at all. The unlock hint is the tile's own text, so
 * the grid reads the same to a screen reader as it looks.
 */
const BadgeTile = ({
  badge,
  selected,
  busy,
}: {
  badge: Badge;
  selected: boolean;
  busy: boolean;
}) => {
  const interactive = badge.unlocked;

  const frame = {
    "data-testid": "account-badge",
    "data-badge-id": badge.id,
    "data-locked": badge.unlocked ? undefined : "true",
    "data-selected": selected ? "true" : undefined,
    textAlign: "center" as const,
    display: "flex",
    flexDir: "column" as const,
    alignItems: "center",
    gap: "0.35rem",
    p: "0.6rem 0.4rem",
    borderRadius: "0.6rem",
    border: "1px solid",
    borderColor: selected ? "brand.secondary" : "transparent",
    bg: selected ? "rgba(72, 40, 79, 0.12)" : "rgba(72, 40, 79, 0.04)",
    transition: "background 120ms ease, border-color 120ms ease",
  };

  const content = (
    <>
      <BadgeGlyph id={badge.id} size="2.75rem" muted={!badge.unlocked} />
      <Text
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="0.8rem"
        lineHeight="1.15"
        opacity={badge.unlocked ? 1 : 0.6}
      >
        {badge.name}
      </Text>
      <Text fontSize="0.7rem" opacity={badge.unlocked ? 0.7 : 0.55} lineHeight="1.25">
        {/* Unlocked: what it means. Locked: what it takes, with the count. */}
        {badge.unlocked ? badge.blurb : badge.unlockedWhy}
      </Text>
      {selected ? (
        <Text
          fontFamily="ArchivoNarrow"
          fontSize="0.62rem"
          letterSpacing="0.08em"
          textTransform="uppercase"
          opacity={0.75}
        >
          Wearing
        </Text>
      ) : null}
    </>
  );

  if (!interactive) return <Box {...frame}>{content}</Box>;

  return (
    <Box
      as="button"
      type="button"
      {...frame}
      aria-pressed={selected}
      disabled={busy}
      // Wearing the badge you already wear takes it off.
      onClick={() => void selectBadge(selected ? null : badge.id)}
      cursor="pointer"
      opacity={busy ? 0.6 : 1}
      _hover={{ bg: "rgba(72, 40, 79, 0.14)" }}
    >
      {content}
    </Box>
  );
};

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="0.88rem" opacity={0.75} py="0.6rem">
    {children}
  </Text>
);

export const AccountBadgeCase = ({ state }: { state: BadgeCaseState }) => {
  const { status, badges, selected, busy, notice } = state;
  const unlocked = badges.filter((badge) => badge.unlocked).length;

  return (
    <Box
      as="section"
      aria-labelledby="account-badges-heading"
      bg="brand.parchment"
      borderRadius="0.75rem"
      p="1.1rem"
      boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
      mb="1rem"
    >
      <Text
        id="account-badges-heading"
        as="h2"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.15rem"
        mb="0.2rem"
      >
        Badge case
      </Text>
      <Text fontSize="0.8rem" opacity={0.65} mb="0.7rem">
        {status === "ready" && badges.length > 0
          ? `${unlocked} of ${badges.length} unlocked. Wear one and it shows beside your name — including to your opponent in a Pro game.`
          : "Badges you unlock by playing Pro games while signed in."}
      </Text>

      {status === "loading" ? <Quiet>Opening the case…</Quiet> : null}

      {/* An unreachable API, an unconfigured one and a 503 are the same thing
          from the player's seat: no case to open. The stats block directly above
          already points a new player at /pro, so this one just says its piece. */}
      {status === "unavailable" || (status === "ready" && badges.length === 0) ? (
        <Quiet>
          Badges aren&apos;t available right now. Everything else on Unbrewed
          works as usual — try again later.
        </Quiet>
      ) : null}

      {status === "ready" && badges.length > 0 ? (
        <>
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(7.5rem, 1fr))"
            gap="0.5rem"
          >
            {badges.map((badge) => (
              <BadgeTile
                key={badge.id}
                badge={badge}
                selected={badge.id === selected}
                busy={busy}
              />
            ))}
          </Box>
          {notice ? (
            <Text
              data-testid="account-badge-notice"
              role="status"
              fontSize="0.78rem"
              opacity={0.75}
              mt="0.6rem"
            >
              {NOTICE[notice]}
            </Text>
          ) : null}
        </>
      ) : null}
    </Box>
  );
};

/**
 * The badge worn beside the display name in the profile header.
 *
 * Renders nothing at all when there is no selection, or when the selection
 * names a badge the catalog didn't send — the header is a statement of fact
 * about the account, and a chip with no name behind it isn't one.
 */
export const SelectedBadgeChip = ({ state }: { state: BadgeCaseState }) => {
  const badge = state.badges.find((row) => row.id === state.selected);
  if (!badge) return null;
  return (
    <Flex
      data-testid="account-badge-chip"
      align="center"
      gap="0.3rem"
      px="0.4rem"
      py="0.12rem"
      borderRadius="full"
      bg="rgba(72, 40, 79, 0.1)"
      maxW="100%"
      minW={0}
    >
      <BadgeGlyph id={badge.id} size="1.05rem" />
      <Text
        fontFamily="ArchivoNarrow"
        fontSize="0.72rem"
        letterSpacing="0.03em"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {badge.name}
      </Text>
    </Flex>
  );
};
