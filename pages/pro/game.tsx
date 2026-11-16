/**
 * Pro game page — renders the server's view, offers legalActions, answers
 * prompts. Contains ZERO rules logic (docs/pro/01-context.md).
 *
 * Modes:
 * - LIVE (default): WS_URL resolves to the Railway server → connects via
 *   useProSocket. `?room=<id>` joins; no room param creates one. This is what
 *   a plain GitHub Pages build ships, so /pro/game is playable with no env.
 * - PREVIEW (fallback): only reached if WS_URL is somehow empty → renders the
 *   Mended Drum fixture with placeholder fighters so board rendering can be
 *   verified without the backend. Clicking a fighter shows its movement
 *   out-edges (adjacentTo ∪ oneWayTo) — reading MAP data for display, not rules.
 */
import { ComponentProps, FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/router";
import { LockIcon } from "@chakra-ui/icons";
import { Box, Button, Flex, Grid, Input, InputGroup, InputLeftElement, Link, Menu, MenuButton, MenuItem, MenuList, NumberDecrementStepper, NumberIncrementStepper, NumberInput, NumberInputField, NumberInputStepper, Tag, Text, Textarea, Tooltip } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { PendingMove, ProBoard } from "@/components/Pro/ProBoard";
import { assignableSeats, BotSlotPlan, SlotOccupant } from "@/components/Pro/CreateSeats";
import { availableBotTiers, botTierChoices, BotTierChoice, coerceBotTier, tierTooltip } from "@/lib/pro/botTiers";
import { applyTierLocks, isAllowlisted, JEVX3_ALLOWLIST, lockedTiers, TierUnlockProgress, tierUnlockProgress } from "@/lib/pro/tierUnlock";
import { OpponentChoice, useOpponentSeat } from "@/lib/pro/opponentSeat";
import {
  BotDifficulty,
  BotSeatFill,
  FighterId,
  HeroListing,
  PlayerId,
  ProMapDef,
  ReplayBundle,
  SpaceId,
  ViewFighter,
} from "@/lib/pro/protocol";
import { saveReplay } from "@/lib/pro/replayStore";
import { toastReplaySaveResult } from "@/components/Pro/replaySaveToast";
import { shareReplayLink } from "@/lib/pro/replayShareLink";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { ProConnectionStatus, useProSocket } from "@/lib/pro/useProSocket";
import { normalizeMap } from "@/lib/pro/normalizeMap";
import { SubmitMapDialog } from "@/components/Pro/SubmitMapDialog";
import {
  RecentRoom,
  getTabToken,
  getToken,
  listRecentHeroes,
  listRecentRooms,
  rememberHero,
} from "@/lib/pro/recentRooms";
import { HERO_DECK_IDS } from "@/lib/pro/useProCardArt";
import { POPULAR_DECKS } from "@/lib/constants/top-decks";
import { GiFootprint, GiHearts } from "@/components/Icons/gi";
import {
  TbArrowsSort,
  TbBow,
  TbChevronDown,
  TbExternalLink,
  TbInfoCircle,
  TbSearch,
  TbSword,
  TbUsers,
  TbX,
  TbZoomIn,
} from "react-icons/tb";
import { DeckAttribution } from "@/components/Pro/DeckAttribution";
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";
import { MapPreviewModal } from "@/components/Pro/MapPreviewModal";
import { STATUS_DISPLAY } from "@/components/Pro/ProHud";
import { GameLostScreen } from "@/components/Pro/GameLostScreen";
import { matchBoardOnScreen, usePageZoomGuard } from "@/lib/pro/usePageZoomGuard";
import {
  cardLabel,
} from "@/lib/pro/actionDock";
import { seatNameplate } from "@/lib/pro/playerIdentity";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";
import { PRO_WS_URL as WS_URL } from "@/lib/pro/wsUrl";
import { useAccount } from "@/lib/account/useAccount";
import { useAccountStats } from "@/lib/account/useAccountStats";
import { gameResultOf, isGameOver } from "@/lib/pro/postGame";
import { earnedKindOf } from "@/lib/pro/earned";
import { useGameEarned } from "@/lib/pro/useGameEarned";
import { useBadges } from "@/lib/account/useBadges";
import {
  EMPTY_GAME_STATS_ACCUMULATOR,
  GameStats,
  firstActorOf,
  readOrMarkClockStart,
  reduceGameStats,
  statsFromExpansion,
} from "@/lib/pro/gameStats";
import { fetchReplayExpansion } from "@/lib/pro/replayApi";
import { InGameAccountChip } from "@/components/Account/AccountChip";
import { ChipCluster } from "@/components/Game/Header/header.styles";
import { formatChoice, PRO_FORMATS, ProFormatId, teamComposition } from "@/lib/pro/multiplayerPlaytest";
import { useSlowMode } from "@/lib/pro/useSlowMode";
import {
  CUSTOM_MAP_ID,
  MAP_CATALOG,
  RANDOM_MAP_ID,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  mapEligibleForFormat,
  mapHasItems,
  randomMapPool,
  rollRandomMap,
} from "@/lib/pro/mapCatalog";
import type { MapCatalogEntry } from "@/lib/pro/mapCatalog";
import { RANDOM_HERO_ID, resolveHeroPick } from "@/lib/pro/randomHero";
import { parseVsParam } from "@/lib/pro/vsParam";
import {
  buildFinishedGameSetup,
  ParsedRematch,
  parseRematchQuery,
  rematchCreateRoomArgs,
  rematchQuery,
  withoutRematchQuery,
} from "@/lib/pro/rematch";
import type { RematchNegotiation } from "@/components/Pro/RematchOfferPanel";
import { withoutTicketQuery } from "@/lib/pro/tournamentTicket";
import { proJoinLinkProps, trackInviteCopied, useEntryEvent } from "@/lib/growthAnalytics";
import { isTournamentRoom, TournamentGate, useTournamentGame, type GateTournament } from "@/components/Pro/TournamentGate";
import { TournamentWaiting } from "@/components/Pro/TournamentGameNotes";
import { useLobbyMatchCue } from "@/lib/pro/useLobbyMatchCue";
import {
  advanceQuickMatch,
  botFallbackHref,
  isQuickMatchRetryable,
  isQuickMatchWaiting,
  QUICK_PLAY_TIMER_SECONDS,
  quickMatchStep,
  startQuickMatch,
} from "@/lib/pro/quickMatch";
import type { QuickMatchSearch } from "@/lib/pro/quickMatch";
import { useLobbySocket } from "@/lib/pro/useLobbySocket";
import type { PresenceEntry, QuickPlayBonus } from "@/lib/pro/lobbyProtocol";
import {
  activeBonus,
  effectiveLobbies,
  elapsedLabel,
  foundOpponent,
  heroPips as lobbyHeroPips,
  lookingCount,
  multiplierLabel,
  presenceAvatar,
  presenceName,
  presencePillModel,
  presentCount,
  quickMatchSubline as quickMatchSublineFor,
  ribbonItems,
  searchProgressLine,
  type Avatar as QuickPlayAvatar,
} from "@/lib/pro/quickPlayLobby";
import { AvatarDisc, LobbyRibbon } from "@/components/Pro/LobbyRibbon";
import { LobbyVisibilityToggle, PresencePill } from "@/components/Pro/PresencePill";
import { useLobbyVisible } from "@/lib/pro/lobbyVisibility";
import { PairActions, PartnerCard, type PartnerModel } from "@/components/Pro/PairPanel";
import {
  livePartner,
  NUDGE_REPLY_WINDOW_MS,
  NUDGE_TOAST_MS,
  nudgeReplyFailMessage,
  pairEndedMessage,
  pairPartnerName,
  partnerReady,
  reducePair,
  type LobbyPair,
  type PairEffect,
  type PairEvent,
} from "@/lib/pro/lobbyPair";
import { FoundPanel, QuickMatchLabel, SearchingPanel } from "@/components/Pro/QuickMatchDock";
import { GameViewBody, useGameViewState, heroDeckMeta, NO_MOTION, prettyHeroId, BTN, heroNameOf, BTN_GOLD, usePendingMoveTimeout, TABLE_BG } from "@/components/Pro/GameView";

/** sessionStorage key for a toast that has to survive a full navigation (#1556). */
const PRO_FLASH_KEY = "pro-game-flash";

/** How long the "Match found" panel holds before the table opens (#1542). */
const QUICK_FOUND_MS = 3_000;

// Move-timer config (issue #223). The server accepts an integer 10–300s; the host
// opts in and picks a per-move duration. Quick-pick presets plus a free custom
// value, both clamped to the engine bound. `TURN_TIMER_DEFAULT` is what flipping
// the toggle ON lands on.
const TURN_TIMER_MIN = 10;
const TURN_TIMER_MAX = 300;
const TURN_TIMER_DEFAULT = 60;
// Rules-strip timer chips (issue #301): "Off" leads (the on/off toggle is gone),
// three quick presets, then "…" for an inline custom seconds field. The strip
// presets are a subset of TURN_TIMER_PRESETS; custom covers everything else.
const TURN_TIMER_STRIP_PRESETS = [30, 60, 90] as const;
const TIMER_CHIPS: { v: string; label: string }[] = [
  { v: "off", label: "Off" },
  ...TURN_TIMER_STRIP_PRESETS.map((s) => ({ v: String(s), label: `${s}s` })),
  { v: "custom", label: "…" },
];
/** Clamp a raw seconds value to the engine's accepted range (integer 10–300). */
const clampTurnTimer = (n: number) =>
  Math.min(TURN_TIMER_MAX, Math.max(TURN_TIMER_MIN, Math.round(n)));

/** The reveal beat: cards flip in from edge-on, defender a breath later. */
const flipIn = keyframes`
  from { transform: perspective(600px) rotateY(88deg) scale(1.12); opacity: 0.4; }
  60%  { transform: perspective(600px) rotateY(-8deg) scale(1.06); opacity: 1; }
  to   { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
`;

// ---------------------------------------------------------------------------
// Pre-join lobby — hero select (T-021)
// ---------------------------------------------------------------------------

const agoLabel = (ts: number) => {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
};

const LabDeckTag = () => (
  <Tag
    size="sm"
    variant="subtle"
    bg="rgba(224,168,46,0.24)"
    color="brand.accent"
    border="1px solid rgba(224,168,46,0.35)"
    borderRadius="999px"
    fontFamily="SpaceGrotesk"
    fontSize="0.58rem"
    fontWeight={700}
    letterSpacing="0.12em"
    textTransform="uppercase"
    px="0.45rem"
    py="0.05rem"
    boxShadow="0 2px 6px rgba(0,0,0,0.35)"
  >
    In the lab
  </Tag>
);

/**
 * The tile-corner lab marker (#768). `LabDeckTag` above spells "In the lab" and
 * is ~9rem wide — on a 5.25rem roster tile it reads as a banner laid across the
 * art, swallowing the name strip on the busiest cards (Boba Fett, Ellen Ripley,
 * Appa). The tile gets this three-letter pill instead; the full tag stays on the
 * splash panel and in HeroPreviewModal where there is room for the words.
 */
const LabCornerPill = () => (
  <Box
    position="absolute"
    top="5px"
    right="5px"
    zIndex={3}
    px="5px"
    py="2px"
    borderRadius="4px"
    bg="rgba(224,168,46,0.92)"
    color="brand.surfaceDim"
    fontFamily="SpaceGrotesk"
    fontSize="8px"
    fontWeight={600}
    letterSpacing="0.08em"
    lineHeight="1"
    pointerEvents="none"
  >
    LAB
  </Box>
);

/**
 * Playtest-tier fighter. The server's own `tier` is authoritative when it sends
 * one; the client deck table is the fallback for servers that predate it (and
 * is what the "In the lab" section is counted from today).
 */
const isLabHero = (hero: HeroListing) =>
  hero.tier === "lab" || !!heroDeckMeta(hero.heroId)?.lab;

// --- roster sorting (#768) --------------------------------------------------

type RosterSort = "az" | "recent" | "newest";
const ROSTER_SORTS: { v: RosterSort; label: string }[] = [
  { v: "az", label: "A\u2013Z" },
  { v: "recent", label: "Recently played" },
  { v: "newest", label: "Newest" },
];

/**
 * "Newest" order. There is no per-deck ship date on the wire or in the deck
 * table, but POPULAR_DECKS is append-ordered — every wire-a-deck ticket pushes
 * its entry onto the end — so a deck's index in it IS its arrival order. A hero
 * with no deck-table row (a server-only listing) has no arrival order and sorts
 * last, then alphabetically.
 */
const DECK_ARRIVAL = new Map(POPULAR_DECKS.map((d, i) => [d.id, i]));
const arrivalOf = (hero: HeroListing) =>
  DECK_ARRIVAL.get(HERO_DECK_IDS[hero.heroId] ?? "") ?? -1;

const byName = (a: HeroListing, b: HeroListing) => a.name.localeCompare(b.name);

/** Order a roster group. A–Z is the default and the tie-break for the others. */
const sortRoster = (
  heroes: HeroListing[],
  sort: RosterSort,
  recentHeroIds: string[],
): HeroListing[] => {
  const list = [...heroes];
  if (sort === "newest") return list.sort((a, b) => arrivalOf(b) - arrivalOf(a) || byName(a, b));
  if (sort === "recent") {
    const rank = (h: HeroListing) => {
      const i = recentHeroIds.indexOf(h.heroId);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return list.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  }
  return list.sort(byName);
};

// --- stage splash preview (#768) --------------------------------------------

/**
 * What the splash panel is previewing while a board tile is hovered/focused.
 * `random` has no board behind it yet (it rolls at create time), so it previews
 * the pool text the tile used to carry as a tooltip.
 */
type StagePreview =
  | { kind: "random"; pool: string }
  | { kind: "board"; entry: MapCatalogEntry };

/**
 * Provenance word for a board, read off the image the catalog already ships:
 * `/maps/legacy-*` are the original Unbrewed boards, `/maps/community-*` the
 * fan battlefields. Anything else stays an unqualified "board" rather than
 * claiming a lineage we can't see.
 */
const boardKindWord = (entry: MapCatalogEntry): string => {
  const url = entry.map.meta.imageUrl ?? entry.thumbnailUrl ?? "";
  if (url.includes("/maps/legacy-")) return "Legacy board";
  if (url.includes("/maps/community-")) return "Community board";
  return "Board";
};

const boardSpaceCount = (entry: MapCatalogEntry) => entry.map.spaces.length;
const boardSeatCount = (entry: MapCatalogEntry) => entry.map.meta.maxPlayers;
const boardHasItemsOn = (entry: MapCatalogEntry) => (entry.map.items?.length ?? 0) > 0;

const skeletonPulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.7; }
`;

// Character-select micro-interactions (issue #301). All three are decorative and
// disabled under prefers-reduced-motion via NO_MOTION below.
const namePop = keyframes`
  0%   { transform: skewX(-4deg) scale(1.14); }
  100% { transform: skewX(-4deg) scale(1); }
`;
const tokenStamp = keyframes`
  0%   { transform: rotate(-8deg) scale(1.9); opacity: 0; }
  100% { transform: rotate(-8deg) scale(1); opacity: 1; }
`;
const createArm = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(1.06); box-shadow: 0 4px 0 #8a6420, 0 0 34px rgba(224,168,46,0.65); }
  100% { transform: scale(1); }
`;

/** Board tiles the setup rail shows inline; the rest live in the popover (#768). */
const RAIL_STAGE_TILES = 3;
/** Tiles in the roster's "Recently played" row (#768) — exactly one row. */
const RECENT_ROSTER_TILES = 4;
/**
 * Roster mosaic columns. Eight across on the desktop rail layout (the redesign
 * mockup's grid); below it the tiles keep their old intrinsic minimum so a
 * phone gets four and a tablet as many as fit.
 */
const ROSTER_GRID_COLUMNS = {
  base: "repeat(auto-fill, minmax(5.25rem, 1fr))",
  lg: "repeat(7, minmax(0, 1fr))",
  xl: "repeat(8, minmax(0, 1fr))",
} as const;

/** Gold selection ring for a locked roster tile (brand.accent = #E0A82E). */
const GOLD_RING = "0 0 0 2px #E0A82E, 0 0 18px rgba(224,168,46,0.4)";
/** Matched mode's P2 token (the partner's pick), teal like the presence pill. */
const P2_TEAL = "#39B7A8";
/** Teal used for the viewer's own team/seat, matching CreateSeats + #195/#201. */
const ALLY_ACCENT = "#39B7A8";

const STRIP_LBL = {
  fontFamily: "SpaceGrotesk",
  fontSize: "0.6rem",
  letterSpacing: "0.16em",
  color: "whiteAlpha.600",
  whiteSpace: "nowrap" as const,
};

const StatPip = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <Flex align="center" gap="0.25rem" fontSize="0.8rem" fontWeight="bold">
    {icon}
    <Text sx={{ fontVariantNumeric: "tabular-nums" }}>{label}</Text>
  </Flex>
);

// --- Character-select building blocks (issue #301) --------------------------

/** the roster's attack-style filter buckets. `melee` also covers LUNGE, mirroring
 *  the tile/splash icon rule (bow = RANGED, sword = everything else). */
type ReachFilter = "all" | "melee" | "ranged";
const reachIsRanged = (reach: HeroListing["reach"]) => reach === "RANGED";
const matchesReachFilter = (hero: HeroListing, f: ReachFilter) =>
  f === "all" || (f === "ranged" ? reachIsRanged(hero.reach) : !reachIsRanged(hero.reach));
const reachWord = (reach: HeroListing["reach"]) =>
  reach === "RANGED" ? "ranged" : reach === "LUNGE" ? "lunge" : "melee";

// icon held as a component (not a JSX element) so nothing renders at module
// scope — the render-fuzz harness imports this file with a classic JSX runtime.
const REACH_FILTERS: { v: ReachFilter; label: string; Icon?: typeof TbSword }[] = [
  { v: "all", label: "All" },
  { v: "melee", label: "Melee", Icon: TbSword },
  { v: "ranged", label: "Ranged", Icon: TbBow },
];

/**
 * One compact roster tile — art + name strip only (per-tile stats/credit/version
 * moved to the splash panel). Hovering/focusing previews it in the splash;
 * clicking locks it (gold ring + a P1 token that stamps in).
 */
const RosterTile = ({
  hero,
  selected,
  onSelect,
  onHover,
  pip,
  last = false,
  partnerPick = null,
}: {
  hero: HeroListing;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
  /** #1542: the host of an open lobby on this hero, as an 18px pip top-right */
  pip?: QuickPlayAvatar;
  /** #1542: the most recent entry in Recently played — a "LAST" badge top-left */
  last?: boolean;
  /** matched mode: the partner has this fighter on their picker — a P2 token top-right */
  partnerPick?: { ready: boolean } | null;
}) => {
  const deck = heroDeckMeta(hero.heroId);
  const cardback = deck?.cardbackUrl;
  return (
    <Box
      as="button"
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      aria-pressed={selected}
      aria-label={deck ? `${hero.name} by ${deck.author}` : hero.name}
      position="relative"
      w="100%"
      sx={{ aspectRatio: "1" }}
      borderRadius="0.5rem"
      overflow="hidden"
      border="1px solid"
      borderColor="blackAlpha.500"
      bg="brand.surface"
      bgImage={cardback ? `url("${cardback}")` : undefined}
      bgSize="cover"
      bgPos="center"
      transition="transform 0.12s ease, box-shadow 0.12s ease"
      boxShadow={selected ? GOLD_RING : "0 2px 5px rgba(0,0,0,0.35)"}
      _hover={{ transform: "scale(1.06)", zIndex: 2, boxShadow: "0 8px 18px rgba(0,0,0,0.55)" }}
      _focusVisible={{ outline: "2px solid", outlineColor: "brand.accent", outlineOffset: "2px" }}
    >
      {selected && (
        <Flex
          position="absolute"
          top="0.3rem"
          left="0.3rem"
          zIndex={3}
          w="1.4rem"
          h="1.4rem"
          borderRadius="50%"
          bg="brand.accent"
          color="brand.surfaceDim"
          align="center"
          justify="center"
          fontFamily="BebasNeueRegular"
          fontSize="0.7rem"
          boxShadow="0 2px 5px rgba(0,0,0,0.5)"
          sx={{ transform: "rotate(-8deg)", animation: `${tokenStamp} 0.22s ease`, ...NO_MOTION }}
        >
          P1
        </Flex>
      )}
      {(deck?.lab || hero.tier === "lab") && <LabCornerPill />}
      {last && !selected && (
        <Box
          as="span"
          data-testid="roster-last"
          position="absolute"
          top="0.3rem"
          left="0.3rem"
          zIndex={3}
          px="0.28rem"
          py="0.1rem"
          borderRadius="3px"
          bg="brand.accent"
          color="brand.surfaceDim"
          fontFamily="SpaceGrotesk"
          fontWeight={600}
          fontSize="0.5rem"
          letterSpacing="0.06em"
          textTransform="uppercase"
        >
          Last
        </Box>
      )}
      {partnerPick && (
        <Flex
          data-testid="roster-p2"
          data-ready={partnerPick.ready || undefined}
          position="absolute"
          top="0.3rem"
          right="0.3rem"
          zIndex={3}
          h="1.4rem"
          minW="1.4rem"
          px={partnerPick.ready ? "0.35rem" : 0}
          borderRadius="999px"
          bg={partnerPick.ready ? "brand.positive" : P2_TEAL}
          color="brand.surfaceDim"
          align="center"
          justify="center"
          gap="0.15rem"
          fontFamily="BebasNeueRegular"
          fontSize="0.7rem"
          boxShadow={partnerPick.ready ? "0 0 0 2px rgba(47,158,104,0.45), 0 0 12px rgba(47,158,104,0.8)" : "0 2px 5px rgba(0,0,0,0.5)"}
          sx={{ transform: "rotate(8deg)", animation: `${tokenStamp} 0.22s ease`, ...NO_MOTION }}
        >
          {`P2${partnerPick.ready ? " ✓" : ""}`}
        </Flex>
      )}
      {pip && !partnerPick && (
        <Box as="span" data-testid="roster-pip" position="absolute" top="0.3rem" right="0.3rem" zIndex={3}>
          <AvatarDisc avatar={pip} size={18} ring="rgba(0,0,0,0.6)" />
        </Box>
      )}
      <Text
        position="absolute"
        left="0"
        right="0"
        bottom="0"
        px="0.3rem"
        pt="0.6rem"
        pb="0.25rem"
        fontFamily="BebasNeueRegular"
        fontSize="0.72rem"
        letterSpacing="0.04em"
        lineHeight="1.1"
        textAlign="center"
        noOfLines={2}
        textShadow="0 1px 3px rgba(0,0,0,0.95)"
        bgGradient="linear(to-t, rgba(10,4,12,0.92), rgba(10,4,12,0))"
      >
        {/* Reflavored/baseline decks (only reachable under ?debug) keep the ★ so
            they read apart from their identically-named spice replacement. */}
        {hero.name}
        {hero.tier === "reflavored" ? " ★" : ""}
      </Text>
    </Box>
  );
};

