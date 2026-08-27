/**
 * The badge case on /account (issue #577) — the whole catalog as a grid, with
 * the unlocked ones wearable — and the same case, read-only, on another
 * player's public profile (#590).
 *
 * Three decisions shape it:
 *
 * 1. **Locked badges are shown, not hidden.** A case with three medallions and
 *    eight grey outlines tells a player what there is to go after; a case with
 *    three medallions tells them nothing. The API sends the same progress hint
 *    for locked and unlocked alike (`"Play 25 games (12/25)"`), so a locked tile
 *    can say exactly how far off it is.
 * 2. **Selecting is a toggle, not a dialog.** Click an unlocked badge to wear
 *    it, click one you're wearing to take it off. Nothing is optimistic —
 *    the server owns the unlock check, so the tile only moves once it agrees.
 *    Three fit (#718); picking a fourth swaps the last slot rather than
 *    refusing, so nobody has to go and find the one to remove first.
 * 3. **Nothing fails loudly.** A dead API, a 503 and a refused pick all land on
 *    the same quiet line the stats block uses. The worst outcome of a broken
 *    cosmetic write is that the badge didn't change.
 *
 * The worn strip above the grid (#718) is where ORDER lives. Slot 1 is the disc
 * drawn in front on the Pro HUD, and the order is the player's — dragged, never
 * sorted by rarity. Showing off is the point of a badge case, so leading with
 * the one you are proud of has to be a choice you can make.
 *
 * `readOnly` (#590) removes the interaction rather than disabling it, for the
 * same reason a locked tile is a `<div>`: on somebody else's profile there is
 * nothing to press, and a focusable control that refuses every press is worse
 * for a keyboard than no control at all.
 */
import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";

import {
  BadgeCluster,
  BadgeGlyph,
  MAX_WORN_BADGES,
} from "@/components/Badges/BadgeGlyph";
import { Badge, wornBadges } from "@/lib/account/badges";
import {
  BadgeCaseState,
  setWornBadges,
  toggleWornBadge,
} from "@/lib/account/useBadges";

const NOTICE: Record<"locked" | "unsaved", string> = {
  // The client's catalog is a render hint; the server is the authority. The
  // honest reading of a 422 is "your page is behind", not "you cheated".
  locked: "That badge isn't unlocked yet — your record may have moved since this page loaded.",
  unsaved: "Couldn't save that just now. Everything else works — try again in a moment.",
};

/**
 * The little numbered disc that says which slot a badge is in.
 *
 * One component for both places it appears — the grid tile's corner and the
 * worn slot itself — so the two can never disagree about what "slot 2" looks
 * like.
 */
const SlotPip = ({
  slot,
  placement,
}: {
  slot: number;
  placement: "corner" | "slot";
}) => (
  <Box
    as="span"
    aria-hidden
    position="absolute"
    {...(placement === "corner"
      ? { top: "0.3rem", right: "0.35rem", boxSize: "0.95rem", fontSize: "0.6rem" }
      : { bottom: "-0.12rem", right: "-0.12rem", boxSize: "1rem", fontSize: "0.62rem" })}
    borderRadius="full"
    bg="brand.secondary"
    color="brand.parchment"
    fontWeight={700}
    display="grid"
    placeItems="center"
    lineHeight={1}
  >
    {slot}
  </Box>
);

/**
 * One tile. A locked badge is a `<div>`, not a disabled button: there is nothing
 * to press, and a focusable control that refuses every press is worse for a
 * keyboard than no control at all. The unlock hint is the tile's own text, so
 * the grid reads the same to a screen reader as it looks.
 */
