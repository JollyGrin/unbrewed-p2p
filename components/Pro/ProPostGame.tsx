/**
 * The post-game panel (p2p #1397, feature/end-screen part 1 of 3). Replaces
 * the dock's small winner block with a screen that describes the game you
 * just played, from data the client already holds at game end:
 *
 *   1. Result band — VICTORY / DEFEAT / NO WINNER, the end reason and who
 *      fell, and a meta column (map, turns, who moved first, the clock).
 *   2. Matchup cards — you | them: avatar, name (profile link, badges, or the
 *      bot's tier + tag), hero, and one HP row per fighter, sidekicks included.
 *   3. Two slots side by side — "How it went" (part 2, p2p #1398: damage
 *      dealt / taken, biggest hit, first blood, the per-turn strip — from
 *      lib/pro/gameStats, hidden when the page has no numbers) and "What you
 *      earned" (part 3). Empty here except the signed-out guest line.
 *   4. Actions — unchanged in meaning: Rematch (offer panel vs humans, one-tap
 *      link vs bots, the tournament's "Back to the match" in its place), the
 *      local replay link, Copy share link (signed in + bundle), Back to lobby.
 *
 * Two layouts: `panel` is the wide centred card the desktop dock swaps itself
 * for; `sheet` stacks the same sections for the phone sheet, the landscape
 * rail and the HUD's side sheet. Everything optional degrades by omission —
 * a reload into a finished room has no bundle and no end reason, and shows
 * the result + matchup with nothing broken.
 */
import { ReactNode } from "react";
import { Box, Button, Flex, Link, Text, Tooltip } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import { TbExternalLink, TbLink, TbRepeat, TbRobot } from "react-icons/tb";
import type { PlayerId, PlayerView } from "@/lib/pro/protocol";
import { GameStats, formatClock, sideSummary } from "@/lib/pro/gameStats";
import type { RoomBots } from "@/lib/pro/rematch";
import { knownBotTierMeta } from "@/lib/pro/botTiers";
import { sanitizeDisplayName } from "@/lib/pro/playerIdentity";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
import {
  GameEndReason,
  MatchupSeat,
  RESULT_TITLE,
  avatarInitials,
  endReasonLine,
  fighterHpLabel,
  gameResultOf,
  matchupSeats,
  seatHeroName,
} from "@/lib/pro/postGame";
import type { AccountState } from "@/lib/account/useAccount";
import { signInUrl } from "@/lib/account/useAccount";
import { profileHref } from "@/lib/account/publicProfile";
import { BadgeCluster, wornBadgeIds } from "@/components/Badges/BadgeGlyph";
import { useSignInReturn } from "@/components/Account/AccountChip";
import { RematchNegotiation, RematchOfferPanel } from "@/components/Pro/RematchOfferPanel";
import { ProPostGameEarned } from "@/components/Pro/ProPostGameEarned";
import type { GameEarnedView } from "@/lib/pro/useGameEarned";
import { PostGameHowItWent } from "@/components/Pro/PostGameHowItWent";

/** What the page knows about this game beyond the view (see ProDock's `postGame`). */
export interface ProPostGameContext {
  /** From the final STATE's GAME_ENDED event; null when it never arrived (reload). */
  endReason: GameEndReason | null;
  /** Hero display name for a heroId — the fallback when a seat's hero fighter is not on the view. */
  heroNameOf?: (heroId: string) => string | null;
  /** The room's bot seats (seat → difficulty); null when this browser never recorded them. */
  bots: RoomBots | null;
  accountStatus: AccountState["status"];
  /** The signed-in username, for "You · name"; null as a guest. */
  username: string | null;
  /**
   * Part 3 (p2p #1399): what this game earned, as `useGameEarned` tracks it —
   * null until the page has a game end to snapshot (or for a guest, whose
   * line the panel renders itself).
   */
  earned?: GameEarnedView | null;
  /**
   * "How it went" (p2p #1398): the game's damage facts, from the live event
   * reducer or the replay expansion. Null/absent = the page has no numbers
   * (a reload with no bundle) and the card is not rendered.
   */
  stats?: GameStats | null;
  /** Client-observed game length in ms (first STATE seen → game end); null when the page has no start stamp. */
  clockMs?: number | null;
  /** Who took turn 1, when derivable; null = omitted. */
  firstPlayer?: PlayerId | null;
}

