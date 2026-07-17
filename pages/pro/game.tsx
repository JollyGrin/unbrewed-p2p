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
import { CSSProperties, Fragment, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/router";
import { Box, Button, Flex, Grid, Input, Kbd, Link, Menu, MenuButton, MenuItem, MenuList, NumberDecrementStepper, NumberIncrementStepper, NumberInput, NumberInputField, NumberInputStepper, Tag, Text, Textarea, Tooltip } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { motion, useReducedMotion } from "framer-motion";
import { MOVE_STEP_SECONDS, MoveHint, PendingMove, ProBoard } from "@/components/Pro/ProBoard";
import { ProErrorBoundary } from "@/components/Pro/ProErrorBoundary";
import { assignableSeats, BotSlotPlan, SlotOccupant } from "@/components/Pro/CreateSeats";
import { stateHash } from "@/lib/pro/stateHash";
import {
  Action,
  BotDifficulty,
  BotSeatFill,
  CardInstanceId,
  CardMeta,
  CombatOutcome,
  FighterId,
  HeroListing,
  LegalOption,
  PlayerId,
  PlayerView,
  ProMapDef,
  ReplayBundle,
  SpaceId,
  ViewCombat,
  ViewFighter,
  ViewPrompt,
} from "@/lib/pro/protocol";
import { replayId, saveReplay } from "@/lib/pro/replayStore";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { ProConnectionStatus, useProSocket } from "@/lib/pro/useProSocket";
import { normalizeMap } from "@/lib/pro/normalizeMap";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { mapSubmissionIssueUrl } from "@/lib/pro/mapIssue";
import { RecentRoom, getTabToken, listRecentRooms } from "@/lib/pro/recentRooms";
import { HERO_DECK_IDS, ResolveCard, heroIdsForArt, useProCardArt } from "@/lib/pro/useProCardArt";
import { frozenAtForHero } from "@/lib/pro/evergreenManifest";
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbChevronDown, TbExternalLink, TbInfoCircle, TbSword, TbZoomIn } from "react-icons/tb";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { CardPreviewProvider } from "@/components/Pro/CardPreview";
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";
import { MapPreviewModal } from "@/components/Pro/MapPreviewModal";
import { ProHud } from "@/components/Pro/ProHud";
import { ProLog, ProLogEntry } from "@/components/Pro/ProLog";
import { ReportBugDialog } from "@/components/Pro/ReportBugDialog";
import { ForfeitDialog } from "@/components/Pro/ForfeitDialog";
import { UndoRequestDialog } from "@/components/Pro/UndoRequestDialog";
import { GameLostScreen } from "@/components/Pro/GameLostScreen";
import { batchPhase, diffViews, enrichLines, seatLabel } from "@/lib/pro/gameLog";
import { AttachItem, cardAffordances, cardLabel, cardTitle, describeAction, soleAction } from "@/lib/pro/actionDock";
import { ItemGlyph } from "@/components/Pro/ItemBadge";
import {
  isExtendedReachAttack,
  LARGE_FIGHTER_BLURB,
  LARGE_REACH_CHIP,
  SpaceReach,
} from "@/lib/pro/largeReach";
import { useFlag } from "@/lib/flags";
import { maneuverBoostHint } from "@/lib/pro/maneuverHint";
import { buildPoseIndex, parsePoseOptions, poseHighlights, resolvePoseClick } from "@/lib/pro/moveChoice";
import { cardFaceOptions } from "@/lib/pro/cardOptions";
import {
  applyClick as applyStepClick,
  canCommit as canCommitStep,
  commitPath as stepCommitPath,
  isFresh as isStepFresh,
  legalNextSteps,
  remaining as stepRemaining,
  startStepping,
  type StepState,
} from "@/lib/pro/moveSteps";
import { useGameFx, DamageArc } from "@/lib/pro/useGameFx";
import { useCombatCallouts, CombatCalloutItem } from "@/lib/pro/combatFx";
import { useCombatStrike, CombatStrike, StrikeVariant, comparePulseFor, CompareBeat } from "@/lib/pro/combatStrike";
import { useCombatValueFx, CombatValueFx, SlotValueFx } from "@/lib/pro/combatValueFx";
import { useTokenLife } from "@/lib/pro/tokenLife";
import { resolveSpaceMove } from "@/lib/pro/moveResolve";
import { useIncomingMoveTween } from "@/lib/pro/moveTween";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";
import { PRO_WS_URL as WS_URL } from "@/lib/pro/wsUrl";
import { formatChoice, PRO_FORMATS, ProFormatId, teamComposition } from "@/lib/pro/multiplayerPlaytest";
import { deriveTeams, isViewerOnWinningTeam } from "@/lib/pro/teams";
import { fighterTokenStateByOwner } from "@/lib/pro/heroStateFlags";
import {
  CUSTOM_MAP_ID,
  MAP_CATALOG,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  ineligibleReason,
  mapEligibleForFormat,
} from "@/lib/pro/mapCatalog";
import type { MapCatalogEntry } from "@/lib/pro/mapCatalog";

/** same table felt the sandbox game uses (game.layout.tsx) */
const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";

const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};
const BTN_GOLD = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

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

/** Fallback safety net for a token-move tween (issue #80): the board clears
 * `pendingMove` itself once the tween's onAnimationComplete fires, but if
 * that ever gets missed (component churn, bad path data) this forces the
 * clear anyway so the board can't get stuck showing a stale animated token. */
const usePendingMoveTimeout = (
  pendingMove: PendingMove | null,
  clearPendingMove: () => void
) => {
  useEffect(() => {
    if (!pendingMove) return;
    const ms = (pendingMove.path.length - 1) * MOVE_STEP_SECONDS * 1000 + 500;
    const t = setTimeout(clearPendingMove, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMove]);
};

/**
 * Title for a `GameEvent` `source` (used by enrichLines for scheduled/fired
 * effect lines): a `CardInstanceId` resolves via the catalog, `'hero:<pid>'`
 * via the hero fighter's name, and the redacted `'(hidden)'` placeholder as
 * "a hidden card" (never crashes label resolution).
 */
const resolveEventSource = (view: PlayerView, source: string): string => {
  if (source === "(hidden)") return "a hidden card";
  if (source.startsWith("hero:")) {
    const pid = source.slice("hero:".length);
    return view.fighters.find((f) => f.id === `${pid}/hero`)?.name ?? "a hero ability";
  }
  return cardLabel(view.catalog, source);
};

/**
 * Best-effort source card for a prompt (issue #72 fix #2). ViewPrompt has no
 * source-card field, so we only trust an explicit `option.data.card` instance
 * id the server chose to attach — never a fabricated mapping. Returns null when
 * no option carries one (caller then falls back to combat context).
 */
const optionCardInstance = (options: ViewPrompt["options"]): CardInstanceId | null => {
  for (const o of options) {
    const d = o.data;
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const card = (d as { card?: unknown }).card;
      if (typeof card === "string") return card;
    }
  }
  return null;
};

const PromptPanel = ({
  prompt,
  you,
  onRespond,
  buttonOptions,
  cardOptions,
  boardHint,
  previewInstance,
  sourceInstance,
  sourceLabel,
  resolveCard,
  catalog,
}: {
  prompt: ViewPrompt;
  you: PlayerView["you"];
  onRespond: (promptId: string, optionId: string) => void;
  /** options NOT answerable via the board (e.g. "Decline move") */
  buttonOptions: ViewPrompt["options"];
  /** hand-card options rendered as clickable card faces (issue #288 — Multi-Arm
   *  Barrage second-attack commit): each `{ id, instance }` shows the offered card;
   *  clicking answers with its option id. The sentinel stays in `buttonOptions`. */
  cardOptions: { id: string; instance: CardInstanceId }[];
  /** set when some options are answered by clicking the board */
  boardHint: string | null;
  /**
   * Legacy best-effort card behind this prompt (issue #72 fix #2), used only when
   * the server sent no `source`: the caller approximates it from `option.data.card`
   * or the live combat card; null = no reliable signal, render header-only. Shown
   * to the CHOOSER only (spectator behaviour unchanged for source-less prompts).
   */
  previewInstance: CardInstanceId | null;
  /**
   * Authoritative source card (protocol v10 `ViewPrompt.source.card`) — the effect
   * that opened this prompt, shown to BOTH players. null when the prompt has no
   * card source (hero ability or a system/source-less prompt).
   */
  sourceInstance: CardInstanceId | null;
  /** Attribution line ("Effect of <card>" / "<hero>'s ability"), or null. */
  sourceLabel: string | null;
  resolveCard: ResolveCard;
  catalog: Record<string, CardMeta>;
}) => (
  <Box bg="brand.surface" border="2px solid" borderColor="brand.accent" borderRadius="0.5rem" p="1rem">
    <Text fontFamily="ArchivoNarrow" fontWeight="bold" mb="0.5rem" color="brand.accent">
      {prompt.kind.replace(/_/g, " ")}
    </Text>
    {/* v16 (issue #237): the mechanical step description — WHICH effect step is
        resolving on a multi-step card ("Choose a fighter to take 2 damage"). When
        present it is the PRIMARY line and the card attribution (`sourceLabel`)
        demotes below it; when absent we fall back to the v10 attribution-only copy.
        Both shown to chooser and spectator alike. */}
    {prompt.description ? (
      <>
        <Text fontSize="0.95rem" fontWeight="bold" mb="0.25rem" color="brand.parchment">
          {prompt.description}
        </Text>
        {sourceLabel && (
          <Text fontSize="0.75rem" mb="0.5rem" color="brand.parchment" opacity={0.7}>
            {sourceLabel}
          </Text>
        )}
      </>
    ) : (
      sourceLabel && (
        <Text fontSize="0.8rem" mb="0.5rem" color="brand.parchment" opacity={0.85}>
          {sourceLabel}
        </Text>
      )
    )}
    {sourceInstance && (
      <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mb="0.5rem">
        <CardFace card={resolveCard(sourceInstance)} fallback={cardLabel(catalog, sourceInstance)} />
      </Box>
    )}
    {prompt.player === you ? (
      <>
        {previewInstance && (
          <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mb="0.5rem">
            <CardFace card={resolveCard(previewInstance)} fallback={cardLabel(catalog, previewInstance)} />
          </Box>
        )}
        {boardHint && (
          <Text fontSize="0.85rem" mb={buttonOptions.length ? "0.5rem" : 0} color="brand.parchment">
            {boardHint}
          </Text>
        )}
        {cardOptions.length > 0 && (
          <Flex gap="0.5rem" flexWrap="wrap" mb="0.5rem">
            {cardOptions.map((c) => (
              <Box
                key={c.id}
                as="button"
                w="5rem"
                sx={{ aspectRatio: "63 / 88" }}
                borderRadius="0.35rem"
                transition="transform 0.1s, box-shadow 0.1s"
                _hover={{ transform: "translateY(-3px)", boxShadow: "0 0 0 2px var(--chakra-colors-brand-accent)" }}
                onClick={() => onRespond(prompt.promptId, c.id)}
                aria-label={`Choose ${cardLabel(catalog, c.instance)}`}
              >
                <CardFace card={resolveCard(c.instance)} fallback={cardLabel(catalog, c.instance)} />
              </Box>
            ))}
          </Flex>
        )}
        <Flex gap="0.5rem" flexWrap="wrap">
          {buttonOptions.map((o) => (
            <Button
              key={o.id}
              {...BTN_GOLD}
              whiteSpace="normal"
              height="auto"
              minH="2rem"
              py="0.35rem"
              textAlign="left"
              onClick={() => onRespond(prompt.promptId, o.id)}
            >
              {o.label}
            </Button>
          ))}
        </Flex>
      </>
    ) : (
      <Text opacity={0.7} fontSize="0.9rem">
        opponent is deciding…
      </Text>
    )}
  </Box>
);

/** red edge-vignette when YOUR hero takes damage (keyed remount replays it) */
const hurtVignette = keyframes`
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  100% { opacity: 0; }
`;

// --- Combat Callouts (issue #162) -------------------------------------------
// Full-screen decorative flourishes, following the hurtVignette overlay pattern.
// Each keyframe both enters AND exits, so a keyed remount plays the whole beat.

/** YOUR-TURN / opponent's-turn banner: sweep in from the top, hold, lift away. */
const calloutBanner = keyframes`
  0%   { opacity: 0; transform: translateY(-1.2rem) scaleX(0.94); }
  12%  { opacity: 1; transform: translateY(0) scaleX(1); }
  80%  { opacity: 1; transform: translateY(0) scaleX(1); }
  100% { opacity: 0; transform: translateY(-0.6rem) scaleX(1); }
`;

/** DEFEND!: slam in, then throb twice in red to pull the eye to the prompt. */
const defendPulse = keyframes`
  0%       { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  14%      { opacity: 1; transform: translate(-50%, -50%) scale(1.18); }
  28%      { transform: translate(-50%, -50%) scale(1); }
  46%      { transform: translate(-50%, -50%) scale(1.1); }
  64%      { transform: translate(-50%, -50%) scale(1); }
  82%      { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100%     { opacity: 0; transform: translate(-50%, -50%) scale(1.04); }
`;

/** Scheme / effect card-reveal: rise to center, hold, drift up and fade. */
const calloutReveal = keyframes`
  0%   { opacity: 0; transform: translate(-50%, -40%) scale(0.72); }
  12%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
  25%  { transform: translate(-50%, -50%) scale(1); }
  78%  { opacity: 1; transform: translate(-50%, -52%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -66%) scale(0.98); }
`;

// --- "The Snuff" cancel-effects callout (issue #346) ------------------------
// One rule to teach: a cancel kills the card's TEXT, not its printed value. So
// the victim card rises, the feint slaps over it, its effect-text band chars to
// ash — while the printed value stays LIT and pulses ("this part still hits").

/** The victim card rises to center, holds while it's foiled, then fades. */
const calloutSnuff = keyframes`
  0%   { opacity: 0; transform: translate(-50%, -40%) scale(0.72); }
  10%  { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
  20%  { transform: translate(-50%, -50%) scale(1); }
  82%  { opacity: 1; transform: translate(-50%, -51%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -62%) scale(0.98); }
`;

/** The feint card sweeps in from the canceller's side and slaps over at an angle. */
const snuffSlap = keyframes`
  0%   { opacity: 0; transform: translate(115%, -32%) rotate(26deg) scale(1.12); }
  20%  { opacity: 0; transform: translate(115%, -32%) rotate(26deg) scale(1.12); }
  40%  { opacity: 1; transform: translate(9%, 5%) rotate(10deg) scale(1.03); }
  48%  { transform: translate(6%, 3%) rotate(8deg) scale(1); }
  84%  { opacity: 1; transform: translate(6%, 3%) rotate(8deg) scale(1); }
  100% { opacity: 0; transform: translate(6%, -4%) rotate(8deg) scale(0.98); }
`;

/** The victim's effect-text band chars to ash — smoke washes over the lower card
 *  while the printed value (top band) stays clear. Waits for the slap to land. */
const snuffAsh = keyframes`
  0%   { opacity: 0; }
  42%  { opacity: 0; }
  70%  { opacity: 0.88; }
  100% { opacity: 0.82; }
`;

/** The printed value pulses once — "this part still hits you." */
const snuffValuePulse = keyframes`
  0%   { transform: scale(1); }
  58%  { transform: scale(1); box-shadow: 0 0 0 0 rgba(224,168,46,0); }
  72%  { transform: scale(1.32); box-shadow: 0 0 22px 6px rgba(224,168,46,0.85); }
  86%  { transform: scale(1.08); }
  100% { transform: scale(1.12); box-shadow: 0 0 14px 3px rgba(224,168,46,0.6); }
`;

/** NOPE. stamps in hard, rotated, once the effect is snuffed. */
const snuffStamp = keyframes`
  0%   { opacity: 0; transform: translate(-50%, -50%) rotate(-13deg) scale(2.6); }
  50%  { opacity: 0; transform: translate(-50%, -50%) rotate(-13deg) scale(2.6); }
  60%  { opacity: 1; transform: translate(-50%, -50%) rotate(-13deg) scale(0.9); }
  68%  { transform: translate(-50%, -50%) rotate(-13deg) scale(1.08); }
  76%  { transform: translate(-50%, -50%) rotate(-13deg) scale(1); }
  100% { opacity: 1; transform: translate(-50%, -50%) rotate(-13deg) scale(1); }
`;

/**
 * Card-back stand-in for a redacted (`'(hidden)'`) reveal source. A real reveal
 * shows the source card's art; a redacted one used to fall back to bare text,
 * which read as a blank tooltip mid-flourish. This fills the same card frame with
 * an art-forward "hidden scheme" back in the parchment/purple language so the
 * beat still lands like a card, not a label.
 */
const HiddenRevealBack = () => (
  <Flex
    w="100%"
    h="100%"
    direction="column"
    alignItems="center"
    justifyContent="center"
    gap="0.35rem"
    borderRadius="0.5rem"
    border="2px solid"
    borderColor="brand.accent"
    bgGradient="linear(160deg, brand.surface 0%, brand.surfaceDim 100%)"
    boxShadow="inset 0 0 24px rgba(0,0,0,0.45)"
    position="relative"
    overflow="hidden"
  >
    {/* inner gold keyline echoes the printed-card frame */}
    <Box
      position="absolute"
      inset="0.45rem"
      borderRadius="0.35rem"
      border="1px solid"
      borderColor="rgba(224,168,46,0.4)"
    />
    <Text
      fontFamily="LeagueGothic"
      fontSize={{ base: "3rem", md: "4rem" }}
      lineHeight="0.9"
      color="brand.accent"
      textShadow="0 2px 10px rgba(0,0,0,0.6)"
    >
      ?
    </Text>
    <Text
      fontFamily="BebasNeueRegular"
      fontSize={{ base: "0.85rem", md: "1rem" }}
      letterSpacing="0.22em"
      color="brand.parchment"
      opacity={0.85}
    >
      HIDDEN
    </Text>
  </Flex>
);

/**
 * Shared card-callout primitive (issue #380). A card face that rises to center
 * screen, holds, then drifts up and fades — the motion the scheme reveal and the
 * effect ribbon share. Callers supply the face (`children`), an optional `ribbon`
 * banner drawn across the card, an optional `caption` below it, and a `slot`
 * cascade index (overlapping callouts step down-right instead of stacking
 * dead-center). The base style is the *settled* state (opacity 1, centered) so
 * that under reduced motion — where NO_MOTION disables the keyframe — a static,
 * readable card remains instead of a card frozen at the keyframe's 0% (invisible)
 * frame. The reveal branch used to lack this reduced-motion fallback; expressing
 * it through the primitive fixes that in passing.
 *
 * The Snuff (#346/#350) keeps its own bespoke render below: its choreography
 * (the feint card sweeping in, the ash wash, the value pill, the NOPE. stamp)
 * is too specialized to fold in without risking that hardened behavior.
 */