/**
 * A roster section rule (#768): "BALANCED DECKS · 22", "IN THE LAB · 9 ·
 * playtest tier, balance may change". The count is the section's own, after
 * filtering — so it always agrees with the tiles under it.
 */
const RosterSectionHeading = ({
  label,
  count,
  note,
}: {
  label: string;
  count?: number;
  note?: string;
}) => (
  <Flex align="center" gap="0.5rem" mb="0.4rem">
    <Text
      fontFamily="SpaceGrotesk"
      fontSize="10px"
      letterSpacing="0.16em"
      textTransform="uppercase"
      color="whiteAlpha.600"
      whiteSpace="nowrap"
    >
      {label}
    </Text>
    {count !== undefined && (
      <Text fontSize="10px" color="whiteAlpha.400" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {count}
      </Text>
    )}
    {note && (
      <Text fontSize="10px" color="whiteAlpha.400" fontFamily="SpaceGrotesk" noOfLines={1}>
        · {note}
      </Text>
    )}
    <Box flex="1" h="1px" bg="whiteAlpha.200" />
  </Flex>
);

/**
 * The "🎲 Random" roster tile (#697) — the fighter-side twin of the Random
 * stage tile, and dashed for the same reason: it is a promise, not a picture.
 * Nothing is chosen until Create/Join, where `resolveHeroPick` rolls over the
 * fighters this grid is currently showing (so the reach filter and the search
 * box narrow the roll). With every fighter filtered away there is nothing to
 * roll, and the tile goes disabled rather than silently doing nothing.
 */
const RandomRosterTile = ({
  selected,
  disabled,
  poolSize,
  onSelect,
  onHover,
}: {
  selected: boolean;
  disabled: boolean;
  /** how many fighters the roll would draw from right now — shown in the tooltip */
  poolSize: number;
  onSelect: () => void;
  onHover: () => void;
}) => (
  <Box
    as="button"
    type="button"
    onClick={disabled ? undefined : onSelect}
    onMouseEnter={onHover}
    onFocus={onHover}
    disabled={disabled}
    aria-pressed={selected}
    aria-label="Random fighter — rolled when the game starts"
    title={
      disabled
        ? "No fighters match — clear the search or filter"
        : `Rolled when the game starts, from the ${poolSize} fighter${poolSize === 1 ? "" : "s"} shown`
    }
    position="relative"
    w="100%"
    sx={{ aspectRatio: "1", ...NO_MOTION }}
    borderRadius="0.5rem"
    overflow="hidden"
    border="1px dashed"
    borderColor={selected ? "brand.accent" : "whiteAlpha.300"}
    bg="rgba(0,0,0,0.18)"
    display="flex"
    flexDirection="column"
    alignItems="center"
    justifyContent="center"
    gap="0.15rem"
    cursor={disabled ? "not-allowed" : "pointer"}
    opacity={disabled ? 0.35 : 1}
    transition="transform 0.12s ease, box-shadow 0.12s ease, border-color 0.15s"
    boxShadow={selected ? GOLD_RING : undefined}
    _hover={disabled ? undefined : { transform: "scale(1.06)", zIndex: 2, borderColor: "whiteAlpha.500" }}
    _focusVisible={{ outline: "2px solid", outlineColor: "brand.accent", outlineOffset: "2px" }}
  >
    <Text fontSize="1.5rem" lineHeight="1" aria-hidden>
      🎲
    </Text>
    <Text
      fontFamily="BebasNeueRegular"
      fontSize="0.72rem"
      letterSpacing="0.04em"
      lineHeight="1.1"
      textAlign="center"
    >
      Random
    </Text>
  </Box>
);

/**
 * The splash body for a hovered STAGE tile (#768) — the board's own answer to
 * the fighter splash: art behind, "click to lock in" above the title, and the
 * three facts a creator actually picks a board on (kind + size, seats, whether
 * it prints items). The Random tile has no board yet, so it shows the pool it
 * will roll from — the text that used to hide in a `title` tooltip.
 */