export interface ProPostGameProps extends ProPostGameContext {
  view: PlayerView;
  layout: "panel" | "sheet";
  /** The narrow shells (rail, HUD side sheet): smaller title, one-line rematch copy. */
  compact?: boolean;
  /** ----- the dock's endgame props, unchanged in meaning ----- */
  endNote: string | null;
  endAction: ReactNode;
  rematchHref: string | null;
  rematchNegotiation: RematchNegotiation | null;
  replayHref: string | null;
  onCopyShareLink?: () => void;
  shareLinkBusy?: boolean;
}

export const PANEL_SURFACE = {
  bg: "linear-gradient(180deg, rgba(58, 33, 64, 0.96), rgba(44, 24, 49, 0.98))",
  border: "1px solid rgba(231, 204, 152, 0.2)",
  borderRadius: "14px",
} as const;

const CARD = {
  borderRadius: "10px",
  bg: "rgba(20, 8, 24, 0.65)",
} as const;
const GOLD_BORDER = "1px solid rgba(224, 168, 46, 0.45)";
const PLAIN_BORDER = "1px solid rgba(231, 204, 152, 0.2)";
const SLOT_BORDER = "1px solid rgba(231, 204, 152, 0.14)";
const DIM = "rgba(250, 235, 215, 0.7)";
const DIMMER = "rgba(250, 235, 215, 0.5)";

const GOLD_BTN = {
  bg: "brand.accent",
  color: "brand.surfaceDim",
  fontWeight: 700,
  borderRadius: "8px",
  _hover: { bg: "brand.accentDeep", textDecoration: "none" },
  _active: { bg: "brand.accentDeep" },
} as const;

const QUIET_BTN = {
  variant: "outline" as const,
  borderColor: "rgba(231, 204, 152, 0.35)",
  color: "brand.parchment",
  fontWeight: 600,
  borderRadius: "8px",
  _hover: { bg: "rgba(255, 255, 255, 0.08)", textDecoration: "none" },
} as const;

const SlotLabel = ({ children }: { children: ReactNode }) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontSize="0.72rem"
    letterSpacing="0.14em"
    textTransform="uppercase"
    color="rgba(250, 235, 215, 0.6)"
    fontWeight={600}
  >
    {children}
  </Text>
);

/** The identity of one seat, as the matchup card names it. */
interface SeatIdentity {
  name: string;
  /** What the avatar disc abbreviates: the username, else the hero. */
  initials: string;
  href: string | null;
  badges: string[];
  bot: { label: string; tag: string | null } | null;
}

const seatIdentity = (
  seat: MatchupSeat,
  heroName: string,
  ctx: Pick<ProPostGameContext, "bots" | "username" | "accountStatus">,
): SeatIdentity => {
  const { player } = seat;
  const tier = ctx.bots?.[player.id];
  if (tier) {
    const meta = knownBotTierMeta(tier);
    const label = meta?.label ?? "Bot";
    return { name: label, initials: label, href: null, badges: [], bot: { label, tag: meta?.badge ?? null } };
  }
  if (seat.you) {
    // "You · name" signed in, "You · guest" signed out; just "You" while the
    // account is still loading or the api is unreachable.
    const who = ctx.username ?? (ctx.accountStatus === "guest" ? "guest" : null);
    return { name: who ? `You · ${who}` : "You", initials: ctx.username ?? heroName, href: null, badges: [], bot: null };
  }
  const claimed = player.displayName ? sanitizeDisplayName(player.displayName) : undefined;
  if (!claimed) return { name: "Guest", initials: heroName, href: null, badges: [], bot: null };
  return { name: claimed, initials: claimed, href: profileHref(claimed), badges: wornBadgeIds(player.badges, player.badge), bot: null };
};