const CardCallout = ({
  slot = 0,
  ribbon,
  caption,
  zIndex = 205,
  children,
}: {
  slot?: number;
  ribbon?: ReactNode;
  caption?: ReactNode;
  zIndex?: number;
  children: ReactNode;
}) => (
  <Flex
    position="fixed"
    top={`calc(46% + ${slot * 1.4}rem)`}
    left={`calc(50% + ${slot * 1.6}rem)`}
    zIndex={zIndex}
    direction="column"
    alignItems="center"
    gap="0.75rem"
    pointerEvents="none"
    // base (reduced-motion) state: settled + visible; the keyframe overrides at runtime
    opacity={1}
    transform="translate(-50%, -50%)"
    animation={`${calloutReveal} 2.3s ease-out both`}
    sx={NO_MOTION}
  >
    <Box
      position="relative"
      w={{ base: "9rem", md: "12rem" }}
      sx={{ aspectRatio: "63 / 88" }}
      filter="drop-shadow(0 8px 24px rgba(0,0,0,0.6))"
    >
      {children}
      {ribbon}
    </Box>
    {caption}
  </Flex>
);

/** The name band beneath a card callout (reveal + effect ribbon share it). */
const CalloutCaption = ({ children }: { children: ReactNode }) => (
  <Text
    fontFamily="BebasNeueRegular"
    fontSize={{ base: "1.4rem", md: "1.9rem" }}
    letterSpacing="0.06em"
    textAlign="center"
    color="brand.parchment"
    textShadow="0 2px 8px rgba(0,0,0,0.7)"
  >
    {children}
  </Text>
);

/**
 * Banner ribbon draped across an effect callout, naming its combat window so a
 * fired During/After-Combat effect never looks like a plain scheme reveal. Sits
 * over the card art (a slight tilt reads as a physical sash) in the parchment /
 * purple / gold language of the rest of the callout layer.
 */
const EffectRibbon = ({ window }: { window: "during" | "after" }) => (
  <Flex
    position="absolute"
    top="42%"
    left="-0.5rem"
    right="-0.5rem"
    justifyContent="center"
    alignItems="center"
    px="0.5rem"
    py="0.3rem"
    transform="rotate(-5deg)"
    bgGradient="linear(90deg, brand.accentDeep 0%, brand.accent 50%, brand.accentDeep 100%)"
    borderTop="1px solid"
    borderBottom="1px solid"
    borderColor="rgba(0,0,0,0.35)"
    boxShadow="0 4px 14px rgba(0,0,0,0.55)"
  >
    <Text
      fontFamily="LeagueGothic"
      fontSize={{ base: "1rem", md: "1.25rem" }}
      lineHeight="1"
      letterSpacing="0.1em"
      whiteSpace="nowrap"
      color="brand.surfaceDim"
      textShadow="0 1px 1px rgba(255,255,255,0.25)"
    >
      {window === "during" ? "⚡ DURING COMBAT" : "AFTER COMBAT"}
    </Text>
  </Flex>
);

/**
 * The overlay for one live combat callout. Decorative only, pointer-transparent,
 * and above the board/vignette. `reveal` names its source with the SAME resolver
 * the activity log uses (`resolveEventSource`); a real source shows its art via
 * CardFace, while the redacted `'(hidden)'` placeholder shows a HiddenRevealBack
 * card-back so it stays art-forward instead of bare text. `item.slot` cascades
 * overlapping reveals/effects down-right so they never stack dead-center.
 */
const CombatCalloutOverlay = ({
  item,
  view,
  resolveCard,
}: {
  item: CombatCalloutItem;
  view: PlayerView;
  resolveCard: ResolveCard;
}) => {
  if (item.kind === "turn") {
    const mine = item.mine;
    return (
      <Flex
        position="fixed"
        top="18%"
        left="0"
        right="0"
        zIndex={205}
        justifyContent="center"
        pointerEvents="none"
        animation={`${calloutBanner} ${mine ? "1.9s" : "1.6s"} ease-out both`}
      >
        <Box
          px={{ base: "2rem", md: "4rem" }}
          py="0.6rem"
          bg={mine ? "rgba(224,168,46,0.16)" : "rgba(0,0,0,0.35)"}
          borderTop="2px solid"
          borderBottom="2px solid"
          borderColor={mine ? "brand.accent" : "whiteAlpha.300"}
          boxShadow={mine ? "0 0 32px 4px rgba(224,168,46,0.35)" : "none"}
        >
          <Text
            fontFamily="LeagueGothic"
            fontSize={{ base: "2.4rem", md: "3.4rem" }}
            lineHeight="1"
            letterSpacing="0.12em"
            textAlign="center"
            color={mine ? "brand.accent" : "brand.parchment"}
            opacity={mine ? 1 : 0.72}
            textShadow="0 2px 10px rgba(0,0,0,0.6)"
          >
            {mine ? "YOUR TURN" : "OPPONENT'S TURN"}
          </Text>
        </Box>
      </Flex>
    );
  }

  if (item.kind === "defend") {
    return (
      <Text
        position="fixed"
        top="42%"
        left="50%"
        zIndex={206}
        pointerEvents="none"
        fontFamily="LeagueGothic"
        fontSize={{ base: "3.5rem", md: "5.5rem" }}
        lineHeight="1"
        letterSpacing="0.1em"
        color="brand.danger"
        textShadow="0 0 24px rgba(255,99,71,0.7), 0 2px 8px rgba(0,0,0,0.7)"
        animation={`${defendPulse} 1.7s ease-out both`}
      >
        DEFEND!
      </Text>
    );
  }

  if (item.kind === "cancel") {
    // "The Snuff" — a cancel-effects card foiled the `role` side's card TEXT. EVERY
    // field is read from the payload captured at diff time (issue #350); the live
    // `view.combat` is deliberately NOT consulted here, because a Feint that ends the
    // combat in one server drive already carries `combat: null` by the time this
    // mounts. The victim (cancelled side) rises, the canceller (opposite side, e.g.
    // Feint) slaps over it; the pill value stays lit because the number still hits,
    // only the words burn to ash. `view.catalog` (match-level, stable) is fine — it's
    // the static title/value source, not the transient combat state.
    const victimFace = item.victim ? resolveCard(item.victim) : null;
    const victimName = item.victim
      ? cardLabel(view.catalog, item.victim)
      : item.role === "ATTACK"
        ? "Attack card"
        : "Defense card";
    const cancellerFace = item.canceller ? resolveCard(item.canceller) : null;
    const cancellerName = item.canceller ? cardLabel(view.catalog, item.canceller) : "Cancel";
    const printedValue = item.value ?? undefined;
    return (
      <Flex
        position="fixed"
        top="46%"
        left="50%"
        zIndex={206}
        direction="column"
        alignItems="center"
        gap="0.6rem"
        pointerEvents="none"
        // base (reduced-motion) state: settled + visible; the keyframe overrides at runtime
        opacity={1}
        transform="translate(-50%, -50%)"
        animation={`${calloutSnuff} 2.3s ease-out both`}
        sx={NO_MOTION}
      >
        <Box
          position="relative"
          w={{ base: "9rem", md: "12rem" }}
          sx={{ aspectRatio: "63 / 88" }}
          filter="drop-shadow(0 8px 24px rgba(0,0,0,0.6))"
        >
          {/* the victim card — its text is about to be snuffed, its number spared */}
          <CardFace card={victimFace} fallback={victimName} />

          {/* effect-text band chars to ash: a dark smoke gradient washes up from the
              bottom (where card text sits), leaving the top value band clear */}
          <Box
            position="absolute"
            inset="0"
            borderRadius="0.5rem"
            bgGradient="linear(to-t, rgba(12,10,9,0.96) 42%, rgba(20,16,14,0.55) 66%, transparent 82%)"
            opacity={0.82}
            animation={`${snuffAsh} 2.3s ease-out both`}
            sx={NO_MOTION}
          />

          {/* the printed value stays LIT and pulses once — "this part still hits" */}
          {printedValue !== undefined && (
            <Flex
              position="absolute"
              bottom="-0.6rem"
              left="50%"
              transform="translateX(-50%)"
              direction="column"
              align="center"
              px="0.7rem"
              py="0.25rem"
              borderRadius="999px"
              bg="rgba(20,16,14,0.9)"
              border="2px solid"
              borderColor="brand.accent"
              animation={`${snuffValuePulse} 2.3s ease-out both`}
              sx={NO_MOTION}
            >
              <Text fontFamily="LeagueGothic" fontSize="1.9rem" lineHeight="1" color="brand.accent" textShadow="0 0 12px rgba(224,168,46,0.8)">
                {printedValue}
              </Text>
              <Text fontFamily="BebasNeueRegular" fontSize="0.55rem" letterSpacing="0.14em" color="brand.parchment" opacity={0.85}>
                STILL HITS
              </Text>
            </Flex>
          )}

          {/* the feint card sweeps in from the side and slaps over at an angle */}
          {item.canceller && (
            <Box
              position="absolute"
              inset="0"
              transform="translate(6%, 3%) rotate(8deg)"
              filter="drop-shadow(0 10px 20px rgba(0,0,0,0.7))"
              animation={`${snuffSlap} 2.3s cubic-bezier(0.2, 0.8, 0.3, 1.2) both`}
              sx={NO_MOTION}
            >
              <CardFace card={cancellerFace} fallback={cancellerName} />
            </Box>
          )}

          {/* the stamp: NOPE. */}
          <Text
            position="absolute"
            top="46%"
            left="50%"
            transform="translate(-50%, -50%) rotate(-13deg)"
            fontFamily="LeagueGothic"
            fontSize={{ base: "2.6rem", md: "3.4rem" }}
            lineHeight="1"
            letterSpacing="0.06em"
            color="brand.danger"
            textShadow="0 0 18px rgba(255,99,71,0.7), 0 2px 6px rgba(0,0,0,0.8)"
            border="3px solid"
            borderColor="brand.danger"
            borderRadius="0.35rem"
            px="0.4rem"
            animation={`${snuffStamp} 2.3s ease-out both`}
            sx={NO_MOTION}
          >
            NOPE.
          </Text>
        </Box>
        <Text
          fontFamily="BebasNeueRegular"
          fontSize={{ base: "1.1rem", md: "1.4rem" }}
          letterSpacing="0.06em"
          textAlign="center"
          color="brand.parchment"
          textShadow="0 2px 8px rgba(0,0,0,0.7)"
        >
          {victimName} — effects cancelled
        </Text>
      </Flex>
    );
  }

  // effect — a fired During/After-Combat effect (issue #380). Same rise as a
  // reveal, but wearing a combat-window ribbon across the card so it never reads
  // as a plain scheme play. A redacted source reuses the HiddenRevealBack card
  // with the ribbon still shown, so the window still reads even when the card can't.
  if (item.kind === "effect") {
    const hidden = item.source === "(hidden)";
    const card = hidden ? null : resolveCard(item.source);
    const name = resolveEventSource(view, item.source);
    return (
      <CardCallout
        slot={item.slot ?? 0}
        ribbon={<EffectRibbon window={item.window} />}
        caption={<CalloutCaption>{name}</CalloutCaption>}
      >
        {hidden ? <HiddenRevealBack /> : <CardFace card={card} fallback={name} />}
      </CardCallout>
    );
  }

  // reveal — float the source card's art + name center-screen (plain look).
  const hidden = item.source === "(hidden)";
  const card = hidden ? null : resolveCard(item.source);
  const name = resolveEventSource(view, item.source);
  // Cascade overlapping reveals down-right from dead-center (slot 0) so a
  // multi-reveal turn fans out instead of piling on one spot.
  return (
    <CardCallout slot={item.slot ?? 0} caption={<CalloutCaption>{name}</CalloutCaption>}>
      {hidden ? <HiddenRevealBack /> : <CardFace card={card} fallback={name} />}
    </CardCallout>
  );
};

/** The reveal beat: cards flip in from edge-on, defender a breath later. */
const flipIn = keyframes`
  from { transform: perspective(600px) rotateY(88deg) scale(1.12); opacity: 0.4; }
  60%  { transform: perspective(600px) rotateY(-8deg) scale(1.06); opacity: 1; }
  to   { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
`;

// ---------------------------------------------------------------------------
// The strike beat (issue #381 — #379 battle-sequence epic). After both cards
// settle (~0.85s after reveal), the attack card lunges right and slams the
// defense card; the defense reacts by outcome. Same physical grammar as the
// token gestures (TokenLifeLayer / TOKEN_LIFE_TUNING) — lunge / recoil / brace,
// similar durations — at card scale. Emotion keyframes + Chakra `animation`,
// sequenced by CSS animation-delay off the flip; derived + keyed once per combat
// by useCombatStrike so it plays exactly once. Wrapped in NO_MOTION at every use.
// ---------------------------------------------------------------------------

/** Wind-up before the lunge — 0.18s defender delay + 0.55s flip + a beat. */
const STRIKE_DELAY = 0.85;
/** The attack card's lunge/recoil. Lengthened (#382 pacing feedback: the beats
 *  felt rushed) so the slam reads with weight rather than snapping. */
const STRIKE_LUNGE_DUR = 0.68;
/** The defense reaction begins as the attack arrives (~55% through the lunge). */
const STRIKE_CONTACT_DELAY = STRIKE_DELAY + STRIKE_LUNGE_DUR * 0.44;
/** The defense card's knockback/brace/shove. Lengthened alongside the lunge. */
const STRIKE_REACT_DUR = 0.68;

// Attack card — win: lunge across into contact, follow through, settle back home.
const strikeLungeWin = keyframes`
  0%   { transform: translateX(0) scale(1); }
  55%  { transform: translateX(46%) scale(1.07); }
  72%  { transform: translateX(30%) scale(1.03); }
  100% { transform: translateX(0) scale(1); }
`;
// Attack card — blocked: lunge, bounce off the shield, recoil past the slot, rest.
const strikeLungeBlocked = keyframes`
  0%   { transform: translateX(0) scale(1); }
  42%  { transform: translateX(40%) scale(1.05); }
  60%  { transform: translateX(-16%) scale(0.96); }
  80%  { transform: translateX(7%); }
  100% { transform: translateX(0) scale(1); }
`;
// Attack card — tie: a shorter shove in and separate, neutral.
const strikeLungeTie = keyframes`
  0%   { transform: translateX(0); }
  50%  { transform: translateX(28%) scale(1.02); }
  100% { transform: translateX(0); }
`;
// Defense card — win: struck, staggers, settles knocked aside + dimmed. Distance
// and tilt ride --kb / --tilt (scaled with damage). `both` holds the pose until
// the strike descriptor clears (or the lingered panel unmounts).
const strikeKnockback = keyframes`
  0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
  16%  { transform: translateX(var(--kb)) rotate(var(--tilt)); opacity: 1; }
  42%  { transform: translateX(calc(var(--kb) * 0.55)) rotate(calc(var(--tilt) * 0.6)); }
  66%  { transform: translateX(calc(var(--kb) * 0.82)) rotate(calc(var(--tilt) * 0.85)); }
  100% { transform: translateX(calc(var(--kb) * 0.6)) rotate(calc(var(--tilt) * 0.66)); opacity: 0.66; }
`;
// Defense card — blocked: a small proud brace pulse (held its ground).
const strikeBrace = keyframes`
  0%,100% { transform: scale(1); }
  35%     { transform: scale(1.09) translateY(-4%); }
  60%     { transform: scale(1.02); }
`;
// Defense card — tie: shoved right and separates, neutral, returns.
const strikeShoveDef = keyframes`
  0%   { transform: translateX(0); }
  45%  { transform: translateX(16%) rotate(2deg); }
  100% { transform: translateX(0); }
`;
// A 2–3px panel shake at the contact moment.
const strikeShake = keyframes`
  0%,100% { transform: translate(0, 0); }
  20%     { transform: translate(-2px, 1px); }
  40%     { transform: translate(2px, -2px); }
  60%     { transform: translate(-2px, 2px); }
  80%     { transform: translate(2px, -1px); }
`;
// Impact ring at the contact point (win / tie).
const strikeImpact = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  30%  { opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(1.9); opacity: 0; }
`;
// Shield ring flashing on the defense card (blocked).
const strikeShield = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.55); opacity: 0; }
  25%  { opacity: 0.95; }
  100% { transform: translate(-50%, -50%) scale(1.3); opacity: 0; }
`;

const STRIKE_ATTACK_KF: Record<StrikeVariant, ReturnType<typeof keyframes>> = {
  win: strikeLungeWin,
  blocked: strikeLungeBlocked,
  tie: strikeLungeTie,
};
const STRIKE_DEFENSE_KF: Record<StrikeVariant, ReturnType<typeof keyframes>> = {
  win: strikeKnockback,
  blocked: strikeBrace,
  tie: strikeShoveDef,
};

/** Knockback distance/tilt for the defense card, scaled with damage (win only).
 *  Passed via inline `style` (custom properties) — the proven pattern for CSS vars
 *  read by an Emotion keyframe (see game.carousel.tsx's --rot/--droop). */
const strikeKnockVars = (damage: number): CSSProperties =>
  ({
    "--kb": `${Math.min(22, 8 + damage * 2.5).toFixed(1)}px`,
    "--tilt": `${Math.min(12, 7 + damage).toFixed(1)}deg`,
  } as CSSProperties);

// ---------------------------------------------------------------------------
// The math beat (issue #382 — #379 battle-sequence epic). Value modifiers fly in
// as chips onto the slot's value pill (useCombatValueFx paces them through the
// battle timeline); the pill ticks up as each lands. When the combat resolves the
// comparison beat pulses the winning value gold (snuffValuePulse) and dims/cracks
// the loser — sequenced by CSS delay off the strike's contact moment.
// ---------------------------------------------------------------------------

/** Chip on-screen lifetime — matches CHIP_TTL_MS in combatValueFx so the fly-in +
 *  fade covers exactly the window the hook keeps the chip mounted. */
const CHIP_FLY_DUR = 0.9;
/** A modifier chip flies in from up-right and settles onto the value pill. */
const chipFly = keyframes`
  0%   { opacity: 0; transform: translate(1.5rem, -0.6rem) scale(0.7); }
  35%  { opacity: 1; transform: translate(0.45rem, -0.25rem) scale(1.08); }
  72%  { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(0, 0.15rem) scale(0.92); }
`;
/** The pill pops as its number ticks — keyed by the displayed value so each step
 *  replays it, reading as a count-up rather than a silent jump. */
const valueTick = keyframes`
  0%   { transform: scale(1); }
  45%  { transform: scale(1.3); text-shadow: 0 0 12px rgba(255,224,138,0.9); }
  100% { transform: scale(1); }
`;
/** The losing value cracks: a small shake, then desaturates and dims in place. */
const loserDim = keyframes`
  0%   { transform: translateX(0) rotate(0deg); filter: none; opacity: 1; }
  22%  { transform: translateX(-2px) rotate(-1.5deg); }
  46%  { transform: translateX(2px) rotate(1.5deg); }
  100% { transform: translateX(0) rotate(0deg); filter: grayscale(0.85) brightness(0.7); opacity: 0.5; }
`;
/** A tie's neutral two-way pulse: BOTH values flash (no gold, no dim) so an
 *  equal-values draw reads as a resolved clash, not "nothing happened" (#382
 *  0-damage regression). Parchment glow, not the winner's gold. */