const StageSplashBody = ({
  stage,
  onViewBoard,
  viewBoardRef,
}: {
  stage: StagePreview;
  onViewBoard?: () => void;
  /**
   * The rail hands keyboard focus here when Tab walks off the end of the stage
   * row (#781) — the button is in the splash, which precedes the row in the
   * DOM, so forward Tab would otherwise skip the only way into the map preview.
   */
  viewBoardRef?: RefObject<HTMLButtonElement>;
}) => {
  const entry = stage.kind === "board" ? stage.entry : undefined;
  return (
    <Flex
      position="relative"
      direction="column"
      mt="auto"
      p={{ base: "0.85rem", lg: "0 1rem 0.875rem" }}
      gap="4px"
      w="100%"
      minW="0"
    >
      <Text
        fontFamily="SpaceGrotesk"
        fontSize="0.62rem"
        letterSpacing="0.16em"
        color="brand.accent"
      >
        PREVIEW — CLICK TO LOCK IN
      </Text>
      <Text
        key={entry?.id ?? "random"}
        fontFamily="LeagueGothic"
        fontSize={{ base: "1.5rem", lg: "2.125rem" }}
        lineHeight="1"
        noOfLines={2}
        sx={{
          transform: "skewX(-4deg)",
          transformOrigin: "left",
          animation: `${namePop} 0.28s ease`,
          ...NO_MOTION,
        }}
      >
        {entry ? entry.title : "Random board"}
      </Text>
      <Text fontSize="0.75rem" fontStyle="italic" color="rgba(250,235,215,0.8)" noOfLines={2}>
        {entry
          ? `${boardKindWord(entry)} · ${boardSpaceCount(entry)} spaces · ${boardSeatCount(entry)} players`
          : `Rolled when the room is created: ${stage.kind === "random" ? stage.pool : ""}`}
      </Text>
      {entry && (
        <Flex gap="0.875rem" mt="6px" align="center" fontSize="0.8rem" fontWeight={600}>
          <Flex align="center" gap="5px">
            <TbUsers size="14px" aria-hidden />
            <Text>
              {boardSeatCount(entry)} seat{boardSeatCount(entry) === 1 ? "" : "s"}
            </Text>
          </Flex>
          {boardHasItemsOn(entry) && (
            <Flex
              align="center"
              gap="4px"
              color="brand.accent"
              title="This board prints battlefield items — the creator can switch them off"
            >
              🎁 items
            </Flex>
          )}
          <Box flex="1" minW="0" />
          {onViewBoard && (
            <Button
              ref={viewBoardRef}
              type="button"
              onClick={onViewBoard}
              display={{ base: "none", lg: "inline-flex" }}
              size="xs"
              h="auto"
              py="4px"
              px="9px"
              fontSize="0.7rem"
              fontFamily="SpaceGrotesk"
              variant="outline"
              leftIcon={<TbZoomIn />}
              bg="transparent"
              borderColor="whiteAlpha.400"
              color="brand.parchment"
              _hover={{ borderColor: "brand.accent", color: "brand.accent" }}
            >
              View board
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
};

/**
 * The left splash panel. Shows the hovered fighter live (preview state), reverts
 * to the locked pick on mouse-leave, and carries all the per-fighter info the
 * tiles no longer do: big name, author credit, stats and the deck-preview link
 * (which shares the stat row). Collapses to a short wide banner under `lg`.
 *
 * The rules-freeze date the panel used to print moved out with the #768
 * redesign: it is still on the /pro landing tile and in the bag's deck list,
 * and the rail has 300px for the whole panel.
 */
const SplashPanel = ({
  hero,
  locked,
  onViewDeck,
  stage,
  onViewBoard,
  viewBoardRef,
}: {
  hero: HeroListing | undefined;
  /** true → showing the committed pick ("P1 · locked in"); false → live preview */
  locked: boolean;
  onViewDeck: () => void;
  /**
   * A hovered/focused STAGE tile (#768). When present it takes the panel over
   * from the fighter for as long as the pointer is on the tile — boards get the
   * same "preview here, click to lock in" treatment fighters have had since
   * #301, which is what let the per-tile magnifiers go.
   */
  stage?: StagePreview;
  onViewBoard?: () => void;
  viewBoardRef?: RefObject<HTMLButtonElement>;
}) => {
  const deck = hero ? heroDeckMeta(hero.heroId) : undefined;
  const cardback = deck?.cardbackUrl;
  const stageArt = stage?.kind === "board" ? stage.entry.thumbnailUrl : undefined;
  const art = stage ? stageArt : cardback;
  return (
    <Flex
      direction={{ base: "row", lg: "column" }}
      position="relative"
      borderRadius="0.9rem"
      overflow="hidden"
      data-testid="pro-splash"
      // Sized for the rail (#768): 19rem when the viewport has the room, shrinking
      // to 13rem when it doesn't, so the seats + Create block below always clears
      // the fold. On mobile it is the short wide banner it has always been.
      minH={{ base: "9rem", lg: "13rem" }}
      h={{ lg: "19rem" }}
      maxH={{ lg: "19rem" }}
      flex={{ lg: "0 1 auto" }}
      border="1px solid"
      borderColor={stage ? "brand.accent" : "whiteAlpha.200"}
      bg="brand.surfaceDim"
      boxShadow="0 14px 34px rgba(0,0,0,0.5)"
    >
      {art && (
        <Box
          position="absolute"
          inset="0"
          bgImage={`url("${art}")`}
          bgSize="cover"
          // Cardbacks put the face in the upper third; board photographs are
          // centre-weighted.
          bgPos={stage ? "center" : "center 30%"}
        />
      )}
      {/* Board art is busier than a hero cardback (a photograph of a board
          covered in coloured discs), so a stage preview gets the heavier scrim. */}
      <Box
        position="absolute"
        inset="0"
        bg={
          stage
            ? "linear-gradient(180deg, rgba(20,9,24,0) 40%, rgba(20,9,24,0.94) 100%)"
            : "linear-gradient(180deg, rgba(20,9,24,0) 35%, rgba(20,9,24,0.92) 100%)"
        }
      />
      {stage ? (
        <StageSplashBody stage={stage} onViewBoard={onViewBoard} viewBoardRef={viewBoardRef} />
      ) : !hero ? (
        <Flex
          position="relative"
          flex="1"
          direction="column"
          align="center"
          justify="center"
          textAlign="center"
          color="brand.parchment"
          opacity={0.6}
          p="1.5rem"
          gap="0.5rem"
        >
          <Box fontSize="2.4rem" opacity={0.5}>
            <TbSword />
          </Box>
          {/* Touch screens have no hover (journeys polish, #1279): the
              CSS media query picks the copy, so SSR and jsdom agree. */}
          <Text fontSize="0.85rem" sx={{ "@media (hover: none)": { display: "none" } }} data-testid="splash-hint-mouse">
            Hover a fighter to preview.
            <br />
            Click to lock in.
          </Text>
          <Text fontSize="0.85rem" display="none" sx={{ "@media (hover: none)": { display: "block" } }} data-testid="splash-hint-touch">
            Tap a fighter to preview it and lock it in.
          </Text>
        </Flex>
      ) : (
        <Flex
          position="relative"
          direction="column"
          mt="auto"
          p={{ base: "0.85rem", lg: "0 1rem 0.875rem" }}
          gap="4px"
          w="100%"
          minW="0"
        >
          <Text
            fontFamily="SpaceGrotesk"
            fontSize="0.62rem"
            letterSpacing="0.16em"
            color={locked ? "brand.accent" : "whiteAlpha.600"}
          >
            {locked ? "P1 · LOCKED IN" : "PREVIEW — CLICK TO LOCK IN"}
          </Text>
          <Text
            key={hero.heroId}
            fontFamily="LeagueGothic"
            fontSize={{ base: "1.5rem", lg: "2.125rem" }}
            lineHeight="1"
            noOfLines={2}
            sx={{
              transform: "skewX(-4deg)",
              transformOrigin: "left",
              animation: `${namePop} 0.28s ease`,
              ...NO_MOTION,
            }}
          >
            {hero.name}
            {hero.tier === "reflavored" ? " ★" : ""}
          </Text>
          {deck?.lab && (
            <Flex mt="0.25rem">
              <LabDeckTag />
            </Flex>
          )}
          {deck && <DeckAttribution deck={deck} />}
          {/* Stats and "View deck" share one line (the mockup's splash foot):
              the rail has 300px of height for the whole panel, and the deck
              link is a garnish on the stat row, not a block of its own. */}
          <Flex
            gap="0.875rem"
            mt="6px"
            align="center"
            color="brand.parchment"
            fontSize="0.875rem"
            fontWeight={600}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            <StatPip icon={<GiHearts color="#C0392B" size="15px" />} label={String(hero.hp)} />
            <StatPip icon={<GiFootprint size="14px" />} label={String(hero.move)} />
            <Flex align="center" gap="0.3rem">
              {reachIsRanged(hero.reach) ? <TbBow size="15px" /> : <TbSword size="15px" />}
              <Text>{reachWord(hero.reach)}</Text>
            </Flex>
            <Box flex="1" minW="0" />
            <Button
              type="button"
              onClick={onViewDeck}
              display={{ base: "none", lg: "inline-flex" }}
              size="xs"
              h="auto"
              py="4px"
              px="9px"
              fontSize="0.7rem"
              fontFamily="SpaceGrotesk"
              fontWeight={600}
              variant="outline"
              leftIcon={<TbInfoCircle />}
              bg="transparent"
              borderColor="whiteAlpha.400"
              color="brand.parchment"
              _hover={{ borderColor: "brand.accent", color: "brand.accent" }}
            >
              View deck
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  );
};

/**
 * One board tile in the stage row / board popover (#768).
 *
 * Hover or focus previews the board in the splash panel (`onHover`), which is
 * what replaced the per-tile magnifier button: the inspect affordance moved to
 * the splash's "View board", so the tile is a single, whole click target again
 * and the art is never covered by a control.
 *
 * The tile deliberately does NOT tear the preview down on mouse-leave (#781).
 * "View board" lives in the splash, several hundred pixels of dead grid away,
 * so a per-tile `onMouseLeave` unmounted the button while the pointer was still
 * travelling towards it. Clearing is the rail's job now — see
 * `clearStagePreview` in the picker — and the tile only reports a blur, which
 * the rail ignores while focus is still somewhere inside it.
 */
const StageTile = ({
  ariaLabel,
  title,
  thumbnailUrl,
  glyph,
  selected,
  dashed,
  onSelect,
  onHover,
  onBlurAway,
}: {
  ariaLabel: string;
  title: string;
  /** board art; omitted for the Random / Custom tiles, which show `glyph` */
  thumbnailUrl?: string;
  glyph?: string;
  selected: boolean;
  dashed?: boolean;
  onSelect: () => void;
  onHover?: () => void;
  /** blur handler; the rail decides from `relatedTarget` whether to clear */
  onBlurAway?: (e: ReactFocusEvent<HTMLElement>) => void;
}) => (
  <Box
    as="button"
    type="button"
    onClick={onSelect}
    onMouseEnter={onHover}
    onFocus={onHover}
    onBlur={onBlurAway}
    aria-pressed={selected}
    aria-label={ariaLabel}
    position="relative"
    w="100%"
    borderRadius="8px"
    overflow="hidden"
    border={dashed ? "1px dashed" : "1px solid"}
    borderColor={selected ? "brand.accent" : "whiteAlpha.300"}
    boxShadow={selected ? "0 0 0 1px #E0A82E" : undefined}
    bg="rgba(0,0,0,0.18)"
    cursor="pointer"
    transition="border-color 0.15s, transform 0.12s ease, box-shadow 0.12s ease"
    _hover={{
      borderColor: "brand.accent",
      transform: "scale(1.06)",
      zIndex: 2,
      boxShadow: "0 0 0 2px #E0A82E, 0 8px 18px rgba(0,0,0,0.55)",
    }}
    _focusVisible={{ outline: "2px solid", outlineColor: "brand.accent", outlineOffset: "2px" }}
  >
    {thumbnailUrl ? (
      <Box
        h="56px"
        bgImage={`url("${thumbnailUrl}")`}
        bgSize="cover"
        bgPosition="center"
        bgColor="rgba(0,0,0,0.4)"
      />
    ) : (
      <Flex h="56px" align="center" justify="center" fontSize="1.5rem" color="whiteAlpha.700" aria-hidden>
        {glyph}
      </Flex>
    )}
    <Text
      fontFamily="SpaceGrotesk"
      fontSize="9px"
      letterSpacing="0.05em"
      textTransform="uppercase"
      textAlign="center"
      px="3px"
      py="4px"
      lineHeight="1.25"
      minH="22px"
      noOfLines={2}
    >
      {title}
    </Text>
  </Box>
);

/** A generic gold/ghost segmented control (aria-pressed, keyboard-operable). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <Flex gap="0.3rem" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Button
            key={o.value}
            type="button"
            size="xs"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            fontFamily="SpaceGrotesk"
            fontWeight={active ? "bold" : "normal"}
            bg={active ? "brand.accent" : "rgba(0,0,0,0.25)"}
            color={active ? "brand.surfaceDim" : "brand.parchment"}
            border="1px solid"
            borderColor={active ? "brand.accent" : "whiteAlpha.200"}
            _hover={{ bg: active ? "brand.accentDeep" : "whiteAlpha.100", borderColor: active ? "brand.accentDeep" : "whiteAlpha.400" }}
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {o.label}
          </Button>
        );
      })}
    </Flex>
  );
}


/** One chip: "Hum" plus whichever bot tiers THIS SERVER offers for the picked
 *  heroes. The bot tiers are never hardcoded here — see lib/pro/botTiers.ts. */
type SeatChip = {
  v: OpponentChoice;
  label: string;
  badge?: string;
  tooltip?: string;
  /** Offered but not yet earned (#933) — rendered, never selectable. */
  locked?: boolean;
  lockHint?: string;
  fullName?: string;
};
const seatChips = (tiers: BotTierChoice[]): SeatChip[] => [
  { v: "human", label: "Hum" },
  ...tiers.map((t) => ({
    v: t.id as OpponentChoice,
    label: t.chip,
    badge: t.badge,
    tooltip: t.tooltip,
    locked: t.locked,
    lockHint: t.lockHint,
    fullName: t.fullName,
  })),
];

/** Fail-closed default when no unlock progress is passed down (#933). */
const LOCKED_TIER_UNLOCK: TierUnlockProgress = tierUnlockProgress("loading", null);

/** The pre-roster strip: the always-available tiers, never an empty picker. */
const FALLBACK_SEAT_CHIPS = seatChips(botTierChoices(null, []));

const PlateChips = ({
  value,
  onChange,
  chips,
}: {
  value: OpponentChoice;
  onChange: (v: OpponentChoice) => void;
  chips: SeatChip[];
}) => (
  <Flex gap="0.25rem" mt="0.3rem" flexWrap="wrap">
    {chips.map((c) => {
      const active = value === c.v;
      // A locked tier (#933) stays focusable and hoverable so its hint shows —
      // aria-disabled + a no-op click, NOT isDisabled: Chakra tooltips never fire
      // on a disabled button.
      const locked = !!c.locked;
      const tip = tierTooltip(c);
      const btn = (
        <Button
          key={c.v}
          type="button"
          size="xs"
          aria-pressed={active}
          aria-disabled={locked || undefined}
          aria-label={locked && tip ? `${c.label} (locked): ${tip.replace(/\n/g, " · ")}` : undefined}
          data-locked={locked || undefined}
          data-testid={`seat-chip-${c.v}`}
          h="1.3rem"
          minW="auto"
          px="0.45rem"
          fontSize="0.62rem"
          fontFamily="SpaceGrotesk"
          onClick={locked ? undefined : () => onChange(c.v)}
          bg={active ? "brand.accent" : "rgba(0,0,0,0.3)"}
          color={active ? "brand.surfaceDim" : "brand.parchment"}
          border="1px solid"
          borderColor={active ? "brand.accent" : "whiteAlpha.200"}
          opacity={locked ? 0.5 : undefined}
          cursor={locked ? "not-allowed" : undefined}
          _hover={{ borderColor: active ? "brand.accentDeep" : locked ? "whiteAlpha.200" : "whiteAlpha.400" }}
        >
          {locked && <LockIcon boxSize="0.55rem" mr="0.25rem" aria-hidden />}
          {c.label}
          {c.badge && (
            <Text as="span" ml="0.25rem" fontSize="0.5rem" letterSpacing="0.05em" opacity={0.85} textTransform="uppercase">
              {c.badge}
            </Text>
          )}
        </Button>
      );
      return tip ? (
        <Tooltip key={c.v} label={tip} openDelay={locked ? 0 : 200} fontSize="0.7rem" whiteSpace="pre-line">
          {btn}
        </Tooltip>
      ) : (
        btn
      );
    })}
  </Flex>
);

/**
 * One player plate in the bottom row. The angled/skewed styling gives the
 * fighting-game feel; the P1 (you) plate shows your locked fighter, every other
 * seat carries its own Human/AI chips.
 */
/** A duel P2 plate driven by Quick Match (#1542) instead of the Human/AI chips. */
interface SeatPlateStatus {
  /** the plate's role line: "Opponent", or the matched player's name */
  role: string;
  /** "Searching…" while the search runs; the opponent's fighter once it lands */
  title: string;
  found: boolean;
}

const SeatPlate = ({
  tag,
  role,
  you,
  heroName,
  occupant,
  onChange,
  teamAccent,
  chips,
  footer,
  status,
}: {
  tag: string;
  role?: string;
  you?: boolean;
  heroName?: string | null;
  occupant?: OpponentChoice;
  onChange?: (v: OpponentChoice) => void;
  teamAccent?: boolean;
  /** Who-fills-this-seat chips, built from the server's advertised bot tiers. */
  chips?: SeatChip[];
  /** extra content inside the plate — the duel AI-hero picker folds in here */
  footer?: ReactNode;
  /** Quick Match (#1542): name the seat's state instead of offering chips */
  status?: SeatPlateStatus;
}) => {
  const isAi = !!occupant && occupant !== "human";
  return (
    <Flex
      // Rail plate (#768): 320px has to hold P1 · VS · P2, so the plate is a
      // column that shrinks to nothing rather than the wide skewed card #301
      // put in the page-wide bar. Tinted by role — gold for your seat, purple
      // for everyone else's.
      direction="column"
      gap="6px"
      flex="1 1 0"
      minW="0"
      borderRadius="8px"
      border="1px solid"
      borderColor={
        you ? "rgba(224,168,46,0.35)" : teamAccent ? ALLY_ACCENT : "rgba(255,255,255,0.12)"
      }
      bg={you ? "rgba(224,168,46,0.08)" : "rgba(122,80,180,0.14)"}
      p="8px 10px"
      overflow="hidden"
    >
      <Text
        fontFamily="SpaceGrotesk"
        fontSize="10px"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color={you ? "brand.accent" : "whiteAlpha.600"}
        noOfLines={1}
      >
        {`${tag}${role ? ` · ${role}` : ""}`}
      </Text>
      {/* Only your own seat names a fighter; every other seat is described by
          its chips (which one is lit says human / which bot tier). */}
      {you && (
        <Text fontFamily="BebasNeueRegular" fontSize="16px" letterSpacing="0.03em" noOfLines={1}>
          {heroName ?? "Pick a fighter"}
        </Text>
      )}
      {status && (
        <Text
          data-testid="p2-plate-status"
          data-found={status.found ? "true" : "false"}
          fontFamily="BebasNeueRegular"
          fontSize="16px"
          letterSpacing="0.03em"
          noOfLines={1}
          color={status.found ? ALLY_ACCENT : "whiteAlpha.700"}
        >
          {status.title}
        </Text>
      )}
      {!you && !status && onChange && (
        <PlateChips value={occupant ?? "human"} onChange={onChange} chips={chips ?? FALLBACK_SEAT_CHIPS} />
      )}
      {footer}
    </Flex>
  );
};

const VsBadge = () => (
  <Flex
    align="center"
    alignSelf="center"
    px="0.1rem"
    color="whiteAlpha.500"
    fontFamily="LeagueGothic"
    fontSize="1rem"
    letterSpacing="0.08em"
  >
    VS
  </Flex>
);

const SkeletonTile = () => (
  <Box
    w="100%"
    sx={{ aspectRatio: "63 / 88" }}
    borderRadius="0.6rem"
    border="2px solid"
    borderColor="whiteAlpha.200"
    bg="whiteAlpha.100"
    animation={`${skeletonPulse} 1.3s ease-in-out infinite`}
  />
);

/**
 * The create/join screen — a video-game character-select (issue #301). A quiet
 * rules strip (format + timer + rejoin chips) sits above a splash panel + dense
 * roster mosaic + stage row; the room assembles in the player-plates row at the
 * bottom where Create lives. While the roster hasn't arrived (`heroes === null`)
 * the mosaic shows skeletons — or, if the creator arrived with a valid `?hero=`,
 * that hero as a preselected tile so they can Create the instant the socket opens.
 */
const HeroSelectLobby = ({
  room,
  status,
  heroes,
  heroParam,
  selectedHeroId,
  opponent,
  selectedFormat,
  onSelectFormat,
  onSelectOpponent,
  onSelectHero,
  aiHeroId,
  onSelectAiHero,
  botSlotPlan,
  onChangeBotSlot,
  turnTimerSeconds,
  onSelectTurnTimer,
  mulligan,
  onSelectMulligan,
  itemsEnabled,
  onSelectItemsEnabled,
  onConfirm,
  onQuickMatch,
  quickMatchArmed,
  customMapJson,
  onCustomMapJsonChange,
  selectedMapId,
  onSelectMap,
  mapError,
  recentRooms,
  onResumeRoom,
  tierUnlock,
  tournament = null,
  presencePill = null,
  ribbon = null,
  quickMatchSubline = null,
  quickMatchBonusLabel = null,
  bonusSummary = null,
  heroPips,
  dockPanel = null,
  p1HeroName,
  p2Status = null,
  pairMode = null,
}: {
  room: string | null;
  /**
   * A tournament game whose hero is the player's choice (#1218): the room's
   * setup (board, format, no bots) comes from the match's ticket, so the lobby
   * shows the hero pick only — like a `?room=` join.
   */
  tournament?: { label: string } | null;
  status: ProConnectionStatus;
  heroes: HeroListing[] | null;
  heroParam: string | null;
  selectedHeroId: string | null;
  opponent: OpponentChoice;
  selectedFormat: ProFormatId;
  onSelectFormat: (format: ProFormatId) => void;
  onSelectOpponent: (o: OpponentChoice) => void;
  onSelectHero: (heroId: string) => void;
  /** the specific hero the AI should play, or null to let the server pick at random */
  aiHeroId: string | null;
  onSelectAiHero: (heroId: string | null) => void;
  botSlotPlan: BotSlotPlan;
  onChangeBotSlot: (player: PlayerId, occupant: SlotOccupant) => void;
  /** per-decision move timer in seconds (issue #223); 0 = off (create flow only) */
  turnTimerSeconds: number;
  onSelectTurnTimer: (seconds: number) => void;
  /** opening-hand mulligan for this room (engine #395); true = on (create flow only) */
  mulligan: boolean;
  onSelectMulligan: (on: boolean) => void;
  /**
   * battlefield items for this room's map (engine #519, issue #725); true = on.
   * Create flow only, and only meaningful when the chosen board carries items —
   * the chip (and the wire field) are gated on `mapHasItems` below.
   */
  itemsEnabled: boolean;
  onSelectItemsEnabled: (on: boolean) => void;
  /** commit the room with this CONCRETE hero id — a Random pick is already rolled */
  onConfirm: (heroId: string) => void;
  /** Quick Match (#687), create flow only: find a game instead of configuring one. */
  onQuickMatch?: (heroId: string) => void;
  /** arrived from the landing's Quick Match CTA (`?quick=1`) — highlight it */
  quickMatchArmed?: boolean;
  /** raw custom-map JSON (create flow only) — persisted in the parent */
  customMapJson: string;
  onCustomMapJsonChange: (json: string) => void;
  /** chosen board: a MAP_CATALOG id, or CUSTOM_MAP_ID for the paste-JSON option */
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  /** local parse error or the server's BAD_MAP message, shown inline */
  mapError: string | null;
  /** recent matches this browser was seated in — "rejoin" chips in the strip */
  recentRooms: RecentRoom[];
  onResumeRoom: (roomId: string) => void;
  /** the player's progress toward gated bot tiers (#933); absent = everything locked */
  tierUnlock?: TierUnlockProgress;
  // ----- Quick Play lobby (#1542) — every one optional; absent renders today's picker -----
  /** the presence pill at the right end of the rules strip */
  presencePill?: ReactNode;
  /** the "Here now" ribbon between the roster header and the tiles */
  ribbon?: ReactNode;
  /** the Quick Match button's second line ("3 waiting right now") */
  quickMatchSubline?: string | null;
  /** "2×" while the Quick Play bonus runs: the button's tag (and armed style) */
  quickMatchBonusLabel?: string | null;
  /** "2×" while the bonus runs: the summary's second line ("Quick Match pays 2× XP · Create room is 1×") */
  bonusSummary?: string | null;
  /** hero id → host avatar of an open lobby holding that hero (roster pips) */
  heroPips?: ReadonlyMap<string, QuickPlayAvatar>;
  /** replaces Create + Quick Match (and the summary) while a search runs or lands */
  dockPanel?: ReactNode;
  /** the P1 plate's fighter while a search runs (the hero the search committed) */
  p1HeroName?: string | null;
  /** the duel P2 plate while a search runs ("Searching…") or lands (the opponent) */
  p2Status?: SeatPlateStatus | null;
  /**
   * Matched mode (#1556): a 👋 was accepted. The partner card takes the header,
   * Go / Cancel take Create / Quick Match, and every setup control `fixedSetup`
   * hides goes too — the room is a standard Quick Match duel.
   */
  pairMode?: {
    partner: PartnerModel;
    /** host picks the board (its Go opens the room); the guest sees whose pick it is */
    role: "host" | "guest";
    /** guest pressed Go and waits for the host's room */
    waiting: boolean;
    bonusLabel: string | null;
    onGo: (heroId: string) => void;
    onCancel: () => void;
  } | null;
}) => {
  // A `?room=` join and a tournament game both arrive with the room's setup
  // decided elsewhere: only the fighter is picked here. So does a pair (#1556).
  const fixedSetup = room !== null || tournament !== null || pairMode !== null;
  // Matched mode keeps ONE setup control: the host's board (its Go opens the room).
  const showStage = !fixedSetup || pairMode?.role === "host";
  // While the list is loading, a valid-looking `?hero=` stands in so the
  // creator isn't blocked; once the list arrives the real selection takes over.
  const effective = selectedHeroId ?? (heroes === null ? heroParam : null);
  const format = formatChoice(selectedFormat);
  const multiplayer = selectedFormat !== "duel";
  const [previewHero, setPreviewHero] = useState<HeroListing>();
  const [previewMap, setPreviewMap] = useState<MapCatalogEntry | null>(null);

  // Roster browse state: the hovered fighter drives the splash live and reverts
  // to the locked pick on mouse-leave; search + reach filter narrow the mosaic.
  const [hoverHero, setHoverHero] = useState<HeroListing>();
  const [search, setSearch] = useState("");
  const [reachFilter, setReachFilter] = useState<ReachFilter>("all");
  // #768 roster controls: the LAB chip narrows to playtest-tier fighters, the
  // sort menu reorders every section, and the stage popover / stage hover drive
  // the rail's board row and the splash respectively.
  const [labOnly, setLabOnly] = useState(false);
  const [rosterSort, setRosterSort] = useState<RosterSort>("az");
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [stageHover, setStageHover] = useState<StagePreview>();
  // #781: the board preview is sticky across the WHOLE rail, not per tile. The
  // only way into the full-map modal is "View board" inside the splash, so the
  // preview has to outlive the trip from a tile to that button — it is torn
  // down when the pointer/focus reaches somewhere that is plainly not the
  // preview (the roster, the seats block, or off the setup grid entirely).
  const splashRef = useRef<HTMLDivElement>(null);
  const stageRowRef = useRef<HTMLDivElement>(null);
  const boardPickerRef = useRef<HTMLDivElement>(null);
  const viewBoardRef = useRef<HTMLButtonElement>(null);
  const clearStagePreview = () => setStageHover(undefined);
  /** true while `related` is still inside the splash / stage row / popover */
  const insideStageRegion = (related: EventTarget | null) => {
    if (!(related instanceof Node)) return false;
    return [splashRef, stageRowRef, boardPickerRef].some((r) => !!r.current?.contains(related));
  };
  /**
   * Keyboard mirror of the sticky hover: Tab off a tile towards "View board"
   * fires the tile's blur first, and clearing there unmounted the button before
   * focus could land on it.
   */
  const onStageTileBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!insideStageRegion(e.relatedTarget)) clearStagePreview();
  };
  /**
   * The splash sits BEFORE the stage row in the DOM (it is above it on screen),
   * so Shift+Tab out of the row already walks back to "View board"; forward Tab
   * off the end of the row would sail past the splash entirely. Hand it over
   * instead — but only from the last tile, so Tab still steps through the row.
   */
  const handoffTabToViewBoard = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    const tiles = e.currentTarget.querySelectorAll("button");
    if (e.target !== tiles[tiles.length - 1]) return;
    viewBoardRef.current?.focus();
    if (document.activeElement === viewBoardRef.current) e.preventDefault();
  };
  // Recently-played fighters (localStorage, this browser only). Read after mount
  // so a static export's HTML and the first client render still match.
  const [recentHeroIds, setRecentHeroIds] = useState<string[]>([]);
  useEffect(() => setRecentHeroIds(listRecentHeroes()), []);
  // The roster's bottom fade is a scroll HINT, so it only appears when there is
  // actually something below the fold — with a short catalog (or a narrow
  // filter) the region doesn't scroll and a fade would just be a smudge.
  const rosterRef = useRef<HTMLDivElement>(null);
  const [rosterScrolls, setRosterScrolls] = useState(false);

  // Timer chips: "Off" is the first chip (the on/off toggle is gone); "…" opens
  // an inline seconds field for any value in the engine's 10–300 range. Seeded
  // open when we arrive on a non-preset custom value.
  const [customTimerOpen, setCustomTimerOpen] = useState(
    () => turnTimerSeconds > 0 && !TURN_TIMER_STRIP_PRESETS.includes(turnTimerSeconds as never)
  );

  // The Random tile (#697) is a selection without a fighter behind it: nothing
  // is rolled until Create/Join, so there is no locked hero to splash or to ask
  // bot tiers about — only a name for the summary line.
  const randomPicked = effective === RANDOM_HERO_ID;
  const lockedHero = randomPicked ? undefined : heroes?.find((h) => h.heroId === effective);
  const lockedName = randomPicked
    ? "Random fighter 🎲"
    : lockedHero?.name ?? (effective ? prettyHeroId(effective) : null);
  // The bot tiers this server offers for the heroes THIS room names — the
  // creator's pick and, in a duel, the AI's named hero. Derived from the live
  // listing every render, so switching fighter swaps the strip immediately; a
  // server that advertises nothing (old, or the tier switched off) yields the
  // unchanged easy/medium/hard set. See lib/pro/botTiers.ts.
  // A Random pick contributes no hero to the tier query (it isn't one yet), so
  // the strip falls back to the server's unnarrowed set until it resolves.
  // Gated tiers (#933) still render, but locked until the player has earned them.
  const seatChipStrip = seatChips(
    applyTierLocks(
      botTierChoices(heroes, [
        randomPicked ? null : effective,
        selectedFormat === "duel" ? aiHeroId : null,
      ]),
      tierUnlock ?? LOCKED_TIER_UNLOCK,
    ),
  );
  // Splash shows the hover preview, else the locked pick. Hovering your own
  // locked tile keeps the "locked" wording (matches the mockup).
  const splashHero = hoverHero ?? lockedHero;
  const splashLocked =
    !!splashHero && (!hoverHero || (!!lockedHero && hoverHero.heroId === lockedHero.heroId));

  const visibleHeroes = (heroes ?? []).filter((h) => {
    if (!matchesReachFilter(h, reachFilter)) return false;
    if (labOnly && !isLabHero(h)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const author = heroDeckMeta(h.heroId)?.author ?? "";
    return h.name.toLowerCase().includes(q) || author.toLowerCase().includes(q);
  });

  // The three roster sections (#768). They partition the SAME `visibleHeroes`
  // the Random tile rolls over, so search / reach / LAB narrow all of them at
  // once and the roll pool never disagrees with what is on screen.
  const sortedVisible = sortRoster(visibleHeroes, rosterSort, recentHeroIds);
  const labHeroes = sortedVisible.filter(isLabHero);
  const balancedHeroes = sortedVisible.filter((h) => !isLabHero(h));
  // Recently played: this browser's own history, newest first, capped at one
  // row. Fighters that fell out of the roster (or the current filter) simply
  // don't appear — the row is a shortcut, never a second source of truth.
  const recentHeroes = recentHeroIds
    .map((id) => visibleHeroes.find((h) => h.heroId === id))
    .filter((h): h is HeroListing => !!h)
    .slice(0, RECENT_ROSTER_TILES);

  // A Random pick with everything filtered away has nothing to roll, so it can't
  // confirm — the same state that greys the tile greys Create/Quick Match.
  const canConfirm =
    status === "open" && !!effective && !(randomPicked && visibleHeroes.length === 0);

  useEffect(() => {
    const el = rosterRef.current;
    if (!el) return;
    const update = () => setRosterScrolls(el.scrollHeight - el.clientHeight > 8);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Escape closes the board popover — it covers the roster, so there has to be
  // a keyboard way out that isn't "tab to the ✕".
  useEffect(() => {
    if (!stagePickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStagePickerOpen(false);
        setStageHover(undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stagePickerOpen]);

  // READY-TO-FIGHT pulse: fire the create button's gold pulse once, on the
  // transition from disabled → enabled (the moment a fighter is first locked).
  const [armed, setArmed] = useState(false);
  const wasConfirmable = useRef(false);
  useEffect(() => {
    if (canConfirm && !wasConfirmable.current) {
      setArmed(true);
      const t = setTimeout(() => setArmed(false), 500);
      wasConfirmable.current = canConfirm;
      return () => clearTimeout(t);
    }
    wasConfirmable.current = canConfirm;
  }, [canConfirm]);

  // Boards the Random tile can land on for the current format. Since #768 this
  // is splash copy, not a tooltip: hovering Random previews the pool it rolls
  // from, so "Random" is never a black box (#685).
  const randomPoolTitles = randomMapPool(selectedFormat)
    .map((e) => e.title)
    .join(", ");
  const randomStage: StagePreview = { kind: "random", pool: randomPoolTitles };

  // Every board this format can seat. Boards it can't host are hidden outright
  // rather than dimmed (#685) — the format chips above already say how many
  // seats are needed.
  const eligibleBoards = MAP_CATALOG.filter(
    (e) => !e.hidden && mapEligibleForFormat(e.map, selectedFormat),
  );
  const selectedEntry = eligibleBoards.find((e) => e.id === selectedMapId);
  // The rail row shows a handful of boards; the rest live in the popover. A
  // board picked in there takes the first slot so the rail always shows what is
  // actually selected without opening anything.
  const railHead = eligibleBoards.slice(0, RAIL_STAGE_TILES);
  const railBoards =
    selectedEntry && !railHead.includes(selectedEntry)
      ? [selectedEntry, ...railHead.slice(0, RAIL_STAGE_TILES - 1)]
      : railHead;
  const stageName =
    selectedMapId === CUSTOM_MAP_ID
      ? "Custom board"
      : selectedMapId === RANDOM_MAP_ID
        ? "Random board"
        : catalogEntry(selectedMapId)?.title ?? "Default board";
  const timerText = turnTimerSeconds > 0 ? `${clampTurnTimer(turnTimerSeconds)}s timer` : "no timer";
  const mulliganText = mulligan ? "mulligan on" : "no mulligan";
  // 🎁 items (#725): the chip — and the summary leg — exist only when the chosen
  // board actually carries items, so an item-less create reads exactly as before.
  const boardHasItems = mapHasItems(selectedMapId, customMapJson);
  const itemsText = boardHasItems && !itemsEnabled ? " · no items" : "";
  const summary = effective
    ? `${lockedName} · ${stageName} · ${timerText} · ${mulliganText}${itemsText}`
    : "Pick a fighter to preview — click a tile to lock in.";

  const createLabel = !effective
    ? "Pick a fighter"
    : fixedSetup
      ? tournament ? "Play" : "Join"
      : multiplayer
        ? `Create ${format.label}`
        : opponent === "human"
          ? "Create"
          : "Play vs Bot";

  const onTimerChip = (v: string) => {
    if (v === "custom") {
      setCustomTimerOpen(true);
      if (turnTimerSeconds === 0) onSelectTurnTimer(TURN_TIMER_DEFAULT);
      return;
    }
    setCustomTimerOpen(false);
    onSelectTurnTimer(v === "off" ? 0 : Number(v));
  };
  const timerActive = (v: string) => {
    if (customTimerOpen) return v === "custom";
    if (v === "off") return turnTimerSeconds === 0;
    return turnTimerSeconds === Number(v);
  };

  // Deferred resolution for the Random tile (#697), the fighter-side twin of the
  // stage roll: the sentinel becomes a real hero HERE, at the click, drawn from
  // the fighters the grid is showing — so the reach filter and search box are
  // the roll's pool. Both commit buttons go through it, and each is disabled
  // when there is nothing to roll (`canConfirm`).
  const commitHeroId = () => resolveHeroPick(effective, visibleHeroes);

  // One element, two mounts (desktop dock + mobile bar below): CSS picks the
  // visible copy per breakpoint, so neither is ever shown twice on screen
  // (#765) — the render test pins the count.
  const createButton = (
    <Button
      type="button"
      data-testid="pro-create-button"
      onClick={() => {
        const heroId = commitHeroId();
        if (heroId) onConfirm(heroId);
      }}
      isDisabled={!canConfirm}
      h="auto"
      py="13px"
      px="18px"
      borderRadius="6px"
      fontFamily="LeagueGothic"
      fontSize="20px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      bg="linear-gradient(180deg, #F0C874, #E0A82E 45%, #C48F1E)"
      color="#2c1a10"
      boxShadow="0 4px 0 #8a6420, 0 10px 22px rgba(0,0,0,0.45)"
      _hover={{ transform: "translateY(-1px)", bg: "linear-gradient(180deg, #F0C874, #E0A82E 45%, #C48F1E)" }}
      _active={{ transform: "translateY(2px)", boxShadow: "0 2px 0 #8a6420" }}
      _disabled={{ filter: "grayscale(0.75) brightness(0.65)", boxShadow: "none", cursor: "not-allowed", opacity: 1 }}
      sx={{
        transition: "transform 0.12s ease, box-shadow 0.12s ease",
        ...(armed ? { animation: `${createArm} 0.45s ease` } : {}),
        ...NO_MOTION,
      }}
    >
      {createLabel}
    </Button>
  );

  // Quick Match (#687) sits BESIDE Create, because it is the other answer to the
  // same question — configure a room, or just get me a game. Same enablement as
  // Create (a fighter is locked and the socket is up); everything else on this
  // screen (board, timer, format) is deliberately ignored by it, so the room the
  // next searcher joins is always a standard duel.
  // #1542: the bonus window keeps the armed style on, not just `?quick=1`.
  const quickArmed = !!quickMatchArmed || !!quickMatchBonusLabel;
  // #1542: two lines + the 2× tag on desktop; the mobile bar keeps the short label.
  const quickTwoLine = (testId: string) => quickMatchSubline !== null && testId === "quick-match";
  const quickMatchButton = (testId: string) =>
    !onQuickMatch || fixedSetup ? null : (
      <Button
        type="button"
        data-testid={testId}
        onClick={() => {
          const heroId = commitHeroId();
          if (heroId) onQuickMatch(heroId);
        }}
        isDisabled={!canConfirm}
        title={
          canConfirm
            ? "Join whoever has waited longest — or open a room and wait"
            : "Pick a fighter first"
        }
        h="auto"
        py={quickTwoLine(testId) ? "7px" : "9px"}
        px={quickTwoLine(testId) ? "12px" : "16px"}
        borderRadius="6px"
        fontFamily="LeagueGothic"
        fontSize="15px"
        letterSpacing="0.08em"
        textTransform="uppercase"
        bg={quickTwoLine(testId) && quickArmed ? "rgba(224,168,46,0.08)" : "transparent"}
        color="brand.accent"
        border="1px solid"
        borderColor={quickArmed ? "brand.accent" : "whiteAlpha.400"}
        boxShadow={quickArmed ? "0 0 14px rgba(224,168,46,0.45)" : undefined}
        _hover={{ bg: "whiteAlpha.200" }}
        _active={{ bg: "whiteAlpha.300" }}
        _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
      >
        {quickTwoLine(testId) ? (
          <QuickMatchLabel subline={quickMatchSubline ?? ""} bonusLabel={quickMatchBonusLabel} />
        ) : (
          "⚡ Quick Match"
        )}
      </Button>
    );

  // Matched mode (#1556): Go needs a REAL fighter — a Random pick isn't rolled
  // for a pair, same guard as Quick Match's "Pick a fighter first".
  const pairActions = (compact: boolean) =>
    pairMode ? (
      <PairActions
        partnerName={pairMode.partner.name}
        canGo={status === "open" && !!effective && !randomPicked}
        waiting={pairMode.waiting}
        partnerReady={pairMode.partner.ready}
        bonusLabel={pairMode.bonusLabel}
        onGo={() => {
          if (effective && !randomPicked) pairMode.onGo(effective);
        }}
        onCancel={pairMode.onCancel}
        compact={compact}
      />
    ) : null;

  // Player plates for the current format. Duel opponent + multiplayer seats share
  // the same Human/AI chips (SeatPlate); they just write to different parent
  // state (`opponent` vs `botSlotPlan`), preserving the existing create-time wire.
  // The duel AI's deck. Since #768 this folds into the P2 plate instead of
  // sitting in its own centred row below the fold — same Menu, same wire (a
  // `null` pick means the server rolls the bot's deck).
  const aiHeroPicker = (
    <Menu placement="bottom-start">
      <MenuButton
        as={Button}
        {...BTN}
        mt="0.3rem"
        h="1.5rem"
        px="0.45rem"
        w="100%"
        fontSize="0.62rem"
        fontFamily="SpaceGrotesk"
        fontWeight="normal"
        textAlign="left"
        rightIcon={<TbChevronDown />}
        isDisabled={heroes === null}
        title={
          aiHeroId
            ? "the bot plays this hero — the game starts instantly"
            : "the server picks the bot's deck at random — the game starts instantly"
        }
      >
        Bot hero: {aiHeroId ? heroNameOf(heroes, aiHeroId) : "Random"}
      </MenuButton>
      <MenuList bg="brand.surface" borderColor="whiteAlpha.300" maxH="16rem" overflowY="auto">
        <MenuItem onClick={() => onSelectAiHero(null)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
          Random
        </MenuItem>
        {[...(heroes ?? [])].sort(byName).map((h) => (
          <MenuItem key={h.heroId} onClick={() => onSelectAiHero(h.heroId)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
            {h.name}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );

  const renderPlates = () => {
    if (pairMode) {
      const { partner } = pairMode;
      return (
        <>
          <SeatPlate tag="P1" role="You" you heroName={lockedName} />
          <VsBadge />
          <SeatPlate
            tag="P2"
            role={partner.name}
            status={{ role: partner.name, title: partner.heroName ?? "Picking…", found: partner.ready }}
          />
        </>
      );
    }
    if (fixedSetup) {
      return <SeatPlate tag="P1" role="You" you heroName={lockedName} />;
    }
    if (selectedFormat === "duel") {
      return (
        <>
          <SeatPlate tag="P1" role="You" you heroName={p1HeroName ?? lockedName} />
          <VsBadge />
          {p2Status ? (
            <SeatPlate tag="P2" role={p2Status.role} status={p2Status} />
          ) : (
            <SeatPlate
              tag="P2"
              role="Opponent"
              occupant={opponent}
              onChange={onSelectOpponent}
              chips={seatChipStrip}
              footer={opponent !== "human" ? aiHeroPicker : undefined}
            />
          )}
        </>
      );
    }
    const comp = teamComposition(selectedFormat, catalogEntry(selectedMapId)?.map);
    if (comp) {
      const myTeam = comp.find((t) => t.seats.includes("p1"));
      const ordered = myTeam ? [myTeam, ...comp.filter((t) => t !== myTeam)] : comp;
      return ordered.map((t, i) => {
        const mine = t === myTeam;
        return (
          <Flex key={t.team} align="center" gap="0.5rem">
            {i > 0 && <VsBadge />}
            <Flex
              direction="column"
              gap="0.4rem"
              p="0.4rem 0.5rem"
              borderRadius="0.7rem"
              bg={mine ? "rgba(224,168,46,0.06)" : "rgba(122,80,180,0.10)"}
            >
              <Text
                fontFamily="SpaceGrotesk"
                fontSize="0.58rem"
                letterSpacing="0.16em"
                opacity={0.75}
                color={mine ? ALLY_ACCENT : "brand.parchment"}
              >
                TEAM {t.team}
                {mine ? " · YOU + ALLY" : " · OPPONENTS"}
              </Text>
              <Flex gap="0.4rem" flexWrap="wrap">
                {t.seats.map((seat) => {
                  const you = seat === "p1";
                  return (
                    <SeatPlate
                      key={seat}
                      tag={seat.toUpperCase()}
                      role={you ? "You" : mine ? "Ally" : "Foe"}
                      you={you}
                      heroName={you ? lockedName : undefined}
                      teamAccent={mine}
                      occupant={you ? undefined : botSlotPlan[seat] ?? "human"}
                      onChange={you ? undefined : (v) => onChangeBotSlot(seat, v)}
                      chips={seatChipStrip}
                    />
                  );
                })}
              </Flex>
            </Flex>
          </Flex>
        );
      });
    }
    // ffa-3: independent seats (P1 you + the assignable others)
    return (
      <>
        <SeatPlate tag="P1" role="You" you heroName={lockedName} />
        <VsBadge />
        {assignableSeats(selectedFormat).map((seat) => (
          <SeatPlate
            key={seat}
            tag={seat.toUpperCase()}
            occupant={botSlotPlan[seat] ?? "human"}
            onChange={(v) => onChangeBotSlot(seat, v)}
            chips={seatChipStrip}
          />
        ))}
      </>
    );
  };

  return (
    // pt leaves the fixed account chip (top-right, rendered by the page) a lane
    // of its own: the rules strip below wraps and its first row can run all the
    // way to the right edge, so overlaying the chip on it would collide.
    <Box maxW="78rem" mx="auto" px={{ base: "0.75rem", md: "1.25rem" }} pt="2.75rem" pb={{ base: "6rem", lg: "0.75rem" }}>
      {/* ---------------- rules strip ---------------- */}
      <Flex
        align="center"
        gap={{ base: "0.6rem", md: "1.1rem" }}
        flexWrap="wrap"
        p="0.6rem 1rem"
        mb="1.1rem"
        borderRadius="0.75rem"
        bg="rgba(0,0,0,0.28)"
        border="1px solid"
        borderColor="whiteAlpha.200"
      >
        {pairMode ? (
          <PartnerCard partner={pairMode.partner} />
        ) : (
          <Text fontFamily="LeagueGothic" fontSize="1.35rem" letterSpacing="0.08em">
            {tournament ? `TOURNAMENT · ${tournament.label}` : room ? `JOIN ROOM ${room}` : "CREATE A ROOM"}
          </Text>
        )}
        {!fixedSetup && (
          <>
            <Flex align="center" gap="0.5rem">
              <Text {...STRIP_LBL}>FORMAT</Text>
              <Segmented
                ariaLabel="Format"
                value={selectedFormat}
                onChange={onSelectFormat}
                options={PRO_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
              />
            </Flex>
            <Flex align="center" gap="0.5rem">
              <Text {...STRIP_LBL}>⏱ TIMER</Text>
              <Flex gap="0.3rem" role="group" aria-label="Move timer" align="center">
                {TIMER_CHIPS.map((c) => {
                  const active = timerActive(c.v);
                  return (
                    <Button
                      key={c.v}
                      type="button"
                      size="xs"
                      aria-pressed={active}
                      onClick={() => onTimerChip(c.v)}
                      fontFamily="SpaceGrotesk"
                      fontWeight={active ? "bold" : "normal"}
                      bg={active ? "brand.accent" : "rgba(0,0,0,0.25)"}
                      color={active ? "brand.surfaceDim" : "brand.parchment"}
                      border="1px solid"
                      borderColor={active ? "brand.accent" : "whiteAlpha.200"}
                      _hover={{ bg: active ? "brand.accentDeep" : "whiteAlpha.100", borderColor: active ? "brand.accentDeep" : "whiteAlpha.400" }}
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {c.label}
                    </Button>
                  );
                })}
                {customTimerOpen && (
                  <NumberInput
                    size="xs"
                    maxW="5rem"
                    min={TURN_TIMER_MIN}
                    max={TURN_TIMER_MAX}
                    step={5}
                    value={turnTimerSeconds}
                    keepWithinRange
                    clampValueOnBlur
                    onChange={(_str, num) => {
                      if (Number.isFinite(num)) onSelectTurnTimer(num);
                    }}
                    aria-label="Custom move timer seconds"
                  >
                    <NumberInputField bg="rgba(0,0,0,0.3)" borderColor="whiteAlpha.300" _focus={{ borderColor: "brand.accent" }} px="0.4rem" />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                )}
              </Flex>
            </Flex>
            {/* Opening-hand mulligan (engine #395, issue #631). ON is the
                engine default, so "Off" is the only choice that reaches the
                wire — see createRoom in lib/pro/useProSocket.ts. */}
            <Flex align="center" gap="0.5rem">
              <Text {...STRIP_LBL}>🃏 MULLIGAN</Text>
              <Segmented
                ariaLabel="Opening-hand mulligan"
                value={mulligan ? "on" : "off"}
                onChange={(v) => onSelectMulligan(v === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </Flex>
            {/* Battlefield items (engine #519, issue #725). Rendered ONLY when
                the chosen board carries items — every catalog board today is
                item-less, so the strip reads exactly as before until the first
                item board ships; hidden also means the opt-out never reaches
                the wire (the create handler gates on the same predicate). */}
            {boardHasItems && (
              <Flex align="center" gap="0.5rem">
                <Text {...STRIP_LBL}>🎁 ITEMS</Text>
                <Segmented
                  ariaLabel="Battlefield items"
                  value={itemsEnabled ? "on" : "off"}
                  onChange={(v) => onSelectItemsEnabled(v === "on")}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                />
              </Flex>
            )}
          </>
        )}
        <Box flex="1" minW="0" />
        {!fixedSetup && recentRooms.length > 0 && (
          <Flex align="center" gap="0.4rem" fontSize="0.75rem" color="whiteAlpha.600">
            <Text {...STRIP_LBL}>REJOIN</Text>
            {recentRooms.slice(0, 3).map((r, i) => (
              <Button
                key={r.roomId}
                type="button"
                size="xs"
                variant="outline"
                borderRadius="999px"
                onClick={() => onResumeRoom(r.roomId)}
                borderColor="whiteAlpha.300"
                color="brand.parchment"
                fontFamily="SpaceGrotesk"
                title={`room ${r.roomId} · ${agoLabel(r.ts)}`}
                _hover={{ borderColor: "brand.accent", color: "brand.accent" }}
              >
                {i === 0 && (
                  <Box as="span" color={ALLY_ACCENT} mr="0.3rem">
                    ●
                  </Box>
                )}
                {r.roomId}
              </Button>
            ))}
          </Flex>
        )}
        {/* #1542: who else is on this page, right before the connection dot. */}
        {!fixedSetup && presencePill}
        {/* Connection state rides the rules strip since #768 — the rail below is
            all setup, and this is the one thing on the screen that is about the
            server rather than the room being built. */}
        <Flex align="center" gap="0.3rem" fontSize="0.7rem" color="whiteAlpha.600" fontFamily="SpaceGrotesk">
          <Box as="span" color={status === "open" ? ALLY_ACCENT : "whiteAlpha.500"} fontSize="0.6rem">
            ●
          </Box>
          {status === "open" ? "connected" : status}
        </Flex>
      </Flex>

      {/* ---------------- setup rail + roster ---------------- */}
      {/* Desktop (#768): two columns that together fill what is left of the
          viewport. The rail owns the whole setup — splash, stage, seats, Create
          — so the primary action never leaves the fold no matter how big the
          catalog grows; only the roster on the right scrolls. Below `lg` the
          height cap and the scroll region both drop away and everything is back
          in flow under the fixed create bar. */}
      {/* Named areas, not nested columns, because the two layouts want DIFFERENT
          orders: the rail reads splash → stage → seats top-to-bottom, while a
          phone wants the roster right under the splash and the seats after it
          (the fixed create bar is the phone's primary action). The `gap` row is
          what pins the seats block to the rail's foot. */}
      <Grid
        templateAreas={{
          base: `"splash" "stage" "roster" "seats"`,
          lg: `"splash roster" "stage roster" "gap roster" "seats roster"`,
        }}
        templateColumns={{ base: "1fr", lg: "20rem 1fr" }}
        templateRows={{ lg: "auto auto 1fr auto" }}
        columnGap={{ lg: "1.4rem" }}
        rowGap="1rem"
        alignItems="stretch"
        h={{ lg: "calc(100vh - 8.5rem)" }}
        onMouseLeave={clearStagePreview}
      >
        {/* ---------------- setup rail ---------------- */}
        <Box ref={splashRef} gridArea="splash" minW="0" minH="0" display="flex" flexDirection="column">
          <SplashPanel
            hero={splashHero}
            locked={splashLocked}
            onViewDeck={() => splashHero && setPreviewHero(splashHero)}
            stage={stageHover}
            onViewBoard={() =>
              stageHover?.kind === "board" ? setPreviewMap(stageHover.entry) : undefined
            }
            viewBoardRef={viewBoardRef}
          />
        </Box>

        {/* ---------------- stage row ---------------- */}
        <Box gridArea="stage" minW="0">
          {pairMode?.role === "guest" && (
            <Box data-testid="pair-board-note">
              <Text {...STRIP_LBL}>STAGE</Text>
              <Text fontFamily="SpaceGrotesk" fontSize="0.75rem" color="whiteAlpha.700" mt="0.35rem">
                {`${pairMode.partner.name} picks the board — you’ll see it when the table opens.`}
              </Text>
            </Box>
          )}
          {showStage && (
            <Box ref={stageRowRef}>
              <Flex align="center" justify="space-between" gap="0.5rem" mb="0.35rem">
                <Text {...STRIP_LBL}>STAGE</Text>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => setStagePickerOpen((open) => !open)}
                  aria-expanded={stagePickerOpen}
                  rightIcon={<TbChevronDown />}
                  color="brand.accent"
                  fontSize="11px"
                  fontFamily="SpaceGrotesk"
                  fontWeight="normal"
                  _hover={{ color: "brand.accentDeep" }}
                >
                  {stagePickerOpen ? "Show fewer" : `All ${eligibleBoards.length} boards`}
                </Button>
              </Flex>
              {/* Four tiles wide, which is the whole rail. Every OTHER board is
                  one click away in the popover — #685's "no board is unreachable
                  without a horizontal scroll" is kept there, by a wrapped grid. */}
              <Grid
                templateColumns="repeat(4, minmax(0, 1fr))"
                gap="6px"
                onKeyDown={handoffTabToViewBoard}
              >
                <StageTile
                  ariaLabel="Random board — rolled when the room is created"
                  title="Random"
                  glyph="🎲"
                  dashed
                  selected={selectedMapId === RANDOM_MAP_ID}
                  onSelect={() => onSelectMap(RANDOM_MAP_ID)}
                  onHover={() => setStageHover(randomStage)}
                  onBlurAway={onStageTileBlur}
                />
                {railBoards.map((entry) => (
                  <StageTile
                    key={entry.id}
                    ariaLabel={entry.title}
                    title={entry.title}
                    thumbnailUrl={entry.thumbnailUrl}
                      selected={selectedMapId === entry.id}
                    onSelect={() => onSelectMap(entry.id)}
                    onHover={() => setStageHover({ kind: "board", entry })}
                    onBlurAway={onStageTileBlur}
                  />
                ))}
                {/* A chosen Custom… board keeps a home in the rail; clicking it
                    reopens the popover, which is where its JSON now lives. */}
                {selectedMapId === CUSTOM_MAP_ID && (
                  <StageTile
                    ariaLabel="Edit custom board JSON"
                    title="Custom…"
                    glyph="+"
                    dashed
                      selected
                    onSelect={() => setStagePickerOpen(true)}
                  />
                )}
              </Grid>
              <Text mt="0.35rem" fontSize="0.6rem" color="whiteAlpha.500" fontFamily="SpaceGrotesk">
                Random rolls from the {format.label.toLowerCase()} pool · hover any board to
                preview it above
              </Text>
            </Box>
          )}
        </Box>

        {/* ---------------- seats + create ---------------- */}
        <Flex
          gridArea="seats"
          data-testid="pro-create-dock"
          minW="0"
          direction="column"
          gap="8px"
          onMouseEnter={clearStagePreview}
        >
          <Flex gap="8px" align="stretch" minW="0">
            {renderPlates()}
          </Flex>
          {/* #1542: a running / landed Quick Match replaces ONLY these buttons. */}
          {dockPanel ? (
            <Box display={{ base: "none", lg: "block" }}>{dockPanel}</Box>
          ) : pairMode ? (
            <Box display={{ base: "none", lg: "block" }}>{pairActions(false)}</Box>
          ) : (
            <Flex direction="column" gap="0.4rem" display={{ base: "none", lg: "flex" }}>
              {createButton}
              {quickMatchButton("quick-match")}
              <Text textAlign="center" fontSize="0.72rem" color="whiteAlpha.600" fontFamily="SpaceGrotesk">
                {summary}
                {(!fixedSetup || pairMode) && (
                  <Box as="span" display="block" data-testid="quick-play-rules">
                    {`${pairMode ? "Quick Play duel" : "Quick Match"}: ⏱ ${QUICK_PLAY_TIMER_SECONDS}s timer${pairMode ? "" : " · random board"}`}
                  </Box>
                )}
                {bonusSummary && !fixedSetup && (
                  <Box as="span" display="block" data-testid="bonus-summary">
                    <Box as="span" color="brand.accent">
                      Quick Match pays {bonusSummary} XP
                    </Box>
                    {" · Create room is 1×"}
                  </Box>
                )}
              </Text>
            </Flex>
          )}
          {!fixedSetup && multiplayer && (
            <Text fontSize="0.66rem" opacity={0.6} textAlign="center" fontFamily="SpaceGrotesk">
              Bot seats are filled by the server · human seats join with the room link.
            </Text>
          )}
        </Flex>

        {/* ---------------- roster ---------------- */}
        {/* Entering the roster is the #781 revert: the pointer has left the
            board preview for the fighters, so the splash goes back to the
            locked pick. The board popover lives inside this region and is the
            one exception — its own tiles re-arm the preview on the way in. */}
        <Flex
          gridArea="roster"
          direction="column"
          gap="0.7rem"
          minW="0"
          minH="0"
          position="relative"
          onMouseEnter={clearStagePreview}
        >
          <Flex align="center" justify="space-between" gap="0.75rem" flexWrap="wrap" flex="none">
            <Flex align="baseline" gap="0.5rem">
              <Text fontFamily="LeagueGothic" fontSize="1.25rem" letterSpacing="0.1em" color="brand.accent">
                SELECT YOUR HERO
              </Text>
              {heroes !== null && (
                <Text fontSize="0.72rem" color="whiteAlpha.600" fontFamily="SpaceGrotesk">
                  {visibleHeroes.length} fighter{visibleHeroes.length === 1 ? "" : "s"}
                </Text>
              )}
            </Flex>
            <Flex gap="0.4rem" align="center" flexWrap="wrap">
              <InputGroup size="sm" w="150px">
                <InputLeftElement pointerEvents="none" color="whiteAlpha.500">
                  <TbSearch size="14px" />
                </InputLeftElement>
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search fighters"
                  borderRadius="6px"
                  bg="rgba(0,0,0,0.25)"
                  borderColor="whiteAlpha.200"
                  _hover={{ borderColor: "whiteAlpha.300" }}
                  _focus={{ borderColor: "brand.accent" }}
                />
              </InputGroup>
              {REACH_FILTERS.map((f) => {
                const active = reachFilter === f.v;
                return (
                  <Button
                    key={f.v}
                    type="button"
                    size="sm"
                    aria-pressed={active}
                    aria-label={`${f.label} fighters`}
                    onClick={() => setReachFilter(f.v)}
                    borderRadius="999px"
                    fontFamily="SpaceGrotesk"
                    bg={active ? "brand.accent" : "transparent"}
                    color={active ? "brand.surfaceDim" : "brand.parchment"}
                    border="1px solid"
                    borderColor={active ? "brand.accent" : "whiteAlpha.200"}
                    _hover={{ borderColor: active ? "brand.accentDeep" : "whiteAlpha.400" }}
                  >
                    {f.Icon ? <f.Icon size="14px" aria-hidden /> : f.label}
                  </Button>
                );
              })}
              {/* LAB chip (#768) — the playtest tier as a filter, not just a
                  badge: "show me only the decks that are still moving". */}
              <Button
                type="button"
                size="sm"
                aria-pressed={labOnly}
                aria-label="Lab decks only"
                onClick={() => setLabOnly((v) => !v)}
                borderRadius="999px"
                fontFamily="SpaceGrotesk"
                letterSpacing="0.08em"
                bg={labOnly ? "brand.accent" : "transparent"}
                color={labOnly ? "brand.surfaceDim" : "brand.parchment"}
                border="1px solid"
                borderColor={labOnly ? "brand.accent" : "whiteAlpha.200"}
                _hover={{ borderColor: labOnly ? "brand.accentDeep" : "whiteAlpha.400" }}
                rightIcon={
                  <Box as="span" fontSize="0.6rem" color={labOnly ? "brand.surfaceDim" : "brand.accent"}>
                    ●
                  </Box>
                }
              >
                LAB
              </Button>
              <Menu placement="bottom-end">
                <MenuButton
                  as={Button}
                  type="button"
                  size="sm"
                  aria-label="Sort fighters"
                  leftIcon={<TbArrowsSort size="14px" />}
                  rightIcon={<TbChevronDown />}
                  borderRadius="999px"
                  fontFamily="SpaceGrotesk"
                  fontWeight="normal"
                  bg="transparent"
                  color="brand.parchment"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  _hover={{ borderColor: "whiteAlpha.400" }}
                  _active={{ borderColor: "whiteAlpha.400" }}
                >
                  {ROSTER_SORTS.find((o) => o.v === rosterSort)?.label}
                </MenuButton>
                <MenuList bg="brand.surface" borderColor="whiteAlpha.300" minW="10rem">
                  {ROSTER_SORTS.map((o) => (
                    <MenuItem
                      key={o.v}
                      onClick={() => setRosterSort(o.v)}
                      bg="transparent"
                      fontSize="0.85rem"
                      _hover={{ bg: "whiteAlpha.100" }}
                    >
                      {o.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </Menu>
            </Flex>
          </Flex>

          {/* #1542: the "Here now" ribbon — one row, the roster gives up its height. */}
          {/* …kept while paired (#1556); the page disables its Join / 👋. */}
          {(!fixedSetup || pairMode) && ribbon}

          {/* The roster is its own scroll region on desktop — the page behind it
              stays put, so Create/seats/stage never move. The fade at the foot
              is the only hint that there is more below. */}
          <Box position="relative" flex="1" minH="0">
            <Box
              ref={rosterRef}
              data-testid="pro-roster-scroll"
              h="100%"
              overflowY={{ base: "visible", lg: "auto" }}
              pr={{ lg: "0.4rem" }}
              pb={{ lg: "1.5rem" }}
              onMouseLeave={() => setHoverHero(undefined)}
              sx={{
                "&::-webkit-scrollbar": { width: "5px" },
                "&::-webkit-scrollbar-thumb": {
                  background: "rgba(255,255,255,0.28)",
                  borderRadius: "3px",
                },
                "&::-webkit-scrollbar-track": { background: "transparent" },
              }}
            >
              {heroes === null ? (
                <Grid templateColumns={ROSTER_GRID_COLUMNS} gap="0.5rem">
                  {heroParam ? (
                    <Box
                      position="relative"
                      w="100%"
                      sx={{ aspectRatio: "1" }}
                      borderRadius="0.5rem"
                      border="1px solid"
                      borderColor="brand.accent"
                      bg="brand.surface"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      p="0.4rem"
                    >
                      <Text fontFamily="BebasNeueRegular" fontSize="0.72rem" textAlign="center" noOfLines={2}>
                        {prettyHeroId(heroParam)}
                      </Text>
                    </Box>
                  ) : (
                    <>
                      <SkeletonTile />
                      <SkeletonTile />
                      <SkeletonTile />
                      <SkeletonTile />
                      <SkeletonTile />
                      <SkeletonTile />
                    </>
                  )}
                </Grid>
              ) : heroes.length === 0 ? (
                <Text textAlign="center" opacity={0.7}>
                  no heroes available — try again shortly
                </Text>
              ) : (
                <Flex direction="column" gap="0.6rem">
                  {visibleHeroes.length === 0 && (
                    <Text textAlign="center" opacity={0.6} fontSize="0.85rem" py="1rem">
                      No fighters match — clear the search or filter.
                    </Text>
                  )}

                  {/* Recently played (#768) — this browser's own history, so the
                      row is simply absent until you have finished configuring a
                      room once. Filtered like every other section. */}
                  {recentHeroes.length > 0 && (
                    <Box data-testid="roster-section-recent">
                      <RosterSectionHeading label="Recently played" />
                      <Grid templateColumns={ROSTER_GRID_COLUMNS} gap="0.5rem">
                        {recentHeroes.map((h, i) => (
                          <RosterTile
                            key={`recent-${h.heroId}`}
                            hero={h}
                            pip={heroPips?.get(h.heroId)}
                            partnerPick={pairMode?.partner.heroId === h.heroId ? { ready: pairMode.partner.ready } : null}
                            last={i === 0 && h.heroId === recentHeroIds[0]}
                            selected={effective === h.heroId}
                            onSelect={() => onSelectHero(h.heroId)}
                            onHover={() => setHoverHero(h)}
                          />
                        ))}
                      </Grid>
                    </Box>
                  )}

                  {/* Balanced decks. The Random tile leads it, mirroring the
                      stage row (#685) — and it survives an empty filter result
                      (disabled) rather than blinking out of the layout, because
                      it is a roster control, not a fighter (#697). */}
                  {(balancedHeroes.length > 0 || labHeroes.length === 0) && (
                    <Box data-testid="roster-section-balanced">
                      <RosterSectionHeading label="Balanced decks" count={balancedHeroes.length} />
                      <Grid templateColumns={ROSTER_GRID_COLUMNS} gap="0.5rem">
                        <RandomRosterTile
                          selected={effective === RANDOM_HERO_ID}
                          disabled={visibleHeroes.length === 0}
                          poolSize={visibleHeroes.length}
                          onSelect={() => onSelectHero(RANDOM_HERO_ID)}
                          onHover={() => setHoverHero(undefined)}
                        />
                        {balancedHeroes.map((h) => (
                          <RosterTile
                            key={h.heroId}
                            hero={h}
                            pip={heroPips?.get(h.heroId)}
                            partnerPick={pairMode?.partner.heroId === h.heroId ? { ready: pairMode.partner.ready } : null}
                            selected={effective === h.heroId}
                            onSelect={() => onSelectHero(h.heroId)}
                            onHover={() => setHoverHero(h)}
                          />
                        ))}
                      </Grid>
                    </Box>
                  )}

                  {labHeroes.length > 0 && (
                    <Box data-testid="roster-section-lab">
                      <RosterSectionHeading
                        label="In the lab"
                        count={labHeroes.length}
                        note="playtest tier, balance may change"
                      />
                      <Grid templateColumns={ROSTER_GRID_COLUMNS} gap="0.5rem">
                        {/* With the LAB chip on there is no balanced section to
                            host it, so Random leads here instead. */}
                        {balancedHeroes.length === 0 && (
                          <RandomRosterTile
                            selected={effective === RANDOM_HERO_ID}
                            disabled={visibleHeroes.length === 0}
                            poolSize={visibleHeroes.length}
                            onSelect={() => onSelectHero(RANDOM_HERO_ID)}
                            onHover={() => setHoverHero(undefined)}
                          />
                        )}
                        {labHeroes.map((h) => (
                          <RosterTile
                            key={h.heroId}
                            hero={h}
                            pip={heroPips?.get(h.heroId)}
                            partnerPick={pairMode?.partner.heroId === h.heroId ? { ready: pairMode.partner.ready } : null}
                            selected={effective === h.heroId}
                            onSelect={() => onSelectHero(h.heroId)}
                            onHover={() => setHoverHero(h)}
                          />
                        ))}
                      </Grid>
                    </Box>
                  )}

                </Flex>
              )}
            </Box>
            {rosterScrolls && (
              <Box
                position="absolute"
                left="0"
                right="0"
                bottom="0"
                h="70px"
                pointerEvents="none"
                display={{ base: "none", lg: "block" }}
                bgGradient="linear(to-t, rgba(58,33,64,0.95), rgba(58,33,64,0))"
              />
            )}
            {/* ---------------- board popover ---------------- */}
            {/* Over the roster, not below the rail: the full catalog needs room to
                wrap, and the rail is 20rem wide. Scrim closes; so does Escape and
                picking a board. Custom… is the one choice that leaves it open —
                its JSON box lives inside. */}
            {showStage && stagePickerOpen && (
              <Box ref={boardPickerRef} position="absolute" inset="0" zIndex={20}>
                {/* Scrim: the roster behind reads as parked, and a click anywhere
                    off the panel closes — the popover has no OK/Cancel. */}
                <Box
                  position="absolute"
                  inset="0"
                  bg="rgba(20,9,24,0.66)"
                  onClick={() => {
                    setStagePickerOpen(false);
                    setStageHover(undefined);
                  }}
                />
                <Flex
                  role="dialog"
                  aria-label="Choose a board"
                  aria-modal={false}
                  direction="column"
                  position="relative"
                  maxH="100%"
                  overflowY="auto"
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(255,255,255,0.18)"
                  bg="brand.surfaceDim"
                  boxShadow="0 20px 50px rgba(0,0,0,0.6)"
                  p="14px"
                  gap="10px"
                >
                  <Flex align="center" gap="10px" flexWrap="wrap">
                    <Text fontFamily="LeagueGothic" fontSize="18px" letterSpacing="0.08em" color="brand.accent">
                      CHOOSE A BOARD
                    </Text>
                    <Text fontSize="11px" color="whiteAlpha.500" fontFamily="SpaceGrotesk">
                      {format.label.toLowerCase()} · {eligibleBoards.length} boards + random
                    </Text>
                    <Box flex="1" minW="0" />
                    {/* A pair room is a plain Quick Match duel: catalog boards or Random only. */}
                    {!pairMode && (
                    <Button
                      type="button"
                      size="xs"
                      aria-pressed={selectedMapId === CUSTOM_MAP_ID}
                      aria-label="Custom board — paste map JSON"
                      onClick={() => onSelectMap(CUSTOM_MAP_ID)}
                      borderRadius="6px"
                      fontSize="12px"
                      fontWeight={600}
                      px="11px"
                      py="5px"
                      h="auto"
                      fontFamily="SpaceGrotesk"
                      bg={selectedMapId === CUSTOM_MAP_ID ? "brand.accent" : "transparent"}
                      color={selectedMapId === CUSTOM_MAP_ID ? "brand.surfaceDim" : "brand.parchment"}
                      border="1px solid"
                      borderColor={selectedMapId === CUSTOM_MAP_ID ? "brand.accent" : "rgba(255,255,255,0.2)"}
                      _hover={{ borderColor: "brand.accent" }}
                    >
                      Custom JSON…
                    </Button>
                    )}
                    <Box
                      as="button"
                      type="button"
                      aria-label="Close board picker"
                      onClick={() => {
                        setStagePickerOpen(false);
                        setStageHover(undefined);
                      }}
                      px="6px"
                      borderRadius="4px"
                      color="whiteAlpha.500"
                      _hover={{ color: "brand.accent", bg: "whiteAlpha.100" }}
                    >
                      <TbX size="16px" />
                    </Box>
                  </Flex>

                  <Grid templateColumns={{ base: "repeat(4, minmax(0, 1fr))", md: "repeat(8, minmax(0, 1fr))" }} gap="8px">
                    <StageTile
                      ariaLabel="Random board — rolled when the room is created"
                      title="Random"
                      glyph="🎲"
                      dashed
                      selected={selectedMapId === RANDOM_MAP_ID}
                      onSelect={() => {
                        onSelectMap(RANDOM_MAP_ID);
                        setStagePickerOpen(false);
                        setStageHover(undefined);
                      }}
                      onHover={() => setStageHover(randomStage)}
                      onBlurAway={onStageTileBlur}
                    />
                    {eligibleBoards.map((entry) => (
                      <StageTile
                        key={entry.id}
                        ariaLabel={entry.title}
                        title={entry.title}
                        thumbnailUrl={entry.thumbnailUrl}
                        selected={selectedMapId === entry.id}
                        onSelect={() => {
                          onSelectMap(entry.id);
                          setStagePickerOpen(false);
                          setStageHover(undefined);
                        }}
                        onHover={() => setStageHover({ kind: "board", entry })}
                        onBlurAway={onStageTileBlur}
                      />
                    ))}
                  </Grid>

                  {/* Custom board: the paste-JSON textarea, revealed only when the
                      Custom… chip is selected. Behavior (validation, BAD_MAP
                      bounce) unchanged — only its address moved. */}
                  {selectedMapId === CUSTOM_MAP_ID && (
                    <Flex direction="column" gap="0.4rem" maxW="32rem">
                      <Textarea
                        value={customMapJson}
                        onChange={(e) => onCustomMapJsonChange(e.target.value)}
                        placeholder="paste map JSON exported from /dev/map-editor — leave blank for the default board"
                        rows={4}
                        fontFamily="monospace"
                        fontSize="0.65rem"
                        bg="rgba(0,0,0,0.3)"
                        borderColor="whiteAlpha.200"
                        _hover={{ borderColor: "whiteAlpha.300" }}
                        _focus={{ borderColor: "brand.accent" }}
                        color="brand.parchment"
                      />
                      {mapError ? (
                        <Text color="#E06A5E" fontSize="0.65rem" fontFamily="SpaceGrotesk">
                          {mapError}
                        </Text>
                      ) : (
                        <Text fontSize="0.6rem" opacity={0.4} fontFamily="SpaceGrotesk">
                          only you set this up · other players just join the room link
                        </Text>
                      )}
                    </Flex>
                  )}
                </Flex>
              </Box>
            )}
          </Box>
        </Flex>
      </Grid>

      <HeroPreviewModal
        isOpen={!!previewHero}
        onClose={() => setPreviewHero(undefined)}
        deckId={previewHero ? HERO_DECK_IDS[previewHero.heroId] ?? null : null}
        heroName={previewHero?.name ?? ""}
        heroId={previewHero?.heroId}
        quickStats={
          previewHero
            ? { hp: previewHero.hp, move: previewHero.move, reach: previewHero.reach }
            : undefined
        }
      />

      <MapPreviewModal
        isOpen={!!previewMap}
        onClose={() => setPreviewMap(null)}
        entry={previewMap}
      />

      {/* ---------------- mobile fixed create bar ---------------- */}
      <Flex
        display={{ base: "flex", lg: "none" }}
        data-testid="pro-mobile-create-bar"
        position="fixed"
        left="0"
        right="0"
        bottom="0"
        zIndex={5}
        align="center"
        gap="0.75rem"
        px="1rem"
        py="0.65rem"
        bg="rgba(20,9,24,0.94)"
        borderTop="1px solid"
        borderColor="whiteAlpha.200"
        sx={{ backdropFilter: "blur(8px)" }}
      >
        {dockPanel ? (
          <Box flex="1" minW="0">
            {dockPanel}
          </Box>
        ) : pairMode ? (
          pairActions(true)
        ) : (
          <>
            <Text flex="1" fontSize="0.72rem" color="whiteAlpha.700" fontFamily="SpaceGrotesk" noOfLines={2}>
              {summary}
            </Text>
            {quickMatchButton("quick-match-mobile")}
            {createButton}
          </>
        )}
      </Flex>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({
  room,
  heroParam,
  vsBot,
  debug,
  quickParam,
  rematch,
  tournamentRoom,
}: {
  room: string | null;
  heroParam: string | null;
  vsBot: BotDifficulty | null;
  debug: boolean;
  quickParam: boolean;
  /** parsed `?rematch=1` payload (lib/pro/rematch.ts), or null on any normal load */
  rematch: ParsedRematch | null;
  /** a tournament game, from TournamentGate; absent for every casual game */
  tournamentRoom?: GateTournament;
}) => {
  // Slow mode (issue #703) — read before the socket, because it is what the socket
  // paces STATE batches with. Persisted per browser; OFF leaves the socket's queue
  // layer completely inert.
  const [slowMode, toggleSlowMode] = useSlowMode();
  const socket = useProSocket(WS_URL, debug, slowMode, isTournamentRoom);
  const { cosmeticHeroes, cosmeticConstants, cosmeticsStatus, status, roomId, roomInfo, snapshot, error, heroes, lobbies, roomPublic, replayBundle, createRoom, joinRoom, requestLobbies, setVisibility, trackHeroPicked, gameLost, rematchNegotiable, rematchOffer, offerRematch, cancelRematch, respondToRematch } = socket;
  // The in-game view's own state (issue #1678): every hook the board, dock, HUD
  // and feed need lives in components/Pro/GameView. Called here, unconditionally
  // and before the lobby's early returns, exactly where those hooks used to sit.
  const game = useGameViewState({ socket, slowMode });
  const { soundOn, gameEndReason, iForfeited, toggleSound, logEntries, resolveCard } = game;
  // No extra request: the `/me` probe is a shared module-level store that
  // `useProSocket` has already kicked off. Only the forfeit dialog reads it —
  // cosmetic points exist for signed-in players, so only they are told what
  // conceding costs (#636).
  const accountState = useAccount();
  const { status: accountStatus } = accountState;
  // The jevx3 unlock gate (#933) reads the record vs Expert. A guest makes no
  // request (useAccountStats waits for "signed-in"); every non-ready state locks.
  // A signed-in player on the build-time allowlist is unlocked outright.
  const { status: statsStatus, stats: accountStats } = useAccountStats();
  const tierUnlock = tierUnlockProgress(
    statsStatus,
    accountStats,
    isAllowlisted(accountState, JEVX3_ALLOWLIST),
  );
  const [joined, setJoined] = useState(false);
  // The board brings its own pinch-zoom; a pinch that lands beside it must not
  // scale the whole page with the cards and the dock in it (player feedback).
  // Only while a match board is actually on screen (#893): the lobby, hero
  // picker and waiting room keep the browser's zoom, an accessibility tool.
  usePageZoomGuard(matchBoardOnScreen({ joined, snapshot, gameLost, error }));
  // `selectedHeroId` holds a real hero id — or RANDOM_HERO_ID (#697), which is
  // resolved to one at the create/join click and written back here, so every
  // downstream reader (lobby label, bot tiers, "play a bot instead") only ever
  // sees a concrete fighter.
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  // Whether that fighter came out of the Random tile, so the waiting screen can
  // say so (🎲) instead of pretending it was hand-picked.
  const [rolledHero, setRolledHero] = useState(false);
  // Duel opponent seat. `chooseOpponent` is the player clicking a chip and locks
  // the seat against the post-hydration `?vs=` preset (#460/#593); `reviseOpponent`
  // is for machine-driven narrowing that isn't a choice. See lib/pro/opponentSeat.ts.
  const { opponent, chooseOpponent, reviseOpponent } = useOpponentSeat(vsBot);
  const [selectedFormat, setSelectedFormat] = useState<ProFormatId>("duel");
  // Quick Match (#687 ↔ engine #391): the search in flight — the hero we
  // committed plus how far down the polled lobby list we have walked. Null the
  // rest of the time, and null is what every "are we matchmaking?" branch below
  // keys off. The stepping itself lives in lib/pro/quickMatch.ts.
  const [quickSearch, setQuickSearch] = useState<QuickMatchSearch | null>(null);
  const [botSlotPlan, setBotSlotPlan] = useState<BotSlotPlan>({});
  // Chosen board in the create flow: a MAP_CATALOG id, CUSTOM_MAP_ID, or
  // RANDOM_MAP_ID. Starts on Random (#685) — it's eligible in every format, so
  // it survives format switches; a hand-picked board that the new format can't
  // host still falls back to `defaultMapIdForFormat`.
  const [selectedMapId, setSelectedMapId] = useState<string>(RANDOM_MAP_ID);
  // The board Random actually rolled at create time, so the lobby can name the
  // real board instead of "Random". Null whenever the pick isn't a rolled one.
  const [rolledMapId, setRolledMapId] = useState<string | null>(null);
  const [aiHeroId, setAiHeroId] = useState<string | null>(null);
  // A tier can stop being offered while it is armed — switch to a fighter the
  // server doesn't serve Expert for and the already-picked Expert seat would be
  // sent anyway, only to be refused (BAD_MESSAGE) after the create click. Prune
  // the moment the offer changes, dropping to the strongest tier still offered.
  // Joined to a string so the effect re-runs on a CHANGE of offer, not on every
  // render's fresh array identity.
  // A tier the player hasn't unlocked yet (#933) is pruned the same way.
  const lockedTierSet = lockedTiers(tierUnlock);
  const armedTierKey = availableBotTiers(heroes, [
    selectedHeroId,
    selectedFormat === "duel" ? aiHeroId : null,
  ])
    .filter((t) => !lockedTierSet.includes(t))
    .join(",");
  useEffect(() => {
    const offered = armedTierKey.split(",") as BotDifficulty[];
    reviseOpponent((prev) => (prev === "human" ? prev : coerceBotTier(prev, offered)));
    setBotSlotPlan((prev) => {
      let changed = false;
      const next = Object.fromEntries(
        Object.entries(prev).map(([player, occupant]) => {
          if (occupant === "human" || occupant === undefined) return [player, occupant];
          const coerced = coerceBotTier(occupant, offered);
          if (coerced !== occupant) changed = true;
          return [player, coerced];
        }),
      ) as BotSlotPlan;
      return changed ? next : prev;
    });
    // `reviseOpponent` is a stable setState — listed only to satisfy the lint rule,
    // which can't see that through the hook boundary.
  }, [armedTierKey, reviseOpponent]);
  // Per-decision move timer (issue #223), create flow only: seconds each seat has
  // to act. 0 = off (the default) → CREATE_ROOM omits turnTimerSeconds and the
  // room behaves exactly as today. The toggle flips between 0 and a default preset.
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(0);
  // Opening-hand mulligan (engine #395, issue #631), create flow only. The
  // engine defaults it ON for new games, so true is the default here too and
  // only an explicit opt-out puts `mulligan: false` on CREATE_ROOM.
  const [mulligan, setMulligan] = useState(true);
  // Battlefield items (engine #519, issue #725), create flow only. Items are
  // printed on the map, so ON is the default; the choice is only offered (and
  // the opt-out only sent) when the chosen board actually carries items.
  const [itemsEnabled, setItemsEnabled] = useState(true);
  // Custom-map playtest (create flow): raw JSON persists across a BAD_MAP bounce
  // so a power user can fix the board and retry without re-pasting.
  const [customMapJson, setCustomMapJson] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);
  // The board behind the "submit this map" link — only when THIS player created
  // the room with a (server-accepted) custom board. null otherwise. The JSON is
  // re-serialized from the normalized map so what lands on the clipboard is the
  // same engine-native shape the editor's export box produces (#756).
  const mapSubmit = useMemo(() => {
    const t = customMapJson.trim();
    if (!t) return null;
    try {
      const map = normalizeMap(JSON.parse(t));
      return { map, json: JSON.stringify(map, null, 2) };
    } catch {
      return null;
    }
  }, [customMapJson]);
  const [submitMapOpen, setSubmitMapOpen] = useState(false);

  // Lobby "match found" cue (issue #689): the waiting host tabbed away, so the
  // moment the room fills and the game begins we chime and shout it from the tab
  // title. The decision (who is waiting, when it fires, exactly once) is
  // lobbyCue.ts; `soundOn` is the SAME setting the HUD's speaker chip flips, so
  // a mute made in a match still holds in the next lobby.
  const lobbyHasBot =
    vsBot !== null ||
    opponent !== "human" ||
    Object.values(botSlotPlan).some((seat) => seat && seat !== "human") ||
    !!roomInfo?.roster?.some((seat) => seat.bot);
  useLobbyMatchCue({
    roomId,
    seated: !!roomInfo,
    seatsFilled: roomInfo?.seats.length ?? 0,
    requiredPlayers: roomInfo?.requiredPlayers ?? 0,
    started: !!snapshot,
    hasBot: lobbyHasBot,
    soundOn,
  });

  // GAME_OVER pushes a self-contained bundle to both seats (protocol v7). Save it
  // to the local Replays store so the match is scrubbable later (issue #122). Runs
  // once per bundle; saveReplay is idempotent by content, so a refresh won't dup it.
  const savedBundleRef = useRef<ReplayBundle | null>(null);
  useEffect(() => {
    if (!replayBundle || savedBundleRef.current === replayBundle) return;
    savedBundleRef.current = replayBundle;
    toastReplaySaveResult(saveReplay(replayBundle));
  }, [replayBundle]);

  // "Copy share link" on the win screen (#698). The replay link the dock hands
  // out is a localStorage deep-link — honest for the player, useless to anyone
  // they paste it to — so signed-in players get the shareable one right there:
  // upload the bundle, copy the public /share/replay/<uuid> URL.
  const [sharingReplay, setSharingReplay] = useState(false);
  const copyReplayShareLink = useCallback(async () => {
    if (!replayBundle) return;
    setSharingReplay(true);
    const res = await shareReplayLink(replayBundle);
    setSharingReplay(false);
    if (res.ok) toast.success(`Share link copied — ${res.url}`, { duration: 7000 });
    else toast.error(`${res.title} — ${res.description}`, { duration: 7000 });
  }, [replayBundle]);

  // One-tap rematch (issue #TBD): the winner screen's Rematch button target —
  // a /pro/game?rematch=1&... link encoding this SAME game's setup (see
  // lib/pro/rematch.ts for exactly what carries over). Built from the replay
  // bundle every seat receives at GAME_OVER plus the room's recorded bot seats
  // — NOT the ROOM_STATUS roster, which a bot room and a mid-game reload never
  // get (#876) — so whoever presses it, winner or loser, vs AI or not, gets an
  // equally faithful rematch. Null until the bundle lands, which the dock
  // treats as "not ready yet" rather than rendering a broken link.
  const finishedSetup = useMemo(() => {
    if (!replayBundle || !roomInfo?.you) return null;
    const { config } = replayBundle;
    return buildFinishedGameSetup({
      players: config.players,
      bots: roomInfo.bots ?? {},
      you: roomInfo.you,
      formatId: config.formatId ?? roomInfo.formatId,
      turnTimerSeconds: roomInfo.turnTimerSeconds,
      mulliganWasOn: config.options?.mulligan === true,
      itemsWereOff: config.options?.itemsDisabled === true,
      mapId: config.mapId ?? null,
    });
  }, [replayBundle, roomInfo]);
  const rematchHref = useMemo(
    () => (finishedSetup ? `/pro/game?${new URLSearchParams(rematchQuery(finishedSetup)).toString()}` : null),
    [finishedSetup]
  );

  // Rematch offer/confirm (p2p #880): with another HUMAN at the table and an
  // engine that serves the negotiation (bound at v35 — see lib/pro/wireVersion),
  // Rematch asks them instead of creating a room of our own; two separate
  // one-tap rooms is what split players apart before. Vs AI there is nobody to
  // ask, and a v34 engine can't carry the question, so both keep the link.
  // Built from the view + the room's recorded bot seats, NOT the replay bundle:
  // the server rebuilds the setup itself, and a reload into a finished room
  // gets no second bundle — the requester who refreshes mid-offer must still
  // see "Waiting…". Bot seats unknown (never recorded here) → the link.
  const rematchView = snapshot?.view ?? null;
  const rematchNegotiation = useMemo<RematchNegotiation | null>(() => {
    const bots = roomInfo?.bots;
    if (!rematchNegotiable || !rematchView?.winner || !bots) return null;
    const humans = rematchView.players.filter((p) => p.id !== rematchView.you && !bots[p.id]);
    if (humans.length === 0) return null;
    const nameOf = (player: PlayerId) =>
      seatNameplate(
        { ...rematchView.players.find((p) => p.id === player), id: player, you: player === rematchView.you },
        rematchView.players.length
      );
    return {
      state: rematchOffer,
      nameOf,
      waitingFor: humans.length === 1 ? nameOf(humans[0].id) : "the other players",
      onOffer: offerRematch,
      onCancel: cancelRematch,
      onRespond: respondToRematch,
    };
  }, [rematchNegotiable, roomInfo, rematchView, rematchOffer, offerRematch, cancelRematch, respondToRematch]);

  // Everyone agreed: the server built the room and seated us (its token is
  // stored). A full page load onto it RECONNECTs like any refresh does —
  // nothing of this finished game's socket state follows us in.
  const rematchReadyRoom = rematchOffer.phase === "ready" ? rematchOffer.roomId : null;
  useEffect(() => {
    if (!rematchReadyRoom) return;
    const query = new URLSearchParams({ room: rematchReadyRoom });
    if (debug) query.set("debug", "");
    window.location.href = `/pro/game?${query.toString()}`;
  }, [rematchReadyRoom, debug]);
  // What you earned (p2p #1399): nothing is granted at game end, so the card
  // is a client-side delta — the pre-game `/me/stats` + cosmetics + badge
  // case this page already holds, against a bounded post-game refetch. The
  // badge case is the shared store `useProSocket` already probed (no second
  // request); the cosmetics are the socket's own copy for the same reason.
  const badgeCase = useBadges();
  const endedView = snapshot?.view ?? null;
  const gameOver = !!endedView && isGameOver(endedView);
  const earnedKind = useMemo(
    () =>
      endedView && gameOver
        ? earnedKindOf(endedView, roomInfo?.bots ?? null, gameResultOf(endedView) ?? "no-winner", gameEndReason, iForfeited)
        : null,
    [endedView, gameOver, roomInfo?.bots, gameEndReason, iForfeited],
  );
  const earned = useGameEarned({
    roomId,
    gameOver,
    signedIn: accountStatus === "signed-in",
    kind: earnedKind,
    heroId: endedView?.self.heroId ?? null,
    stats: accountStats,
    cosmeticHeroes,
    cosmeticsKnown: cosmeticsStatus === "ready",
    cosmeticConstants: cosmeticConstants ?? null,
    badges: badgeCase.badges,
  });

  // "How it went" (p2p #1398). Two routes to the same damage numbers:
  //  1. `liveStats` folds every STATE's events as they arrive — instant on the
  //     panel's first paint, but it only knows what this page saw (a reload
  //     starts it empty, and the join STATE carries no events).
  //  2. `expansionStats` is read off the replay expansion once the bundle has
  //     landed at game end: complete and reload-safe, fetched once per bundle,
  //     and it silently replaces the live numbers. A failed or diverged fetch
  //     leaves the live numbers in place.
  // Neither → the panel renders no card.
  const [liveStats, setLiveStats] = useState(EMPTY_GAME_STATS_ACCUMULATOR);
  const [expansionStats, setExpansionStats] = useState<GameStats | null>(null);
  useEffect(() => {
    setLiveStats(EMPTY_GAME_STATS_ACCUMULATOR);
    setExpansionStats(null);
  }, [roomId]);
  useEffect(() => {
    if (!snapshot) return;
    setLiveStats((acc) => reduceGameStats(acc, snapshot.events, snapshot.view));
  }, [snapshot]);
  useEffect(() => {
    if (!replayBundle) return;
    let live = true;
    void fetchReplayExpansion(replayBundle).then((res) => {
      if (!live || !res.ok) return;
      const stats = statsFromExpansion(res.expansion);
      if (stats) setExpansionStats(stats);
    });
    return () => {
      live = false;
    };
  }, [replayBundle]);
  const gameStats = expansionStats ?? (liveStats.observed ? liveStats.stats : null);
  const firstPlayer = expansionStats?.firstPlayer ?? liveStats.stats.firstPlayer ?? firstActorOf(replayBundle);

  // The game clock, CLIENT-OBSERVED: stamped when this page first receives a
  // STATE for the room (kept in sessionStorage so a reload resumes it), read
  // against the bundle's `endedAt`, else the moment this page saw GAME_OVER.
  // Not the engine's duration — it includes the creator's wait for a seat.
  const [clockStart, setClockStart] = useState<number | null>(null);
  const [clockEnd, setClockEnd] = useState<number | null>(null);
  useEffect(() => {
    setClockStart(null);
    setClockEnd(null);
  }, [roomId]);
  useEffect(() => {
    if (!snapshot || !roomId) return;
    setClockStart((prev) => prev ?? readOrMarkClockStart(roomId));
    if (isGameOver(snapshot.view)) setClockEnd((prev) => prev ?? Date.now());
  }, [snapshot, roomId]);
  const clockEndedAt = replayBundle?.meta.endedAt ?? clockEnd;
  const clockMs = clockStart !== null && clockEndedAt !== null ? Math.max(0, clockEndedAt - clockStart) : null;

  // Returning player: a saved reconnect token for this room means we skip the
  // hero picker entirely and RECONNECT straight into the same seat (joinRoom
  // replays the token when one exists). Runs once when a `?room=` has a token.
  const reconnectedRef = useRef(false);
  const tournament = useTournamentGame(tournamentRoom, { socket, room, joined, setJoined, reconnectedRef, setSelectedHeroId, setSelectedMapId, setSelectedFormat, setRolledHero });
  // "Next up" (p2p #1657): the same held data, for the strip under the earned
  // card. Memoised so the strip only re-ranks when one of its sources moves.
  const nextUpHeroId = endedView?.self.heroId ?? null;
  const inTournament = !!tournament.at;
  const nextUp = useMemo(
    () => ({
      heroId: nextUpHeroId,
      cosmeticHeroes,
      cosmeticConstants: cosmeticConstants ?? null,
      stats: accountStats,
      badges: badgeCase.badges,
      // What to play next (p2p #1659): the Rematch link's own setup for the
      // bot ladder, the roster for a hero never piloted. A tournament game
      // never rematches, so it gets no ladder either.
      setup: inTournament ? null : finishedSetup,
      roster: heroes,
      hiddenBotUnlocked: tierUnlock.unlocked,
    }),
    [nextUpHeroId, cosmeticHeroes, cosmeticConstants, accountStats, badgeCase.badges, inTournament, finishedSetup, heroes, tierUnlock.unlocked],
  );
  useEffect(() => {
    if (joined || !room || tournament.ownsSeat || reconnectedRef.current || typeof window === "undefined") return;
    // Only THIS TAB's own seat auto-reconnects (refresh). A fresh tab with a
    // ?room= link goes to the picker and JOINs — even if another tab of this
    // browser is the host — or resumes explicitly via the recent-rooms strip.
    // A tournament room is the exception: a JOIN_ROOM into it needs a ticket,
    // and both of its seats are never this browser's, so any token it holds for
    // the room is the player's own seat — resume it. A ticket launch decides for itself.
    if (getTabToken(room) || (tournament.resumesAnyToken && getToken(room))) {
      reconnectedRef.current = true;
      joinRoom(room, ""); // heroId ignored on the RECONNECT path
      setJoined(true);
    }
  }, [joined, room, joinRoom, tournament.ownsSeat, tournament.resumesAnyToken]);

  // Keep the room id in the URL: the joiner arrives with ?room= but the HOST's
  // URL never had it, so a refresh dumped them to the lobby with no way back
  // (playtest feedback). With the id in the URL + the localStorage token, a
  // refresh reconnects either seat.
  // A rematch link's own keys are dropped on the way (#876): left beside
  // `room=`, a refresh would read them as a fresh rematch and CREATE_ROOM again.
  const router = useRouter();
  useEffect(() => {
    if (!roomId || router.query.room === roomId) return;
    router.replace(
      { pathname: router.pathname, query: { ...withoutTicketQuery(withoutRematchQuery(router.query)), room: roomId } },
      undefined,
      { shallow: true }
    );
  }, [roomId, router]);

  // Recent matches this browser was seated in (client-only; loaded after mount
  // so the static export hydrates cleanly). Also offered when a ?room= link is
  // open — a returning host in a brand-new tab resumes from here instead of
  // hitting ROOM_FULL by re-joining.
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  useEffect(() => {
    if (!joined) setRecentRooms(listRecentRooms());
  }, [joined, room]);

  // ---- Quick Play lobby (#1542) ---------------------------------------------
  // The presence socket (lib/pro/useLobbySocket.ts, engine #1034) is open only
  // while this player sits on the CREATE picker — `joined` flips the moment a
  // CREATE_ROOM / JOIN_ROOM / RECONNECT / RESUME_ROOM goes out, which closes it,
  // and a bounce back to the picker reopens it. A Quick Match search is the one
  // exception: it holds a seat while it walks the lobbies, but the dock still
  // shows who is here, so the socket stays up (as `searching`) until the game's
  // first STATE lands. It waits for the game socket so an engine that is down
  // costs one failed connect, not two.
  // #1556: our 👋s awaiting an answer. Each greys its chip ("waiting…") until the
  // target declines, the server refuses it, or the 60 s invitation runs out.
  const [waved, setWaved] = useState<ReadonlySet<string>>(() => new Set());
  const waveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const unwave = useCallback((id: string) => {
    const timer = waveTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    waveTimersRef.current.delete(id);
    setWaved((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    const timers = waveTimersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  // Matched mode (#1556): a 👋 was accepted and the two pickers are paired. The
  // transitions live in lib/pro/lobbyPair.ts; `stepPair` (below) runs them. The
  // ref is what the lobby callbacks read, so two frames in one tick see each other.
  const [pair, setPair] = useState<LobbyPair | null>(null);
  // "Show me in the lobby" (default on): off keeps the presence socket closed.
  const [lobbyVisible, setLobbyVisible] = useLobbyVisible();
  const pairRef = useRef<LobbyPair | null>(null);
  // The fighter our Go committed (the host's create / the guest's join fall back to it).
  const pairGoHeroRef = useRef<string | null>(null);
  // Who 👋'd us, by presence id — the NUDGE_REPLY_RESULT toast names them.
  const nudgerNamesRef = useRef(new Map<string, string>());
  // Not before the router is ready: the static export's first render has no
  // query yet, and a `?room=` link would open (and at once close) the socket.
  const routerReady = useRouter().isReady;
  const lobbySocket = useLobbySocket({
    wsUrl: WS_URL,
    // #1556: a pair keeps it up past the seat too, like a search — the host's
    // private room waits on it, and the first game STATE closes it.
    enabled:
      routerReady &&
      lobbyVisible === true &&
      status === "open" &&
      !tournamentRoom &&
      ((!joined && !room) || (quickSearch !== null && !snapshot) || (pair !== null && !snapshot)),
    // A pair's Go reads `searching` too: that is how the partner sees we're in.
    state: quickSearch !== null || pair?.ready ? "searching" : "picking",
    heroId: selectedHeroId && selectedHeroId !== RANDOM_HERO_ID ? selectedHeroId : null,
    onNudged: (from: PresenceEntry) => {
      // The server never nudges a paired watcher; if one slips through, ignore it.
      // A searcher is off the ribbon (no 👋 to aim at it), so the same goes there.
      if (pairRef.current || quickSearch !== null) return;
      const name = from.displayName?.trim() || "Someone";
      nudgerNamesRef.current.set(from.id, name);
      const btn = { marginLeft: 6, padding: "4px 10px", borderRadius: 5, fontWeight: 600, minHeight: 32 } as const;
      toast(
        (t) => (
          <span data-testid="lobby-nudged-toast">
            <b>{name}</b> wants to play{" "}
            <button
              type="button"
              data-testid="lobby-nudge-accept"
              style={{ ...btn, background: "#E0A82E", color: "#2C1831" }}
              onClick={() => {
                toast.dismiss(t.id);
                lobbySocket.reply(from.id, true);
              }}
            >
              Accept
            </button>
            <button
              type="button"
              data-testid="lobby-nudge-decline"
              style={{ ...btn, background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,0.3)" }}
              onClick={() => {
                toast.dismiss(t.id);
                lobbySocket.reply(from.id, false);
              }}
            >
              Decline
            </button>
          </span>
        ),
        { id: `lobby-nudged-${from.id}`, icon: "👋", duration: NUDGE_TOAST_MS },
      );
    },
    onNudgeResult: (result) => {
      if (result.ok) return;
      unwave(result.to);
      if (result.reason === "rate_limited") toast("Easy on the waves — try again in a moment.", { id: "lobby-nudge-limit", icon: "👋" });
      if (result.reason === "busy") toast(`${presenceNameOf(result.to)} is already matched`, { id: `lobby-nudge-busy-${result.to}`, icon: "👋" });
    },
    onNudgeReplyResult: (result) => {
      if (result.ok) return;
      const name = nudgerNamesRef.current.get(result.to) ?? presenceNameOf(result.to);
      toast(nudgeReplyFailMessage(result.reason, name), { id: `lobby-nudge-reply-${result.to}`, icon: "👋" });
    },
    onNudgeDeclined: (from) => {
      unwave(from.id);
      toast(`${pairPartnerName(from)} can't play right now`, { id: `lobby-nudge-declined-${from.id}`, icon: "👋" });
    },
    onPaired: ({ pairId, role, with: partner }) => {
      toast.dismiss(`lobby-nudged-${partner.id}`);
      toast.dismiss(`lobby-nudge-declined-${partner.id}`);
      unwave(partner.id);
      stepPair({ type: "paired", pairId, role, with: partner });
      // The pair room is a duel: the host's STAGE rail lists duel boards, and a
      // board that isn't one (or Custom…) goes back to Random.
      setSelectedFormat("duel");
      setSelectedMapId((prev) => {
        if (prev === RANDOM_MAP_ID) return prev;
        const entry = catalogEntry(prev);
        return entry && mapEligibleForFormat(entry.map, "duel") ? prev : RANDOM_MAP_ID;
      });
    },
    onPairRoom: ({ pairId, roomId: pairRoomId }) => {
      stepPair({ type: "room", pairId, roomId: pairRoomId, seated: joined });
    },
    onPairEnded: ({ pairId, reason }) => {
      const current = pairRef.current;
      if (!current || current.pairId !== pairId) return;
      stepPair({ type: "ended", pairId, seated: joined }, pairEndedMessage(reason, pairPartnerName(current.with)));
    },
  });
  const lobbySnapshot = lobbySocket.snapshot;
  // The bonus advert outlives the lobby socket: a search closes it (the player
  // took a seat), and the searching panel still says "2× XP".
  const [knownBonus, setKnownBonus] = useState<QuickPlayBonus | null>(null);
  useEffect(() => {
    if (lobbySnapshot) setKnownBonus(lobbySnapshot.bonus ?? null);
  }, [lobbySnapshot]);
  const bonus = activeBonus(knownBonus, Date.now());
  const bonusLabel = bonus ? multiplierLabel(bonus.multiplier) : null;
  // SNAPSHOT.lobbies replaces the LIST_LOBBIES poll while the lobby socket is up.
  const shownLobbies = effectiveLobbies(lobbySnapshot?.lobbies, lobbies);
  const lobbyLive = !!lobbySnapshot;

  // Public-lobby browser: poll while sitting in the pre-join picker (cheap —
  // one tiny message every 5s against the already-open socket). Quick Match
  // (#687) keeps the same poll running past the picker: the waiting screen shows
  // a live count of who else is searching, and it is the list a re-try would
  // walk. A boolean (not the search object) so an advance doesn't restart the
  // interval.
  const quickSearching = quickSearch !== null;
  // #1542: the lobby socket's pushed list stands in for the poll while it is up.
  useEffect(() => {
    if (status !== "open") return;
    if (!quickSearching && (joined || room)) return;
    if (!quickSearching && lobbyLive) return;
    requestLobbies();
    const timer = setInterval(requestLobbies, 5_000);
    return () => clearInterval(timer);
  }, [joined, room, status, requestLobbies, quickSearching, lobbyLive]);

  // Quick Match, step 1 of 2 — DRIVE the search. Each index either joins the
  // longest-waiting lobby we haven't tried yet or, once the list is spent, opens
  // our own room with `quickMatch: true`. The ref makes each index fire exactly
  // once (the effect also re-runs on unrelated re-renders).
  const quickStepRef = useRef(-1);
  // The room id we held when a Quick Match CREATE_ROOM went out — `undefined`
  // when nothing is armed. See the auto-publish effect below.
  const quickCreatedFromRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!quickSearch) {
      quickStepRef.current = -1;
      return;
    }
    if (quickStepRef.current === quickSearch.index) return;
    quickStepRef.current = quickSearch.index;
    const step = quickMatchStep(quickSearch);
    if (step.type === "join") {
      joinRoom(step.roomId, quickSearch.heroId, undefined, true);
    } else {
      // A matchmade room is a standard duel: it ignores the picker's format and
      // timer deliberately, so the room the next searcher joins is always the
      // same thing — a duel on the Quick Play timer (QUICK_PLAY_TIMER_SECONDS). The BOARD is rolled, not fixed — #685 made Random the
      // default precisely so every lobby stops opening on The Mended Drum, and a
      // Quick Match room is the one nobody hand-picks a board for. Same
      // `rollRandomMap` + `customMapForEntry` pair the Create path uses, so the
      // server-default board still sends no `customMap`.
      const rolledEntry = rollRandomMap("duel");
      setRolledMapId(rolledEntry.id); // …so the waiting screen names it (🎲)
      createRoom(
        quickSearch.heroId,
        undefined,
        customMapForEntry(rolledEntry),
        "duel",
        [],
        QUICK_PLAY_TIMER_SECONDS,
        mulligan,
        true,
      );
      // Arm the auto-publish below. We can't send SET_VISIBILITY yet: it needs
      // the room id, which only arrives with ROOM_CREATED — so we remember the
      // id we had (null, or the last lobby that raced away) and fire when it
      // changes to our own.
      quickCreatedFromRef.current = roomId;
    }
    setJoined(true);
  }, [quickSearch, joinRoom, createRoom, mulligan, roomId]);

  // A Quick Match room has to be findable by the NEXT searcher or matchmaking
  // only ever pairs the second player with the first. Public-by-default is the
  // engine ticket's half (#391); this is what makes the feature work against the
  // engine as deployed today, and it is a harmless no-op once that lands.
  useEffect(() => {
    const armedFrom = quickCreatedFromRef.current;
    if (armedFrom === undefined || !roomId || roomId === armedFrom) return;
    quickCreatedFromRef.current = undefined; // one-shot per created room
    setVisibility(true);
  }, [roomId, setVisibility]);

  // Quick Match, step 2 of 2 — ABSORB the race. A lobby that filled or vanished
  // between the poll and our join answers ROOM_FULL / ROOM_NOT_FOUND; that is an
  // ordinary matchmaking outcome, not something to show anyone, so we walk to the
  // next candidate (and eventually to create). The ref consumes each error object
  // exactly once — without it this effect would re-fire on the re-render its own
  // advance causes and skip a candidate.
  const quickErrorRef = useRef<typeof error>(null);
  useEffect(() => {
    if (!error) {
      quickErrorRef.current = null;
      return;
    }
    if (!quickSearch || quickErrorRef.current === error) return;
    if (!isQuickMatchRetryable(error.code)) return;
    quickErrorRef.current = error;
    setQuickSearch(advanceQuickMatch(quickSearch));
  }, [error, quickSearch]);

  // "Play a bot instead" (#687). DROP-AND-CREATE: there is no engine message for
  // adding a bot to a room that already exists, so we leave. A full navigation
  // (not a router push) closes the socket, which the server reads as the host
  // walking away, and the URL re-enters the ordinary `?vs=ai-*` create flow with
  // our fighter already picked. Medium unless the server doesn't serve it for
  // this hero — the tier list is server data, never a client constant (#458).
  const playBotInstead = () => {
    const heroId = selectedHeroId;
    if (!heroId || typeof window === "undefined") return;
    const tier = coerceBotTier("medium", availableBotTiers(heroes, [heroId]));
    window.location.href = botFallbackHref(heroId, tier, { debug });
  };

  // ---- Quick Match on the picker (#1542) -------------------------------------
  // A search no longer swaps the page for a waiting room: the picker stays up and
  // only the dock's two buttons turn into "Finding a match", then "Match found"
  // for QUICK_FOUND_MS, then the table. Roster and ribbon stay live throughout.
  const [quickStartedAt, setQuickStartedAt] = useState<number | null>(null);
  const [quickFoundAt, setQuickFoundAt] = useState<number | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const beginQuickMatch = (heroId: string) => {
    setSelectedHeroId(heroId);
    setRolledHero(heroId !== (selectedHeroId ?? (heroes === null ? heroParam : null)));
    setSelectedFormat("duel"); // v1 matches duels only
    tournament.seatedUntagged();
    rememberHero(heroId); // "Recently played" row (#768)
    setQuickSearch(startQuickMatch(heroId, shownLobbies));
    setQuickStartedAt(Date.now());
    setQuickFoundAt(null);
    setInviteCopied(false);
    // One `hero_picked` per search, however many lobbies it walks (#1512).
    trackHeroPicked(heroId, "quickmatch");
  };
  const quickOpponent = quickSearch ? foundOpponent(roomInfo?.roster, roomInfo?.you) : null;
  const quickLanded = !!quickSearch && (!!snapshot || !!quickOpponent);
  useEffect(() => {
    if (quickLanded && quickFoundAt === null) setQuickFoundAt(Date.now());
  }, [quickLanded, quickFoundAt]);
  const [quickNow, setQuickNow] = useState(() => Date.now());
  // The table opens once the countdown is spent AND the first STATE is in.
  const quickFoundDone = quickFoundAt !== null && quickNow - quickFoundAt >= QUICK_FOUND_MS && !!snapshot;
  const quickTicking = !!quickSearch && !quickFoundDone;
  useEffect(() => {
    if (!quickTicking) return;
    setQuickNow(Date.now());
    const timer = setInterval(() => setQuickNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [quickTicking]);
  // A real (non-race) error, or a lost game, takes the screen as it always has.
  const showQuickDock =
    !!quickSearch && !quickFoundDone && !gameLost && !(error && !isQuickMatchRetryable(error.code));
  // Cancel and Join-while-searching LEAVE the room the search may already hold.
  // There is no leave message (see playBotInstead), so both are a full navigation:
  // the socket closes, the server drops the seat, and the URL lands back on the
  // picker with the fighter still locked (`?hero=`), or in the chosen room.
  const pickedHero = selectedHeroId && selectedHeroId !== RANDOM_HERO_ID ? selectedHeroId : null;
  // `flash` (#1556) is a toast for the page we land on: the navigation would
  // otherwise swallow "Sam cancelled" before anyone could read it.
  const leaveToPicker = (heroId: string | null, flash?: string) => {
    // Leaving a waiting room we listed (a cancelled Quick Match): unlist it first,
    // so nobody joins an empty table while the page reloads. The engine also hides
    // a host whose socket dropped; this makes the leave explicit, not inferred.
    if (roomId && roomPublic && !snapshot) setVisibility(false);
    if (flash) {
      try {
        window.sessionStorage.setItem(PRO_FLASH_KEY, flash);
      } catch {
        /* private mode: the toast is lost, the navigation is not */
      }
    }
    const params = new URLSearchParams();
    if (heroId) params.set("hero", heroId);
    if (debug) params.set("debug", "1");
    const qs = params.toString();
    window.location.href = `/pro/game${qs ? `?${qs}` : ""}`;
  };
  const cancelQuickMatch = () => leaveToPicker(pickedHero ?? quickSearch?.heroId ?? null);
  const joinFromRibbon = (lobbyRoomId: string) => {
    if (quickSearch) {
      const params = new URLSearchParams({ room: lobbyRoomId });
      if (pickedHero) params.set("hero", pickedHero);
      if (debug) params.set("debug", "1");
      window.location.href = `/pro/game?${params.toString()}`;
      return;
    }
    // Today's lobby-row click: through `?room=` and the hero picker, with the
    // current pick carried so it stays selected (and survives a refresh).
    router.replace(
      { pathname: router.pathname, query: { ...router.query, room: lobbyRoomId, ...(pickedHero ? { hero: pickedHero } : {}) } },
      undefined,
      { shallow: true }
    );
  };
  const onNudge = (presenceId: string) => {
    if (pairRef.current) return;
    setWaved((prev) => new Set(prev).add(presenceId));
    const timers = waveTimersRef.current;
    const prior = timers.get(presenceId);
    if (prior) clearTimeout(prior);
    // No answer inside the server's invitation window: the chip re-enables.
    timers.set(presenceId, setTimeout(() => unwave(presenceId), NUDGE_REPLY_WINDOW_MS));
    lobbySocket.nudge(presenceId);
  };

  // ---- Matched mode (#1556) --------------------------------------------------
  // The name a presence id goes by in the latest SNAPSHOT, for toasts.
  function presenceNameOf(id: string): string {
    const entry = lobbySocket.snapshot?.players.find((p) => p.id === id);
    return (entry && presenceName(entry)) ?? "That player";
  }
  // Host: the room id we held when the pair's CREATE_ROOM went out (`undefined`
  // = nothing armed), so ROOM_CREATED for OUR room is what triggers PAIR_ROOM.
  const pairCreatedFromRef = useRef<string | null | undefined>(undefined);
  // Guest: the pair room we sent JOIN_ROOM for, so its ROOM_NOT_FOUND/ROOM_FULL
  // reads as "their table closed" rather than a bad link.
  const pairJoinRef = useRef<string | null>(null);
  const runPairEffect = (effect: PairEffect, flash?: string) => {
    switch (effect.type) {
      case "create": {
        // The Quick Match create step's call shape: a standard duel on a rolled
        // board, `quickMatch: true` so it pays the bonus. Deliberately NOT armed
        // for the auto-publish (`quickCreatedFromRef`): a pair room stays private.
        const heroId = pairGoHeroRef.current;
        if (!heroId) return;
        // The host's STAGE pick (catalog boards only, duel-eligible); Random — the
        // default — or anything else rolls from the duel pool like Quick Match.
        const picked = catalogEntry(selectedMapId);
        const chosen = picked && mapEligibleForFormat(picked.map, "duel") ? picked : null;
        const boardEntry = chosen ?? rollRandomMap("duel");
        setRolledMapId(chosen ? null : boardEntry.id);
        setSelectedFormat("duel");
        tournament.seatedUntagged();
        pairCreatedFromRef.current = roomId;
        createRoom(heroId, undefined, customMapForEntry(boardEntry), "duel", [], QUICK_PLAY_TIMER_SECONDS, mulligan, true);
        trackHeroPicked(heroId, "quickmatch");
        setJoined(true);
        return;
      }
      case "join": {
        // The latest pick wins: a guest may change fighter while it waits.
        const heroId = pickedHero ?? pairGoHeroRef.current;
        if (!heroId) return;
        pairJoinRef.current = effect.roomId;
        setSelectedHeroId(heroId);
        setSelectedFormat("duel");
        tournament.seatedUntagged();
        joinRoom(effect.roomId, heroId, undefined, true);
        trackHeroPicked(heroId, "quickmatch");
        setJoined(true);
        return;
      }
      case "pairRoom":
        lobbySocket.pairRoom(effect.pairId, effect.roomId);
        return;
      case "cancelPair":
        lobbySocket.cancelPair(effect.pairId);
        return;
      case "leave":
        leaveToPicker(pickedHero ?? pairGoHeroRef.current, flash);
        return;
    }
  };
  /** Advance the pair; `flash` is the toast to show (carried across a "leave"). */
  function stepPair(event: PairEvent, flash?: string) {
    const { pair: next, effects } = reducePair(pairRef.current, event);
    pairRef.current = next;
    setPair(next);
    for (const effect of effects) runPairEffect(effect, flash);
    if (flash && !effects.some((e) => e.type === "leave")) toast(flash, { id: "lobby-pair-notice", icon: "👋" });
  }
  const pairGo = (heroId: string) => {
    pairGoHeroRef.current = heroId;
    setSelectedHeroId(heroId);
    setRolledHero(false);
    rememberHero(heroId); // "Recently played" row (#768)
    stepPair({ type: "go" });
  };
  const cancelPair = () => stepPair({ type: "cancel", seated: joined });
  // The partner pressed Go and we haven't: say so once per pair (toast), and in the
  // tab title while the tab is hidden, so the nudge to confirm is hard to miss.
  const partnerIsReady = pair ? partnerReady(pair, livePartner(pair, lobbySnapshot?.players)) : false;
  const weAreReady = !!pair?.ready;
  const readyToastedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pair || !partnerIsReady || weAreReady) return;
    if (readyToastedRef.current !== pair.pairId) {
      readyToastedRef.current = pair.pairId;
      toast(`${pairPartnerName(pair.with)} is ready — pick your fighter and Go!`, { id: `pair-ready-${pair.pairId}`, icon: "⚔️", duration: 6_000 });
    }
    if (typeof document === "undefined") return;
    const prev = document.title;
    const flash = () => {
      document.title = document.visibilityState === "hidden" ? `⚔️ ${pairPartnerName(pair.with)} is ready!` : prev;
    };
    flash();
    document.addEventListener("visibilitychange", flash);
    return () => {
      document.removeEventListener("visibilitychange", flash);
      document.title = prev;
    };
  }, [pair, partnerIsReady, weAreReady]);
  // Host: ROOM_CREATED for the pair's room ⇒ relay it to the guest.
  useEffect(() => {
    const armedFrom = pairCreatedFromRef.current;
    if (armedFrom === undefined || !roomId || roomId === armedFrom) return;
    pairCreatedFromRef.current = undefined;
    stepPair({ type: "created", roomId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  // The game's first STATE: the pair is handed off (both seats taken). Forget it.
  useEffect(() => {
    if (!snapshot || !pairRef.current) return;
    pairRef.current = null;
    setPair(null);
  }, [snapshot]);
  // The lobby socket dropped while paired: a reconnect is a new socket id, so the
  // server has already ended the pair. Once the room has been relayed the pair is
  // handed off and survives a drop (the server forgets it silently too).
  const lobbyWasLiveRef = useRef(false);
  useEffect(() => {
    const was = lobbyWasLiveRef.current;
    lobbyWasLiveRef.current = lobbyLive;
    const current = pairRef.current;
    if (!was || lobbyLive || !current || current.roomId !== null || snapshot) return;
    stepPair({ type: "clear", seated: joined }, "Lost the lobby connection — wave again");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyLive]);
  // Game-side answers to the pair's own frames.
  useEffect(() => {
    const current = pairRef.current;
    if (!current || !error) return;
    // Guest: the host's table is gone (or already full) — back to the picker.
    if (pairJoinRef.current && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FULL")) {
      pairJoinRef.current = null;
      stepPair({ type: "cancel", seated: true }, `${pairPartnerName(current.with)}'s table closed`);
      return;
    }
    // Host: the create bounced back to the picker (ROOM_LIMIT and friends; see the
    // error effect below) — let Go try again.
    if (current.role === "host" && current.ready && current.roomId === null) {
      pairCreatedFromRef.current = undefined;
      stepPair({ type: "unready" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  // A toast a full navigation carried over (see leaveToPicker).
  useEffect(() => {
    try {
      const flash = window.sessionStorage.getItem(PRO_FLASH_KEY);
      if (!flash) return;
      window.sessionStorage.removeItem(PRO_FLASH_KEY);
      toast(flash, { id: "pro-flash", icon: "👋" });
    } catch {
      /* no storage */
    }
  }, []);

  // Preselect a hero once the server roster arrives: honor a valid `?hero=`
  // (invalid ids are ignored → manual pick), and auto-select when only one
  // hero ships so the picker reads as a confirmation.
  useEffect(() => {
    if (selectedHeroId || !heroes) return;
    if (heroParam && heroes.some((h) => h.heroId === heroParam)) {
      setSelectedHeroId(heroParam);
    } else if (heroes.length === 1) {
      setSelectedHeroId(heroes[0].heroId);
    }
  }, [heroes, heroParam, selectedHeroId]);

  // One-tap rematch (issue #TBD): fire the CREATE_ROOM a rematch link encoded,
  // exactly once, the moment this page mounts with one. Mirrors what the
  // create-lobby's own submit does alongside `createRoom` — `setSelectedHeroId`
  // + `setJoined(true)` — so every `joined`-gated effect below (and the
  // waiting room's own "playing on <board>" line) behaves as if the player
  // had picked all of this by hand, and the picker never flashes on screen.
  // `customMap` is resolved from `rematch.mapId` here (not in lib/pro/rematch,
  // which stays protocol-only) via the same catalog helpers onConfirm uses; a
  // pasted-custom board has no mapId and rematches onto the format's default.
  // The link's params come straight off the URL the moment it fires (#876):
  // the page's own `room=` takes over from there, so a refresh or a copied URL
  // RECONNECTs to this room instead of minting another empty one. What the
  // waiting room still needs from the link (`joinHero`) is kept in state.
  const rematchFiredRef = useRef(false);
  const [firedRematch, setFiredRematch] = useState<ParsedRematch | null>(null);
  useEffect(() => {
    if (!rematch || rematchFiredRef.current) return;
    rematchFiredRef.current = true;
    tournament.seatedUntagged();
    setFiredRematch(rematch);
    router.replace(
      { pathname: router.pathname, query: withoutRematchQuery(router.query) },
      undefined,
      { shallow: true }
    );
    const args = rematchCreateRoomArgs(rematch);
    const mapEntry = rematch.mapId ? catalogEntry(rematch.mapId) : undefined;
    createRoom(
      args.heroId,
      args.bot,
      mapEntry ? customMapForEntry(mapEntry) : undefined,
      args.formatId,
      args.botSeats,
      args.turnTimerSeconds,
      args.mulligan,
      undefined,
      args.itemsEnabled,
    );
    setSelectedHeroId(args.heroId);
    setSelectedFormat(rematch.formatId as ProFormatId);
    if (rematch.mapId) setSelectedMapId(rematch.mapId);
    if (args.itemsEnabled === false) setItemsEnabled(false);
    setJoined(true);
    // `tournament` is a fresh object every render; this fires once per rematch link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rematch, createRoom, router]);

  // UNKNOWN_HERO shouldn't happen when picking from the server list, but if the
  // server rejects the hero, drop back to the picker instead of a dead end.
  // BAD_MAP similarly bounces back to the lobby (hero kept) with the server's
  // validation message shown against the still-populated map box.
  useEffect(() => {
    // A bounce back to the picker also ends a Quick Match (#1542): the dock would
    // otherwise keep "Finding a match" up for a search that has stopped.
    if (error?.code === "UNKNOWN_HERO" || error?.code === "BAD_MAP" || error?.code === "ROOM_LIMIT") setQuickSearch(null);
    if (error?.code === "UNKNOWN_HERO") {
      setJoined(false);
      setSelectedHeroId(null);
      setRolledHero(false);
    }
    if (error?.code === "BAD_MAP") {
      setJoined(false);
      // Only a pasted custom board realistically fails validation; select the
      // Custom… option so its textarea (where the error renders) is visible.
      setSelectedMapId(CUSTOM_MAP_ID);
      setRolledMapId(null);
      setMapError(error.message);
    }
    // ROOM_LIMIT (PR #103): the server is at its global room cap on create/join.
    // Non-fatal — bounce back to the landing picker (keep the hero/format/board
    // selections intact) and toast the friendly retry copy; the player just tries
    // again in a minute. Never the raw error screen or loss path.
    if (error?.code === "ROOM_LIMIT") {
      setJoined(false);
      toast(proErrorMessage("ROOM_LIMIT"), { id: "pro-room-limit", icon: "⏳" });
    }
  }, [error]);

  if (tournament.preJoinScreen) return tournament.preJoinScreen;

  // #1542: a Quick Match search keeps the picker up (the dock shows its state).
  if (!joined || showQuickDock) {
    const effectiveHeroId = selectedHeroId ?? (heroes === null ? heroParam : null);
    // ---- Quick Play lobby surface (#1542) ----
    const hereCount = lobbySnapshot ? presentCount(lobbySnapshot) : null;
    const presenceModel = presencePillModel({
      connected: status === "open" || lobbyLive,
      here: hereCount,
      lobbies: shownLobbies,
      players: lobbySnapshot?.players,
      you: lobbySnapshot?.you,
      ownRoomId: roomId,
      youLooking: quickSearch !== null,
    });
    const ribbonChips = ribbonItems({
      lobbies: shownLobbies,
      players: lobbySnapshot?.players,
      you: lobbySnapshot?.you,
      ownRoomId: roomId,
      tablesInPlay: lobbySnapshot?.tablesInPlay,
    });
    const ribbonShown = (status === "open" || lobbyLive) && (ribbonChips.length > 0 || !!bonus);
    const ribbon = ribbonShown ? (
      <LobbyRibbon
        items={ribbonChips}
        here={hereCount}
        bonus={bonus && bonusLabel ? { label: bonusLabel } : null}
        onJoin={joinFromRibbon}
        onNudge={lobbyLive ? onNudge : undefined}
        waved={waved}
        disabled={pair !== null}
      />
    ) : null;
    // Matched mode (#1556): the partner as the latest SNAPSHOT shows them.
    let pairMode: ComponentProps<typeof HeroSelectLobby>["pairMode"] = null;
    if (pair) {
      const partner = livePartner(pair, lobbySnapshot?.players);
      pairMode = {
        partner: {
          avatar: presenceAvatar(partner),
          name: pairPartnerName(partner),
          badge: partner.badges?.[0] ?? partner.badge ?? null,
          heroId: partner.heroId ?? null,
          heroName: partner.heroName ?? (partner.heroId ? heroNameOf(heroes, partner.heroId) : null),
          ready: partnerReady(pair, partner),
        },
        role: pair.role,
        waiting: pair.role === "guest" && pair.ready,
        bonusLabel,
        onGo: pairGo,
        onCancel: cancelPair,
      };
    }
    const quickHeroName = quickSearch ? heroNameOf(heroes, quickSearch.heroId) : null;
    const opponentName = quickOpponent?.displayName?.trim() || "Anonymous";
    const opponentHero = quickOpponent ? heroNameOf(heroes, quickOpponent.heroId) : null;
    let dockPanel: ReactNode = null;
    if (showQuickDock && quickSearch && quickFoundAt !== null) {
      const timerRule = roomInfo?.turnTimerSeconds ? `${roomInfo.turnTimerSeconds}s timer` : "untimed";
      dockPanel = (
        <FoundPanel
          name={opponentName}
          badge={quickOpponent?.badges?.[0] ?? quickOpponent?.badge ?? null}
          heroName={opponentHero}
          board={(rolledMapId ? catalogEntry(rolledMapId)?.title : snapshot?.view.map?.meta?.title) ?? null}
          rules={rolledMapId ? `${timerRule}, ${mulligan ? "mulligan on" : "no mulligan"}` : timerRule}
          multiplierLabel={roomInfo?.xpMultiplier && roomInfo.xpMultiplier > 1 ? multiplierLabel(roomInfo.xpMultiplier) : null}
          secondsLeft={Math.ceil((QUICK_FOUND_MS - Math.max(0, quickNow - quickFoundAt)) / 1000)}
        />
      );
    } else if (showQuickDock && quickSearch) {
      const inviteUrl = roomId && typeof window !== "undefined" ? `${window.location.origin}/pro/game?room=${roomId}` : null;
      dockPanel = (
        <SearchingPanel
          bonusLabel={bonusLabel}
          progress={searchProgressLine({
            candidates: quickSearch.candidates,
            index: quickSearch.index,
            waiting: isQuickMatchWaiting(quickSearch),
            seated: !!roomInfo,
            lobbies: shownLobbies,
            ownRoomId: roomInfo ? roomId : null,
          })}
          elapsed={elapsedLabel(quickStartedAt === null ? 0 : quickNow - quickStartedAt)}
          onInvite={
            inviteUrl && roomInfo
              ? () =>
                  void navigator.clipboard
                    ?.writeText(inviteUrl)
                    .then(() => {
                      setInviteCopied(true);
                      trackInviteCopied("pro");
                    })
                    .catch(() => {})
              : undefined
          }
          inviteCopied={inviteCopied}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onBot={selectedHeroId ? playBotInstead : undefined}
          onCancel={cancelQuickMatch}
        />
      );
    }
    // Recent rooms now surface as "rejoin" chips inside the lobby's rules strip.
    const resumeRoom = (roomId: string) => {
      joinRoom(roomId, ""); // token path — heroId ignored
      setJoined(true);
    };
    return (
      <>
        {/* The lobby has no ProHud, so without this the account chip is
            invisible until you're actually in a game. InGameAccountChip, not
            the page AccountChip: the socket is already live here and its
            same-tab OAuth hop would tear it down. */}
        <ChipCluster>
          <InGameAccountChip />
        </ChipCluster>
        <HeroSelectLobby
          // Once the search holds a seat the URL carries `?room=` (for refresh);
          // that is still the Quick Match picker, not a join-this-room one.
          room={showQuickDock ? null : room}
          tournament={tournament.lobby}
          status={status}
          heroes={heroes}
          heroParam={heroParam}
          recentRooms={recentRooms}
          tierUnlock={tierUnlock}
          onResumeRoom={resumeRoom}
          selectedHeroId={selectedHeroId}
          opponent={opponent}
          selectedFormat={selectedFormat}
          onSelectFormat={(format) => {
            setSelectedFormat(format);
            if (format !== "duel") reviseOpponent("human");
            setBotSlotPlan((prev) => {
              const allowed = new Set(assignableSeats(format));
              return Object.fromEntries(Object.entries(prev).filter(([player]) => allowed.has(player as PlayerId))) as BotSlotPlan;
            });
            // Keep a still-eligible board (and a "Custom…" choice) selected;
            // otherwise fall back to the new format's default board.
            setSelectedMapId((prev) => {
              if (prev === CUSTOM_MAP_ID || prev === RANDOM_MAP_ID) return prev;
              const entry = catalogEntry(prev);
              if (entry && mapEligibleForFormat(entry.map, format)) return prev;
              return defaultMapIdForFormat(format);
            });
          }}
          onSelectOpponent={chooseOpponent}
          onSelectHero={(id) => {
            setSelectedHeroId(id);
            setRolledHero(false); // a fresh pick isn't a roll until one happens
          }}
          aiHeroId={aiHeroId}
          onSelectAiHero={setAiHeroId}
          botSlotPlan={botSlotPlan}
          onChangeBotSlot={(player, occupant) =>
            setBotSlotPlan((prev) => ({ ...prev, [player]: occupant }))
          }
          turnTimerSeconds={turnTimerSeconds}
          onSelectTurnTimer={setTurnTimerSeconds}
          mulligan={mulligan}
          onSelectMulligan={setMulligan}
          itemsEnabled={itemsEnabled}
          onSelectItemsEnabled={setItemsEnabled}
          customMapJson={customMapJson}
          onCustomMapJsonChange={(json) => {
            setCustomMapJson(json);
            if (mapError) setMapError(null); // clear stale error as they edit
          }}
          selectedMapId={selectedMapId}
          onSelectMap={(id) => {
            setSelectedMapId(id);
            setRolledMapId(null);
            if (mapError) setMapError(null);
          }}
          mapError={mapError}
          quickMatchArmed={quickParam}
          presencePill={
            presenceModel ? (
              <Flex align="center" gap="0.4rem">
                <PresencePill model={presenceModel} />
                {lobbyVisible !== null && <LobbyVisibilityToggle visible={lobbyVisible} onChange={setLobbyVisible} />}
              </Flex>
            ) : null
          }
          ribbon={ribbon}
          quickMatchSubline={quickMatchSublineFor(lookingCount(shownLobbies, roomId))}
          quickMatchBonusLabel={bonusLabel}
          bonusSummary={bonusLabel}
          heroPips={lobbyHeroPips(shownLobbies, roomId)}
          dockPanel={dockPanel}
          pairMode={pairMode}
          p1HeroName={showQuickDock ? quickHeroName : undefined}
          p2Status={
            !showQuickDock
              ? null
              : quickFoundAt !== null
                ? { role: opponentName, title: opponentHero ?? "Opponent", found: true }
                : { role: "Opponent", title: "Searching…", found: false }
          }
          // Quick Match (#687): one button that finds you a game — join whoever
          // has waited longest, else open a public room and wait. It is not a
          // queue: every frame it sends is a JOIN_ROOM or a CREATE_ROOM this
          // picker could also make by hand. `?quick=1` (the landing CTA) only
          // highlights it — we never auto-fire, because the fighter pick is the
          // one choice nobody can make for the player.
          onQuickMatch={
            room && !showQuickDock ? undefined : beginQuickMatch
          }
          onConfirm={(heroId) => {
            // `heroId` is always CONCRETE: the lobby has already resolved a
            // Random pick (#697) against its filtered roster, so the sentinel
            // never reaches CREATE_ROOM/JOIN_ROOM. It differing from what was
            // selected is exactly the signal that a roll happened, which the
            // waiting screen uses to mark the fighter with a 🎲.
            const wasRolled = heroId !== effectiveHeroId;
            // Feed the lobby's "Recently played" row (#768). Browser-local and
            // purely cosmetic — nothing here touches the frame we're about to
            // send, and the id is already concrete (a Random pick is resolved).
            rememberHero(heroId);
            // A tournament game: the ticket decides room, board, format.
            if (tournament.pick(heroId, wasRolled)) return;
            if (room) {
              joinRoom(room, heroId);
              setSelectedHeroId(heroId);
              setRolledHero(wasRolled);
              setJoined(true);
              return;
            }
            // Create flow: resolve the chosen board. A catalog board sends its
            // ProMapDef (or nothing, for the server-default duel board); the
            // Custom… option parses the pasted JSON just-in-time. Local errors
            // stay in the lobby; the server re-validates and answers BAD_MAP.
            let customMap: ProMapDef | undefined;
            let rolled: string | null = null;
            if (selectedMapId === RANDOM_MAP_ID) {
              // Deferred resolution (#685): roll now, then behave exactly as if
              // that board's tile had been clicked — Mended Drum still sends no
              // customMap, every other board sends its full ProMapDef. The pool
              // is the format's (`randomMapPool`), not the whole catalog.
              const entry = rollRandomMap(selectedFormat);
              rolled = entry.id;
              customMap = customMapForEntry(entry);
            } else if (selectedMapId === CUSTOM_MAP_ID) {
              const trimmed = customMapJson.trim();
              if (trimmed) {
                try {
                  customMap = normalizeMap(JSON.parse(trimmed));
                } catch (e) {
                  setMapError(e instanceof Error ? e.message : "invalid JSON");
                  return;
                }
              } else {
                // blank Custom… → fall back to the format's default board
                const def = catalogEntry(defaultMapIdForFormat(selectedFormat));
                customMap = def ? customMapForEntry(def) : undefined;
              }
            } else {
              const entry =
                catalogEntry(selectedMapId) ??
                catalogEntry(defaultMapIdForFormat(selectedFormat))!;
              customMap = customMapForEntry(entry);
            }
            setMapError(null);
            setRolledMapId(rolled);
            const bot =
              selectedFormat !== "duel" || opponent === "human"
                ? undefined
                : { difficulty: opponent, ...(aiHeroId ? { heroId: aiHeroId } : {}) };
            const botSeats: BotSeatFill[] =
              selectedFormat === "duel"
                ? []
                : Object.entries(botSlotPlan)
                    .filter((entry): entry is [string, Exclude<SlotOccupant, "human">] => entry[1] !== "human")
                    .map(([player, difficulty]) => ({ player: player as PlayerId, difficulty }));
            // Clamp to the engine's 10–300 bound at the wire (a mid-edit custom
            // value could sit outside it); 0 = off stays off.
            const timerSeconds = turnTimerSeconds > 0 ? clampTurnTimer(turnTimerSeconds) : 0;
            // 🎁 items (#725): the opt-out rides only when the chosen board
            // actually carries items (same predicate as the chip) — a hidden
            // chip must never put the field on the wire, so item-less creates,
            // the Random roll, and a blank Custom paste all stay byte-identical.
            const itemsOptOut = mapHasItems(selectedMapId, customMapJson) && itemsEnabled === false;
            createRoom(
              heroId,
              bot,
              customMap,
              selectedFormat,
              botSeats,
              timerSeconds,
              mulligan,
              undefined,
              itemsOptOut ? false : undefined,
            );
            setSelectedHeroId(heroId); // lock it for the lobby label
            setRolledHero(wasRolled);
            setJoined(true);
          }}
        />
        {/* The old "Open lobbies" strip under the picker is the ribbon now (#1542). */}
      </>
    );
  }

  if (tournament.seatScreen) return tournament.seatScreen;
  if (tournament.closedScreen) return tournament.closedScreen;

  // Terminal resume failure (issue #133): a live game we couldn't restore after
  // a server update. Takes priority over the raw error/waiting screens — those
  // dead-ended on a freeze; this apologizes, shows the activity log, and offers a
  // way to complain. `gameLost` is set ONLY on genuine loss (never a slow-but-ok
  // resume), so the happy path never reaches here (useProSocket).
  if (gameLost) {
    return (
      <GameLostScreen
        entries={logEntries}
        view={snapshot?.view ?? null}
        roomId={roomId}
        resolveCard={resolveCard}
        labelFor={snapshot ? (c) => cardLabel(snapshot.view.catalog, c) : undefined}
        aside={tournament.lostGameAside}
      />
    );
  }

  // A tournament game refused: the ticket card, never "create a new room".
  if (tournament.errorScreen) return tournament.errorScreen;

  // Room-level errors surface on a friendly screen with a create-new fallback.
  // (ROOM_LIMIT is handled earlier as a non-fatal bounce back to the landing
  // picker, so it never reaches this terminal screen.)
  // (…unless Quick Match is mid-search: a full/vanished lobby is its normal
  // fodder and the effect above is already walking to the next candidate.)
  if (!quickSearch && error && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FULL")) {
    const msg = proErrorMessage(error.code);
    return (
      <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem" textAlign="center">
        <Text fontFamily="LeagueGothic" fontSize="2rem" letterSpacing="0.05em" color="red.300">
          {msg}
        </Text>
        <Button {...BTN_GOLD} onClick={() => (window.location.href = "/pro/game")}>
          Create a new room instead
        </Button>
      </Flex>
    );
  }

  if (error)
    return (
      <Text color="red.300" pt="4rem" textAlign="center">
        {error.code}: {error.message}
      </Text>
    );
  // The server sends the first STATE only once BOTH seats are filled — a
  // created room sits here (correctly) until the opponent joins. (Any room
  // with no state yet shows this; the room id is also in the URL now, so
  // don't gate on its absence.)
  if (!snapshot) {
    // Quick Match (#687) never reaches this screen since #1542: its search and
    // its own open table both live in the picker's dock (see showQuickDock).
    if (roomId) {
      // A rematch link's `joinHero` (lib/pro/rematch.ts) pre-fills the invite
      // we're about to hand the previous game's other seat, so joining this
      // rematch is a hero-picker-free tap for them too — the same courtesy
      // `?hero=` already does for any other invite link.
      const joinUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/pro/game?room=${roomId}${
              firedRematch?.joinHeroId ? `&hero=${encodeURIComponent(firedRematch.joinHeroId)}` : ""
            }`
          : "";
      // After a refresh / "Back to your room" this page load never picked a hero
      // or board (E7, #1236): the room's own roster still names our seat's hero,
      // and the board is unknown — say nothing rather than the default's name.
      const myWaitingHeroName =
        heroNameOf(heroes, selectedHeroId ?? roomInfo?.roster?.find((r) => r.player === roomInfo.you)?.heroId ?? null);
      const boardUnknown = (reconnectedRef.current || tournament.boardUnknown) && !rolledMapId;
      return (
        <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem">
          <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em" data-testid="waiting-title">
            {pair ? `Waiting for ${pairPartnerName(pair.with)}…` : tournament.at ? "YOUR MATCH ROOM" : `ROOM ${roomId}`}
          </Text>
          {myWaitingHeroName && (
            <Text fontFamily="BebasNeueRegular" fontSize="1.3rem" letterSpacing="0.05em" color="brand.accent">
              {`You are ${myWaitingHeroName}${rolledHero ? " 🎲" : ""}`}
            </Text>
          )}
          <Text opacity={0.8} textAlign="center">
            {(() => {
              const required = roomInfo?.requiredPlayers ?? formatChoice(selectedFormat).requiredPlayers;
              const seated = roomInfo?.seats.length ?? 1;
              // A Random pick is already resolved by the time we get here, so
              // the lobby names the board that was actually rolled (#685).
              const boardTitle = rolledMapId
                ? `${catalogEntry(rolledMapId)?.title ?? "the default board"} 🎲`
                : selectedMapId === CUSTOM_MAP_ID
                  ? "a custom board"
                  : catalogEntry(selectedMapId)?.title ?? "the default board";
              const waiting =
                required <= 2
                  ? "Waiting for an opponent — the game starts the moment they join."
                  : `Waiting for players — ${seated}/${required} seats joined. Share the same link with everyone.`;
              return boardUnknown ? waiting : `${waiting} · playing on ${boardTitle}.`;
            })()}
          </Text>

          {/* Move timer setting (issue #223): echoed by the server on
              ROOM_CREATED/JOINED/ROOM_STATUS, so joiners know the room's rule
              before the game starts. Absent = untimed room → nothing shown. */}
          {roomInfo?.turnTimerSeconds ? (
            <Tag
              px="0.75rem"
              py="0.4rem"
              fontFamily="SpaceGrotesk"
              letterSpacing="0.04em"
              bg="brand.accent"
              color="brand.surfaceDim"
            >
              ⏱ Move timer: {roomInfo.turnTimerSeconds}s per decision
            </Tag>
          ) : null}

          {/* team preview (issue #195): in a team format the seat→team mapping is
              fixed, so show who is with whom before the game even starts. The
              viewer's team is listed first and accented. Live ROOM_STATUS roster
              (issue #222) fills each seat with the real hero as it joins — an
              un-filled seat shows "?" ("You + ? vs GINGERBREAD + ?"). */}
          {(() => {
            const comp = teamComposition(
              roomInfo?.formatId ?? selectedFormat,
              catalogEntry(rolledMapId ?? selectedMapId)?.map,
            );
            if (!comp) return null;
            const youSeat = roomInfo?.you;
            const rosterSeat = (id: string) => roomInfo?.roster?.find((s) => s.player === id);
            const fmtSeat = (id: string) => {
              if (id === youSeat) return "You";
              const seat = rosterSeat(id);
              if (!seat) return "?"; // seat not yet filled
              const name = heroNameOf(heroes, seat.heroId) ?? id.toUpperCase();
              return seat.bot ? `${name} (bot)` : name;
            };
            const myTeam = youSeat ? comp.find((t) => t.seats.includes(youSeat)) : undefined;
            const ordered = myTeam ? [myTeam, ...comp.filter((t) => t !== myTeam)] : comp;
            return (
              <Flex gap="0.6rem" alignItems="center" flexWrap="wrap" justifyContent="center">
                {ordered.map((t, i) => (
                  <Flex key={t.team} gap="0.6rem" alignItems="center">
                    {i > 0 && (
                      <Text fontFamily="BebasNeueRegular" opacity={0.6} fontSize="0.9rem">
                        vs
                      </Text>
                    )}
                    <Tag
                      px="0.75rem"
                      py="0.4rem"
                      fontFamily="SpaceGrotesk"
                      letterSpacing="0.04em"
                      bg={t === myTeam ? "#39B7A8" : "brand.surfaceDim"}
                      color={t === myTeam ? "brand.surfaceDim" : "brand.parchment"}
                    >
                      {t.seats.map(fmtSeat).join(" + ")}
                    </Tag>
                  </Flex>
                ))}
              </Flex>
            );
          })()}

          {/* joined-heroes roster for NON-team multiplayer (ffa-3): the team
              preview above already names heroes per side, so this fills the gap
              for formats with no fixed team mapping — a live chip per seated
              hero as ROOM_STATUS arrives (issue #222). */}
          {(() => {
            const roster = roomInfo?.roster;
            const isTeam = !!teamComposition(roomInfo?.formatId ?? selectedFormat, catalogEntry(rolledMapId ?? selectedMapId)?.map);
            const required = roomInfo?.requiredPlayers ?? formatChoice(selectedFormat).requiredPlayers;
            if (!roster || isTeam || required <= 2) return null;
            const youSeat = roomInfo?.you;
            return (
              <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
                {roster.map((s) => {
                  const isYou = s.player === youSeat;
                  const name = isYou ? "You" : heroNameOf(heroes, s.heroId) ?? s.player.toUpperCase();
                  return (
                    <Tag
                      key={s.player}
                      px="0.75rem"
                      py="0.4rem"
                      fontFamily="SpaceGrotesk"
                      letterSpacing="0.04em"
                      bg={isYou ? "#39B7A8" : "brand.surfaceDim"}
                      color={isYou ? "brand.surfaceDim" : "brand.parchment"}
                      opacity={s.connected ? 1 : 0.5}
                    >
                      {`${name}${s.bot ? " (bot)" : ""}${s.connected ? "" : " — reconnecting…"}`}
                    </Tag>
                  );
                })}
              </Flex>
            );
          })()}

          {tournament.at && <TournamentWaiting at={tournament.at} roomId={roomId} boardUnknown={boardUnknown} onNotice={tournament.onNotice} />}
          {/* #1556: a pair's room is theirs alone — no invite, no publish; just a way out. */}
          {pair && (
            <Button {...BTN} data-testid="pair-cancel" onClick={cancelPair}>
              Cancel
            </Button>
          )}
          {/* discoverability: invite privately or list publicly */}
          {!tournament.at && !pair && (
            <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
              <Tag fontFamily="mono" px="0.75rem" py="0.4rem">
                {joinUrl}
              </Tag>
              <Button
                {...BTN_GOLD}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(joinUrl)
                    .then(() => trackInviteCopied("pro"))
                    .catch(() => {})
                }
              >
                copy link
              </Button>
            </Flex>
          )}
          <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
            {!tournament.at && !pair && (
              <Button
                {...(roomPublic ? BTN_GOLD : BTN)}
                onClick={() => setVisibility(!roomPublic)}
              >
                {roomPublic ? "✓ public — listed in the lobby browser" : "make lobby public"}
              </Button>
            )}
            {/* Match-found chime (#689). Same `pro-sound-fx` setting the in-match
                HUD chip flips — this is just where you reach for it, since this
                is the screen you leave before tabbing away. Muting silences the
                chime only; the tab title still shouts. */}
            <Button
              {...(soundOn ? BTN_GOLD : BTN)}
              onClick={toggleSound}
              data-testid="lobby-sound-toggle"
              aria-label={soundOn ? "Mute the match-found chime" : "Unmute the match-found chime"}
            >
              {soundOn ? "🔊 chime on" : "🔇 chime muted"}
            </Button>
          </Flex>
          <Text fontSize="0.8rem" opacity={0.6} textAlign="center">
            Go do something else — this tab chimes and renames itself the moment the game starts.
          </Text>
          <Text fontSize="0.8rem" opacity={0.5} display={tournament.at || pair ? "none" : undefined}>
            {(roomInfo?.requiredPlayers ?? formatChoice(selectedFormat).requiredPlayers) > 2 ? "(testing solo? open that link in more browser tabs)" : "(testing solo? open that link in a second browser tab)"}
          </Text>
          {mapSubmit && (
            <Link
              as="button"
              onClick={() => setSubmitMapOpen(true)}
              bg="transparent"
              fontFamily="SpaceGrotesk"
              fontSize="0.75rem"
              letterSpacing="0.06em"
              opacity={0.55}
              _hover={{ opacity: 1, color: "brand.accent" }}
              display="inline-flex"
              alignItems="center"
              gap="0.3rem"
            >
              happy with this board? submit it to unbrewed <TbExternalLink size="0.8rem" />
            </Link>
          )}
          {mapSubmit && (
            <SubmitMapDialog
              isOpen={submitMapOpen}
              onClose={() => setSubmitMapOpen(false)}
              map={mapSubmit.map}
              json={mapSubmit.json}
            />
          )}
        </Flex>
      );
    }
    return (
      <Text pt="4rem" textAlign="center" opacity={0.7}>
        {/* Same "Connected"/"Reconnecting…" vocabulary as the in-match HUD chip
            (issue #133 follow-up): a phone returning from the background before
            ever seeing a STATE — e.g. a reconnect still climbing back onto the
            room — reads the same status words here as it does in a live game,
            instead of the raw internal status string. */}
        {`waiting for game state… (${(STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting).label}${
          roomId ? `, room ${roomId}` : ""
        })`}
      </Text>
    );
  }
  return (
    <GameViewBody
      socket={socket}
      state={game}
      host={{
        tournament,
        slowMode,
        toggleSlowMode,
        rematchHref,
        rematchNegotiation,
        accountStatus,
        copyReplayShareLink,
        sharingReplay,
        accountState,
        earned,
        gameStats,
        clockMs,
        firstPlayer,
        nextUp,
        mapSubmit,
        setSubmitMapOpen,
        submitMapOpen,
        // Escape hatch when re-render keeps failing: back to a clean lobby. The
        // reconnect token stays in localStorage, so this room is still resumable.
        onLeave: () => {
          if (typeof window !== "undefined") window.location.href = "/pro/game";
        },
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// PREVIEW mode (dev only, no server)
// ---------------------------------------------------------------------------

const PREVIEW_MAP = mendedDrum as ProMapDef;

const previewFighters = (map: ProMapDef): ViewFighter[] => {
  const start = (slot: number) => map.spaces.find((s) => s.start?.slot === slot)?.id ?? null;
  return [
    { id: "p1/hero", owner: "p1", kind: "HERO", name: "King Kong", space: start(1), tailSpace: null, hp: 18, maxHp: 18, reach: "MELEE", size: "NORMAL", defeated: false },
    { id: "p2/hero", owner: "p2", kind: "HERO", name: "Baba Yaga", space: start(2), tailSpace: null, hp: 14, maxHp: 14, reach: "RANGED", size: "NORMAL", defeated: false },
  ];
};

const PreviewGame = () => {
  // The demo is nothing but a board, so it is guarded whenever it is up.
  usePageZoomGuard();
  const [fighters, setFighters] = useState<ViewFighter[]>(() => previewFighters(PREVIEW_MAP));
  const [selected, setSelected] = useState<FighterId | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  usePendingMoveTimeout(pendingMove, () => setPendingMove(null));

  const spaceById = useMemo(
    () => new Map(PREVIEW_MAP.spaces.map((s) => [s.id, s])),
    []
  );
  const selectedSpace = selected ? fighters.find((f) => f.id === selected)?.space : null;
  const outEdges: SpaceId[] = selectedSpace
    ? [...(spaceById.get(selectedSpace)?.adjacentTo ?? []), ...(spaceById.get(selectedSpace)?.oneWayTo ?? [])]
    : [];

  return (
    <Grid templateColumns={{ base: "1fr", lg: "1fr 20rem" }} gap="1rem" p="1rem" maxW="90rem" mx="auto">
      <ProBoard
        map={PREVIEW_MAP}
        fighters={fighters}
        highlightedSpaces={outEdges}
        highlightedFighters={selected ? [] : fighters.map((f) => f.id)}
        selectedFighter={selected}
        pendingMove={pendingMove}
        onPendingMoveSettled={() => setPendingMove(null)}
        onFighterClick={(id) => setSelected(id)}
        onSpaceClick={(spaceId) => {
          if (!selected) return;
          const origin = fighters.find((f) => f.id === selected)?.space;
          setFighters((fs) => fs.map((f) => (f.id === selected ? { ...f, space: spaceId } : f)));
          if (origin && origin !== spaceId) setPendingMove({ fighterId: selected, path: [origin, spaceId] });
          setSelected(null);
        }}
      />
      <Flex direction="column" gap="0.75rem">
        <Tag colorScheme="orange" w="fit-content">
          BOARD DEMO — no server connected
        </Tag>
        <Text fontSize="0.9rem" opacity={0.8}>
          A feel for the rules-enforced table on {PREVIEW_MAP.meta.title}: click a fighter, then a gold
          space to slide it one step along the printed paths (the stairs by s12 only go one way — the
          board knows). In a real match the referee server decides what lights up.
        </Text>
        <Text fontSize="0.8rem" opacity={0.6}>
          Live matches activate when a game server is configured (NEXT_PUBLIC_PRO_WS_URL at build time).
        </Text>
        {selected && (
          <Button {...BTN} onClick={() => setSelected(null)} w="fit-content">
            deselect
          </Button>
        )}
      </Flex>
    </Grid>
  );
};

// ---------------------------------------------------------------------------

const ProGamePage = () => {
  const router = useRouter();
  // An empty `?room=` is no room (it would open the join picker with default settings).
  const room = typeof router.query.room === "string" && router.query.room !== "" ? router.query.room : null;
  const heroParam = typeof router.query.hero === "string" ? router.query.hero : null;
  // One-tap rematch (issue #TBD): `/pro/game?rematch=1&...` carries a whole
  // CREATE_ROOM's worth of settings from a just-finished game's winner screen
  // — see lib/pro/rematch.ts. Null on every ordinary page load (no `rematch`
  // key), so this is a no-op for the entire rest of the app.
  const rematch = parseRematchQuery(router.query);
  // `?vs=ai[-easy|-medium|-hard]` presets the duel opponent seat to a bot, so
  // the landing's "Play vs AI" CTA lands one click from a solo match (#460).
  // Independent of `?hero=` — both compose.
  const vsBot = parseVsParam(router.query.vs);
  // `?debug` (any value, incl. bare `?debug`) opts this session into seeing the
  // debug-only decks the server hides by default, in the picker and in random
  // bot picks. See lib/pro/protocol.ts v15/v18.
  const debug = router.query.debug !== undefined;
  // `?quick` (any value, incl. bare `?quick`) is the pro landing's Quick Match
  // CTA arriving: it highlights the Quick Match button on the picker. It never
  // auto-fires — the fighter pick is the one choice we can't make for them.
  const quickParam = router.query.quick !== undefined;
  useEntryEvent("join_link_opened", router.isReady ? proJoinLinkProps(room, router.query) : undefined, {
    landingOnly: true,
  });
  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
      {WS_URL ? (
        // A tournament match's ticket (`?tour=…&match=…#ticket=…`) or room: the
        // gate's screens come before the game, which gets one prop for the rest.
        <TournamentGate room={room} quickParam={quickParam}>
          {(tournamentRoom) => (
            <LiveGame
              room={room}
              heroParam={heroParam}
              vsBot={vsBot}
              debug={debug}
              quickParam={quickParam}
              rematch={rematch}
              tournamentRoom={tournamentRoom}
            />
          )}
        </TournamentGate>
      ) : (
        <PreviewGame />
      )}
    </Box>
  );
};

export default ProGamePage;

// No getServerSideProps: the GitHub Pages deploy is a static `next export`,
// which has no server and no runtime env. NEXT_PUBLIC_PRO_WS_URL is baked in
// at build time; when it's absent the page falls back to the self-contained
// board demo above, so a Pages build with no backend still shows something
// honest instead of a broken table. Setting the variable in the Pages build
// (or any host) flips the same page to live mode.