/** "you" / "bot" / the seat's claimed name / "guest" — how meta lines and captions name a seat. */
const shortSeatName = (view: PlayerView, id: PlayerId, ctx: Pick<ProPostGameContext, "bots">): string | null => {
  const player = view.players.find((p) => p.id === id);
  if (!player) return null;
  if (player.you || id === view.you) return "you";
  if (ctx.bots?.[id]) return "bot";
  const claimed = player.displayName ? sanitizeDisplayName(player.displayName) : undefined;
  return claimed || "guest";
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const Avatar = ({ initials, bot, gold, size }: { initials: string; bot: boolean; gold: boolean; size: string }) => (
  <Flex
    w={size}
    h={size}
    flexShrink={0}
    borderRadius="50%"
    bg={gold ? "#5A3A62" : "#3A2140"}
    border="2px solid"
    borderColor={gold ? "brand.accent" : "rgba(231, 204, 152, 0.35)"}
    align="center"
    justify="center"
    fontWeight={700}
    fontSize="0.8rem"
    color={gold ? "brand.parchment" : DIM}
    aria-hidden
  >
    {bot ? <TbRobot size="60%" /> : initials}
  </Flex>
);

const NameLine = ({
  identity,
  fontSize,
}: {
  identity: SeatIdentity;
  fontSize: string;
}) => (
  <Flex align="center" gap="0.5rem" minW={0} flexWrap="wrap">
    {identity.href ? (
      <Link
        href={identity.href}
        target="_blank"
        rel="noopener noreferrer"
        fontWeight={700}
        fontSize={fontSize}
        color="brand.parchment"
        textDecoration="underline"
        textDecorationColor="rgba(250, 235, 215, 0.35)"
        textUnderlineOffset="3px"
        _hover={{ color: "brand.accent" }}
      >
        {identity.name}
      </Link>
    ) : (
      <Text fontWeight={700} fontSize={fontSize} color="brand.parchment" noOfLines={1}>
        {identity.name}
      </Text>
    )}
    {identity.badges.length > 0 && <BadgeCluster ids={identity.badges} size={18} />}
    {identity.bot?.tag && (
      <Box
        as="span"
        data-testid="post-game-bot-tag"
        fontSize="0.62rem"
        letterSpacing="0.1em"
        textTransform="uppercase"
        px="0.45rem"
        py="0.1rem"
        borderRadius="999px"
        bg="rgba(224, 168, 46, 0.18)"
        color="brand.primary"
        fontWeight={600}
      >
        {identity.bot.tag}
      </Box>
    )}
  </Flex>
);

/** One fighter's final HP: name, bar, "hp / max" or "KO". */
const HpRow = ({ name, hp, maxHp, defeated }: { name: string; hp: number; maxHp: number; defeated: boolean }) => {
  const ko = defeated || hp <= 0;
  const pct = ko || maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <Flex align="center" gap="0.6rem" fontSize="0.82rem" color={ko ? "rgba(250, 235, 215, 0.6)" : "brand.parchment"} data-testid="post-game-hp-row">
      <Text w="7.5rem" flexShrink={0} noOfLines={1}>
        {name}
      </Text>
      <Box flex="1 1 0" h="8px" borderRadius="4px" bg="rgba(250, 235, 215, 0.15)" overflow="hidden">
        <Box w={`${pct}%`} h="8px" bg="brand.primary" />
      </Box>
      <Text w="3rem" flexShrink={0} textAlign="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {fighterHpLabel({ hp, maxHp, defeated })}
      </Text>
    </Flex>
  );
};