const neutralPulse = keyframes`
  0%   { transform: scale(1); }
  50%  { transform: scale(1.2); text-shadow: 0 0 12px rgba(240,230,210,0.75); }
  100% { transform: scale(1); }
`;

/** Comparison beat begins just after the (now-longer) strike lands. */
const COMPARE_DELAY = STRIKE_CONTACT_DELAY + 0.15;
/** Comparison pulse durations — lengthened with the rest of the sequence so the
 *  resolved values hold their pose rather than blinking. Keyed by CompareBeat. */
const COMPARE_DUR = { gold: 1.1, dim: 1.0, neutral: 1.0 } as const;

/**
 * Synthetic "Fire, you fools!" sub-attack combat card (issue #288 — engine batch D).
 * The chosen B1 droid's "Blast 'em!" attack has no catalog/deck entry (its instance is
 * `sub-attack:<fighter>`, `synthetic: true` server-side) — it is a graphic PRINTED on
 * card 210's face with no separate cell to crop — so resolveCard can't find art. Render
 * a distinct card-shaped tile rather than the raw-instance-id text fallback. The value
 * rides the normal combat math (effectiveValue) shown by the slot's detail line.
 */
const isSubAttackCard = (instance: CardInstanceId) => instance.startsWith("sub-attack:");
const SubAttackFace = () => (
  <Flex
    w="100%"
    h="100%"
    direction="column"
    align="center"
    justify="center"
    borderRadius="0.35rem"
    border="2px solid"
    borderColor="brand.accent"
    bg="linear-gradient(160deg, #6b2b2b, #3a1414)"
    color="brand.parchment"
    px="0.35rem"
    textAlign="center"
  >
    <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.04em" lineHeight="1.05">
      Blast&nbsp;&apos;em!
    </Text>
    <Text fontSize="0.6rem" opacity={0.8} mt="0.2rem">
      sub-attack
    </Text>
  </Flex>
);

/** One combat slot: revealed card face, own face-down commit, or a card back. */
const CombatSlot = ({
  label,
  card,
  detail,
  resolveCard,
  facedownInstance,
  facedownState,
  catalog,
  revealDelay = "0s",
  strikeAnimation,
  strikeVars,
  valueFx,
  comparePulse,
}: {
  label: string;
  card: ViewCombat["attackerCard"];
  detail?: string;
  resolveCard: ResolveCard;
  /** own committed instance when this slot is mine and unrevealed */
  facedownInstance: CardInstanceId | null;
  facedownState: "committed" | "deciding" | "none";
  catalog: Record<string, CardMeta>;
  revealDelay?: string;
  /** strike beat (#381): a lunge/knockback animation applied to the card box, plus
   *  --kb/--tilt vars scaling the defense knockback with damage. */
  strikeAnimation?: string;
  strikeVars?: CSSProperties;
  /** math beat (#382): chips flying onto the pill + the pill's ticking value.
   *  Undefined ⇒ visual-fx off / reduced motion ⇒ the pill shows the raw value. */
  valueFx?: SlotValueFx;
  /** comparison beat (#382): "gold" pulses the winning value, "dim" cracks the
   *  loser, "neutral" flashes both on a tie. */
  comparePulse?: CompareBeat;
}) => (
  <Box textAlign="center">
    <Text opacity={0.6} fontSize="0.75rem" mb="0.25rem">
      {label}
    </Text>
    <Box
      w="6.5rem"
      mx="auto"
      position="relative"
      animation={strikeAnimation}
      style={strikeVars}
      sx={{ aspectRatio: "63 / 88", ...(strikeAnimation ? NO_MOTION : {}) }}
    >
      {card ? (
        // keyed by instance: mounts fresh at reveal, so the flip plays exactly once
        <Box
          key={card.instance}
          w="100%"
          h="100%"
          animation={`${flipIn} 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.1) ${revealDelay} both`}
        >
          {isSubAttackCard(card.instance) ? (
            <SubAttackFace />
          ) : (
            <CardFace card={resolveCard(card.instance)} fallback={cardLabel(catalog, card.instance)} />
          )}
        </Box>
      ) : facedownInstance ? (
        <Box position="relative" w="100%" h="100%">
          <CardFace
            card={resolveCard(facedownInstance)}
            fallback={cardLabel(catalog, facedownInstance)}
          />
          <Tag position="absolute" top="-0.4rem" left="50%" transform="translateX(-50%)" size="sm">
            face-down
          </Tag>
        </Box>
      ) : (
        <Flex
          w="100%"
          h="100%"
          bg={facedownState === "committed" ? "brand.surface" : "transparent"}
          border="1px dashed"
          borderColor="whiteAlpha.400"
          borderRadius="0.5rem"
          alignItems="center"
          justifyContent="center"
        >
          <Text fontSize="0.7rem" opacity={0.6}>
            {facedownState === "committed" ? "face-down" : facedownState === "deciding" ? "deciding…" : "no card"}
          </Text>
        </Flex>
      )}
    </Box>
    {card && (
      // The value row is a positioning context: chips fly in beside the pill, and
      // the pill's number ticks (valueFx.displayValue) up to the effective value.
      <Flex position="relative" justify="center" align="center" h="1.4rem">
        {/* modifier chips flying onto the pill (issue #382) */}
        {(valueFx?.chips ?? []).map((chip) => (
          <Box
            key={chip.key}
            position="absolute"
            left="50%"
            bottom="100%"
            transform="translateX(-50%)"
            px="0.4rem"
            py="0.05rem"
            mb="0.1rem"
            borderRadius="999px"
            whiteSpace="nowrap"
            fontFamily="SpaceGrotesk"
            fontSize="0.62rem"
            fontWeight="bold"
            letterSpacing="0.02em"
            color={chip.delta < 0 ? "#ff9a8a" : "brand.accent"}
            bg="rgba(20,16,14,0.92)"
            border="1px solid"
            borderColor={chip.delta < 0 ? "rgba(255,120,90,0.6)" : "rgba(224,168,46,0.6)"}
            boxShadow="0 2px 8px rgba(0,0,0,0.6)"
            pointerEvents="none"
            zIndex={3}
            animation={`${chipFly} ${CHIP_FLY_DUR}s cubic-bezier(0.2, 0.8, 0.3, 1) both`}
            sx={NO_MOTION}
            title={chip.source ? cardLabel(catalog, chip.source) : undefined}
          >
            {chip.label}
          </Box>
        ))}
        <Text
          // Keyed by the displayed value so each tick replays the pop (count-up feel).
          key={valueFx?.displayValue ?? card.effectiveValue}
          fontSize="0.95rem"
          fontWeight="bold"
          color="brand.accent"
          animation={
            comparePulse === "gold"
              ? `${snuffValuePulse} ${COMPARE_DUR.gold}s ease-out ${COMPARE_DELAY}s both`
              : comparePulse === "dim"
                ? `${loserDim} ${COMPARE_DUR.dim}s ease-out ${COMPARE_DELAY}s both`
                : comparePulse === "neutral"
                  ? `${neutralPulse} ${COMPARE_DUR.neutral}s ease-out ${COMPARE_DELAY}s both`
                  : valueFx?.displayValue != null
                    ? `${valueTick} 0.28s ease-out both`
                    : undefined
          }
          sx={comparePulse || valueFx?.displayValue != null ? NO_MOTION : undefined}
        >
          {valueFx?.displayValue ?? card.effectiveValue}
          {card.boosts.length ? ` (+${card.boosts.length} boost)` : ""}
        </Text>
      </Flex>
    )}
    {detail && (
      <Text fontSize="0.75rem" opacity={0.7}>
        {detail}
      </Text>
    )}
  </Box>
);

/** A decorative ring flashed at the strike's contact point / on the blocked card.
 *  `pointerEvents="none"`; mounts with the strike so its 0.5s animation plays once. */
const StrikeRing = ({
  variant,
  delay,
  left,
}: {
  variant: StrikeVariant;
  delay: number;
  left: string;
}) => {
  const shield = variant === "blocked";
  return (
    <Box
      position="absolute"
      top="42%"
      left={left}
      w="2.6rem"
      h="2.6rem"
      borderRadius="50%"
      border={shield ? "3px solid #6fd3c6" : "3px solid #f0c14b"}
      boxShadow={shield ? "0 0 16px rgba(111,211,198,0.7)" : "0 0 16px rgba(240,193,75,0.7)"}
      pointerEvents="none"
      zIndex={2}
      opacity={0}
      animation={`${shield ? strikeShield : strikeImpact} 0.5s ease-out ${delay}s both`}
      sx={NO_MOTION}
    />
  );
};

/**
 * Combat windows for the panel ticker (issue #380). The two COMMIT_* stages
 * collapse into a leading pre-reveal "commit" state; HERO_POST/CLEANUP fold into
 * the trailing "after". The named windows mirror the resolution order the engine
 * walks (IMMEDIATELY → DURING → DAMAGE → AFTER, ViewCombat.stage in protocol.ts).
 */
const COMBAT_WINDOWS = ["commit", "immediately", "during", "damage", "after"] as const;

const combatWindowIndex = (stage: ViewCombat["stage"]): number => {
  switch (stage) {
    case "COMMIT_ATTACK":
    case "COMMIT_DEFENSE":
      return 0;
    case "IMMEDIATELY":
      return 1;
    case "DURING":
      return 2;
    case "DAMAGE":
      return 3;
    case "AFTER":
    case "HERO_POST":
    case "CLEANUP":
      return 4;
    default:
      return 0;
  }
};

/** Compact one-row ticker of the combat windows: active lit, past dimmed. */
const CombatStageTicker = ({ stage }: { stage: ViewCombat["stage"] }) => {
  const active = combatWindowIndex(stage);
  return (
    <Flex mt="0.5rem" justifyContent="center" alignItems="center" gap="0.3rem" flexWrap="wrap">
      {COMBAT_WINDOWS.map((w, i) => (
        <Fragment key={w}>
          {i > 0 && (
            <Text fontSize="0.55rem" opacity={0.3} aria-hidden>
              ›
            </Text>
          )}
          <Text
            fontFamily="SpaceGrotesk"
            fontSize="0.6rem"
            letterSpacing="0.08em"
            textTransform="uppercase"
            fontWeight={i === active ? "bold" : "normal"}
            color={i === active ? "brand.accent" : "brand.parchment"}
            opacity={i === active ? 1 : i < active ? 0.5 : 0.28}
          >
            {w}
          </Text>
        </Fragment>
      ))}
    </Flex>
  );
};

/** Human-readable combat outcome — never the raw enum, and UNKNOWN stays hidden. */
const COMBAT_OUTCOME_LABEL: Record<Exclude<CombatOutcome, "UNKNOWN">, string> = {
  ATTACKER_WON: "Attacker wins",
  DEFENDER_WON: "Defender wins",
};

/** The reveal beat + running combat math, straight from the server view. The
 *  strike beat (#381) rides on top: when `strike` is set, the attack card lunges
 *  and slams the defense card, the panel shakes, and a ring flashes — all sequenced
 *  by CSS delay off the flip and gated on the caller (visual-fx off ⇒ null). The
 *  stage ticker (#380) sits below the slots; the outcome uses COMBAT_OUTCOME_LABEL. */