const BadgeTile = ({
  badge,
  slot,
  busy,
  readOnly,
}: {
  badge: Badge;
  /** 1-based worn slot, or null when this badge isn't being worn. */
  slot: number | null;
  busy: boolean;
  readOnly: boolean;
}) => {
  const interactive = badge.unlocked && !readOnly;
  const selected = slot !== null;

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
    position: "relative" as const,
  };

  const content = (
    <>
      {/* Which slot, not just THAT it is worn — the tile is the only place a
          player sees the two facts together while scanning the grid. */}
      {slot !== null ? <SlotPip slot={slot} placement="corner" /> : null}
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
      // Wearing a badge you already wear takes it off; a fourth pick swaps the
      // last slot. Both live in `toggleWornBadge` — the tile just names the id.
      onClick={() => void toggleWornBadge(badge.id)}
      cursor="pointer"
      opacity={busy ? 0.6 : 1}
      _hover={{ bg: "rgba(72, 40, 79, 0.14)" }}
    >
      {content}
    </Box>
  );
};

/**
 * The worn strip: three slots, in order, above the grid.
 *
 * Reordering is a native HTML drag, and the dragged index lives in React state
 * rather than in `dataTransfer` — the payload is one small integer belonging to
 * this component, nothing outside the strip may drop into it, and reading it
 * back out of the event is the only part of the DnD API that behaves
 * differently in every browser.
 *
 * Every drag has a keyboard equal: a focused slot moves with the arrow keys.
 * Dragging is the discoverable way to order three things and the only way to
 * order them with a mouse, but it is also the one interaction on this page a
 * keyboard cannot perform at all, so it does not get to be the only way.
 *
 * A write is the WHOLE list every time (`setWornBadges`), so a reorder and a
 * removal are the same request and can't disagree about what is worn.
 */
const WornStrip = ({
  badges,
  selected,
  busy,
}: {
  badges: Badge[];
  selected: string[];
  busy: boolean;
}) => {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const worn = wornBadges(badges, selected);

  // The ids as the strip would store them. Built off `worn` rather than off
  // `selected` so an id the catalog no longer sends — which has no slot to drag
  // and no name to show — can't be silently re-saved by a reorder.
  const ids = worn.map((badge) => badge.id);

  const move = (from: number, to: number) => {
    if (busy || from === to || to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void setWornBadges(next);
  };

  return (
    <Flex
      data-testid="account-worn-strip"
      align="center"
      gap="1.1rem"
      border="1px solid"
      borderColor="rgba(72, 40, 79, 0.18)"
      borderRadius="0.6rem"
      p="0.7rem 0.85rem"
      mb="0.7rem"
      flexWrap="wrap"
    >
      <Flex align="center" gap="0.9rem">
        {Array.from({ length: MAX_WORN_BADGES }, (_, i) => {
          const badge = worn[i];
          const slot = i + 1;
          if (!badge) {
            return (
              <Flex
                key={`empty-${slot}`}
                data-testid="account-worn-slot"
                data-slot={slot}
                direction="column"
                align="center"
                gap="0.35rem"
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={() => {
                  // Dropping past the end means "last" — there is nothing to
                  // swap with, and refusing the drop reads as a broken target.
                  if (dragFrom !== null) move(dragFrom, ids.length - 1);
                  setDragFrom(null);
                }}
              >
                <Box
                  boxSize="3.25rem"
                  borderRadius="full"
                  border="1px dashed"
                  borderColor="rgba(72, 40, 79, 0.35)"
                  position="relative"
                />
                <Text fontSize="0.62rem" opacity={0.45} fontWeight={700}>
                  Slot {slot}
                </Text>
              </Flex>
            );
          }
          return (
            <Flex
              key={badge.id}
              direction="column"
              align="center"
              gap="0.35rem"
              data-testid="account-worn-slot"
              data-slot={slot}
              data-badge-id={badge.id}
            >
              <Box
                as="button"
                type="button"
                draggable={!busy}
                disabled={busy}
                aria-label={`${badge.name}, slot ${slot} of ${MAX_WORN_BADGES}. Arrow keys reorder; press to take it off.`}
                title={`${badge.name} — drag to reorder, click to take it off`}
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => {
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={() => {
                  if (dragFrom !== null) move(dragFrom, i);
                  setDragFrom(null);
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    move(i, i - 1);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    move(i, i + 1);
                  }
                }}
                onClick={() => void toggleWornBadge(badge.id)}
                position="relative"
                boxSize="3.25rem"
                borderRadius="full"
                border="1px solid"
                borderColor="brand.secondary"
                bg="rgba(72, 40, 79, 0.1)"
                display="grid"
                placeItems="center"
                cursor={busy ? "default" : "grab"}
                opacity={busy || dragFrom === i ? 0.6 : 1}
              >
                <BadgeGlyph id={badge.id} size="2.4rem" />
                <SlotPip slot={slot} placement="slot" />
              </Box>
              <Text
                fontSize="0.62rem"
                fontWeight={700}
                opacity={0.8}
                maxW="4.5rem"
                textAlign="center"
                lineHeight="1.2"
              >
                {badge.name}
              </Text>
            </Flex>
          );
        })}
      </Flex>
      <Box flex="1" minW="12rem">
        <Text
          fontSize="0.68rem"
          fontWeight={700}
          letterSpacing="0.1em"
          textTransform="uppercase"
          opacity={0.55}
        >
          Worn
        </Text>
        <Text fontSize="0.75rem" opacity={0.75} lineHeight="1.45">
          Drag to reorder — slot 1 sits in front on the HUD. Click a badge below
          to add it; click one you&apos;re wearing to take it off. With all three
          full, picking a fourth swaps the last slot.
        </Text>
      </Box>
    </Flex>
  );
};

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="0.88rem" opacity={0.75} py="0.6rem">
    {children}
  </Text>
);