const MatchupCard = ({ seat, heroName, identity }: { seat: MatchupSeat; heroName: string; identity: SeatIdentity }) => (
  <Flex
    direction="column"
    gap="0.6rem"
    p="0.85rem 1rem"
    {...CARD}
    border={seat.won ? GOLD_BORDER : PLAIN_BORDER}
    data-testid="post-game-seat"
    data-won={seat.won ? "true" : "false"}
  >
    <Flex align="center" gap="0.6rem">
      <Avatar initials={avatarInitials(identity.initials)} bot={!!identity.bot} gold={seat.won} size="36px" />
      <Flex direction="column" minW={0}>
        <NameLine identity={identity} fontSize="0.92rem" />
        <Text fontSize="0.75rem" color={DIM}>
          {heroName}
        </Text>
      </Flex>
    </Flex>
    <Flex direction="column" gap="0.35rem">
      {seat.fighters.map((f) => (
        <HpRow key={f.id} name={f.name} hp={f.hp} maxHp={f.maxHp} defeated={f.defeated} />
      ))}
      {seat.fighters.length <= 1 && (
        <Text fontSize="0.75rem" color={DIMMER}>
          No sidekick
        </Text>
      )}
    </Flex>
  </Flex>
);

/** The phone sheet's matchup: one row per seat, HP as text, inside one box. */
const MatchupRow = ({ seat, heroName, identity }: { seat: MatchupSeat; heroName: string; identity: SeatIdentity }) => (
  <Flex align="center" gap="0.5rem" data-testid="post-game-seat" data-won={seat.won ? "true" : "false"}>
    <Avatar initials={avatarInitials(identity.initials)} bot={!!identity.bot} gold={seat.won} size="28px" />
    <Flex direction="column" minW={0} flex="1 1 0">
      <NameLine identity={identity} fontSize="0.82rem" />
      <Flex align="center" gap="0.4rem" fontSize="0.72rem" color={DIM} flexWrap="wrap">
        {seat.fighters.length === 0 ? (
          <Text as="span">{heroName}</Text>
        ) : (
          seat.fighters.map((f, i) => (
            <Text as="span" key={f.id} data-testid="post-game-hp-row">
              {i > 0 && <Text as="span" mr="0.4rem">·</Text>}
              {f.name} {fighterHpLabel(f)}
            </Text>
          ))
        )}
      </Flex>
    </Flex>
  </Flex>
);

/** The signed-out line in the "What you earned" slot. Quiet, never a wall. */
const GuestLine = ({ compact }: { compact: boolean }) => {
  const onSignInClick = useSignInReturn();
  return (
    <Flex
      direction="column"
      gap="0.6rem"
      p="0.85rem 1rem"
      borderRadius="10px"
      border="1px dashed rgba(231, 204, 152, 0.3)"
      data-testid="post-game-guest"
    >
      <SlotLabel>What you earned</SlotLabel>
      <Text fontSize={compact ? "0.78rem" : "0.85rem"} color="rgba(250, 235, 215, 0.85)">
        This game isn&apos;t saved to an account. Sign in with Discord and your next games count toward a level, hero
        cosmetics and badges.
      </Text>
      <Button
        as="a"
        href={signInUrl("/pro")}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onSignInClick}
        alignSelf="flex-start"
        {...QUIET_BTN}
        minH={TAP_TARGET}
        leftIcon={<FaDiscord size="1rem" />}
      >
        Sign in with Discord
      </Button>
    </Flex>
  );
};