const CombatPanel = ({
  combat,
  catalog,
  resolveCard,
  you,
  selfCommitted,
  strike,
  valueFx,
  clashRef,
}: {
  combat: ViewCombat;
  catalog: Record<string, CardMeta>;
  resolveCard: ResolveCard;
  you: PlayerView["you"];
  selfCommitted: CardInstanceId | null;
  strike?: CombatStrike | null;
  /** math beat (#382): per-role chips + ticking pill value (undefined ⇒ off). */
  valueFx?: CombatValueFx;
  /** the clash point (seam between the cards) — the arc launches from here. The
   *  page owns the ref and reads its rect at launch time (#382). */
  clashRef?: React.Ref<HTMLDivElement>;
}) => {
  const attackerCommitted = combat.stage !== "COMMIT_ATTACK";
  const pastReveal = !["COMMIT_ATTACK", "COMMIT_DEFENSE"].includes(combat.stage);
  const attackAnim = strike
    ? `${STRIKE_ATTACK_KF[strike.variant]} ${STRIKE_LUNGE_DUR}s cubic-bezier(0.3, 0, 0.2, 1) ${STRIKE_DELAY}s both`
    : undefined;
  const defenseAnim = strike
    ? `${STRIKE_DEFENSE_KF[strike.variant]} ${STRIKE_REACT_DUR}s cubic-bezier(0.2, 0.8, 0.3, 1) ${STRIKE_CONTACT_DELAY}s both`
    : undefined;
  // The panel shakes at the contact moment; the ring flashes there too. Blocked
  // flashes a shield on the defense card (right), win/tie an impact ring at the seam.
  const ring = strike ? (
    <StrikeRing
      variant={strike.variant}
      delay={STRIKE_CONTACT_DELAY}
      left={strike.variant === "blocked" ? "72%" : "50%"}
    />
  ) : null;
  return (
    <Box
      bg="brand.surface"
      border="1px solid"
      borderColor="whiteAlpha.300"
      borderRadius="0.5rem"
      p="0.75rem"
      position="relative"
      animation={strike ? `${strikeShake} 0.4s ease-in-out ${STRIKE_CONTACT_DELAY}s both` : undefined}
      sx={strike ? NO_MOTION : undefined}
    >
      <Flex gap="0.5rem" alignItems="center" mb="0.5rem">
        <Tag colorScheme="red" size="sm">
          COMBAT
        </Tag>
      </Flex>
      <Flex gap="1rem" justifyContent="center" position="relative">
        <CombatSlot
          label="attack"
          card={combat.attackerCard}
          resolveCard={resolveCard}
          facedownInstance={
            !combat.attackerCard && combat.attackerPlayer === you ? selfCommitted : null
          }
          facedownState={attackerCommitted ? "committed" : "deciding"}
          catalog={catalog}
          strikeAnimation={attackAnim}
          valueFx={valueFx?.ATTACK}
          comparePulse={comparePulseFor(strike?.variant, "ATTACK")}
        />
        <CombatSlot
          label="defense"
          card={combat.defenderCard}
          revealDelay="0.18s"
          resolveCard={resolveCard}
          facedownInstance={
            !combat.defenderCard && combat.defenderPlayer === you && !pastReveal ? selfCommitted : null
          }
          facedownState={combat.stage === "COMMIT_DEFENSE" ? "deciding" : pastReveal ? "none" : "committed"}
          catalog={catalog}
          strikeAnimation={defenseAnim}
          strikeVars={strike?.variant === "win" ? strikeKnockVars(strike.damage) : undefined}
          valueFx={valueFx?.DEFENSE}
          comparePulse={comparePulseFor(strike?.variant, "DEFENSE")}
        />
        {ring}
        {/* Clash point — the seam between the two cards. Zero-size marker whose
            viewport rect is the arc's launch origin (#382). */}
        <Box
          ref={clashRef}
          position="absolute"
          top="42%"
          left="50%"
          w="1px"
          h="1px"
          pointerEvents="none"
        />
      </Flex>
      <CombatStageTicker stage={combat.stage} />
      {combat.outcome && combat.outcome !== "UNKNOWN" && (
        <Text textAlign="center" mt="0.5rem" fontWeight="bold">
          {COMBAT_OUTCOME_LABEL[combat.outcome]}
          {combat.attackDamageDealt !== null ? ` · ${combat.attackDamageDealt} dmg` : ""}
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// The damage arc (issue #382 — #379 battle-sequence epic). One fixed-position
// projectile per resolved hit, arcing from the panel clash point down to the
// defender's token. Both endpoints are viewport px CAPTURED AT LAUNCH by useGameFx
// (correct under the board's zoom/pan transform, where board coords are not), so
// this layer just tweens between two frozen points along a quadratic bézier. The
// board `−N` / ring / hit sound are delayed to the landing by useGameFx, so no
// duplicate is spawned here. framer-motion drives the flight (the epic sanctions it
// for genuine springs/paths); the whole layer is absent when there are no arcs.
// ---------------------------------------------------------------------------

/** Sample a quadratic bézier (P0→P2, control lifted above the midpoint so the shot
 *  arcs) into N viewport points for framer-motion keyframe arrays. */
const arcPoints = (from: DamageArc["from"], to: DamageArc["to"], n = 18) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  // Control point: midpoint, lifted UP (screen y−) by a fraction of the span so the
  // projectile lobs rather than sliding straight; clamped so long shots don't balloon.
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2 - Math.min(220, dist * 0.28 + 40);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const mt = 1 - t;
    xs.push(mt * mt * from.x + 2 * mt * t * cx + t * t * to.x);
    ys.push(mt * mt * from.y + 2 * mt * t * cy + t * t * to.y);
  }
  return { xs, ys };
};

const DamageArcLayer = ({ arcs }: { arcs: DamageArc[] }) => {
  if (arcs.length === 0) return null;
  return (
    <Box position="fixed" inset="0" pointerEvents="none" zIndex={205}>
      {arcs.map((arc) => {
        const { xs, ys } = arcPoints(arc.from, arc.to);
        const dur = arc.flightMs / 1000;
        return (
          <motion.div
            key={arc.key}
            style={{ position: "fixed", top: 0, left: 0, willChange: "transform" }}
            initial={{ x: arc.from.x, y: arc.from.y, opacity: 0, scale: 0.6 }}
            animate={{
              x: xs,
              y: ys,
              // pop in on launch, hold, then a touch bigger as it lands
              opacity: [0, 1, 1, 1],
              scale: [0.6, 1.1, 1, arc.heavy ? 1.25 : 1.1],
            }}
            // ease-in so it accelerates into the token like a thrown blow
            transition={{ duration: dur, ease: "easeIn", opacity: { duration: dur * 0.3 } }}
          >
            <Box
              transform="translate(-50%, -50%)"
              px={arc.heavy ? "0.6rem" : "0.5rem"}
              py="0.1rem"
              borderRadius="999px"
              fontFamily="BebasNeueRegular"
              fontSize={arc.heavy ? "1.7rem" : "1.35rem"}
              fontWeight="bold"
              lineHeight="1"
              color="#fff"
              bg="rgba(200,40,40,0.92)"
              border="2px solid #ff7a5c"
              boxShadow="0 0 18px rgba(255,90,60,0.85), 0 2px 6px rgba(0,0,0,0.7)"
              whiteSpace="nowrap"
            >
              −{arc.amount}
            </Box>
          </motion.div>
        );
      })}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Pre-join lobby — hero select (T-021)
// ---------------------------------------------------------------------------

const agoLabel = (ts: number) => {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
};

/** server hero id -> pretty display fallback ('king-kong' -> 'King Kong') */
const prettyHeroId = (heroId: string) =>
  heroId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const heroNameOf = (heroes: HeroListing[] | null, heroId: string | null) => {
  if (!heroId) return null;
  return heroes?.find((h) => h.heroId === heroId)?.name ?? prettyHeroId(heroId);
};

const viewHeroIdOf = (view: PlayerView, player: PlayerId): string | null =>
  view.players.find((p) => p.id === player)?.heroId ??
  (view.self.id === player ? view.self.heroId : null) ??
  (view.opponent?.id === player ? view.opponent.heroId : null);

const playerLabel = (view: PlayerView, player: PlayerId): string => {
  if (player === view.you) return "your";
  return view.players.length === 2 ? "opponent's" : `${player.toUpperCase()}'s`;
};

/**
 * Community-deck metadata (author, likes, cardback) for a server hero via the
 * deck-id bridge. Every /pro hero originates as a fan deck on unmatched.cards —
 * the tile credits its author and links back to the source listing.
 */
const heroDeckMeta = (heroId: string): PopularDeckMeta | undefined => {
  const deckId = HERO_DECK_IDS[heroId];
  return POPULAR_DECKS.find((d) => d.id === deckId);
};

const LabDeckTag = ({ compact = false }: { compact?: boolean }) => (
  <Tag
    size="sm"
    variant="subtle"
    bg="rgba(224,168,46,0.24)"
    color="brand.accent"
    border="1px solid rgba(224,168,46,0.35)"
    borderRadius="999px"
    fontFamily="SpaceGrotesk"
    fontSize={compact ? "0.48rem" : "0.58rem"}
    fontWeight={700}
    letterSpacing="0.12em"
    textTransform="uppercase"
    px={compact ? "0.3rem" : "0.45rem"}
    py="0.05rem"
    boxShadow="0 2px 6px rgba(0,0,0,0.35)"
  >
    In the lab
  </Tag>
);

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
/** Spread into an animated element's `sx` to honor prefers-reduced-motion. */
const NO_MOTION = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none !important" },
} as const;

/** Gold selection ring for a locked roster tile (brand.accent = #E0A82E). */
const GOLD_RING = "0 0 0 2px #E0A82E, 0 0 18px rgba(224,168,46,0.4)";
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
}: {
  hero: HeroListing;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
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
      {deck?.lab && (
        <Flex position="absolute" top="0.3rem" right="0.3rem" zIndex={3}>
          <LabDeckTag compact />
        </Flex>
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
 * The left splash panel. Shows the hovered fighter live (preview state), reverts
 * to the locked pick on mouse-leave, and carries all the per-fighter info the
 * tiles no longer do: big name, author credit, stats, frozen-rules line, and the
 * deck-preview link. Collapses to a short wide banner under `lg`.
 */
const SplashPanel = ({
  hero,
  locked,
  onViewDeck,
}: {
  hero: HeroListing | undefined;
  /** true → showing the committed pick ("P1 · locked in"); false → live preview */
  locked: boolean;
  onViewDeck: () => void;
}) => {
  const deck = hero ? heroDeckMeta(hero.heroId) : undefined;
  const cardback = deck?.cardbackUrl;
  const frozenAt = hero ? frozenAtForHero(hero.heroId) : undefined;
  return (
    <Flex
      direction={{ base: "row", lg: "column" }}
      position="relative"
      borderRadius="0.9rem"
      overflow="hidden"
      minH={{ base: "9rem", lg: "28rem" }}
      border="1px solid"
      borderColor="whiteAlpha.200"
      bg="brand.surfaceDim"
      boxShadow="0 14px 34px rgba(0,0,0,0.5)"
    >
      {hero && cardback && (
        <Box
          position="absolute"
          inset="0"
          bgImage={`url("${cardback}")`}
          bgSize="cover"
          bgPos="center"
        />
      )}
      <Box
        position="absolute"
        inset="0"
        bg="linear-gradient(180deg, rgba(12,5,14,0.15) 30%, rgba(12,5,14,0.93) 85%)"
      />
      {!hero ? (
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
          <Text fontSize="0.85rem">
            Hover a fighter to preview.
            <br />
            Click to lock in.
          </Text>
        </Flex>
      ) : (
        <Flex
          position="relative"
          direction="column"
          mt="auto"
          p={{ base: "0.85rem", lg: "1.1rem" }}
          gap="0.15rem"
          w="100%"
          minW="0"
        >
          <Text
            fontFamily="SpaceGrotesk"
            fontSize="0.62rem"
            letterSpacing="0.18em"
            color={locked ? "brand.accent" : "whiteAlpha.600"}
          >
            {locked ? "P1 · LOCKED IN" : "PREVIEW — CLICK TO LOCK IN"}
          </Text>
          <Text
            key={hero.heroId}
            fontFamily="LeagueGothic"
            fontSize={{ base: "1.5rem", lg: "2.1rem" }}
            lineHeight="1.02"
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
          {deck && (
            <Text fontStyle="italic" fontSize="0.8rem" color="brand.parchment" opacity={0.85}>
              by{" "}
              {/* Community decks link to their unmatched.cards attribution page;
                  evergreen originals (deck.original) have no such page, so the
                  author stays plain text. stopPropagation is defensive — the
                  splash panel isn't itself selectable, but keeps the link inert
                  toward any future click-to-lock wrapper. */}
              {deck.original ? (
                deck.author
              ) : (
                <Tooltip
                  label={`View ${deck.author}'s deck on unmatched.cards`}
                  hasArrow
                  placement="top"
                  openDelay={150}
                >
                  <Link
                    href={`https://unmatched.cards/decks/${deck.id}`}
                    isExternal
                    aria-label={`View ${deck.author}'s deck on unmatched.cards (opens in a new tab)`}
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
              )}
            </Text>
          )}
          <Flex gap="0.9rem" mt="0.45rem" align="center" color="brand.parchment" sx={{ fontVariantNumeric: "tabular-nums" }}>
            <StatPip icon={<GiHearts color="#C0392B" size="15px" />} label={String(hero.hp)} />
            <StatPip icon={<GiFootprint size="14px" />} label={String(hero.move)} />
            <Flex align="center" gap="0.3rem" fontSize="0.8rem" fontWeight="bold">
              {reachIsRanged(hero.reach) ? <TbBow size="15px" /> : <TbSword size="15px" />}
              <Text>{reachWord(hero.reach)}</Text>
            </Flex>
          </Flex>
          {frozenAt && (
            <Text fontSize="0.6rem" opacity={0.55} mt="0.35rem" fontFamily="SpaceGrotesk">
              rules version frozen {frozenAt}
            </Text>
          )}
          <Button
            type="button"
            onClick={onViewDeck}
            display={{ base: "none", lg: "inline-flex" }}
            mt="0.7rem"
            alignSelf="flex-start"
            size="xs"
            variant="outline"
            leftIcon={<TbInfoCircle />}
            bg="transparent"
            borderColor="whiteAlpha.300"
            color="brand.parchment"
            _hover={{ borderColor: "brand.accent", color: "brand.accent" }}
          >
            View deck
          </Button>
        </Flex>
      )}
    </Flex>
  );
};

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

/** Who-fills-this-seat choice, unified across the duel opponent + multiplayer
 *  seats (both drive the same `human | easy | medium | hard` union). */
type OpponentChoice = "human" | BotDifficulty;
const SEAT_CHIPS: { v: OpponentChoice; label: string }[] = [
  { v: "human", label: "Hum" },
  { v: "easy", label: "AI·E" },
  { v: "medium", label: "AI·M" },
  { v: "hard", label: "AI·H" },
];

const PlateChips = ({ value, onChange }: { value: OpponentChoice; onChange: (v: OpponentChoice) => void }) => (
  <Flex gap="0.25rem" mt="0.3rem" flexWrap="wrap">
    {SEAT_CHIPS.map((c) => {
      const active = value === c.v;
      return (
        <Button
          key={c.v}
          type="button"
          size="xs"
          aria-pressed={active}
          h="1.3rem"
          minW="auto"
          px="0.45rem"
          fontSize="0.62rem"
          fontFamily="SpaceGrotesk"
          onClick={() => onChange(c.v)}
          bg={active ? "brand.accent" : "rgba(0,0,0,0.3)"}
          color={active ? "brand.surfaceDim" : "brand.parchment"}
          border="1px solid"
          borderColor={active ? "brand.accent" : "whiteAlpha.200"}
          _hover={{ borderColor: active ? "brand.accentDeep" : "whiteAlpha.400" }}
        >
          {c.label}
        </Button>
      );
    })}
  </Flex>
);

/**
 * One player plate in the bottom row. The angled/skewed styling gives the
 * fighting-game feel; the P1 (you) plate shows your locked fighter, every other
 * seat carries its own Human/AI chips.
 */
const SeatPlate = ({
  tag,
  role,
  you,
  heroName,
  cardback,
  occupant,
  onChange,
  teamAccent,
}: {
  tag: string;
  role?: string;
  you?: boolean;
  heroName?: string | null;
  cardback?: string;
  occupant?: OpponentChoice;
  onChange?: (v: OpponentChoice) => void;
  teamAccent?: boolean;
}) => {
  const isAi = !!occupant && occupant !== "human";
  return (
    <Flex
      minW="10.5rem"
      flex={{ base: "1 1 10.5rem", md: "0 1 auto" }}
      borderRadius="0.6rem"
      border="1px solid"
      borderColor={you ? "brand.accentDeep" : isAi ? "brand.accent" : teamAccent ? ALLY_ACCENT : "whiteAlpha.200"}
      bg={you ? "linear-gradient(105deg, rgba(224,168,46,0.14), rgba(0,0,0,0.3) 60%)" : "rgba(0,0,0,0.3)"}
      p="0.55rem 0.65rem"
      gap="0.6rem"
      align="center"
      overflow="hidden"
      sx={{ transform: "skewX(-3deg)", "& > *": { transform: "skewX(3deg)" } }}
    >
      <Flex
        w="2.6rem"
        h="2.6rem"
        flex="none"
        borderRadius="0.4rem"
        overflow="hidden"
        border="1px solid"
        borderColor="whiteAlpha.200"
        bg="brand.surfaceDim"
        align="center"
        justify="center"
        fontSize="1.1rem"
        color="whiteAlpha.700"
        bgImage={you && cardback ? `url("${cardback}")` : undefined}
        bgSize="cover"
        bgPos="center"
      >
        {you ? (cardback ? "" : "?") : isAi ? "🤖" : "👤"}
      </Flex>
      <Box minW="0" flex="1">
        <Text fontFamily="SpaceGrotesk" fontSize="0.6rem" letterSpacing="0.14em" color={you ? "brand.accent" : "whiteAlpha.600"}>
          {tag}
          {role ? ` · ${role}` : ""}
        </Text>
        <Text fontFamily="BebasNeueRegular" fontSize="0.95rem" letterSpacing="0.03em" noOfLines={1}>
          {you ? heroName ?? "Pick a fighter" : isAi ? `AI · ${occupant}` : "Open seat"}
        </Text>
        {!you && onChange && <PlateChips value={occupant ?? "human"} onChange={onChange} />}
      </Box>
    </Flex>
  );
};

const VsBadge = () => (
  <Flex
    align="center"
    px="0.2rem"
    color="brand.accent"
    fontFamily="LeagueGothic"
    fontSize="1.4rem"
    letterSpacing="0.04em"
    textShadow="0 2px 10px rgba(224,168,46,0.4)"
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
  onConfirm,
  customMapJson,
  onCustomMapJsonChange,
  selectedMapId,
  onSelectMap,
  mapError,
  recentRooms,
  onResumeRoom,
}: {
  room: string | null;
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
  onConfirm: () => void;
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
}) => {
  // While the list is loading, a valid-looking `?hero=` stands in so the
  // creator isn't blocked; once the list arrives the real selection takes over.
  const effective = selectedHeroId ?? (heroes === null ? heroParam : null);
  const canConfirm = status === "open" && !!effective;
  const format = formatChoice(selectedFormat);
  const multiplayer = selectedFormat !== "duel";
  const [previewHero, setPreviewHero] = useState<HeroListing>();
  const [previewMap, setPreviewMap] = useState<MapCatalogEntry | null>(null);

  // Roster browse state: the hovered fighter drives the splash live and reverts
  // to the locked pick on mouse-leave; search + reach filter narrow the mosaic.
  const [hoverHero, setHoverHero] = useState<HeroListing>();
  const [search, setSearch] = useState("");
  const [reachFilter, setReachFilter] = useState<ReachFilter>("all");

  // Timer chips: "Off" is the first chip (the on/off toggle is gone); "…" opens
  // an inline seconds field for any value in the engine's 10–300 range. Seeded
  // open when we arrive on a non-preset custom value.
  const [customTimerOpen, setCustomTimerOpen] = useState(
    () => turnTimerSeconds > 0 && !TURN_TIMER_STRIP_PRESETS.includes(turnTimerSeconds as never)
  );

  const lockedHero = heroes?.find((h) => h.heroId === effective);
  const lockedName = lockedHero?.name ?? (effective ? prettyHeroId(effective) : null);
  const lockedCardback = lockedHero ? heroDeckMeta(lockedHero.heroId)?.cardbackUrl : undefined;
  // Splash shows the hover preview, else the locked pick. Hovering your own
  // locked tile keeps the "locked" wording (matches the mockup).
  const splashHero = hoverHero ?? lockedHero;
  const splashLocked =
    !!splashHero && (!hoverHero || (!!lockedHero && hoverHero.heroId === lockedHero.heroId));

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

  const visibleHeroes = (heroes ?? []).filter((h) => {
    if (!matchesReachFilter(h, reachFilter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const author = heroDeckMeta(h.heroId)?.author ?? "";
    return h.name.toLowerCase().includes(q) || author.toLowerCase().includes(q);
  });

  const recommendedHeroes = visibleHeroes.filter((h) => h.deckSection === "recommended");
  const communityHeroes = visibleHeroes.filter((h) => h.deckSection === "community");

  const stageName =
    selectedMapId === CUSTOM_MAP_ID
      ? "Custom board"
      : catalogEntry(selectedMapId)?.title ?? "Default board";
  const timerText = turnTimerSeconds > 0 ? `${clampTurnTimer(turnTimerSeconds)}s timer` : "no timer";
  const summary = effective
    ? `${lockedName} · ${stageName} · ${timerText}`
    : "Pick a fighter to preview — click a tile to lock in.";

  const createLabel = !effective
    ? "Pick a fighter"
    : room
      ? "Join"
      : multiplayer
        ? `Create ${format.label}`
        : opponent === "human"
          ? "Create"
          : "Play vs AI";

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

  const createButton = (
    <Button
      type="button"
      onClick={onConfirm}
      isDisabled={!canConfirm}
      h="auto"
      py="0.8rem"
      px="1.4rem"
      borderRadius="0.6rem"
      fontFamily="LeagueGothic"
      fontSize="1.15rem"
      letterSpacing="0.08em"
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

  // Player plates for the current format. Duel opponent + multiplayer seats share
  // the same Human/AI chips (SeatPlate); they just write to different parent
  // state (`opponent` vs `botSlotPlan`), preserving the existing create-time wire.
  const renderPlates = () => {
    if (room) {
      return <SeatPlate tag="P1" role="You" you heroName={lockedName} cardback={lockedCardback} />;
    }
    if (selectedFormat === "duel") {
      return (
        <>
          <SeatPlate tag="P1" role="You" you heroName={lockedName} cardback={lockedCardback} />
          <VsBadge />
          <SeatPlate tag="P2" role="Opponent" occupant={opponent} onChange={onSelectOpponent} />
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
                      cardback={you ? lockedCardback : undefined}
                      teamAccent={mine}
                      occupant={you ? undefined : botSlotPlan[seat] ?? "human"}
                      onChange={you ? undefined : (v) => onChangeBotSlot(seat, v)}
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
        <SeatPlate tag="P1" role="You" you heroName={lockedName} cardback={lockedCardback} />
        <VsBadge />
        {assignableSeats(selectedFormat).map((seat) => (
          <SeatPlate
            key={seat}
            tag={seat.toUpperCase()}
            occupant={botSlotPlan[seat] ?? "human"}
            onChange={(v) => onChangeBotSlot(seat, v)}
          />
        ))}
      </>
    );
  };

  return (
    <Box maxW="78rem" mx="auto" px={{ base: "0.75rem", md: "1.25rem" }} pt="1.25rem" pb={{ base: "6rem", lg: "2.5rem" }}>
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
        <Text fontFamily="LeagueGothic" fontSize="1.35rem" letterSpacing="0.08em">
          {room ? `JOIN ROOM ${room}` : "CREATE A ROOM"}
        </Text>
        {!room && (
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
          </>
        )}
        <Box flex="1" minW="0" />
        {!room && recentRooms.length > 0 && (
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
      </Flex>

      {/* ---------------- splash + roster ---------------- */}
      <Grid templateColumns={{ base: "1fr", lg: "20rem 1fr" }} gap={{ base: "1rem", lg: "1.4rem" }} alignItems="stretch">
        <SplashPanel
          hero={splashHero}
          locked={splashLocked}
          onViewDeck={() => splashHero && setPreviewHero(splashHero)}
        />

        <Flex direction="column" gap="0.9rem" minW="0">
          <Flex align="center" justify="space-between" gap="0.75rem" flexWrap="wrap">
            <Text fontFamily="LeagueGothic" fontSize="1.25rem" letterSpacing="0.1em" color="brand.accent">
              SELECT YOUR HERO
            </Text>
            <Flex gap="0.4rem" align="center" flexWrap="wrap">
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search fighters"
                size="sm"
                w="9rem"
                bg="rgba(0,0,0,0.25)"
                borderColor="whiteAlpha.200"
                _hover={{ borderColor: "whiteAlpha.300" }}
                _focus={{ borderColor: "brand.accent" }}
              />
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
            </Flex>
          </Flex>

          {heroes === null ? (
            <Grid
              templateColumns="repeat(auto-fill, minmax(5.25rem, 1fr))"
              gap="0.5rem"
              onMouseLeave={() => setHoverHero(undefined)}
            >
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
          ) : visibleHeroes.length === 0 ? (
            <Text textAlign="center" opacity={0.6} fontSize="0.85rem" py="1rem">
              No fighters match — clear the search or filter.
            </Text>
          ) : (
            <Flex direction="column" gap="1rem" onMouseLeave={() => setHoverHero(undefined)}>
              {recommendedHeroes.length > 0 && (
                <Grid templateColumns="repeat(auto-fill, minmax(5.25rem, 1fr))" gap="0.5rem">
                  {recommendedHeroes.map((h) => (
                    <RosterTile
                      key={h.heroId}
                      hero={h}
                      selected={effective === h.heroId}
                      onSelect={() => onSelectHero(h.heroId)}
                      onHover={() => setHoverHero(h)}
                    />
                  ))}
                </Grid>
              )}

              {communityHeroes.length > 0 && (
                <Flex direction="column" gap="0.55rem">
                  <Flex align="baseline" justify="space-between" gap="0.75rem" flexWrap="wrap">
                    <Text fontFamily="LeagueGothic" fontSize="1.05rem" letterSpacing="0.1em" color="brand.accent">
                      SEARCH COMMUNITY DECKS
                    </Text>
                    <Text fontSize="0.68rem" color="whiteAlpha.500" fontFamily="SpaceGrotesk" maxW="32rem">
                      Community decks are playable fan decks. They may be less maintained or less balanced than recommended picks.
                    </Text>
                  </Flex>
                  <Grid templateColumns="repeat(auto-fill, minmax(5.25rem, 1fr))" gap="0.5rem">
                    {communityHeroes.map((h) => (
                      <RosterTile
                        key={h.heroId}
                        hero={h}
                        selected={effective === h.heroId}
                        onSelect={() => onSelectHero(h.heroId)}
                        onHover={() => setHoverHero(h)}
                      />
                    ))}
                  </Grid>
                </Flex>
              )}
            </Flex>
          )}

          <Text fontSize="0.72rem" color="whiteAlpha.500" fontFamily="SpaceGrotesk">
            ♥ health · ⚑ fighters · ⚔ / 🏹 attack style shown in the splash panel.
          </Text>

          {/* ---------------- stage row ---------------- */}
          {!room && (
            <Flex align="center" gap="0.7rem">
              <Text {...STRIP_LBL}>STAGE</Text>
              <Flex gap="0.5rem" overflowX="auto" pb="0.25rem" flex="1">
                {MAP_CATALOG.map((entry) => {
                  const reason = ineligibleReason(entry.map, selectedFormat);
                  const eligible = reason === null;
                  const selected = selectedMapId === entry.id;
                  return (
                    <Box
                      as="button"
                      type="button"
                      key={entry.id}
                      onClick={() => eligible && onSelectMap(entry.id)}
                      disabled={!eligible}
                      aria-pressed={selected && eligible}
                      aria-label={`${entry.title}${eligible ? "" : ` — ${reason}`}`}
                      position="relative"
                      flex="none"
                      w="6.75rem"
                      borderRadius="0.5rem"
                      overflow="hidden"
                      border="1px solid"
                      borderColor={selected && eligible ? "brand.accent" : "whiteAlpha.200"}
                      boxShadow={selected && eligible ? "0 0 0 1px #E0A82E" : undefined}
                      bg="rgba(0,0,0,0.22)"
                      opacity={eligible ? 1 : 0.32}
                      cursor={eligible ? "pointer" : "not-allowed"}
                      transition="border-color 0.15s, opacity 0.15s"
                      _hover={eligible ? { borderColor: selected ? "brand.accent" : "whiteAlpha.400" } : {}}
                    >
                      <Box
                        h="3.5rem"
                        bgImage={`url("${entry.thumbnailUrl}")`}
                        bgSize="cover"
                        bgPosition="center"
                        bgColor="rgba(0,0,0,0.4)"
                      />
                      {/* Inspect affordance — opens the full board image + attribution
                          without committing to the pick. stopPropagation keeps the
                          card's own onClick (select) from firing (issue #316). It's a
                          span (not a <button>) because the card itself is a <button>
                          and buttons can't nest. */}
                      <Box
                        as="span"
                        role="button"
                        tabIndex={0}
                        aria-label={`Preview ${entry.title}`}
                        title="Preview board"
                        position="absolute"
                        top="0.2rem"
                        right="0.2rem"
                        w="1.35rem"
                        h="1.35rem"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        borderRadius="0.35rem"
                        bg="rgba(10,4,12,0.7)"
                        color="brand.parchment"
                        cursor="pointer"
                        _hover={{ bg: "rgba(10,4,12,0.9)", color: "brand.accent" }}
                        onClick={(e: ReactMouseEvent) => {
                          e.stopPropagation();
                          setPreviewMap(entry);
                        }}
                        onKeyDown={(e: ReactKeyboardEvent) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setPreviewMap(entry);
                          }
                        }}
                      >
                        <TbZoomIn size="0.85rem" />
                      </Box>
                      <Text
                        fontFamily="SpaceGrotesk"
                        fontSize="0.56rem"
                        letterSpacing="0.05em"
                        textTransform="uppercase"
                        textAlign="center"
                        px="0.3rem"
                        py="0.25rem"
                        lineHeight="1.2"
                        noOfLines={2}
                      >
                        {entry.title}
                      </Text>
                      {!eligible && (
                        <Text
                          position="absolute"
                          top="1.1rem"
                          left="0"
                          right="0"
                          fontSize="0.55rem"
                          fontFamily="SpaceGrotesk"
                          textAlign="center"
                          bg="rgba(10,4,12,0.85)"
                          py="0.15rem"
                          color="#E0A06E"
                        >
                          {reason}
                        </Text>
                      )}
                    </Box>
                  );
                })}
                <Box
                  as="button"
                  type="button"
                  onClick={() => onSelectMap(CUSTOM_MAP_ID)}
                  aria-pressed={selectedMapId === CUSTOM_MAP_ID}
                  aria-label="Custom board — paste map JSON"
                  flex="none"
                  w="6.75rem"
                  borderRadius="0.5rem"
                  overflow="hidden"
                  border="1px dashed"
                  borderColor={selectedMapId === CUSTOM_MAP_ID ? "brand.accent" : "whiteAlpha.300"}
                  bg="rgba(0,0,0,0.18)"
                  cursor="pointer"
                  transition="border-color 0.15s"
                  _hover={{ borderColor: "whiteAlpha.500" }}
                >
                  <Flex h="3.5rem" align="center" justify="center" fontSize="1.3rem" color="whiteAlpha.500">
                    +
                  </Flex>
                  <Text fontFamily="SpaceGrotesk" fontSize="0.56rem" letterSpacing="0.05em" textTransform="uppercase" textAlign="center" px="0.3rem" py="0.25rem">
                    Custom…
                  </Text>
                </Box>
              </Flex>
            </Flex>
          )}
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

      {/* ---------------- player plates ---------------- */}
      <Flex
        mt="1.25rem"
        p="0.85rem 1rem"
        borderRadius="0.9rem"
        bg="linear-gradient(180deg, #432a4a, #2a1630)"
        border="1px solid"
        borderColor="whiteAlpha.200"
        boxShadow="0 12px 30px rgba(0,0,0,0.45)"
        align="stretch"
        gap="0.9rem"
        flexWrap="wrap"
      >
        <Flex flex="1" gap="0.6rem" align="center" flexWrap="wrap" minW="0">
          {renderPlates()}
        </Flex>
        <Flex direction="column" justify="center" gap="0.4rem" minW="11rem" display={{ base: "none", lg: "flex" }}>
          {createButton}
          <Text textAlign="center" fontSize="0.72rem" color="whiteAlpha.600" fontFamily="SpaceGrotesk">
            {summary}
          </Text>
        </Flex>
      </Flex>

      {/* Duel AI hero picker — optional specific deck for the server bot. Only
          when a duel opponent is set to AI; unchanged from the old Opponent row. */}
      {!room && !multiplayer && opponent !== "human" && (
        <Flex direction="column" alignItems="center" gap="0.3rem" mt="0.75rem">
          <Menu placement="bottom">
            <MenuButton as={Button} {...BTN} size="sm" rightIcon={<TbChevronDown />} isDisabled={heroes === null}>
              AI hero: {aiHeroId ? heroNameOf(heroes, aiHeroId) : "Random"}
            </MenuButton>
            <MenuList bg="brand.surface" borderColor="whiteAlpha.300" maxH="16rem" overflowY="auto">
              <MenuItem onClick={() => onSelectAiHero(null)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
                Random
              </MenuItem>
              {(heroes ?? []).map((h) => (
                <MenuItem key={h.heroId} onClick={() => onSelectAiHero(h.heroId)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
                  {h.name}
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
          <Text fontSize="0.7rem" opacity={0.55}>
            {aiHeroId
              ? "the AI plays this hero — the game starts instantly"
              : "the server picks the AI's deck at random — the game starts instantly"}
          </Text>
        </Flex>
      )}

      {!room && multiplayer && (
        <Text mt="0.6rem" fontSize="0.7rem" opacity={0.6} textAlign="center" fontFamily="SpaceGrotesk">
          Bot seats are filled by the server · human seats join with the room link.
        </Text>
      )}

      {/* Custom board: the paste-JSON textarea, revealed only when the Custom…
          stage is selected. Behavior (validation, BAD_MAP bounce) unchanged. */}
      {!room && selectedMapId === CUSTOM_MAP_ID && (
        <Box maxW="28rem" w="100%" mx="auto" mt="0.85rem">
          <Flex direction="column" gap="0.4rem">
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
        </Box>
      )}

      <Text mt="0.85rem" fontSize="0.75rem" opacity={0.5} textAlign="center">
        server: {status === "open" ? "connected" : status}
      </Text>

      {/* ---------------- mobile fixed create bar ---------------- */}
      <Flex
        display={{ base: "flex", lg: "none" }}
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
        <Text flex="1" fontSize="0.72rem" color="whiteAlpha.700" fontFamily="SpaceGrotesk" noOfLines={2}>
          {summary}
        </Text>
        {createButton}
      </Flex>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({ room, heroParam, debug }: { room: string | null; heroParam: string | null; debug: boolean }) => {
  const { status, roomId, roomInfo, snapshot, opponentConnected, seatPresence, turnTimer, ownTimerExpired, acknowledgeOwnTimerExpired, error, heroes, lobbies, roomPublic, replayBundle, createRoom, joinRoom, sendAction, respondToPrompt, requestUndo, respondToUndo, incomingUndo, undoPending, undoRejected, acknowledgeUndoRejected, undoUnavailable, acknowledgeUndoUnavailable, serverError, acknowledgeServerError, rateLimited, acknowledgeRateLimited, requestLobbies, setVisibility, serverRestarting, gameLost } =
    useProSocket(WS_URL, debug);
  const [joined, setJoined] = useState(false);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<OpponentChoice>("human");
  const [selectedFormat, setSelectedFormat] = useState<ProFormatId>("duel");
  const [botSlotPlan, setBotSlotPlan] = useState<BotSlotPlan>({});
  // Chosen board in the create flow: a MAP_CATALOG id or CUSTOM_MAP_ID. Starts
  // on the duel default (The Mended Drum) and follows the format's default when
  // the format changes to one the current board can't host.
  const [selectedMapId, setSelectedMapId] = useState<string>(defaultMapIdForFormat("duel"));
  const [aiHeroId, setAiHeroId] = useState<string | null>(null);
  // Per-decision move timer (issue #223), create flow only: seconds each seat has
  // to act. 0 = off (the default) → CREATE_ROOM omits turnTimerSeconds and the
  // room behaves exactly as today. The toggle flips between 0 and a default preset.
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(0);
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // Incremental-maneuver stepping (issue #285): the LOCAL hop-by-hop preview for
  // the selected fighter, scoped to that fighter so it never leaks across a
  // re-selection. null = no preview in flight (fresh). Nothing is sent until the
  // move commits — the whole accumulated path lands as one MOVE_FIGHTER.
  const [step, setStep] = useState<{ fighter: FighterId; state: StepState } | null>(null);
  // First space tapped in a two-tap LARGE-fighter move pick (issue #132), scoped
  // to the prompt it belongs to so a stale anchor never leaks into the next one.
  const [poseAnchor, setPoseAnchor] = useState<{ promptId: string; space: SpaceId } | null>(null);
  // "Who would move here" cues (issue #320 follow-up). `hoveredSpace`/`hoveredFighter`
  // are pointer-only (touch never sets them). `moveChoice` is the touch-safe
  // ambiguity resolver: a move space reachable by >1 of your fighters anchors here
  // instead of silently moving the first one, and the next fighter click commits.
  const [hoveredSpace, setHoveredSpace] = useState<SpaceId | null>(null);
  const [hoveredFighter, setHoveredFighter] = useState<FighterId | null>(null);
  const [moveChoice, setMoveChoice] = useState<{ space: SpaceId; candidates: FighterId[] } | null>(null);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  // Client-side memory that YOU chose to forfeit (vs. being swept by combat), so
  // the continuing-game spectator panel can say "You forfeited — spectating"
  // instead of the generic elimination copy. Resets on refresh — the panel then
  // degrades to the neutral "eliminated" wording, which stays accurate either way.
  const [iForfeited, setIForfeited] = useState(false);
  // Spacebar performs the sole available dock action (issue #353). The single
  // window listener is registered once and reads the current eligible action
  // through a ref, so it needn't re-bind on every snapshot. Kept in sync each
  // render below (see `soleActionRef.current = …` after `listActions`).
  const soleActionRef = useRef<Action | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // holding space must not spam the action
      if (e.code !== "Space" && e.key !== " ") return;
      const action = soleActionRef.current;
      if (!action) return; // 0 or 2+ options, prompt open, or not your turn
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      // A modal/dialog (ForfeitDialog, etc.) owns the keyboard while open — never
      // fire the shortcut underneath one. Chakra portals mark them aria-modal.
      if (typeof document !== "undefined" && document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault(); // stop page scroll and a native re-fire if the button has focus
      sendAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendAction]);
  // Issue #80: a just-committed MOVE_FIGHTER tweens through its whole path
  // instead of snapping — held here so the board keeps rendering it while
  // the authoritative STATE (which may already show the fighter arrived)
  // comes back over the wire.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  usePendingMoveTimeout(pendingMove, () => setPendingMove(null));
  // An OPPONENT's move arrives only as an authoritative STATE view — nothing set
  // a pendingMove, so the enemy token used to teleport (issue #149). Derive one
  // by diffing snapshots; your own moves stay on the optimistic path above.
  const { incomingMove, clearIncoming } = useIncomingMoveTween(snapshot);
  // Custom-map playtest (create flow): raw JSON persists across a BAD_MAP bounce
  // so a power user can fix the board and retry without re-pasting.
  const [customMapJson, setCustomMapJson] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);
  // Prefilled "submit this map" GitHub issue URL — only when THIS player created
  // the room with a (server-accepted) custom board. null otherwise.
  const mapSubmitUrl = useMemo(() => {
    const t = customMapJson.trim();
    if (!t) return null;
    try {
      return mapSubmissionIssueUrl(normalizeMap(JSON.parse(t)), t);
    } catch {
      return null;
    }
  }, [customMapJson]);
  // Art fetch (unbrewed-api, matched by title against the server catalog) —
  // must run unconditionally; no-ops until the first STATE arrives.
  const { resolveCard, resolveHero, resolveFighterToken } = useProCardArt(
    snapshot ? heroIdsForArt(snapshot.view) : [],
    snapshot?.view.catalog ?? {}
  );

  // owner seat -> heroId, so the board can resolve a fighter's token art by hero
  // (ViewFighter carries owner + kind, not heroId). Rebuilt per snapshot; empty
  // until the first STATE arrives (board then draws initials-only tokens).
  const ownerHeroIds = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of snapshot?.view.players ?? []) m[p.id] = p.heroId;
    return m;
  }, [snapshot]);
  // owner seat -> { badge, heroArtUrl }: one map feeding BOTH the token badge and
  // the flag-driven portrait swap (Thetis tide), resolved from the same
  // HERO_STATE_FLAGS entry. Rebuilt per snapshot so mid-game flag flips re-render.
  const ownerTokenState = useMemo(
    () => fighterTokenStateByOwner(snapshot?.view.players ?? []),
    [snapshot]
  );

  // Registry of fighter-token DOM elements, populated by ProBoard's tokens, read at
  // arc-launch time to measure the defender's viewport rect (#382). A Map ref rather
  // than state so registration never re-renders.
  const fighterElsRef = useRef<Map<string, HTMLElement>>(new Map());
  // The combat panel's clash point (seam between the cards) — the arc's launch origin.
  const clashRef = useRef<HTMLDivElement | null>(null);

  // Sounds + transient board visuals, derived by diffing snapshots (useGameFx). The
  // refs let the damage-arc (#382) measure its endpoints at launch.
  const { boardFx, arcs, hurtKey, soundOn, visualOn, toggleSound, toggleVisual } = useGameFx(
    snapshot,
    { fighterEls: fighterElsRef, clashRef }
  );

  // Combat callouts (issue #162): full-screen turn/defend/reveal flourishes.
  // Decorative-only; a separate hook so the board-FX loop above stays
  // byte-identical.
  const combatCallouts = useCombatCallouts(snapshot);

  // The strike beat (issue #381): after the flip settles, the attack card slams
  // the defense card and it reacts by outcome. `lingeringCombat` freezes a combat
  // that resolves+ends in one batch so the panel survives long enough to play it.
  const { strike, lingeringCombat } = useCombatStrike(snapshot);

  // The math beat (issue #382): value modifiers fly in as chips onto the value
  // pill, which ticks toward the effective value; paced through the shared battle
  // timeline. Purely decorative — gated off (raw values shown) when visual-fx is
  // off OR reduced motion is requested (the count-up is motion too), exactly like
  // the strike.
  const combatValueFx = useCombatValueFx(snapshot);
  const reducedMotion = !!useReducedMotion();

  // Lively tokens (issue #320): per-fighter recoil/lunge/brace/topple gestures,
  // diffed off the same snapshots. Opt-in behind the `tokenLife` beta flag; the
  // hook always advances its prevViewRef but emits nothing while off, so toggling
  // it on mid-game diffs cleanly. Passing null to ProBoard when off keeps the
  // token DOM byte-identical.
  const [tokenLifeOn] = useFlag("tokenLife");
  const tokenGestures = useTokenLife(snapshot, tokenLifeOn);

  // A new authoritative snapshot invalidates the transient move-choice anchor and
  // any lingering hover cue (the legal-action set may have changed under it).
  useEffect(() => {
    setMoveChoice(null);
    setHoveredSpace(null);
    setHoveredFighter(null);
  }, [snapshot]);

  // GAME_OVER pushes a self-contained bundle to both seats (protocol v7). Save it
  // to the local Replays store so the match is scrubbable later (issue #122). Runs
  // once per bundle; saveReplay is idempotent by content, so a refresh won't dup it.
  const savedBundleRef = useRef<ReplayBundle | null>(null);
  useEffect(() => {
    if (!replayBundle || savedBundleRef.current === replayBundle) return;
    savedBundleRef.current = replayBundle;
    const res = saveReplay(replayBundle);
    if (res.ok) {
      toast.success(
        (t) => (
          <span>
            Match saved to{" "}
            <Link href="/pro/replays" color="brand.accent" onClick={() => toast.dismiss(t.id)}>
              Replays
            </Link>
          </span>
        ),
        { duration: 6000 }
      );
    }
  }, [replayBundle]);

  // Pinch/scroll zoom + drag pan on the board (issue #120) — off by default,
  // opt-in via the zoomMap beta flag. Zero footprint on ProBoard when off.
  const [zoomMapOn] = useFlag("zoomMap");

  // Activity feed: diff each view against the previous one (see gameLog.ts).
  const [logEntries, setLogEntries] = useState<ProLogEntry[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const logSeqRef = useRef(0);
  // One monotonic id per appended STATE batch (issue #298) — every line of a
  // batch shares it, so the log panel groups a single player action together.
  const logBatchRef = useRef(0);
  useEffect(() => {
    if (!snapshot) return;
    const next = snapshot.view;
    const diff = diffViews(prevViewRef.current, next, (c) => cardLabel(next.catalog, c), snapshot.events);
    // Decoratively enrich with the engine's structured events for THIS batch —
    // tags discards with their reason and logs scheduled/delayed effects, value
    // changes, and gained actions. No events → same as diffViews. See enrichLines.
    const lines =
      snapshot.events.length
        ? enrichLines(diff, snapshot.events, {
            label: (source) => resolveEventSource(next, source),
            you: next.you,
            seat: (player) => seatLabel(next, player),
            fighter: (id) =>
              next.fighters.find((f) => f.id === id)?.name ?? id.split("/").pop() ?? id,
          })
        : diff;
    prevViewRef.current = next;
    if (lines.length === 0) return;
    const ts = Date.now();
    const turn = next.turnNumber;
    const turnActor = seatLabel(next, next.activePlayer);
    const phase = batchPhase(snapshot.events);
    const batchId = logBatchRef.current++;
    setLogEntries((cur) =>
      [
        ...lines
          .map((l) => ({ ...l, key: `log-${logSeqRef.current++}`, ts, turn, turnActor, batchId, phase }))
          .reverse(),
        ...cur,
      ].slice(0, 120)
    );
  }, [snapshot]);

  // Returning player: a saved reconnect token for this room means we skip the
  // hero picker entirely and RECONNECT straight into the same seat (joinRoom
  // replays the token when one exists). Runs once when a `?room=` has a token.
  const reconnectedRef = useRef(false);
  useEffect(() => {
    if (joined || !room || reconnectedRef.current || typeof window === "undefined") return;
    // Only THIS TAB's own seat auto-reconnects (refresh). A fresh tab with a
    // ?room= link goes to the picker and JOINs — even if another tab of this
    // browser is the host — or resumes explicitly via the recent-rooms strip.
    if (getTabToken(room)) {
      reconnectedRef.current = true;
      joinRoom(room, ""); // heroId ignored on the RECONNECT path
      setJoined(true);
    }
  }, [joined, room, joinRoom]);

  // Keep the room id in the URL: the joiner arrives with ?room= but the HOST's
  // URL never had it, so a refresh dumped them to the lobby with no way back
  // (playtest feedback). With the id in the URL + the localStorage token, a
  // refresh reconnects either seat.
  const router = useRouter();
  useEffect(() => {
    if (!roomId || router.query.room === roomId) return;
    router.replace(
      { pathname: router.pathname, query: { ...router.query, room: roomId } },
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

  // Public-lobby browser: poll while sitting in the pre-join picker (cheap —
  // one tiny message every 5s against the already-open socket).
  useEffect(() => {
    if (joined || room || status !== "open") return;
    requestLobbies();
    const timer = setInterval(requestLobbies, 5_000);
    return () => clearInterval(timer);
  }, [joined, room, status, requestLobbies]);

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

  // UNKNOWN_HERO shouldn't happen when picking from the server list, but if the
  // server rejects the hero, drop back to the picker instead of a dead end.
  // BAD_MAP similarly bounces back to the lobby (hero kept) with the server's
  // validation message shown against the still-populated map box.
  useEffect(() => {
    if (error?.code === "UNKNOWN_HERO") {
      setJoined(false);
      setSelectedHeroId(null);
    }
    if (error?.code === "BAD_MAP") {
      setJoined(false);
      // Only a pasted custom board realistically fails validation; select the
      // Custom… option so its textarea (where the error renders) is visible.
      setSelectedMapId(CUSTOM_MAP_ID);
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

  // Deploy-safe games (protocol v7): while the server is redeploying it sends
  // SERVER_RESTARTING; show a persistent "reconnecting" toast until the next
  // STATE clears `serverRestarting` (the game resumed on the new instance via
  // the RESUME_ROOM path in useProSocket). If there's no valid resume token the
  // reconnect just lands on the normal error screen instead — graceful either way.
  useEffect(() => {
    const id = "pro-server-restarting";
    if (serverRestarting) {
      toast.loading("Server updating — reconnecting…", { id });
    } else {
      toast.dismiss(id);
    }
    return () => toast.dismiss(id);
  }, [serverRestarting]);

  // Undo (issue #154). While our own request awaits the opponent's verdict, hold
  // a persistent "waiting" toast; it clears when the request resolves (accept
  // rewinds the board — undoPending flips false on the next STATE; reject latches
  // undoRejected below). Mirrors the reconnecting-toast pattern above.
  useEffect(() => {
    const id = "pro-undo-pending";
    if (undoPending) toast.loading("Undo requested — waiting for opponent…", { id });
    else toast.dismiss(id);
    return () => toast.dismiss(id);
  }, [undoPending]);

  // A declined undo is a one-shot notice: show it, then acknowledge so it can't
  // re-fire on the next render.
  useEffect(() => {
    if (!undoRejected) return;
    toast.error("Your opponent declined the undo.");
    acknowledgeUndoRejected();
  }, [undoRejected, acknowledgeUndoRejected]);

  // The server couldn't honor the undo (nothing to undo, or one already pending)
  // — a benign race despite canUndo-gating. Light one-shot notice, not an error.
  useEffect(() => {
    if (!undoUnavailable) return;
    toast("Nothing to undo.", { icon: "↩️" });
    acknowledgeUndoUnavailable();
  }, [undoUnavailable, acknowledgeUndoUnavailable]);

  // Non-fatal engine error (issue #178): the server couldn't process our action
  // but the game is intact and the socket is still open. One-shot notice, then
  // acknowledge — the board stays live and the player can try something else.
  // Deliberately NOT the "We lost your game" screen (that's socket-close only).
  useEffect(() => {
    if (!serverError) return;
    // Stable id so retrying a broken action coalesces instead of stacking toasts.
    toast.error("The server couldn't process that action — try again or take a different action.", {
      id: "pro-server-error",
    });
    acknowledgeServerError();
  }, [serverError, acknowledgeServerError]);

  // Rate limited (issue #209 / engine PR #103): we're sending too fast. Gentle
  // one-shot toast, then acknowledge — the socket stays open and the board stays
  // live. A stable id coalesces a burst of breaches into a single toast. If the
  // server ultimately closes the socket for a repeated breach, the jittered
  // reconnect/backoff in useProSocket handles resumption; this is NOT a loss.
  useEffect(() => {
    if (!rateLimited) return;
    toast(proErrorMessage("RATE_LIMITED"), { id: "pro-rate-limited", icon: "🐢" });
    acknowledgeRateLimited();
  }, [rateLimited, acknowledgeRateLimited]);

  // Move timer (issue #223): the viewer's OWN clock ran out and the server played
  // a move for them. The move itself renders through the ordinary STATE flow (the
  // draining bar just advances to the next actor) — this one-shot toast keeps the
  // "a move was made for you" legible. An opponent's expiry needs no toast: their
  // move just advances the board like any other.
  useEffect(() => {
    if (!ownTimerExpired) return;
    toast("Time's up — a move was made for you.", { id: "pro-own-timer", icon: "⏱️" });
    acknowledgeOwnTimerExpired();
  }, [ownTimerExpired, acknowledgeOwnTimerExpired]);

  if (!joined) {
    const effectiveHeroId = selectedHeroId ?? (heroes === null ? heroParam : null);
    // Recent rooms now surface as "rejoin" chips inside the lobby's rules strip.
    const resumeRoom = (roomId: string) => {
      joinRoom(roomId, ""); // token path — heroId ignored
      setJoined(true);
    };
    return (
      <>
        <HeroSelectLobby
          room={room}
          status={status}
          heroes={heroes}
          heroParam={heroParam}
          recentRooms={recentRooms}
          onResumeRoom={resumeRoom}
          selectedHeroId={selectedHeroId}
          opponent={opponent}
          selectedFormat={selectedFormat}
          onSelectFormat={(format) => {
            setSelectedFormat(format);
            if (format !== "duel") setOpponent("human");
            setBotSlotPlan((prev) => {
              const allowed = new Set(assignableSeats(format));
              return Object.fromEntries(Object.entries(prev).filter(([player]) => allowed.has(player as PlayerId))) as BotSlotPlan;
            });
            // Keep a still-eligible board (and a "Custom…" choice) selected;
            // otherwise fall back to the new format's default board.
            setSelectedMapId((prev) => {
              if (prev === CUSTOM_MAP_ID) return prev;
              const entry = catalogEntry(prev);
              if (entry && mapEligibleForFormat(entry.map, format)) return prev;
              return defaultMapIdForFormat(format);
            });
          }}
          onSelectOpponent={setOpponent}
          onSelectHero={setSelectedHeroId}
          aiHeroId={aiHeroId}
          onSelectAiHero={setAiHeroId}
          botSlotPlan={botSlotPlan}
          onChangeBotSlot={(player, occupant) =>
            setBotSlotPlan((prev) => ({ ...prev, [player]: occupant }))
          }
          turnTimerSeconds={turnTimerSeconds}
          onSelectTurnTimer={setTurnTimerSeconds}
          customMapJson={customMapJson}
          onCustomMapJsonChange={(json) => {
            setCustomMapJson(json);
            if (mapError) setMapError(null); // clear stale error as they edit
          }}
          selectedMapId={selectedMapId}
          onSelectMap={(id) => {
            setSelectedMapId(id);
            if (mapError) setMapError(null);
          }}
          mapError={mapError}
          onConfirm={() => {
            if (!effectiveHeroId) return;
            if (room) {
              joinRoom(room, effectiveHeroId);
              setSelectedHeroId(effectiveHeroId);
              setJoined(true);
              return;
            }
            // Create flow: resolve the chosen board. A catalog board sends its
            // ProMapDef (or nothing, for the server-default duel board); the
            // Custom… option parses the pasted JSON just-in-time. Local errors
            // stay in the lobby; the server re-validates and answers BAD_MAP.
            let customMap: ProMapDef | undefined;
            if (selectedMapId === CUSTOM_MAP_ID) {
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
            createRoom(effectiveHeroId, bot, customMap, selectedFormat, botSeats, timerSeconds);
            setSelectedHeroId(effectiveHeroId); // lock it for the lobby label
            setJoined(true);
          }}
        />
        {/* public lobbies waiting for an opponent — joining one routes through
            the normal ?room= flow (hero picker included) */}
        {!room && lobbies && lobbies.length > 0 && (
          <Flex direction="column" alignItems="center" gap="0.6rem" pb="3rem" px="1rem">
            <Text
              fontFamily="BebasNeueRegular"
              fontSize="1.1rem"
              letterSpacing="0.08em"
              opacity={0.75}
            >
              Open lobbies — join someone waiting
            </Text>
            <Flex gap="0.5rem" flexWrap="wrap" justifyContent="center" maxW="42rem">
              {lobbies.map((l) => (
                <Button
                  key={l.roomId}
                  {...BTN_GOLD}
                  onClick={() =>
                    router.replace(
                      { pathname: router.pathname, query: { ...router.query, room: l.roomId } },
                      undefined,
                      { shallow: true }
                    )
                  }
                >
                  vs {l.heroName} · room {l.roomId} · {agoLabel(Date.now() - l.ageMs)}
                </Button>
              ))}
            </Flex>
          </Flex>
        )}
      </>
    );
  }

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
      />
    );
  }

  // Room-level errors surface on a friendly screen with a create-new fallback.
  // (ROOM_LIMIT is handled earlier as a non-fatal bounce back to the landing
  // picker, so it never reaches this terminal screen.)
  if (error && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FULL")) {
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
    if (roomId) {
      const joinUrl =
        typeof window !== "undefined" ? `${window.location.origin}/pro/game?room=${roomId}` : "";
      return (
        <Flex direction="column" alignItems="center" gap="1rem" pt="4rem" px="1rem">
          <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em">
            ROOM {roomId}
          </Text>
          {heroNameOf(heroes, selectedHeroId) && (
            <Text fontFamily="BebasNeueRegular" fontSize="1.3rem" letterSpacing="0.05em" color="brand.accent">
              You are {heroNameOf(heroes, selectedHeroId)}
            </Text>
          )}
          <Text opacity={0.8} textAlign="center">
            {(() => {
              const required = roomInfo?.requiredPlayers ?? formatChoice(selectedFormat).requiredPlayers;
              const seated = roomInfo?.seats.length ?? 1;
              const boardTitle =
                selectedMapId === CUSTOM_MAP_ID
                  ? "a custom board"
                  : catalogEntry(selectedMapId)?.title ?? "the default board";
              const waiting =
                required <= 2
                  ? "Waiting for an opponent — the game starts the moment they join."
                  : `Waiting for players — ${seated}/${required} seats joined. Share the same link with everyone.`;
              return `${waiting} · playing on ${boardTitle}.`;
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
              catalogEntry(selectedMapId)?.map,
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
            const isTeam = !!teamComposition(roomInfo?.formatId ?? selectedFormat, catalogEntry(selectedMapId)?.map);
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
                      {name}
                      {s.bot ? " (bot)" : ""}
                      {s.connected ? "" : " — reconnecting…"}
                    </Tag>
                  );
                })}
              </Flex>
            );
          })()}

          {/* discoverability: invite privately or list publicly */}
          <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
            <Tag fontFamily="mono" px="0.75rem" py="0.4rem">
              {joinUrl}
            </Tag>
            <Button {...BTN_GOLD} onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              copy link
            </Button>
          </Flex>
          <Flex gap="0.5rem" alignItems="center" flexWrap="wrap" justifyContent="center">
            <Button
              {...(roomPublic ? BTN_GOLD : BTN)}
              onClick={() => setVisibility(!roomPublic)}
            >
              {roomPublic ? "✓ public — listed in the lobby browser" : "make lobby public"}
            </Button>
          </Flex>
          <Text fontSize="0.8rem" opacity={0.5}>
            {(roomInfo?.requiredPlayers ?? formatChoice(selectedFormat).requiredPlayers) > 2 ? "(testing solo? open that link in more browser tabs)" : "(testing solo? open that link in a second browser tab)"}
          </Text>
          {mapSubmitUrl && (
            <Link
              href={mapSubmitUrl}
              isExternal
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
        </Flex>
      );
    }
    return (
      <Text pt="4rem" textAlign="center" opacity={0.7}>
        waiting for game state… ({status}
        {roomId ? `, room ${roomId}` : ""})
      </Text>
    );
  }

  const { view, legalActions, prompt } = snapshot;
  const myTurn = view.activePlayer === view.you;
  const multiplayerView = view.players.length > 2;
  // Forfeit is offered ONLY through the legal-action surface (unbrewed-engine
  // #117): the engine enumerates FORFEIT in the seat's legalActions exactly while
  // it may forfeit — on its own clock, live, not yet eliminated. Gating the dock
  // button on this (rather than re-deriving duel-vs-multiplayer rules client-side)
  // means it renders in every format the engine allows and vanishes the instant
  // the seat is out of turn order, with no seat-count/seat-id special-casing.
  const canForfeit = legalActions.some((a) => a.type === "FORFEIT");
  // Eliminated-and-spectating: a continuing game (no winner) where every fighter
  // this seat owns is swept. True after your own forfeit in team/ffa play and
  // after a team-game combat death — either way you watch the board play on.
  const myFighters = view.fighters.filter((f) => f.owner === view.you);
  const iAmSpectating = !view.winner && myFighters.length > 0 && myFighters.every((f) => f.defeated);
  // Team affiliation (issue #195): the viewer's team (self + ally) for the board's
  // shared ring. Empty in duel/ffa/older-server views → the board draws no ring.
  const friendlyOwners = deriveTeams(view.players, view.you).friendlyOwners;
  const activeTurnLabel = myTurn ? "YOUR TURN" : `${playerLabel(view, view.activePlayer).toUpperCase()} TURN`;
  // RESPOND_PROMPT renders through the PromptPanel; MOVE_FIGHTER and
  // PLACE_SIDEKICK render as clickable board spaces — listing one button per
  // destination just floods the sidebar (and card actions live on the hand).
  // FORFEIT: engine #32 enumerates it in legalActions during PLAY (its isMember
  // gate needs it there), but we render it ONLY through the confirm-gated dock
  // button — a raw one-click sidebar entry would be the exact misfire we guard.
  const listActions = legalActions.filter(
    (a) => !["RESPOND_PROMPT", "MOVE_FIGHTER", "PLACE_SIDEKICK", "FORFEIT"].includes(a.type)
  );
  // The one dock action a spacebar press may fire (issue #353): eligible only
  // when, ignoring FORFEIT, exactly one legal action remains and it's a dock
  // action with no prompt open. Synced into the ref the keydown listener reads.
  const sole = soleAction(legalActions, prompt);
  soleActionRef.current = sole;

  // Board affordances derive ONLY from what the server offered. Each
  // highlighted space maps back to the exact server-offered action so a click
  // sends it verbatim (incl. the enumerated MOVE_FIGHTER path).
  const spaceActions = new Map<SpaceId, Action[]>();
  for (const a of legalActions) {
    const dest =
      a.type === "PLACE_SIDEKICK" ? a.space : a.type === "MOVE_FIGHTER" ? a.path[a.path.length - 1] : null;
    if (dest) spaceActions.set(dest, [...(spaceActions.get(dest) ?? []), a]);
  }
  const attackActions = new Map<FighterId, Action>();
  for (const a of legalActions) if (a.type === "DECLARE_ATTACK") attackActions.set(a.target, a);
  const movableFighters = new Set(
    legalActions.flatMap((a) => (a.type === "MOVE_FIGHTER" ? [a.fighter] : []))
  );

  // Issue #161: when several same-named sidekicks can each declare an attack,
  // the sidebar offers "Attack <target> with <name>" once per attacker but the
  // board gives no clue which token is which — so the player guesses and picks
  // the wrong one. Assign a 1..N disambiguator per shared name (only when a name
  // recurs among the attackers), badge the matching token with it, and append it
  // to the button label, so "with Raptor 2" visibly points at the #2 token.
  const nameOf = (id: FighterId) => view.fighters.find((f) => f.id === id)?.name ?? id.split("/")[1];
  const attackerBadge: Partial<Record<FighterId, number>> = {};
  {
    const orderByName = new Map<string, FighterId[]>(); // name -> distinct attacker ids, first-seen order
    for (const a of legalActions) {
      if (a.type !== "DECLARE_ATTACK") continue;
      const name = nameOf(a.attacker);
      const list = orderByName.get(name) ?? [];
      if (!list.includes(a.attacker)) list.push(a.attacker);
      orderByName.set(name, list);
    }
    for (const ids of orderByName.values()) {
      if (ids.length > 1) ids.forEach((id, i) => (attackerBadge[id] = i + 1));
    }
  }

  // Large-fighter reach helper (issue #235): PRESENTATION ONLY. A melee attacker
  // two spaces from a LARGE fighter is offered the attack (engine rule, docs §4.2b)
  // and it reads as a bug with nothing on screen to explain it. Flag the exact
  // DECLARE_ATTACK options that are legal only via the two-space extension so the
  // sidebar row and the pulsing target can carry a "Large fighter — melee reach 2"
  // hint. We EXPLAIN what the server already offered; we never re-check legality.
  const spaceReachById = new Map<SpaceId, SpaceReach>(
    view.map.spaces.map((s) => [s.id, { adjacentTo: s.adjacentTo, zones: s.zones }])
  );
  const fighterById = new Map<FighterId, ViewFighter>(view.fighters.map((f) => [f.id, f]));
  const isExtendedReach = (a: Action): boolean => {
    if (a.type !== "DECLARE_ATTACK") return false;
    const attacker = fighterById.get(a.attacker);
    const target = fighterById.get(a.target);
    return !!attacker && !!target && isExtendedReachAttack(attacker, target, spaceReachById);
  };
  // Targets reachable ONLY via the extension — so the board can annotate the
  // pulsing token. Keyed by target id (matches attackActions above).
  const extendedReachTargets = new Set<FighterId>(
    legalActions.filter(isExtendedReach).map((a) => (a as { target: FighterId }).target)
  );

  // Prompts answer via the board too: a CHOOSE_SPACE option names its space in
  // option.id (place ops), option.data.space, or option.label (token ops label
  // a token's space, e.g. destroy-totem); CHOOSE_TARGET options a fighter id.
  // Board-answerable options become highlights; the rest stay panel buttons.
  const promptForMe = prompt && prompt.player === view.you ? prompt : null;
  const mapSpaceIds = new Set(view.map.spaces.map((s) => s.id));
  const fighterIds = new Set(view.fighters.map((f) => f.id));
  const optionSpace = (o: LegalOption): SpaceId | null => {
    if (mapSpaceIds.has(o.id)) return o.id;
    const dataSpace = (o.data as { space?: string } | undefined)?.space;
    if (dataSpace && mapSpaceIds.has(dataSpace)) return dataSpace;
    if (mapSpaceIds.has(o.label)) return o.label;
    return null;
  };
  // space -> optionId (tokens never share a space, so this can't collide)
  const promptSpaceOptions = new Map<SpaceId, string>(
    promptForMe?.kind === "CHOOSE_SPACE"
      ? promptForMe.options.flatMap((o) => {
          const space = optionSpace(o);
          return space ? [[space, o.id] as const] : [];
        })
      : []
  );
  const promptSpaceIds = [...promptSpaceOptions.keys()];
  const promptTargetIds =
    promptForMe?.kind === "CHOOSE_TARGET"
      ? promptForMe.options.map((o) => o.id).filter((id) => fighterIds.has(id))
      : [];
  // Card-pick options (issue #288 — Multi-Arm Barrage second-attack commit;
  // extended by issue #352 — deck search/tutor, look-at-top, discard picks): a
  // CHOOSE_OPTION or CHOOSE_TARGET whose options name a real card instance in
  // option.data.card (`<defId>#<n>`) rather than an effect label or a board
  // target. Render these as clickable card FACES (with the same hover/press-hold
  // preview the hand uses) instead of opaque instance-id buttons; sentinels
  // (`decline`, data.card null) and effect-label branches (data.branch) carry no
  // `#` instance id and fall through to panel buttons, and fighter/space
  // CHOOSE_TARGETs carry no data.card so their board-click flow is untouched.
  const promptCardOptions = cardFaceOptions(promptForMe);
  // Two-space (LARGE fighter) move choice (issue #132): a card's "move up to N
  // spaces" effect on Triceratops emits CHOOSE_SPACE options encoded as
  // "<head>|<tail>" pairs, which optionSpace can't resolve — so instead of a wall
  // of opaque "s12|s13" buttons, parse the pairs and light up the board. The pick
  // is a two-tap gesture (poseAnchor) resolved by resolvePoseClick in onSpaceClick.
  const poseOptions = parsePoseOptions(promptForMe, mapSpaceIds);
  const poseIndex = buildPoseIndex(poseOptions);
  const activePoseAnchor =
    promptForMe && poseAnchor?.promptId === promptForMe.promptId ? poseAnchor.space : null;
  const promptBoardIds = new Set([
    ...promptSpaceOptions.values(),
    ...promptTargetIds,
    ...poseOptions.map((p) => p.optionId),
    ...promptCardOptions.map((c) => c.id),
  ]);
  const promptButtonOptions = promptForMe
    ? promptForMe.options.filter((o) => !promptBoardIds.has(o.id))
    : [];
  const promptBoardHint =
    poseIndex.size > 0
      ? activePoseAnchor
        ? "click the second gold space to finish the move"
        : `click a gold space to move (${poseIndex.size} destination${poseIndex.size === 1 ? "" : "s"})`
      : promptSpaceIds.length > 0
        ? `click a gold space on the board (${promptSpaceIds.length} option${promptSpaceIds.length === 1 ? "" : "s"})`
        : promptTargetIds.length > 0
          ? "click a pulsing fighter on the board"
          : null;

  // Prompt attribution (protocol v10, issue #35 / #147 / #151): `prompt.source`
  // names WHAT opened this prompt and is sent to BOTH players — a resolving card
  // (`{ card }`, face public to both) or a hero ability (`{ hero }`). We show the
  // asking card + an "Effect of …" line to chooser AND spectator alike.
  const promptSource = prompt?.source ?? null;
  const sourceCardInstance =
    promptSource && "card" in promptSource ? promptSource.card : null;
  const sourceLabel: string | null = !promptSource
    ? null
    : "card" in promptSource
      ? `Effect of ${cardTitle(view.catalog, promptSource.card)}`
      : `${heroNameOf(heroes, viewHeroIdOf(view, promptSource.hero)) ?? "Hero"}'s ability`;

  // Legacy best-effort card behind the prompt (issue #72 fix #2), used ONLY when
  // the server sent no `source` (system prompts, or an older server): trust an
  // explicit option.data.card first, else the live combat card. When `source` is
  // present it is authoritative and this fallback stays null (no duplicate face).
  const promptCardInstance = promptForMe && !promptSource
    ? optionCardInstance(promptForMe.options) ??
      view.combat?.attackerCard?.instance ??
      view.combat?.defenderCard?.instance ??
      null
    : null;

  // Optional filter: narrow a space's actions to ONE fighter's moves (non-move
  // actions like PLACE_SIDEKICK always pass through). Used for click resolution
  // (selected fighter) and for the hover preview below (hovered fighter).
  const matchesFighter = (actions: Action[], fighter: FighterId | null) =>
    fighter
      ? actions.filter((a) => a.type !== "MOVE_FIGHTER" || a.fighter === fighter)
      : actions;
  // Inverse preview (issue #320 follow-up): with nothing selected, hovering one of
  // your OWN movable fighters previews only ITS reachable spaces — without
  // committing a selection. `focusFighter` drives the gold highlight set only;
  // click resolution still keys off `selectedFighter`.
  const hoverPreviewFighter =
    !selectedFighter && hoveredFighter && movableFighters.has(hoveredFighter) ? hoveredFighter : null;
  const focusFighter = selectedFighter ?? hoverPreviewFighter;
  // Incremental maneuver stepping (issue #285). Active ONLY during MANEUVER_MOVE
  // once a fighter is selected AND the server sent a move graph for it. Effect/
  // scheme CHOOSE_SPACE moves, large fighters (omitted from the graph), and older
  // servers all leave `moveGraph` null → today's one-click canonical-path move.
  const selectedOrigin =
    selectedFighter != null
      ? view.fighters.find((f) => f.id === selectedFighter)?.space ?? null
      : null;
  const moveGraph =
    view.turnPhase === "MANEUVER_MOVE" && selectedFighter != null
      ? view.moveGraphs?.find((g) => g.fighter === selectedFighter) ?? null
      : null;
  // The live preview state for the selected fighter — its own `step` if one is in
  // flight, else a fresh preview parked at the origin. Null unless stepping is on.
  const stepState: StepState | null =
    moveGraph && selectedOrigin
      ? step && step.fighter === selectedFighter && step.state.origin === selectedOrigin
        ? step.state
        : startStepping(selectedOrigin)
      : null;
  // While stepping (≥1 hop) show only the next legal hops from the preview
  // position; when fresh, fall through to today's enumerated destinations so a
  // far one-click still commits the canonical path.
  const stepHighlights: SpaceId[] | null =
    moveGraph && stepState && !isStepFresh(stepState) ? legalNextSteps(moveGraph, stepState) : null;
  // The ghost's route (nothing sent yet) — only once at least one hop is taken.
  const previewMove: PendingMove | null =
    moveGraph && stepState && selectedFighter && !isStepFresh(stepState)
      ? { fighterId: selectedFighter, path: stepCommitPath(stepState) }
      : null;
  // Board-level stepping affordance state (issue #285): only meaningful once a
  // hop is previewed (previewMove non-null). `stepMovesLeft` counts remaining
  // hops; `stepCanEnd` gates the "End move here" commit on a legal resting spot.
  const stepMovesLeft = moveGraph && stepState ? stepRemaining(moveGraph, stepState) : 0;
  const stepCanEnd = !!(moveGraph && stepState && canCommitStep(moveGraph, stepState));

  const highlightedSpaces = [
    ...(stepHighlights ??
      [...spaceActions.entries()]
        .filter(([, actions]) => matchesFighter(actions, focusFighter).length > 0)
        .map(([space]) => space)),
    ...promptSpaceIds,
    ...(poseIndex.size > 0 ? poseHighlights(poseIndex, activePoseAnchor) : []),
  ];
  const highlightedFighters = [...attackActions.keys(), ...movableFighters, ...promptTargetIds];

  // "Who would move here" cues (issue #320 follow-up). Source = the anchored
  // ambiguous space if a chooser is open, else the pointer-hovered space. For a
  // selected/hover-previewed fighter, narrow to just that fighter; otherwise show
  // every candidate so an ambiguous space reads as ambiguous. Suppressed while a
  // prompt or the stepping graph owns the board (they have their own visuals).
  const moveHintSpace = moveChoice?.space ?? hoveredSpace;
  const moveHint: MoveHint[] =
    moveHintSpace && !promptForMe && !(moveGraph && stepState)
      ? (() => {
          const moveActs = (spaceActions.get(moveHintSpace) ?? []).filter(
            (a): a is Extract<Action, { type: "MOVE_FIGHTER" }> => a.type === "MOVE_FIGHTER"
          );
          const fighterIds = moveChoice
            ? moveChoice.candidates
            : focusFighter
              ? moveActs.filter((a) => a.fighter === focusFighter).map((a) => a.fighter)
              : [...new Set(moveActs.map((a) => a.fighter))];
          return [...new Set(fighterIds)].flatMap((fid) => {
            const from = view.fighters.find((f) => f.id === fid)?.space;
            return from ? [{ fighterId: fid, from, to: moveHintSpace }] : [];
          });
        })()
      : [];

  // Issue #85: say out loud why boost is (or is no longer) available, instead
  // of letting the affordance silently vanish once the fighters have moved.
  const boostHint = maneuverBoostHint(view, legalActions);

  // Commit the accumulated incremental-maneuver walk as ONE MOVE_FIGHTER (issue
  // #285): the engine already accepts arbitrary legal paths incl. revisits, so
  // the opponent sees a single multi-hop tween and it's one undo unit. The path
  // is client-constructed — MOVE_FIGHTER is the sanctioned exception to "only
  // send what the server offered".
  const commitStep = (state: StepState) => {
    if (!selectedFighter) return;
    const path = stepCommitPath(state);
    sendAction({ type: "MOVE_FIGHTER", player: view.you, fighter: selectedFighter, path });
    if (path.length >= 2) setPendingMove({ fighterId: selectedFighter, path });
    setStep(null);
    setSelectedFighter(null);
  };

  const onSpaceClick = (space: SpaceId) => {
    // Two-space (LARGE fighter) move choice owns the board when present: a
    // uniquely-completing space commits at once, an ambiguous one anchors and
    // lights up its partners, and re-tapping the anchor cancels (issue #132).
    if (promptForMe && poseIndex.size > 0) {
      const click = resolvePoseClick(poseIndex, activePoseAnchor, space);
      if (click.type === "commit") {
        respondToPrompt(promptForMe.promptId, click.optionId);
        setPoseAnchor(null);
        setSelectedFighter(null);
        return;
      }
      if (click.type === "anchor") {
        setPoseAnchor({ promptId: promptForMe.promptId, space: click.space });
        return;
      }
      if (click.type === "cancel") {
        setPoseAnchor(null);
        return;
      }
      // "ignore" — not a pose space; fall through to the generic handling below.
    }
    // an open prompt owns the board — answer it first
    const promptOption = promptForMe ? promptSpaceOptions.get(space) : undefined;
    if (promptForMe && promptOption) {
      respondToPrompt(promptForMe.promptId, promptOption);
      setSelectedFighter(null);
      return;
    }
    // Incremental maneuver stepping (issue #285): once the server sends a move
    // graph for the selected fighter, the graph OWNS its maneuver clicks. A click
    // either advances the LOCAL preview one hop or — while fresh — adopts the
    // server's canonical path to a far destination. Nothing is sent until the
    // walk commits (auto on 0 remaining, or via the "End move" affordance).
    if (moveGraph && stepState) {
      const canonical = (spaceActions.get(space) ?? []).find(
        (a): a is Extract<Action, { type: "MOVE_FIGHTER" }> =>
          a.type === "MOVE_FIGHTER" && a.fighter === selectedFighter
      );
      const res = applyStepClick(moveGraph, stepState, space, canonical ? canonical.path : null);
      if (res.type === "step") {
        if (res.commit) commitStep(res.state);
        else setStep({ fighter: selectedFighter as FighterId, state: res.state });
      }
      // Stepped, committed, or ignored — never fall through to the one-click
      // commit below (mid-walk far jumps stay disabled; the client owns no paths).
      return;
    }
    // Re-tapping the already-anchored ambiguous space cancels the chooser.
    if (moveChoice?.space === space) {
      setMoveChoice(null);
      return;
    }
    // Kill the silent first-pick: a space reachable by MORE THAN ONE of your
    // fighters (and none pre-selected) must not auto-move whichever the server
    // enumerated first. Anchor here and let the next fighter click decide — this
    // also makes the ambiguity resolvable on touch (tap space, then tap fighter).
    const res = resolveSpaceMove(spaceActions.get(space) ?? [], selectedFighter);
    if (res.kind === "none") {
      setMoveChoice(null);
      return;
    }
    if (res.kind === "choose") {
      setMoveChoice({ space, candidates: res.candidates });
      return;
    }
    setMoveChoice(null);
    commitMoveOrAction(res.action, space);
    setSelectedFighter(null);
  };
  // Send one resolved board action; if it's a MOVE_FIGHTER, start the tween from
  // the fighter's real space (the server path may omit it as path[0]).
  const commitMoveOrAction = (action: Action, _space: SpaceId) => {
    sendAction(action);
    if (action.type === "MOVE_FIGHTER") {
      const origin = view.fighters.find((f) => f.id === action.fighter)?.space;
      const fullPath = origin && action.path[0] !== origin ? [origin, ...action.path] : action.path;
      if (fullPath.length >= 2) setPendingMove({ fighterId: action.fighter, path: fullPath });
    }
  };
  // Resolve an open ambiguous-move chooser by picking the fighter: find that
  // fighter's MOVE_FIGHTER to the anchored space and commit it.
  const resolveMoveChoice = (fighter: FighterId): boolean => {
    if (!moveChoice || !moveChoice.candidates.includes(fighter)) return false;
    const action = (spaceActions.get(moveChoice.space) ?? []).find(
      (a): a is Extract<Action, { type: "MOVE_FIGHTER" }> =>
        a.type === "MOVE_FIGHTER" && a.fighter === fighter
    );
    setMoveChoice(null);
    if (!action) return false;
    commitMoveOrAction(action, moveChoice.space);
    setSelectedFighter(null);
    return true;
  };
  const onFighterClick = (id: FighterId) => {
    if (promptForMe && promptTargetIds.includes(id)) {
      respondToPrompt(promptForMe.promptId, id);
      setSelectedFighter(null);
      return;
    }
    // An open ambiguous-move chooser: clicking one of its candidate fighters
    // commits THAT fighter's move to the anchored space (touch path). A click on
    // any other fighter cancels the chooser and proceeds normally.
    if (moveChoice) {
      if (resolveMoveChoice(id)) return;
      setMoveChoice(null);
    }
    const attack = attackActions.get(id);
    if (attack) {
      sendAction(attack);
      setSelectedFighter(null);
      setStep(null);
    } else if (movableFighters.has(id)) {
      // Stepping (issue #285): the selected fighter's token stays at its ORIGIN
      // while the ghost previews elsewhere, so clicking it steps BACK one hop
      // toward origin when that's legal (keeps back-and-forth reachable). If it
      // isn't an adjacent step, fall through to toggling the selection.
      if (moveGraph && stepState && id === selectedFighter && !isStepFresh(stepState)) {
        const res = applyStepClick(moveGraph, stepState, stepState.origin, null);
        if (res.type === "step") {
          if (res.commit) commitStep(res.state);
          else setStep({ fighter: id, state: res.state });
          return;
        }
      }
      setSelectedFighter((cur) => (cur === id ? null : id));
      setStep(null); // selecting/deselecting always starts a fresh preview
    }
  };

  // Battlefield items (v17) — ALL presentation. Item labels come from the static
  // map.items; token PRESENCE and attach eligibility come from the server (view.
  // itemTokens + the offered attachItem commit variants). We never re-derive item
  // legality — the badge/label/attach control only surface what the server sent.
  const itemDefById = new Map((view.map.items ?? []).map((it) => [it.id, it]));
  const liveItemLabel = (space: SpaceId): string | undefined => {
    const id = view.itemTokens?.[space];
    return (id ? itemDefById.get(id) : undefined)?.label;
  };
  // The COMBAT item the viewer may attach on THIS commit: the one on the committing
  // fighter's space (the attacker if we're attacking, else the target we're
  // defending). Combat-kind only; its label + value drive the attach menu entry.
  const attachItemContext: AttachItem | undefined = (() => {
    const c = view.combat;
    if (!c) return undefined;
    const fighterId =
      c.attackerPlayer === view.you ? c.attacker : c.defenderPlayer === view.you ? c.target : null;
    if (!fighterId) return undefined;
    const space = view.fighters.find((f) => f.id === fighterId)?.space;
    const id = space ? view.itemTokens?.[space] : undefined;
    const def = id ? itemDefById.get(id) : undefined;
    return def && def.kind === "combat" ? { label: def.label, value: def.value ?? 0 } : undefined;
  })();

  // Hand affordances: a card is playable iff a server-offered action carries
  // its instance id (pure logic in lib/pro/actionDock — seat-agnostic, so a
  // multiplayer BOOST_MOVE from p3 renders and sends exactly like a duel seat).
  const actionsForCard = (instance: CardInstanceId) =>
    cardAffordances(legalActions, instance, attachItemContext);

  return (
    <ProErrorBoundary
      roomId={roomId}
      seat={view.you}
      stateHash={stateHash(view)}
      onLeave={() => {
        // Escape hatch when re-render keeps failing: back to a clean lobby. The
        // reconnect token stays in localStorage, so this room is still resumable.
        if (typeof window !== "undefined") window.location.href = "/pro/game";
      }}
    >
    <CardPreviewProvider>
    <Box h="100svh" overflow="hidden" bg={TABLE_BG} position="relative">
      {/* Playtesting a custom board (this player created it): a near-invisible
          link to submit it to unbrewed. Covers the AI case, where the pre-game
          waiting screen — which also offers this — is never shown. */}
      {mapSubmitUrl && (
        <Link
          href={mapSubmitUrl}
          isExternal
          position="fixed"
          top="0.5rem"
          left="50%"
          transform="translateX(-50%)"
          zIndex={150}
          fontFamily="SpaceGrotesk"
          fontSize="0.65rem"
          letterSpacing="0.06em"
          opacity={0.4}
          _hover={{ opacity: 1, color: "brand.accent" }}
          display="inline-flex"
          alignItems="center"
          gap="0.3rem"
        >
          submit this map to unbrewed <TbExternalLink size="0.7rem" />
        </Link>
      )}

      {/* board — fills the stage, capped so the whole field stays in view */}
      <Flex
        h="100%"
        alignItems="center"
        justifyContent="center"
        p="1rem"
        pt="7.5rem"
        pb="8.5rem"
        pr={{ base: "1rem", lg: "20rem" }}
      >
        <ProBoard
          map={view.map}
          fighters={view.fighters}
          tokens={view.tokens}
          highlightedSpaces={[...new Set(highlightedSpaces)]}
          highlightedFighters={[...new Set(highlightedFighters)]}
          selectedFighter={selectedFighter}
          attack={view.combat ? { attacker: view.combat.attacker, target: view.combat.target } : null}
          friendlyOwners={friendlyOwners}
          fighterBadges={attackerBadge}
          extendedReachTargets={[...extendedReachTargets]}
          fighterTokenArt={(f) => {
            // A flag-driven portrait swap (Thetis tide) wins for the HERO token;
            // otherwise fall back to the deck's fixed per-hero token art.
            const st = ownerTokenState[f.owner];
            if (f.kind === "HERO" && st?.heroArtUrl) return st.heroArtUrl;
            const heroId = ownerHeroIds[f.owner];
            return heroId ? resolveFighterToken(heroId, f.kind) : null;
          }}
          fighterTokenBadge={(f) => ownerTokenState[f.owner]?.badge ?? null}
          fx={boardFx}
          pendingMove={pendingMove ?? incomingMove}
          previewMove={previewMove}
          onPendingMoveSettled={() => {
            setPendingMove(null);
            clearIncoming();
          }}
          closedRegions={view.closedRegions}
          itemTokens={view.itemTokens}
          onSpaceClick={onSpaceClick}
          onFighterClick={onFighterClick}
          onSpaceHover={setHoveredSpace}
          onFighterHover={setHoveredFighter}
          moveHint={moveHint}
          imgMaxH="calc(100svh - 16rem)"
          zoomable={zoomMapOn}
          tokenLife={tokenLifeOn ? tokenGestures : null}
          fighterEls={fighterElsRef}
        />
      </Flex>

      {/* red vignette flash when your hero takes damage (useGameFx) */}
      {visualOn && hurtKey > 0 && (
        <Box
          key={hurtKey}
          position="fixed"
          inset="0"
          zIndex={200}
          pointerEvents="none"
          bg="radial-gradient(ellipse at center, transparent 55%, rgba(192, 57, 43, 0.5) 100%)"
          animation={`${hurtVignette} 0.7s ease-out both`}
        />
      )}

      {/* damage arcs (issue #382): fixed-position projectiles from the panel clash
          point to the defender's token. Endpoints captured at launch by useGameFx;
          absent when visual-fx is off (arcs is never populated in that case). */}
      {visualOn && <DamageArcLayer arcs={arcs} />}

      {/* combat callouts: turn banner / DEFEND! pulse / scheme reveal / effect
          ribbon (issues #162, #380; empty on a pre-v10 server). Gated on the
          pro-visual-fx toggle per the battle-sequence epic's shared constraint;
          the hook still advances its prevViewRef while off, so flipping the
          toggle mid-combat diffs cleanly with no backlog burst. */}
      {visualOn &&
        combatCallouts.map((item) => (
          <CombatCalloutOverlay key={item.key} item={item} view={view} resolveCard={resolveCard} />
        ))}

      {/* floating player plates + room/connection chips (sandbox HUD DNA);
          report-bug chip (issue #125/#138) shares this row so it doesn't
          overlap the invite/connection chips — beta badge distinguishes it
          from the activity-log icon (#87); both open the same ReportBugDialog. */}
      <ProHud
        view={view}
        status={status}
        roomId={roomId}
        seatPresence={seatPresence}
        turnTimer={turnTimer}
        turnTimerSeconds={roomInfo?.turnTimerSeconds}
        resolveCard={resolveCard}
        resolveHero={resolveHero}
        labelFor={(c) => cardLabel(view.catalog, c)}
        soundOn={soundOn}
        visualFxOn={visualOn}
        onToggleSound={toggleSound}
        onToggleVisualFx={toggleVisual}
        onReportBug={() => setReportBugOpen(true)}
      />

      {/* right control dock — turn state, combat, prompts, actions */}
      <Flex
        position="fixed"
        right="0.75rem"
        top="7.5rem"
        bottom="1rem"
        w="18.5rem"
        direction="column"
        gap="0.6rem"
        zIndex={140}
        overflowY="auto"
        sx={{ "::-webkit-scrollbar": { display: "none" } }}
        pointerEvents="none"
      >
        <Flex direction="column" gap="0.6rem" sx={{ "& > *": { pointerEvents: "auto" } }}>
          {/* Incremental-maneuver stepping controls (issue #285): shown while a
              local hop-by-hop preview is in flight. "End move here" commits the
              accumulated path as one MOVE_FIGHTER (auto-commits when 0 moves are
              left); "Cancel" resets the ghost to the origin — nothing was sent, so
              the cancel is free. Addresses the awkward maneuver prompt in #169. */}
          {previewMove && (
            <Flex
              direction="column"
              gap="0.4rem"
              bg="rgba(0,0,0,0.55)"
              border="1px solid"
              borderColor="brand.accent"
              borderRadius="0.5rem"
              p="0.6rem"
            >
              <Text fontSize="0.8rem" color="brand.accent" fontWeight={700}>
                stepping {selectedFighter?.split("/")[1]} — {stepMovesLeft} move{stepMovesLeft === 1 ? "" : "s"} left
              </Text>
              <Text fontSize="0.7rem" color="brand.parchment" opacity={0.85}>
                click a gold space to step (moving back counts too), or:
              </Text>
              <Flex gap="0.4rem">
                <Button
                  size="sm"
                  flex={1}
                  colorScheme="yellow"
                  isDisabled={!stepCanEnd}
                  onClick={() => stepState && commitStep(stepState)}
                >
                  End move here
                </Button>
                <Button
                  size="sm"
                  flex={1}
                  variant="outline"
                  color="brand.parchment"
                  onClick={() => setStep(null)}
                >
                  Cancel
                </Button>
              </Flex>
            </Flex>
          )}
          {/* Live-turn chrome — hidden once the game is decided (issue #194): at
              GAME_OVER legal actions are empty and no seat is "on turn", so these
              chips would go stale. The outcome (VICTORY!/DEFEAT) shows instead. */}
          {showLiveTurnChrome(view) && (
            <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
              <Tag size="sm" bg={myTurn ? "brand.accent" : "whiteAlpha.300"} color={myTurn ? "brand.surfaceDim" : "brand.parchment"}>
                {activeTurnLabel}
              </Tag>
              <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
                turn {view.turnNumber}
              </Tag>
              <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
                {view.actionsRemaining} actions left
              </Tag>
              {/* In multiplayer the seat-identified presence map is authoritative
                  (multiple seats can drop independently); duel keeps the coarse
                  boolean untouched. The per-seat card badge + countdown live in
                  ProHud — this chip is just the at-a-glance banner (issue #222). */}
              {(multiplayerView ? Object.keys(seatPresence).length > 0 : !opponentConnected) && (
                <Tag size="sm" colorScheme="red">
                  {multiplayerView
                    ? Object.keys(seatPresence).length > 1
                      ? `${Object.keys(seatPresence).length} players disconnected`
                      : "player disconnected"
                    : "opponent disconnected"}
                </Tag>
              )}
            </Flex>
          )}
          {moveChoice && (
            <Text fontSize="0.8rem" color="#C4B5FD" fontWeight="bold" textShadow="0 1px 3px rgba(0,0,0,0.6)">
              {moveChoice.candidates.map((id) => nameOf(id)).join(" or ")} can both move here — click which
              fighter should move (or tap the space again to cancel)
            </Text>
          )}
          {!moveChoice && !previewMove && (highlightedSpaces.length > 0 || attackActions.size > 0) && (
            <Text fontSize="0.8rem" color="brand.accent" textShadow="0 1px 3px rgba(0,0,0,0.6)">
              {selectedFighter
                ? moveGraph
                  ? `stepping ${selectedFighter.split("/")[1]} — click a near gold space to step one at a time, or a far one to move straight there`
                  : `showing moves for ${selectedFighter.split("/")[1]} — click a gold space (click the fighter again to unselect)`
                : [
                    highlightedSpaces.length > 0 &&
                      `click a gold space to move there (${highlightedSpaces.length} option${
                        highlightedSpaces.length === 1 ? "" : "s"
                      })`,
                    attackActions.size > 0 && "click a pulsing enemy to attack",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </Text>
          )}
          {boostHint && (
            <Text
              fontSize="0.75rem"
              color="brand.parchment"
              opacity={0.85}
              textShadow="0 1px 3px rgba(0,0,0,0.6)"
            >
              {boostHint}
            </Text>
          )}
          {/* Strike beat (#381): while a combat that resolved+ended in one batch
              lingers, keep rendering the panel from the frozen snapshot so the
              slam can play. Visual-fx off ⇒ no linger, no strike (outcome still
              lives in the activity log); the panel just unmounts as before. */}
          {(view.combat ?? (visualOn ? lingeringCombat : null)) && (
            <CombatPanel
              combat={(view.combat ?? lingeringCombat)!}
              catalog={view.catalog}
              resolveCard={resolveCard}
              you={view.you}
              selfCommitted={view.self.committedCard}
              strike={visualOn ? strike : null}
              valueFx={visualOn && !reducedMotion ? combatValueFx : undefined}
              clashRef={clashRef}
            />
          )}
          {prompt && (
            <PromptPanel
              prompt={prompt}
              you={view.you}
              onRespond={respondToPrompt}
              buttonOptions={promptButtonOptions}
              cardOptions={promptCardOptions}
              boardHint={promptBoardHint}
              previewInstance={promptCardInstance}
              sourceInstance={sourceCardInstance}
              sourceLabel={sourceLabel}
              resolveCard={resolveCard}
              catalog={view.catalog}
            />
          )}
          <Flex direction="column" gap="0.4rem">
            {listActions.map((a, i) => (
              <Button
                key={i}
                {...BTN}
                bg="rgba(20, 8, 24, 0.65)"
                justifyContent="flex-start"
                whiteSpace="normal"
                height="auto"
                minH="2rem"
                py="0.4rem"
                textAlign="left"
                onClick={() => sendAction(a)}
              >
                <Flex as="span" align="center" gap="0.4rem" flexWrap="wrap">
                  {/* Scheme-item use (v17): a leading yellow lightning glyph marks
                      this as a BOARD item action, visually distinct from a hand
                      scheme card. The item's label rides in the describeAction text. */}
                  {a.type === "USE_SCHEME_ITEM" && (
                    <Box as="span" display="inline-flex" boxSize="1.1rem" flexShrink={0}>
                      <ItemGlyph kind="scheme" fill="#E4B106" />
                    </Box>
                  )}
                  <Text as="span">
                    {describeAction(view.catalog, a, { nameOf, attackerBadge, itemLabelForSpace: liveItemLabel })}
                  </Text>
                  {isExtendedReach(a) && (
                    <Tooltip label={LARGE_FIGHTER_BLURB} hasArrow placement="top" openDelay={150}>
                      <Tag
                        size="sm"
                        bg="brand.accent"
                        color="brand.surfaceDim"
                        fontWeight={700}
                        letterSpacing="0.01em"
                        flexShrink={0}
                      >
                        {LARGE_REACH_CHIP}
                      </Tag>
                    </Tooltip>
                  )}
                  {/* Sole-option shortcut hint (issue #353): only the lone eligible
                      dock action carries it, and pressing space fires this action. */}
                  {a === sole && (
                    <Kbd
                      ml="auto"
                      flexShrink={0}
                      bg="rgba(255,255,255,0.08)"
                      borderColor="rgba(255,255,255,0.25)"
                      color="brand.parchment"
                      fontSize="0.7rem"
                    >
                      space
                    </Kbd>
                  )}
                </Flex>
              </Button>
            ))}
            {legalActions.length === 0 && !prompt && showLiveTurnChrome(view) && (
              <Text opacity={0.7} fontSize="0.9rem" color="brand.parchment">
                {iAmSpectating
                  ? iForfeited
                    ? "You forfeited — spectating."
                    : "You've been eliminated — spectating."
                  : multiplayerView
                  ? "waiting on another player…"
                  : "waiting on opponent…"}
              </Text>
            )}
          </Flex>
          {view.winner && (
            <Flex direction="column" align="center" gap="0.15rem">
              <Text
                fontFamily="LeagueGothic"
                fontSize="3rem"
                color="brand.accent"
                textShadow="0 2px 12px rgba(224,168,46,0.5)"
                lineHeight="1"
              >
                {isViewerOnWinningTeam(view) ? "VICTORY!" : "DEFEAT"}
              </Text>
              {/* Deep-link straight into this match's saved God-view replay
                  (issue #240). The bundle is saved locally on GAME_OVER (see the
                  saveReplay effect above); /pro/replays?open=<id> auto-opens it.
                  Only shown once we hold the bundle, so the link always resolves. */}
              {replayBundle && (
                <Link
                  href={`/pro/replays?open=${replayId(replayBundle)}`}
                  color="brand.parchment"
                  opacity={0.85}
                  fontSize="0.9rem"
                  display="inline-flex"
                  alignItems="center"
                  gap="0.3rem"
                  _hover={{ opacity: 1, color: "brand.accent", textDecoration: "none" }}
                >
                  View replay <TbExternalLink size="0.85rem" />
                </Link>
              )}
            </Flex>
          )}
          {/* Undo — request to rewind our last action, pending opponent consent
              (issue #154). Shown only while live and only when the server says we
              have an eligible last action (view.canUndo); disabled while a request
              is already in flight. The rewind itself is server-side — we just ask. */}
          {view.phase === "PLAY" && !view.winner && view.canUndo && (
            <Button
              size="sm"
              mt="0.4rem"
              colorScheme="yellow"
              variant="outline"
              isDisabled={undoPending}
              onClick={requestUndo}
            >
              {undoPending ? "Undo requested…" : "Undo last action"}
            </Button>
          )}
          {/* Forfeit — rendered whenever the engine offers FORFEIT to this seat
              (`canForfeit`, issue #140 + unbrewed-engine #117). No seat-count or
              seat-id gate: duel and multiplayer alike surface it via the same
              legal-action check, so it appears on your own clock and vanishes
              once you're eliminated. Destructive, so it's red and confirm-gated;
              the phase/winner gates stay as belt-and-suspenders. */}
          {view.phase === "PLAY" && !view.winner && canForfeit && (
            <Button
              size="sm"
              mt="0.4rem"
              colorScheme="red"
              variant="outline"
              onClick={() => setForfeitOpen(true)}
            >
              Forfeit
            </Button>
          )}
        </Flex>
      </Flex>

      {/* concede confirmation (issue #140) — sends FORFEIT on confirm. In
          multiplayer this resigns your seat (you may keep spectating), so the
          dialog copy adapts; `iForfeited` lets the spectator panel say so. */}
      <ForfeitDialog
        isOpen={forfeitOpen}
        onClose={() => setForfeitOpen(false)}
        multiplayer={multiplayerView}
        onConfirm={() => {
          setIForfeited(true);
          sendAction({ type: "FORFEIT", player: view.you });
        }}
      />

      {/* undo accept/reject prompt (issue #154) — shown to the opponent of the
          requester; the server pushed the list of actions to be rewound. */}
      <UndoRequestDialog
        isOpen={!!incomingUndo}
        you={view.you}
        actions={incomingUndo?.rewindActions ?? []}
        onAccept={() => respondToUndo(true)}
        onReject={() => respondToUndo(false)}
      />

      {/* activity feed — bottom-left parchment panel, sandbox style */}
      <ProLog
        entries={logEntries}
        resolveCard={resolveCard}
        labelFor={(c) => cardLabel(view.catalog, c)}
        onReportBug={() => setReportBugOpen(true)}
      />

      {/* prefilled-GitHub-issue bug report with auto-captured game context (#87) */}
      <ReportBugDialog
        isOpen={reportBugOpen}
        onClose={() => setReportBugOpen(false)}
        view={view}
        roomId={roomId}
        entries={logEntries}
      />

      {/* hand — docked fan over the bottom edge, sandbox style */}
      <Flex position="fixed" bottom="-0.75rem" left="0" right="0" justifyContent="center" zIndex={160} pointerEvents="none">
        <Box pointerEvents="auto">
          <ProHand
            hand={view.self.hand}
            resolveCard={resolveCard}
            labelFor={(c) => cardLabel(view.catalog, c)}
            actionsFor={actionsForCard}
            onAction={sendAction}
          />
        </Box>
      </Flex>
    </Box>
    </CardPreviewProvider>
    </ProErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// PREVIEW mode (dev only, no server)
// ---------------------------------------------------------------------------

const PREVIEW_MAP = mendedDrum as ProMapDef;

const previewFighters = (map: ProMapDef): ViewFighter[] => {
  const start = (slot: number) => map.spaces.find((s) => s.start?.slot === slot)?.id ?? null;
  return [
    { id: "p1/hero", owner: "p1", kind: "HERO", name: "King Kong", space: start(1), tailSpace: null, hp: 18, maxHp: 18, reach: "MELEE", defeated: false },
    { id: "p2/hero", owner: "p2", kind: "HERO", name: "Baba Yaga", space: start(2), tailSpace: null, hp: 14, maxHp: 14, reach: "RANGED", defeated: false },
  ];
};

const PreviewGame = () => {
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
  const room = typeof router.query.room === "string" ? router.query.room : null;
  const heroParam = typeof router.query.hero === "string" ? router.query.hero : null;
  // `?debug` (any value, incl. bare `?debug`) opts this session into seeing the
  // debug-only decks the server hides by default, in the picker and in random
  // bot picks. See lib/pro/protocol.ts v15/v18.
  const debug = router.query.debug !== undefined;

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
      {WS_URL ? <LiveGame room={room} heroParam={heroParam} debug={debug} /> : <PreviewGame />}
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