export const AccountBadgeCase = ({
  state,
  readOnly = false,
  name,
}: {
  state: BadgeCaseState;
  /** True on a public profile: the grid displays, nothing selects. */
  readOnly?: boolean;
  /** Whose case this is. Only used when `readOnly` is true. */
  name?: string;
}) => {
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
          ? readOnly
            ? `${unlocked} of ${badges.length} unlocked. The ones being worn show beside the name — including to an opponent in a Pro game.`
            : `${unlocked} of ${badges.length} unlocked. Wear up to three and they show beside your name — including to your opponent in a Pro game.`
          : readOnly
            ? `Badges ${name ?? "this player"} unlocked by playing Pro games.`
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
          {/* Order is only meaningful where it can be changed — a visitor sees
              what is worn on the tiles themselves, and a strip they can't drag
              would be three more discs saying the same thing. */}
          {readOnly ? null : (
            <WornStrip badges={badges} selected={selected} busy={busy} />
          )}
          <Box
            display="grid"
            gridTemplateColumns="repeat(auto-fill, minmax(7.5rem, 1fr))"
            gap="0.5rem"
          >
            {badges.map((badge) => {
              const at = selected.indexOf(badge.id);
              return (
                <BadgeTile
                  key={badge.id}
                  badge={badge}
                  slot={at === -1 ? null : at + 1}
                  busy={busy}
                  readOnly={readOnly}
                />
              );
            })}
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
 * The badges worn beside the display name in the profile header — the same
 * overlapping cluster the Pro HUD draws, in the same order (#718).
 *
 * Renders nothing at all when nothing is worn, or when every id names a badge
 * the catalog didn't send — the header is a statement of fact about the
 * account, and a chip with no name behind it isn't one.
 *
 * The names are spelled out here, unlike on the HUD. There is room, this page
 * has the API's catalog rows to hand, and a profile is read rather than glanced
 * at: the cluster says how the badges LOOK in game, the text says what they are.
 */
export const SelectedBadgeChip = ({ state }: { state: BadgeCaseState }) => {
  const worn = wornBadges(state.badges, state.selected);
  if (worn.length === 0) return null;
  return (
    <Flex
      data-testid="account-badge-chip"
      align="center"
      gap="0.35rem"
      px="0.4rem"
      py="0.12rem"
      borderRadius="full"
      bg="rgba(72, 40, 79, 0.1)"
      maxW="100%"
      minW={0}
    >
      <BadgeCluster ids={worn.map((badge) => badge.id)} title={false} />
      <Text
        fontFamily="ArchivoNarrow"
        fontSize="0.72rem"
        letterSpacing="0.03em"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {worn.map((badge) => badge.name).join(" · ")}
      </Text>
    </Flex>
  );
};