export const ProPostGame = ({
  view,
  layout,
  compact = false,
  endReason,
  heroNameOf,
  bots,
  accountStatus,
  username,
  endNote,
  endAction,
  rematchHref,
  rematchNegotiation,
  replayHref,
  onCopyShareLink,
  shareLinkBusy = false,
  stats = null,
  clockMs = null,
  firstPlayer = null,
  earned,
}: ProPostGameProps) => {
  const result = gameResultOf(view) ?? "no-winner";
  const victory = result === "victory";
  const reason = endReasonLine(view, endReason, heroNameOf);
  const seats = matchupSeats(view);
  const mapTitle = view.map?.meta?.title ?? null;
  const turns = view.turnNumber;
  const panel = layout === "panel";
  // Client-observed (first STATE seen → game end), never the engine's duration.
  const clock = clockMs === null ? null : formatClock(clockMs);
  const firstPlayerName = firstPlayer ? shortSeatName(view, firstPlayer, { bots }) : null;
  const rematchLine =
    !!rematchNegotiation && (rematchNegotiation.state.phase !== "idle" || !!rematchNegotiation.state.notice);

  const title = (
    <Text
      as="h2"
      data-testid="post-game-result"
      data-result={result}
      fontFamily="LeagueGothic"
      fontSize={panel ? "4.75rem" : compact ? (rematchLine ? "1.9rem" : "2.4rem") : "3.4rem"}
      lineHeight="0.9"
      letterSpacing="0.02em"
      color={victory ? "brand.accent" : "brand.parchment"}
      opacity={victory ? 1 : 0.72}
      textShadow={victory ? "0 2px 12px rgba(224,168,46,0.5)" : "none"}
    >
      {RESULT_TITLE[result]}
    </Text>
  );

  // The engine's reason line and the tournament's note share the slot under the
  // title: the note (why a tagged duel ended, from the api) is the more specific
  // of the two when it exists.
  const subline = (
    <Flex direction="column" gap="0.15rem" fontSize={panel ? "0.92rem" : "0.8rem"} color="rgba(250, 235, 215, 0.85)">
      {reason && <Text data-testid="game-end-reason">{reason}</Text>}
      {endNote && (
        <Text data-testid="game-end-note" opacity={0.85}>
          {endNote}
        </Text>
      )}
      {!panel && (mapTitle || turns > 0) && (
        <Text color={DIM} fontSize="0.75rem">
          {[turns > 0 ? `turn ${turns}` : null, mapTitle].filter(Boolean).join(" · ")}
        </Text>
      )}
    </Flex>
  );

  const metaColumn = panel && (
    <Flex direction="column" align="flex-end" gap="0.2rem" fontSize="0.85rem" color="rgba(250, 235, 215, 0.75)" flexShrink={0} textAlign="right">
      {mapTitle && <Text>{mapTitle}</Text>}
      {turns > 0 && <Text>{turns === 1 ? "1 turn" : `${turns} turns`}</Text>}
      {clock && (
        <Text data-testid="post-game-clock" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {clock}
        </Text>
      )}
      {firstPlayerName && <Text data-testid="post-game-first-player">{capitalize(firstPlayerName)} moved first</Text>}
    </Flex>
  );

  const identities = seats.map((seat) => {
    const heroName = seatHeroName(view, seat.player, heroNameOf);
    return { seat, heroName, identity: seatIdentity(seat, heroName, { bots, username, accountStatus }) };
  });

  const summary = stats ? sideSummary(stats, view.you, view.players.map((p) => p.id), turns) : null;
  const howItWent = summary && (
    <PostGameHowItWent
      summary={summary}
      layout={layout}
      clock={clock}
      firstBloodBy={summary.firstBlood?.dealtBy ? shortSeatName(view, summary.firstBlood.dealtBy, { bots }) : null}
      firstPlayer={firstPlayerName}
    />
  );

  const matchup = panel ? (
    <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="1rem" data-testid="post-game-matchup">
      {identities.map(({ seat, identity, heroName }) => (
        <MatchupCard key={seat.player.id} seat={seat} identity={identity} heroName={heroName} />
      ))}
    </Box>
  ) : (
    <Flex direction="column" gap="0.45rem" p="0.65rem 0.75rem" {...CARD} border={PLAIN_BORDER} data-testid="post-game-matchup">
      {identities.map(({ seat, identity, heroName }, i) => (
        <Box key={seat.player.id}>
          {i > 0 && <Box h="1px" bg="rgba(231, 204, 152, 0.14)" mb="0.45rem" />}
          <MatchupRow seat={seat} identity={identity} heroName={heroName} />
        </Box>
      ))}
    </Flex>
  );

  // The played hero's name for the points tile: your HERO fighter on the view,
  // else the page's catalog lookup — the same resolution the matchup uses.
  const earnedHeroName =
    earned && "before" in earned ? seatHeroName(view, { id: view.you, heroId: earned.before.heroId }, heroNameOf) : "";
  const earnedSlot =
    accountStatus === "guest" ? (
      <GuestLine compact={!panel} />
    ) : earned ? (
      <ProPostGameEarned view={earned} heroName={earnedHeroName} compact={!panel} />
    ) : null;
  // The grid stays in the tree even while both slots are empty, so parts 2 and
  // 3 drop into a layout that is already there.
  const slots = (
    <Box
      display="grid"
      gridTemplateColumns={panel ? "repeat(2, minmax(0, 1fr))" : "1fr"}
      gap={panel ? "1rem" : "0.6rem"}
      data-testid="post-game-slots"
    >
      <Box data-testid="post-game-how-it-went">{howItWent}</Box>
      <Box data-testid="post-game-earned">{earnedSlot}</Box>
    </Box>
  );

  // ----- actions: same conditions as the old winner block -------------------
  const rematch = endAction ? (
    endAction
  ) : rematchNegotiation ? (
    <RematchOfferPanel negotiation={rematchNegotiation} compact={compact} fullWidth={!panel && !compact} />
  ) : rematchHref ? (
    <Button
      as={Link}
      href={rematchHref}
      {...GOLD_BTN}
      h={panel ? "46px" : "48px"}
      minH={TAP_TARGET}
      px="1.4rem"
      w={panel ? undefined : "100%"}
      leftIcon={<TbRepeat size="1.1rem" />}
    >
      Rematch — same setup
    </Button>
  ) : null;

  const replay = replayHref && (
    <Tooltip label="Saved in this browser — this link only opens for you" hasArrow placement="top">
      <Button as={Link} href={replayHref} {...QUIET_BTN} h={panel ? "46px" : "44px"} minH={TAP_TARGET} px="1.1rem" fontSize="0.88rem" rightIcon={<TbExternalLink size="0.85rem" />}>
        View your replay
      </Button>
    </Tooltip>
  );

  const share = onCopyShareLink && (
    <Tooltip label="Uploads a copy, then anyone with the link can watch" hasArrow placement="top">
      <Button {...QUIET_BTN} h={panel ? "46px" : "44px"} minH={TAP_TARGET} px="1.1rem" fontSize="0.88rem" isLoading={shareLinkBusy} onClick={onCopyShareLink} leftIcon={<TbLink size="0.85rem" />}>
        Copy share link
      </Button>
    </Tooltip>
  );

  // Straight back into matchmaking (issue #374). Bare href = full navigation.
  const lobby = (
    <Link
      href="/pro/game"
      color="rgba(250, 235, 215, 0.7)"
      fontSize="0.88rem"
      textDecoration="underline"
      textUnderlineOffset="3px"
      _hover={{ color: "brand.accent" }}
      py={panel ? undefined : "0.4rem"}
    >
      Back to lobby
    </Link>
  );

  const actions = panel ? (
    <Flex align="center" gap="0.75rem" pt="0.6rem" borderTop={SLOT_BORDER} flexWrap="wrap">
      {rematch}
      {replay}
      {share}
      <Box ml="auto">{lobby}</Box>
    </Flex>
  ) : (
    <Flex direction="column" gap="0.5rem" pt="0.2rem">
      {rematch}
      {(replay || share) && (
        <Box display="grid" gridTemplateColumns={replay && share ? "repeat(2, minmax(0, 1fr))" : "1fr"} gap="0.5rem">
          {replay}
          {share}
        </Box>
      )}
      <Flex justify="center">{lobby}</Flex>
    </Flex>
  );

  return (
    <Flex
      direction="column"
      gap={panel ? "1.1rem" : "0.75rem"}
      data-testid="pro-post-game"
      data-layout={layout}
      color="brand.parchment"
      fontFamily="SpaceGrotesk"
    >
      <Flex align="flex-end" justify="space-between" gap="1.5rem">
        <Flex direction="column" gap="0.25rem" minW={0}>
          {title}
          {subline}
        </Flex>
        {metaColumn}
      </Flex>
      {matchup}
      {slots}
      {actions}
    </Flex>
  );
};
