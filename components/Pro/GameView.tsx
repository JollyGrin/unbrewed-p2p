/**
 * The in-game Pro view (issue #1678): the board, HUD, dock, hand and feed that
 * render one seat's view of a live game, extracted from `LiveGame` in
 * pages/pro/game.tsx so it can be mounted anywhere.
 *
 * Contains ZERO rules logic (docs/pro/01-context.md): it draws the server's
 * view, offers its legalActions and answers its prompts.
 *
 *  - `useGameViewState` holds every in-game hook; `GameViewBody` is the render.
 *    /pro/game calls the hook itself (unconditionally, before its lobby
 *    screens) and renders the body, so the page behaves as it always has.
 *  - `GameView` is the embeddable component: the same hook and body inside a
 *    sized panel, driven by a socket the caller hands it.
 */
import { ComponentProps, CSSProperties, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { containedOrigin, containedOwnsKeys, containedScope, ProContainedFrame, proVh, useProContained } from "@/lib/pro/contained";
import { Box, Button, Flex, Link, Tag, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { motion, useReducedMotion } from "framer-motion";
import { MOVE_STEP_SECONDS, MoveHint, PendingMove, ProBoard, ProBoardProps } from "@/components/Pro/ProBoard";
import { useLazyTableBoard } from "@/lib/pro/useLazyTableBoard";
import { useBoardView } from "@/lib/pro/useBoardView";
import { boardViewLockedHint, resolveBoardView } from "@/lib/pro/boardView";
import { ProErrorBoundary } from "@/components/Pro/ProErrorBoundary";
import { stateHash } from "@/lib/pro/stateHash";
import {
  Action,
  CardInstanceId,
  CardMeta,
  FighterId,
  HeroListing,
  LegalOption,
  PlayerId,
  PlayerView,
  ProMapDef,
  ProMapItem,
  SpaceId,
  ViewCombat,
  ViewFighter,
  ViewPrompt,
  ViewToken,
} from "@/lib/pro/protocol";
import {
  boardObjectOriginFighter,
  boardObjectVisualFor,
  disambiguateLabels,
} from "@/lib/pro/boardObjects";
import { buildPromptSpaceMap } from "@/lib/pro/promptSpaces";
import { replayId } from "@/lib/pro/replayStore";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { deriveRelocateMode, resolveRelocateBoardClick } from "@/lib/pro/relocateMode";
import { UseProSocketReturn } from "@/lib/pro/useProSocket";
import { SubmitMapDialog } from "@/components/Pro/SubmitMapDialog";
import { HERO_DECK_IDS, ResolveCard, heroIdsForArt, useProCardArt } from "@/lib/pro/useProCardArt";
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import {
  TbExternalLink,
  TbCards,
  TbList,
} from "react-icons/tb";
import { ProDiscardsSheet } from "@/components/Pro/ProDiscardsSheet";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { cardChoiceGroups } from "@/lib/pro/cardChoices";
import { CardPreviewProvider } from "@/components/Pro/CardPreview";
import { ProDock } from "@/components/Pro/ProDock";
import { ProHud, ProHudProps } from "@/components/Pro/ProHud";
import { MOBILE_BTN, ProMobileHud, ProMobileMenu } from "@/components/Pro/ProMobileHud";
import { touchCopy } from "@/lib/pro/touchCopy";
import { HandDecisionWatcher, ProMobileHand, RailHand } from "@/components/Pro/ProMobileHand";
import { TableHudHand } from "@/components/Pro/Table/Hud/TableHudHand";
import { TableHudSideButtons } from "@/components/Pro/Table/Hud/TableHudSideButtons";
import { HUD_RESET_VIEW_SPOT, tableHudFitInset } from "@/lib/pro/tableHud";
import { useSafeAreaInsets } from "@/lib/pro/useSafeAreaInsets";
import { ProLog, ProLogEntry } from "@/components/Pro/ProLog";
import { ReportBugDialog } from "@/components/Pro/ReportBugDialog";
import { ForfeitDialog } from "@/components/Pro/ForfeitDialog";
import { UndoRequestDialog } from "@/components/Pro/UndoRequestDialog";
import { MulliganDialog } from "@/components/Pro/MulliganDialog";
import { RevealedHandPanel } from "@/components/Pro/RevealedHandPanel";
import { actionFallbackLine, batchPhase, batchTurnTag, combatCardsOf, diffViews, enrichLines, seatLabel } from "@/lib/pro/gameLog";
import { MulliganChoice, isMulliganPrompt, mulliganChoiceOf } from "@/lib/pro/mulligan";
import { RAIL_WIDTH_CSS, TAP_TARGET, boardFitInsetFor, handDecisionKeyFor } from "@/lib/pro/mobileLayout";
import { effectiveFigureStyle, figureStyleOptions, pieceCredit, pieceForStyle } from "@/lib/pro/figures";
import { useMinis3dSource } from "@/lib/pro/minis3d/useMinis3dSource";
import { useFigureManifests } from "@/lib/pro/useFigureManifest";
import { useFigureStyle } from "@/lib/pro/useFigureStyle";
import { useZoneDiscs } from "@/lib/pro/useZoneDiscs";
import { useElementBottom, useElementHeight, useProLayout } from "@/lib/pro/useProLayout";
import {
  EMPTY_SUB_ATTACK_CHAIN,
  SubAttackChainProgress,
  SubAttackChainState,
  advanceSubAttackChain,
  isSubAttackInstance,
  parentCardTitle,
  subAttackChainProgress,
} from "@/lib/pro/subAttackChain";
import { effectAttackTagFor, type EffectAttackTag } from "@/lib/pro/effectAttack";
import {
  FACE_UP_BADGE,
  FACE_UP_TITLE,
  isFaceUpPreRevealAttack,
} from "@/lib/pro/faceUpCommit";
import {
  AttachItem,
  cardAffordances,
  cardLabel,
  cardTitle,
  describeAction,
  dockRows,
  NON_DOCK_ACTION_TYPES,
  soleAction,
} from "@/lib/pro/actionDock";
import {
  isExtendedReachAttack,
  SpaceReach,
} from "@/lib/pro/largeReach";
import { useFlag } from "@/lib/flags";
import { maneuverBoostHint } from "@/lib/pro/maneuverHint";
import { badgedFighterName, fighterName, squadBadges } from "@/lib/pro/squadNumbers";
import {
  emergenceCaption,
  secretMarkPromptDescription,
  visibleSecretMarks,
  withSecretMarkStatuses,
} from "@/lib/pro/fighterStatuses";
import { buildPoseIndex, parsePoseOptions, poseHighlights, resolvePoseClick } from "@/lib/pro/moveChoice";
import { moveBudgetLine, steppingBudgetLine, unofferableMoveFeedback } from "@/lib/pro/moveFeedback";
import { cardFaceOptions, revealedPlayerPickOptions, type RevealedCard } from "@/lib/pro/cardOptions";
import { seatNameplate } from "@/lib/pro/playerIdentity";
import {
  applyClick as applyStepClick,
  canCommit as canCommitStep,
  commitPath as stepCommitPath,
  commitTrailPath as stepCommitTrailPath,
  isFresh as isStepFresh,
  isPoseGraph,
  leadOf,
  legalNextSteps,
  poseGraph,
  poseNode,
  poseStopKey,
  previewPose,
  remaining as stepRemaining,
  restrictStops,
  startStepping,
  type PoseChoice,
  type StepState,
} from "@/lib/pro/moveSteps";
import { useGameFx, DamageArc } from "@/lib/pro/useGameFx";
import { useCombatCallouts, CombatCalloutItem } from "@/lib/pro/combatFx";
import { attackerSwapText, defenderChangeKind, defenderRedirect, defenderSwapText } from "@/lib/pro/combatDefender";
import { useAttackerSwap, useCombatTargeting, useDefenderSwap } from "@/lib/pro/useDefenderSwap";
import {
  useCombatStrike,
  CombatStrike,
  StrikeVariant,
  comparePulseFor,
  CompareBeat,
  panelCombatFor,
  combatForStrike,
} from "@/lib/pro/combatStrike";
import { combatOutcomeBannerText, isNoWinner } from "@/lib/pro/combatOutcome";
import { useCombatValueFx, CombatValueFx, SlotValueFx } from "@/lib/pro/combatValueFx";
import { useTokenLife } from "@/lib/pro/tokenLife";
import { resolveSpaceMove } from "@/lib/pro/moveResolve";
import { useIncomingMoveTween } from "@/lib/pro/moveTween";
import { usePositionSwaps } from "@/lib/pro/usePositionSwaps";
import { useAccount } from "@/lib/account/useAccount";
import { GameEndReason, gameEndReasonOf, isGameOver } from "@/lib/pro/postGame";
import { deriveTeams } from "@/lib/pro/teams";
import { fighterTokenStateByOwner } from "@/lib/pro/heroStateFlags";
import { clockTowerMitigationLine } from "@/lib/pro/clockTower";
import { boughtRangeAttacks, boughtRangeBlurb, boughtRangeChip } from "@/lib/pro/rangePurchase";
import { CosmeticRimTier } from "@/lib/pro/cosmetics";
import { seatCosmetics, tokenRimForSeat } from "@/lib/pro/seatCosmetics";
import { useHideOpponentCosmetics } from "@/lib/pro/useHideOpponentCosmetics";
import { usePace } from "@/lib/pro/usePace";
import { paceFactor } from "@/lib/pro/pace";
import { scaledCombatAnimTiming, CombatAnimTiming } from "@/lib/pro/combatAnimTiming";
import type { TableStrike } from "@/components/Pro/Table/tableMiniCues";
import { batchActor } from "@/lib/pro/slowModeQueue";
import { ActionSpotlight, ActionSpotlightBatch } from "@/components/Pro/ActionSpotlight";
import type { RematchNegotiation } from "@/components/Pro/RematchOfferPanel";
import { useTournamentGame } from "@/components/Pro/TournamentGate";
import { useTurnReminder } from "@/lib/pro/useTurnReminder";
import { useTurnReminderSetting } from "@/lib/pro/useTurnReminderSetting";
import { TurnReminderCue } from "@/components/Pro/TurnReminderCue";


/** same table felt the sandbox game uses (game.layout.tsx) */
export const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
/** Breathing room between the HUD and the Keen Hearing panel hanging below it. */
const REVEALED_PANEL_GAP_PX = 8;

export const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};
export const BTN_GOLD = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

/** Fallback safety net for a token-move tween (issue #80): the board clears
 * `pendingMove` itself once the tween's onAnimationComplete fires, but if
 * that ever gets missed (component churn, bad path data) this forces the
 * clear anyway so the board can't get stuck showing a stale animated token. */
export const usePendingMoveTimeout = (
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
  budgetLine,
  noteLine,
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
  cardOptions: { id: string; instance: CardInstanceId; caption?: string }[];
  /** set when some options are answered by clicking the board */
  boardHint: string | null;
  /** issue #412: the step budget line for a CHOOSE_SPACE *move* prompt ("Move
   *  up to 2 spaces"), shown as the primary line so the player knows why some
   *  spaces aren't offered. null for non-move prompts (fall back to
   *  `prompt.description`). */
  budgetLine: string | null;
  /** issue #663: a live SECONDARY line for a prompt whose engine label is static but
   *  whose stakes are not — today only Skull Kid's Clock Tower mitigation, where the
   *  running reduction is the whole decision ("currently reduced by 3, so 2 would
   *  land"). Rendered under the primary line to chooser AND spectator alike, since
   *  every number in it is public. null for every other prompt. */
  noteLine: string | null;
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
        Both shown to chooser and spectator alike. Issue #412: for a CHOOSE_SPACE
        move prompt `budgetLine` (the "Move up to N spaces" budget, or a move-shaped
        fallback) takes the primary line so the step budget is always stated. */}
    {(budgetLine ?? secretMarkPromptDescription(prompt.description)) ? (
      <>
        <Text fontSize="0.95rem" fontWeight="bold" mb="0.25rem" color="brand.parchment">
          {budgetLine ?? secretMarkPromptDescription(prompt.description)}
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
    {noteLine && (
      <Text fontSize="0.85rem" fontWeight="bold" mb="0.5rem" color="brand.accent">
        {noteLine}
      </Text>
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
              <Flex key={c.id} as="button" direction="column" alignItems="center" gap="0.25rem"
                w="5rem"
                sx={{ "@media (max-width: 420px)": { w: "4.25rem" } }}
              >
                <Box
                  w="100%"
                  sx={{ aspectRatio: "63 / 88" }}
                  borderRadius="0.35rem"
                  transition="transform 0.1s, box-shadow 0.1s"
                  _hover={{ transform: "translateY(-3px)", boxShadow: "0 0 0 2px var(--chakra-colors-brand-accent)" }}
                  onClick={() => onRespond(prompt.promptId, c.id)}
                  aria-label={`Choose ${cardLabel(catalog, c.instance)}`}
                >
                  <CardFace card={resolveCard(c.instance)} fallback={cardLabel(catalog, c.instance)} />
                </Box>
                {c.caption && (
                  <Text fontSize="0.7rem" lineHeight="1.1" textAlign="center" color="brand.parchment" whiteSpace="normal">
                    {c.caption}
                  </Text>
                )}
              </Flex>
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

/** A deck's cardback filling the combat-slot card frame; the gold "?" back when
 *  the deck has no cardback art. */
const CardBackFace = ({ url }: { url?: string }) =>
  url ? (
    <Box
      w="100%"
      h="100%"
      borderRadius="0.5rem"
      border="1px solid"
      borderColor="whiteAlpha.400"
      bgImage={`url("${url}")`}
      bgSize="cover"
      bgPos="center"
      boxShadow="0 2px 8px rgba(0,0,0,0.5)"
      aria-label="face-down card"
    />
  ) : (
    <HiddenRevealBack />
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

// ---------------------------------------------------------------------------
// The strike beat (issue #381 — #379 battle-sequence epic). After both cards
// settle (~0.85s after reveal), the attack card lunges right and slams the
// defense card; the defense reacts by outcome. Same physical grammar as the
// token gestures (TokenLifeLayer / TOKEN_LIFE_TUNING) — lunge / recoil / brace,
// similar durations — at card scale. Emotion keyframes + Chakra `animation`,
// sequenced by CSS animation-delay off the flip; derived + keyed once per combat
// by useCombatStrike so it plays exactly once. Wrapped in NO_MOTION at every use.
// ---------------------------------------------------------------------------

// Durations/delays (STRIKE_DELAY, STRIKE_LUNGE_DUR, STRIKE_REACT_DUR, the derived
// STRIKE_CONTACT_DELAY, the flip transition, the chip fly, the compare beat) used to
// live here as fixed 1× constants — CSS animation-delay/duration sequenced off the
// flip, but deaf to the player's Combat pace setting (only the JS-side linger/hold
// in combatTiming.ts stretched, so a slower pace held the pose longer without the
// motion itself taking any longer to play). They now live in combatAnimTiming.ts,
// derived once per render via `scaledCombatAnimTiming(factor)` in CombatPanel and
// threaded down as props — see CombatPanel/CombatSlot/StrikeRing below.

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

/** A modifier chip flies in from up-right and settles onto the value pill. Its
 *  duration is CHIP_FLY_DUR (combatAnimTiming.ts), which matches CHIP_TTL_MS in
 *  combatValueFx.ts — both scaled by the SAME pace factor — so the fly-in + fade
 *  still covers exactly the window the hook keeps the chip mounted at any pace. */
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

/**
 * Synthetic sub-attack combat card (issue #288 — engine batch D; extended to chains
 * in issue #596 ↔ engine #359).
 * A `subAttack` op's attack has no catalog/deck entry (its instance is
 * `sub-attack:<fighter>`, `synthetic: true` server-side) and carries no printed text,
 * so resolveCard can't find art. Render a distinct card-shaped tile rather than the
 * raw-instance-id text fallback. The value rides the normal combat math
 * (effectiveValue) shown by the slot's detail line.
 *
 * `title`/`note` name WHICH sub-attack this is. Grievous's single droid shot keeps its
 * printed "Blast 'em!" graphic (the default), while a chain hit is labelled by the
 * PARENT card plus its index — "Hundred-Fist Rush" / "chain hit 2 of up to 3" — since
 * engine #359 lets one card open three of these in a row and the synthetic faces are
 * otherwise indistinguishable.
 */
const SubAttackFace = ({ title, note }: { title?: string; note?: string }) => (
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
      {title ?? <>Blast&nbsp;&apos;em!</>}
    </Text>
    <Text fontSize="0.6rem" opacity={0.8} mt="0.2rem">
      {note ?? "sub-attack"}
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
  cardbackUrl,
  revealDelay = "0s",
  strikeAnimation,
  strikeVars,
  valueFx,
  comparePulse,
  subAttackFace,
  faceUp,
  width = "6.5rem",
  anim,
}: {
  label: string;
  card: ViewCombat["attackerCard"];
  detail?: string;
  resolveCard: ResolveCard;
  /** own committed instance when this slot is mine and unrevealed */
  facedownInstance: CardInstanceId | null;
  facedownState: "committed" | "deciding" | "none";
  catalog: Record<string, CardMeta>;
  /** the committing player's deck cardback, shown while their card is committed
   *  but unrevealed (#735); undefined ⇒ the gold "?" HiddenRevealBack fallback. */
  cardbackUrl?: string;
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
  /** labels for a SYNTHETIC sub-attack face in this slot (#596). Ignored unless the
   *  revealed card is one; absent ⇒ the Grievous "Blast 'em!" default. */
  subAttackFace?: { title?: string; note?: string };
  /** this face is on the table because the attacker played it FACE UP (#772), with
   *  the defender still to answer — badged so nobody reads a pre-reveal face as a
   *  reveal that already happened. Every viewer sees it: both seats, spectators and
   *  the replay scrubber. */
  faceUp?: boolean;
  /** slot card width; the phone sheet shrinks it until the reveal (mobile step 3) */
  width?: string;
  /** the combat sequence's CSS clock at the player's pace (combatAnimTiming.ts),
   *  derived ONCE by CombatPanel and passed down — the flip transition, the chip
   *  fly, the compare pulse and its delay all read from here instead of a fixed
   *  1× literal, so a slower pace genuinely slows the motion, not just its dwell. */
  anim: CombatAnimTiming;
}) => (
  <Box textAlign="center">
    <Text opacity={0.6} fontSize="0.75rem" mb="0.25rem">
      {label}
    </Text>
    <Box
      w={width}
      mx="auto"
      position="relative"
      animation={strikeAnimation}
      style={strikeVars}
      sx={{ aspectRatio: "63 / 88", ...(strikeAnimation ? NO_MOTION : {}) }}
    >
      {facedownInstance ? (
        // own committed instance: YOUR card shows its face — you know what you
        // played; only the opponent's commit is hidden from you.
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
        // Two-layer 3D flip (#735): back = the committing player's deck cardback
        // while a card is committed (dashed placeholder otherwise), front = the
        // revealed face. The container stays mounted across commit → reveal, so
        // the rotation transition IS the flip — no remount keyframe. On initial
        // mount with a card already revealed (e.g. a sub-attack arriving face up)
        // no transition fires; the face just shows. When a new combat opens, the
        // next committed card visibly flips back over (180°→0°).
        <Box w="100%" h="100%" sx={{ perspective: "600px" }}>
          <Box
            position="relative"
            w="100%"
            h="100%"
            transform={card ? "rotateY(180deg)" : "rotateY(0deg)"}
            transition={`transform ${anim.flipTransitionDur}s cubic-bezier(0.2, 0.9, 0.3, 1.1) ${revealDelay}`}
            sx={{
              transformStyle: "preserve-3d",
              "@media (prefers-reduced-motion: reduce)": { transition: "none !important" },
            }}
          >
            {/* back layer: cardback while committed, dashed placeholder otherwise */}
            <Box position="absolute" inset={0} sx={{ backfaceVisibility: "hidden" }}>
              {facedownState === "committed" ? (
                <Box position="relative" w="100%" h="100%">
                  <CardBackFace url={cardbackUrl} />
                  <Tag
                    position="absolute"
                    top="-0.4rem"
                    left="50%"
                    transform="translateX(-50%)"
                    size="sm"
                  >
                    face-down
                  </Tag>
                </Box>
              ) : (
                <Flex
                  w="100%"
                  h="100%"
                  border="1px dashed"
                  borderColor="whiteAlpha.400"
                  borderRadius="0.5rem"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Text fontSize="0.7rem" opacity={0.6}>
                    {facedownState === "deciding" ? "deciding…" : "no card"}
                  </Text>
                </Flex>
              )}
            </Box>
            {/* front layer: the revealed face (or sub-attack synthetic face) */}
            <Box
              position="absolute"
              inset={0}
              transform="rotateY(180deg)"
              sx={{ backfaceVisibility: "hidden" }}
            >
              {card &&
                (isSubAttackInstance(card.instance) ? (
                  <SubAttackFace title={subAttackFace?.title} note={subAttackFace?.note} />
                ) : (
                  <CardFace card={resolveCard(card.instance)} fallback={cardLabel(catalog, card.instance)} />
                ))}
            </Box>
          </Box>
        </Box>
      )}
      {/* FACE-UP badge (#772 ↔ engine #555). The slot already knows how to draw a
          pre-reveal face — a sub-attack and a linked effect attack have arrived that
          way for ages — but a face-up commit is a HAND card, and without a marker the
          defender reads their opponent's still-undefended attack as a reveal that has
          already happened. Drawn OUTSIDE the flip container (whose front layer is
          mirrored) so it reads right way round, and mirroring the "face-down" tag's
          placement so the two states occupy the same spot. */}
      {faceUp && card && (
        <Tag
          position="absolute"
          top="-0.4rem"
          left="50%"
          transform="translateX(-50%)"
          size="sm"
          zIndex={2}
          bg="#1F6B2A"
          color="#F2EAD3"
          cursor="help"
          title={FACE_UP_TITLE}
          aria-label={FACE_UP_TITLE}
        >
          {FACE_UP_BADGE}
        </Tag>
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
            animation={`${chipFly} ${anim.chipFlyDur}s cubic-bezier(0.2, 0.8, 0.3, 1) both`}
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
              ? `${snuffValuePulse} ${anim.compareDur.gold}s ease-out ${anim.compareDelay}s both`
              : comparePulse === "dim"
                ? `${loserDim} ${anim.compareDur.dim}s ease-out ${anim.compareDelay}s both`
                : comparePulse === "neutral"
                  ? `${neutralPulse} ${anim.compareDur.neutral}s ease-out ${anim.compareDelay}s both`
                  : valueFx?.displayValue != null
                    ? `${valueTick} ${anim.valueTickDur}s ease-out both`
                    : undefined
          }
          sx={comparePulse || valueFx?.displayValue != null ? NO_MOTION : undefined}
        >
          {/* One text node (#1608): the boost suffix appearing beside a bare
              value node trips React under browser translation. */}
          {`${valueFx?.displayValue ?? card.effectiveValue}${card.boosts.length ? ` (+${card.boosts.length} boost)` : ""}`}
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
 *  `pointerEvents="none"`; mounts with the strike so its animation plays once. */
const StrikeRing = ({
  variant,
  delay,
  dur,
  left,
}: {
  variant: StrikeVariant;
  delay: number;
  /** the ring's own animation duration (STRIKE_RING_DUR, scaled by pace). */
  dur: number;
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
      animation={`${shield ? strikeShield : strikeImpact} ${dur}s ease-out ${delay}s both`}
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

/** The reveal beat + running combat math, straight from the server view. The
 *  strike beat (#381) rides on top: when `strike` is set, the attack card lunges
 *  and slams the defense card, the panel shakes, and a ring flashes — all sequenced
 *  by CSS delay off the flip and gated on the caller (visual-fx off ⇒ null). Every
 *  one of those durations/delays is derived ONCE from `factor` via
 *  `scaledCombatAnimTiming` (combatAnimTiming.ts) and threaded down, so a slower
 *  Combat pace genuinely slows the motion, not just how long the panel lingers
 *  after it. The stage ticker (#380) sits below the slots; the outcome line reads
 *  from combatOutcome.ts (incl. the no-winner case, #545). */
const CombatPanel = ({
  combat,
  catalog,
  resolveCard,
  you,
  selfCommitted,
  attackerCardbackUrl,
  defenderCardbackUrl,
  strike,
  valueFx,
  clashRef,
  chain,
  effectAttack,
  defenderCallout,
  attackerCallout,
  compact = false,
  fighterName,
  factor = 1,
}: {
  combat: ViewCombat;
  catalog: Record<string, CardMeta>;
  resolveCard: ResolveCard;
  you: PlayerView["you"];
  selfCommitted: CardInstanceId | null;
  /** each side's deck cardback for the face-down slot (#735) — resolved by the
   *  caller from the SAME combat this panel renders (may be the frozen hold
   *  snapshot, not the live view's). */
  attackerCardbackUrl?: string;
  defenderCardbackUrl?: string;
  strike?: CombatStrike | null;
  /** math beat (#382): per-role chips + ticking pill value (undefined ⇒ off). */
  valueFx?: CombatValueFx;
  /** the clash point (seam between the cards) — the arc launches from here. The
   *  page owns the ref and reads its rect at launch time (#382). */
  clashRef?: React.Ref<HTMLDivElement>;
  /** live sub-attack CHAIN progress (#596 ↔ engine #359), when this combat is a
   *  synthetic followup: names the parent card and which hit of the chain this is.
   *  Null/undefined for an ordinary combat and for a lone unnamed sub-attack. */
  chain?: SubAttackChainProgress | null;
  /** effect-initiated attack marker (#671 ↔ engine #463, protocol v32): this combat
   *  was opened by `{op:'attackWith'}` with a LINKED printed card, outside any
   *  action. Null/undefined for every declared combat. */
  effectAttack?: EffectAttackTag | null;
  /** the defender is not the fighter that was attacked. Two ways in: a card moved
   *  the DEFENDING FIGHTER mid-combat (#681 ↔ engine #494, protocol v34 — Ripley's
   *  *GET BEHIND ME*), or the combat OPENED against a fighter the attacker never
   *  declared against (#694 — Grievous's Multi-Arm Barrage Combat 2, whose target
   *  is picked at commit time). Either way the cards do not move — the slots below
   *  are unchanged — which is precisely why the panel has to say it in words. The
   *  caller picks the wording; this just draws it. Null for an ordinary combat. */
  defenderCallout?: { tag: string; full: string } | null;
  /** v36 attacker takeover tag ("<name> attacks instead"). */
  attackerCallout?: { tag: string; full: string } | null;
  /** phone sheet (mobile step 3): smaller slots until the reveal, so the card
   *  picker under the panel still fits, plus a "who attacks whom" line. */
  compact?: boolean;
  fighterName?: (id: FighterId) => string;
  /** Combat pace (lib/pro/pace.ts) as a plain multiplier — 1 = today's pace. The
   *  ONE place the panel derives its CSS clock (combatAnimTiming.ts) from the
   *  player's setting; every animation below reads from `anim` instead of a fixed
   *  1× literal, so a slower pace stretches the motion itself, not just how long
   *  the panel stays mounted (that's combatTiming.ts, a separate clock). */
  factor?: number;
}) => {
  const attackerCommitted = combat.stage !== "COMMIT_ATTACK";
  const pastReveal = !["COMMIT_ATTACK", "COMMIT_DEFENSE"].includes(combat.stage);
  // The attacker played their card FACE UP (#772 ↔ engine #555): it is on the table,
  // public to everyone, with the defender still to choose. Inferred from the view's
  // shape — the wire carries no marker — by the one shared helper.
  const faceUpAttack = isFaceUpPreRevealAttack(combat);
  const anim = scaledCombatAnimTiming(factor);
  const attackAnim = strike
    ? `${STRIKE_ATTACK_KF[strike.variant]} ${anim.strikeLungeDur}s cubic-bezier(0.3, 0, 0.2, 1) ${anim.strikeDelay}s both`
    : undefined;
  const defenseAnim = strike
    ? `${STRIKE_DEFENSE_KF[strike.variant]} ${anim.strikeReactDur}s cubic-bezier(0.2, 0.8, 0.3, 1) ${anim.strikeContactDelay}s both`
    : undefined;
  // The panel shakes at the contact moment; the ring flashes there too. Blocked
  // flashes a shield on the defense card (right), win/tie an impact ring at the seam.
  const ring = strike ? (
    <StrikeRing
      variant={strike.variant}
      delay={anim.strikeContactDelay}
      dur={anim.strikeRingDur}
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
      animation={
        strike ? `${strikeShake} ${anim.strikeShakeDur}s ease-in-out ${anim.strikeContactDelay}s both` : undefined
      }
      sx={strike ? NO_MOTION : undefined}
    >
      {/* The tag row wraps: a combat can wear several of these at once (chain +
          effect-attack + "now defending: <fighter>"), and the redirect tag is the
          long one — a name it cannot fit is a name the defender cannot read. */}
      <Flex gap="0.5rem" alignItems="center" mb="0.5rem" flexWrap="wrap">
        <Tag colorScheme="red" size="sm">
          COMBAT
        </Tag>
        {/* Chain progress (#596): engine #359's followup queue can open up to three
            of these back to back, each with its own defense window. Without an
            ordinal the defender cannot tell hit 2 from hit 3 — the synthetic faces
            are identical and the card that opened them is long gone from the table. */}
        {chain && (
          <Tag size="sm" bg="#B3232C" color="#FDF3E3" letterSpacing="0.03em">
            {chain.text}
          </Tag>
        )}
        {/* Effect-initiated attack (#671 ↔ engine #463). Every other combat on this
            panel was DECLARED by someone spending an action; this one opened on a
            turn edge with nothing declared, and its attack card is printed on
            another card rather than drawn — a defender who cannot find it in the
            opponent's 30 needs to be told why. The face itself needs no special
            path: the engine sends it face UP at COMMIT_DEFENSE, same as a drained
            sub-attack, and it resolves art through the ordinary catalog+snapshot
            route off the deck's `extraCards`. */}
        {effectAttack && (
          <Tag
            size="sm"
            bg="#1F6B2A"
            color="#F2EAD3"
            letterSpacing="0.03em"
            cursor="help"
            title={effectAttack.title}
            aria-label={effectAttack.title}
          >
            {effectAttack.text}
          </Tag>
        )}
        {/* Defender substitution (#681 ↔ engine #494, protocol v34). The combat
            card slots do NOT move with the fighter — the committed defense card
            stays where it was — so without this tag the only sign that a
            different figure is about to eat the damage is the board arrow
            quietly re-pointing between two frames. */}
        {attackerCallout && (
          <Tag
            size="sm"
            bg="#3B1D63"
            color="#F2EAD3"
            letterSpacing="0.03em"
            cursor="help"
            title={attackerCallout.full}
            aria-label={attackerCallout.full}
          >
            {attackerCallout.tag}
          </Tag>
        )}
        {defenderCallout && (
          <Tag
            size="sm"
            bg="#3B1D63"
            color="#F2EAD3"
            letterSpacing="0.03em"
            cursor="help"
            title={defenderCallout.full}
            aria-label={defenderCallout.full}
          >
            {defenderCallout.tag}
          </Tag>
        )}
      </Flex>
      {/* The defense picker's whole reason to exist (#772): when the attack was played
          FACE UP the defender is choosing with information, so the panel says WHAT they
          are defending against in words, above their hand, instead of making them read
          it off a card face they have never been shown before the reveal. "printed" is
          literal — `effectiveValue` at COMMIT_DEFENSE carries no boosts, and a hidden
          ability boost is deliberately invisible on the wire. */}
      {faceUpAttack && combat.defenderPlayer === you && combat.attackerCard && (
        <Text
          fontSize="0.8rem"
          mb="0.5rem"
          textAlign="center"
          color="brand.parchment"
          opacity={0.85}
        >
          Played face up: {cardTitle(catalog, combat.attackerCard.instance)} — printed value{" "}
          {combat.attackerCard.effectiveValue}. Choose your defense knowing it.
        </Text>
      )}
      {compact && fighterName && (
        <Text fontSize="0.85rem" fontWeight={700} mb="0.35rem" noOfLines={2}>
          {fighterName(combat.attacker)}{" "}
          <Text as="span" color="#E36B6B" fontWeight={600}>
            attacks
          </Text>{" "}
          {fighterName(combat.target)}
        </Text>
      )}
      <Flex gap="1rem" justifyContent="center" position="relative">
        <CombatSlot
          label="attack"
          width={compact && !pastReveal ? "5.25rem" : undefined}
          card={combat.attackerCard}
          faceUp={faceUpAttack}
          resolveCard={resolveCard}
          facedownInstance={
            !combat.attackerCard && combat.attackerPlayer === you ? selfCommitted : null
          }
          facedownState={attackerCommitted ? "committed" : "deciding"}
          catalog={catalog}
          cardbackUrl={attackerCardbackUrl}
          subAttackFace={
            chain
              ? { title: chain.label, note: `chain hit ${chain.hit}${chain.max ? ` of up to ${chain.max}` : ""}` }
              : undefined
          }
          strikeAnimation={attackAnim}
          valueFx={valueFx?.ATTACK}
          comparePulse={comparePulseFor(strike?.variant, "ATTACK")}
          anim={anim}
        />
        <CombatSlot
          label="defense"
          width={compact && !pastReveal ? "5.25rem" : undefined}
          card={combat.defenderCard}
          revealDelay={`${anim.defenseFlipDelay}s`}
          resolveCard={resolveCard}
          facedownInstance={
            !combat.defenderCard && combat.defenderPlayer === you && !pastReveal ? selfCommitted : null
          }
          facedownState={combat.stage === "COMMIT_DEFENSE" ? "deciding" : pastReveal ? "none" : "committed"}
          catalog={catalog}
          cardbackUrl={defenderCardbackUrl}
          strikeAnimation={defenseAnim}
          strikeVars={strike?.variant === "win" ? strikeKnockVars(strike.damage) : undefined}
          valueFx={valueFx?.DEFENSE}
          comparePulse={comparePulseFor(strike?.variant, "DEFENSE")}
          anim={anim}
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
      {combat.outcome && (
        // A no-winner resolve (UNKNOWN — the Doppelgänger, engine #303) used to be
        // suppressed here, so the panel went silent on a mechanic whose whole point
        // is the stalemate. It now says so, in the muted steel of the neutral
        // "tie" strike variant rather than the plain bold of a decided combat.
        <Text
          textAlign="center"
          mt="0.5rem"
          fontWeight="bold"
          color={isNoWinner(combat.outcome) ? "#B8C4CE" : undefined}
        >
          {combatOutcomeBannerText(combat.outcome, combat.attackDamageDealt)}
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
  // The endpoints were measured in viewport px; inside a contained frame
  // (#1678) this fixed layer is placed from the frame's corner instead.
  const frameEl = useProContained()?.el;
  if (arcs.length === 0) return null;
  const origin = containedOrigin(frameEl);
  const local = (p: DamageArc["from"]) => (frameEl ? { ...p, x: p.x - origin.left, y: p.y - origin.top } : p);
  return (
    <Box position="fixed" inset="0" pointerEvents="none" zIndex={205}>
      {arcs.map((raw) => {
        const arc = frameEl ? { ...raw, from: local(raw.from), to: local(raw.to) } : raw;
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

/** server hero id -> pretty display fallback ('king-kong' -> 'King Kong') */
export const prettyHeroId = (heroId: string) =>
  heroId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const heroNameOf = (heroes: HeroListing[] | null, heroId: string | null) => {
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
export const heroDeckMeta = (heroId: string): PopularDeckMeta | undefined => {
  const deckId = HERO_DECK_IDS[heroId];
  return POPULAR_DECKS.find((d) => d.id === deckId);
};
/** Spread into an animated element's `sx` to honor prefers-reduced-motion. */
export const NO_MOTION = {
  "@media (prefers-reduced-motion: reduce)": { animation: "none !important" },
} as const;

// ---------------------------------------------------------------------------
// The in-game view (issue #1678): state hook + render body
// ---------------------------------------------------------------------------

type DockPostGame = NonNullable<ComponentProps<typeof ProDock>["postGame"]>;

/**
 * What the page hosting a game adds around it: everything here is /pro/game's
 * own business (tournament chrome, rematch, the post-game cards, the account,
 * the custom-map submit link), computed by `LiveGame` and worn by the view.
 * All optional: an embedded view (`GameView`) passes none of it.
 */
export interface GameViewHost {
  tournament?: ReturnType<typeof useTournamentGame>;
  slowMode?: boolean;
  toggleSlowMode?: () => void;
  rematchHref?: string | null;
  rematchNegotiation?: RematchNegotiation | null;
  accountStatus?: DockPostGame["accountStatus"];
  accountState?: ReturnType<typeof useAccount>;
  copyReplayShareLink?: () => Promise<void>;
  sharingReplay?: boolean;
  earned?: DockPostGame["earned"];
  gameStats?: DockPostGame["stats"];
  clockMs?: DockPostGame["clockMs"];
  firstPlayer?: DockPostGame["firstPlayer"];
  nextUp?: DockPostGame["nextUp"];
  mapSubmit?: { map: ProMapDef; json: string } | null;
  setSubmitMapOpen?: (open: boolean) => void;
  submitMapOpen?: boolean;
  /** The error boundary's "leave" escape hatch. Omitted: no such button. */
  onLeave?: () => void;
}

/**
 * What the view offers besides playing the game. /pro/game has all of it; an
 * embedded puzzle turns off what it has no use for.
 *
 * (The ticket also lists "chat": Pro has no chat, so there is nothing to hide.)
 */
export interface GameViewFeatures {
  /** the Forfeit button / menu item and its confirmation */
  forfeit: boolean;
  /** "Undo last action" and the accept/reject dialog. Off: an incoming request is declined. */
  undo: boolean;
  /** the Rematch button / offer on the end screen (it navigates the page) */
  rematch: boolean;
  /** the report-bug chip, menu item and dialog */
  reportBug: boolean;
  /** the move-timer bars (the server still enforces a timed room's clock) */
  turnTimer: boolean;
  /** the end-of-game screen. Off: the dock simply goes away when the game is decided. */
  postGame: boolean;
  /** the sound / visual-fx chips (the stored settings still apply) */
  soundToggles: boolean;
  /** the "copy join link — room X" chip / menu item */
  roomLink: boolean;
  /** the "it's your move" nudge: chip, pulse, sound and the TAB TITLE cue */
  turnReminder: boolean;
  /** the tabletop (3D) board view and its toggle. Off: always the flat board. */
  tableBoard: boolean;
}

/** /pro/game: everything on. */
export const FULL_GAME_FEATURES: GameViewFeatures = {
  forfeit: true,
  undo: true,
  rematch: true,
  reportBug: true,
  turnTimer: true,
  postGame: true,
  soundToggles: true,
  roomLink: true,
  turnReminder: true,
  tableBoard: true,
};

/**
 * The default for a CONTAINED view: the game itself is all there, and what
 * reaches outside the panel is off — Rematch and the room link navigate to
 * /pro/game, the turn reminder writes the tab title, and the tabletop board
 * (a lazy chunk + WebGL, sized for a whole screen) stays out of a panel.
 */
export const CONTAINED_GAME_FEATURES: GameViewFeatures = {
  ...FULL_GAME_FEATURES,
  rematch: false,
  roomLink: false,
  turnReminder: false,
  tableBoard: false,
};

const NO_HOST: GameViewHost = {};

export const useGameViewState = ({
  socket,
  slowMode,
  features = FULL_GAME_FEATURES,
}: {
  socket: UseProSocketReturn;
  slowMode: boolean;
  features?: GameViewFeatures;
}) => {
  // The contained frame this view is mounted in (#1678), or null on /pro/game.
  // Read through a ref by the window-level key listeners below.
  const frameEl = useProContained()?.el ?? null;
  const frameElRef = useRef(frameEl);
  frameElRef.current = frameEl;
  const { incomingUndo, respondToUndo, slowModeHeld, snapshot, sendAction, roomId, revealState, serverRestarting, undoPending, undoRejected, acknowledgeUndoRejected, undoUnavailable, acknowledgeUndoUnavailable, serverError, acknowledgeServerError, rateLimited, acknowledgeRateLimited, illegalAction, acknowledgeIllegalAction, resyncing, ownTimerExpired, acknowledgeOwnTimerExpired } = socket;
  // Combat pace (player feedback: combat reads too fast to follow) — a per-device
  // multiplier applied to the VISUAL combat sequence (reveal, damage arc, damage
  // beat, settle dwell, math-beat chips). Deliberately separate from slow mode:
  // slow mode paces how fast SERVER batches apply (queuing), pace scales how long
  // the client's own animations take once a batch has already landed — see the
  // gotcha note in lib/pro/useProSocket.ts's drainApplyQueue.
  const [pace, cyclePace] = usePace();
  const paceScale = paceFactor(pace);
  // Turn reminder (player request: "I play matches alongside other things and
  // forget it's my move") — the per-device setting, default ON. The hook that
  // actually times the wait and fires the nudge is wired up below, once `view`
  // and `soundOn` (useGameFx) exist.
  const [turnReminderOn, toggleTurnReminder] = useTurnReminderSetting();
  // Read through refs inside the log effect: adding either to that effect's deps
  // would re-run it without a new snapshot and append the last batch's lines
  // twice. `slowModeHeldRef` is what pins the spotlight to the batch the player
  // is actually reading — see the capture below.
  const slowModeRef = useRef(slowMode);
  slowModeRef.current = slowMode;
  const slowModeHeldRef = useRef(slowModeHeld);
  slowModeHeldRef.current = slowModeHeld;
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // Dock-armed relocation (engine #535; review of #748): the board never
  // relocates on a bare click — the dock's "Start maneuver elsewhere" row arms
  // the mode, and only an armed click may send RELOCATE_FIGHTER. The armed state
  // is the FIGHTER whose origins are showing (#764), so a seat with two
  // relocating fighters gets one row each and the dashed picks always belong to
  // a named fighter. Auto-disarm whenever that fighter's offers end (commit,
  // phase change, the once-per-maneuver ledger) so the mode never outlives its
  // dock row — note it no longer watches `selectedFighter`: arming is what
  // selects, not the other way round. This hook lives with the others ON
  // PURPOSE: the page's snapshot guard returns early below, and hooks must run
  // on every render.
  const [relocateArmed, setRelocateArmed] = useState<FighterId | null>(null);
  useEffect(() => {
    const stillOffered =
      relocateArmed != null &&
      snapshot?.view?.turnPhase === "MANEUVER_MOVE" &&
      snapshot.legalActions.some(
        (a) => a.type === "RELOCATE_FIGHTER" && a.fighter === relocateArmed
      );
    if (!stillOffered) setRelocateArmed(null);
  }, [snapshot, relocateArmed]);
  // Incremental-maneuver stepping (issue #285): the LOCAL hop-by-hop preview for
  // the selected fighter, scoped to that fighter so it never leaks across a
  // re-selection. null = no preview in flight (fresh). Nothing is sent until the
  // move commits — the whole accumulated path lands as one MOVE_FIGHTER.
  const [step, setStep] = useState<{ fighter: FighterId; state: StepState } | null>(null);
  // Incremental EFFECT movement (issue #654): the local walk of a CHOOSE_SPACE move
  // prompt, keyed by promptId so a new prompt (or an answered one) always starts
  // fresh. Nothing here has been sent — the route only reaches the server on commit.
  const [promptStep, setPromptStep] = useState<{ promptId: string; state: StepState } | null>(null);
  // First space tapped in a two-tap LARGE-fighter move pick (issue #132), scoped
  // to the prompt it belongs to so a stale anchor never leaks into the next one.
  const [poseAnchor, setPoseAnchor] = useState<{ promptId: string; space: SpaceId } | null>(null);
  // Snake-step disambiguation (issue #658). Walking a LARGE body is a single-choice
  // gesture everywhere except one spot: a space BOTH ends of the body could lead
  // into (or a far destination offered under several final poses). `space` is that
  // click, `key` scopes it to the walk it belongs to (fighter id for a maneuver,
  // promptId for an effect move) so it can never leak into the next one. The
  // candidates themselves are recomputed from the graph, never cached.
  const [poseChoice, setPoseChoice] = useState<{ key: string; space: SpaceId } | null>(null);
  // "Who would move here" cues (issue #320 follow-up). `hoveredSpace`/`hoveredFighter`
  // are pointer-only (touch never sets them). `moveChoice` is the touch-safe
  // ambiguity resolver: a move space reachable by >1 of your fighters anchors here
  // instead of silently moving the first one, and the next fighter click commits.
  const [hoveredSpace, setHoveredSpace] = useState<SpaceId | null>(null);
  const [hoveredFighter, setHoveredFighter] = useState<FighterId | null>(null);
  const [moveChoice, setMoveChoice] = useState<{ space: SpaceId; candidates: FighterId[] } | null>(null);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  // Opening-hand mulligan (issue #622 ↔ engine #395): the answer this seat has
  // already sent, latched by promptId so the buttons can't be fired twice while
  // the answering STATE is in flight and so the waiting line can say which way
  // you went. Cleared whenever no mulligan window is open, so a reopened window
  // (rewind/resume) always starts undecided.
  const [mulliganAnswer, setMulliganAnswer] = useState<{ promptId: string; choice: MulliganChoice | null } | null>(null);
  const mulliganWindowOpen = isMulliganPrompt(snapshot?.prompt);
  useEffect(() => {
    if (!mulliganWindowOpen) setMulliganAnswer(null);
  }, [mulliganWindowOpen]);
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
      // An embedded panel (#1678) only answers keys while focus is inside it.
      if (!containedOwnsKeys(frameElRef.current)) return;
      const action = soleActionRef.current;
      if (!action) return; // 0 or 2+ options, prompt open, or not your turn
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      // A modal/dialog (ForfeitDialog, etc.) owns the keyboard while open — never
      // fire the shortcut underneath one. Chakra portals mark them aria-modal, and
      // so does slow mode's action spotlight (#703): while the player is reading a
      // held batch, no action may fire under it.
      if (containedScope(frameElRef.current)?.querySelector('[aria-modal="true"]')) return;
      e.preventDefault(); // stop page scroll and a native re-fire if the button has focus
      sendAction(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendAction]);
  // Number hotkeys 1–9 fire the dock's rows (issue #514) — the multi-option
  // counterpart to the spacebar above, and built the same way: one window
  // listener reading a ref, so it never re-binds per snapshot. The ref holds the
  // rows in RENDERED (post-sort) order, so a digit always fires the row wearing
  // that chip. Only dock rows are ever in the ref — Undo, Forfeit, and prompt
  // options are unreachable by digit on purpose.
  const hotkeyActionsRef = useRef<Action[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Leave browser/OS chords (⌘1 tab switching, alt-digit) alone.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!/^[1-9]$/.test(e.key)) return;
      // Same focus rule as the spacebar: two panels never share a digit.
      if (!containedOwnsKeys(frameElRef.current)) return;
      const action = hotkeyActionsRef.current[Number(e.key) - 1];
      if (!action) return; // fewer rows than that, prompt open, or not your turn
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      // A modal/dialog — or the action spotlight (#703) — owns the keyboard while
      // open. Same guard as the spacebar above.
      if (containedScope(frameElRef.current)?.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
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

  // Atomic position swaps (protocol v31 ↔ engine #445). A separate channel from
  // the move tween on purpose: a swap has NO route, so it must not glide, and
  // the tween above deliberately ignores the fighters named here. Both seats'
  // figures play it — a swap is never a move the viewer committed.
  const positionSwaps = usePositionSwaps(snapshot);
  // Defender substitution (protocol v34 ↔ engine #494 — Ripley's *GET BEHIND
  // ME*). The view already re-points `combat.target` on its own, so this channel
  // exists to SAY SO: without it the attack arrow silently jumps to a fighter
  // nobody attacked and the damage lands on the wrong-looking figure. Held for
  // as long as the view agrees the substitution stands, not on a timer.
  const defenderSwap = useDefenderSwap(snapshot);
  const attackerSwap = useAttackerSwap(snapshot);
  // The DECLARED target of the live attack action (issue #694). The hook above only
  // sees substitutions INSIDE a combat; this one is what catches an attack that
  // opened somewhere else entirely — Grievous's Multi-Arm Barrage picks Combat 2's
  // target at commit time, so the second combat arrives against a fighter the
  // player never declared against and no v34 event is emitted at all.
  const combatTargeting = useCombatTargeting(snapshot);
  // Art fetch (unbrewed-api, matched by title against the server catalog) —
  // must run unconditionally; no-ops until the first STATE arrives.
  // Equipped cosmetics, decoded once per snapshot from each seat's opaque
  // `cosmetics` blob (issue #615). PURELY DECORATIVE and total: an unparseable
  // blob, an unknown hash and a seat that published nothing all resolve to base
  // art. `hideCosmetics` is the player's own "hide opponent cosmetics" setting;
  // it drops OTHER seats' loadouts and never their own.
  const [hideCosmetics, toggleHideCosmetics] = useHideOpponentCosmetics();
  const cosmetics = useMemo(
    () => seatCosmetics(snapshot?.view.players, { hideOthers: hideCosmetics }),
    [snapshot, hideCosmetics]
  );
  const { resolveCard, resolveHero, resolveRuleCards, resolveFighterToken } = useProCardArt(
    snapshot ? heroIdsForArt(snapshot.view) : [],
    snapshot?.view.catalog ?? {},
    cosmetics
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
  // v38 secret marks (issue #1453): the board's fighters with THIS viewer's visible
  // marks folded onto their bearers, so the Marked badge rides the status pipeline on
  // the flat board and the table alike. The same array when no seat has a mark.
  const boardFighters = useMemo(
    () => (snapshot ? withSecretMarkStatuses(snapshot.view.fighters, visibleSecretMarks(snapshot.view), snapshot.view.you) : []),
    [snapshot]
  );

  // Registry of fighter-token DOM elements, populated by ProBoard's tokens, read at
  // arc-launch time to measure the defender's viewport rect (#382). A Map ref rather
  // than state so registration never re-renders.
  const fighterElsRef = useRef<Map<string, HTMLElement>>(new Map());
  // The combat panel's clash point (seam between the cards) — the arc's launch origin.
  const clashRef = useRef<HTMLDivElement | null>(null);

  // Sounds + transient board visuals, derived by diffing snapshots (useGameFx). The
  // refs let the damage-arc (#382) measure its endpoints at launch. `paceScale`
  // stretches the arc's launch/flight and how long a board overlay stays legible.
  const { boardFx, arcs, hurtKey, soundOn, visualOn, toggleSound, toggleVisual } = useGameFx(
    snapshot,
    { fighterEls: fighterElsRef, clashRef },
    paceScale
  );

  // Turn reminder (player request: "I play matches alongside other things and
  // forget it's my move") — nudges this seat once its turn, or a combat
  // defense it owes, has sat untouched for a while. `soundOn` is the SAME
  // setting the HUD's speaker chip flips; `turnReminderOn` is its own
  // per-device toggle (default ON, surfaced in the HUD as a bell chip).
  // `snapshot?.view ?? null` rather than destructuring — this hook has to run
  // unconditionally, before the pre-game early return below ever narrows
  // `snapshot`.
  const { pulse: turnReminderPulse } = useTurnReminder({
    view: snapshot?.view ?? null,
    legalActionCount: snapshot?.legalActions.length ?? 0,
    enabled: turnReminderOn && features.turnReminder,
    soundOn,
  });

  // Combat callouts (issue #162): full-screen turn/defend/reveal flourishes.
  // Decorative-only; a separate hook so the board-FX loop above stays
  // byte-identical. `paceScale` stretches the reveal stagger + each callout's
  // on-screen life.
  const combatCallouts = useCombatCallouts(snapshot, paceScale);

  // The strike beat (issue #381): after the flip settles, the attack card slams
  // the defense card and it reacts by outcome. `lingeringCombat` freezes a combat
  // that resolves+ends in one batch so the panel survives long enough to play it.
  // `paceScale` stretches the strike's life and the panel's linger/hold together —
  // the #517 invariant holds at every pace (see scaledCombatTiming).
  const { strike, lingeringCombat, lingerHold } = useCombatStrike(snapshot, paceScale);
  // The same beat for the tabletop's 3D minis (#962): who lunges at whom, and
  // when, on the panel's own (paced) clock — the minis lunge and recoil with
  // the cards. Presentation only.
  const liveCombat = snapshot?.view.combat ?? null;
  const tableStrike = useMemo((): TableStrike | null => {
    // Only the combat the strike itself resolved — never a chained next one.
    const pair = strike ? combatForStrike(strike, lingeringCombat, liveCombat) : null;
    if (!strike || !pair) return null;
    const t = scaledCombatAnimTiming(paceScale);
    return {
      key: strike.key,
      attacker: pair.attacker,
      target: pair.target,
      variant: strike.variant,
      damage: strike.damage,
      lungeDelayMs: t.strikeDelay * 1000,
      lungeMs: t.strikeLungeDur * 1000,
      contactMs: t.strikeContactDelay * 1000,
      reactMs: t.strikeReactDur * 1000,
    };
  }, [strike, lingeringCombat, liveCombat, paceScale]);

  // The math beat (issue #382): value modifiers fly in as chips onto the value
  // pill, which ticks toward the effective value; paced through the shared battle
  // timeline. Purely decorative — gated off (raw values shown) when visual-fx is
  // off OR reduced motion is requested (the count-up is motion too), exactly like
  // the strike. `paceScale` stretches the chip run and count-up cadence too.
  const combatValueFx = useCombatValueFx(snapshot, paceScale);
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

  // Pinch/scroll zoom + drag pan on the board (issue #120), now the default
  // interaction: the board fills the whole stage and the fixed HUD/hand/dock
  // float over it (issue #450). Turning the flag off falls back to the old
  // boxed, padded board — no transform, no gestures.
  const [zoomMapOn] = useFlag("zoomMap");
  // Board presentation (tabletop board view phase 1): flat (default) or
  // tabletop, per device — same game, same socket, same handlers; only which
  // board component renders below changes.
  const [preferredBoardView, toggleBoardView] = useBoardView();
  // Which arrangement this viewport gets (issue #708). Desktop (>= 62em) is the
  // floating-overlay layout below, untouched; anything narrower mounts the
  // mobile arrangement of the same components. Read via matchMedia rather than
  // Chakra's useBreakpointValue, which touches `window` during the static
  // prerender of this page and fails the export — see lib/pro/useProLayout.
  const { mobile, rail, mode } = useProLayout();
  // A portrait phone always draws the flat board (#870): the tabletop has no
  // counter-rotation for the 90°-turned portrait frame. The stored preference
  // is untouched, so turning back to landscape returns to the tabletop. A map
  // with a region (Baba Yaga's Hut) no longer forces the flat board (#922):
  // TableBoard renders its main spaces in 3D and floats the region as its own
  // 2D inset panel.
  const wantedBoardView = features.tableBoard ? resolveBoardView(preferredBoardView, mode) : "flat";
  // The tabletop's code is its own chunk (#893): fetched the first time the
  // tabletop is wanted — at mount for a device that stored it, which is still
  // in the lobby — and the flat board stays up until it has arrived, so the
  // switch never shows an empty stage.
  const TableBoard = useLazyTableBoard(wantedBoardView === "table");
  const boardView = wantedBoardView === "table" && !TableBoard ? "flat" : wantedBoardView;
  // Pre-rendered miniatures for the tabletop view (lib/pro/figures): the
  // owner's private set (git-ignored, absent on every deploy) and the
  // committed open-licence set (#903). A hero without a figure keeps its
  // token standee. Fetched only once the tabletop is shown: the flat board
  // draws no figures (#877).
  const { private: privateFigures, open: openFigures } = useFigureManifests(boardView === "table");
  const figureManifests = useMemo(() => ({ private: privateFigures, open: openFigures }), [privateFigures, openFigures]);
  // 3D minis (#945/#953): null — no "3D minis" option — until the tabletop is
  // shown, and for good where WebGL is unavailable or the renderer failed.
  // The manifest is fetched only then, so the first page load is unchanged.
  const minis3dSource = useMinis3dSource(boardView === "table");
  // The viewer's figure style (#903, #953): 3D minis, a sprite set, or
  // tokens, picked from one dropdown. Offered only as the choices that change
  // something on THIS board — none at all when every hero here would be a
  // token anyway. Each hero then stands at its best available level under
  // the style: 3D mini → sprite mini → token.
  const [preferredFigureStyle, chooseFigureStyle] = useFigureStyle();
  const figureStyles = useMemo(
    () =>
      figureStyleOptions(
        figureManifests,
        Object.entries(ownerHeroIds).map(([seat, heroId]) => ({ heroId, seat })),
        minis3dSource
      ),
    [figureManifests, ownerHeroIds, minis3dSource]
  );
  const figureStyle = effectiveFigureStyle(preferredFigureStyle, figureStyles);
  const heroPiece = (seat: string) =>
    pieceForStyle(figureManifests, minis3dSource, figureStyle, ownerHeroIds[seat], seat);
  // The viewer's zone-disc preference for the tabletop (#1395): off by
  // default — the art carries the zones — and opaque discs when on.
  const [zoneDiscs, toggleZoneDiscs] = useZoneDiscs();
  // The tabletop HUD (lib/pro/tableHud): a landscape phone looking at the
  // tabletop board gets plates, a banner, a fanned hand and a hexagon instead
  // of the decision rail. The flat board keeps its rail, untouched.
  const hud = rail && boardView === "table";
  // The HUD's fit is arithmetic, so it needs the notch's width as a number.
  const safeArea = useSafeAreaInsets(hud);
  // The PERSISTENT mobile chrome is measured, not assumed — the HP-chip row
  // grows a timer bar, the bottom controls grow with the fan-peek. The decision
  // sheet, hand drawer and log sheet are deliberately NOT measured: they are
  // overlays over a full-bleed board, and re-fitting the map under each one
  // would make the board jump every time a prompt opened.
  const mobileChipsRef = useRef<HTMLDivElement>(null);
  const mobileControlsRef = useRef<HTMLDivElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const [mobileSheetShown, setMobileSheetShown] = useState(false);
  const mobileChipsH = useElementHeight(mobileChipsRef, mobile);
  // The desktop HUD's measured bottom: the Keen Hearing panel sits below it, however
  // many sidekick rows have grown the plates.
  const [hudOverlayEl, setHudOverlayEl] = useState<HTMLDivElement | null>(null);
  const hudBottom = useElementBottom(mobile ? null : hudOverlayEl);
  const mobileControlsH = useElementHeight(mobileControlsRef, mobile && !rail);
  // The decision sheet IS counted (unlike the hand drawer and the log): it is
  // force-open for whole stretches of a game, and a board centred behind it
  // sits half off-screen under a screenful of empty table.
  const mobileSheetH = useElementHeight(mobileSheetRef, mobile && !rail && mobileSheetShown);
  // px of the stage hidden behind that chrome, so the initial fit centers the
  // board in the part of the screen nothing is standing on. Mirrors the padding
  // the non-zoom fallback below still uses.
  const boardFitInset = useMemo(
    () =>
      hud
        ? tableHudFitInset({ sheetShown: mobileSheetShown, safe: safeArea })
        : boardFitInsetFor({
            mode,
            chipsH: mobileChipsH,
            controlsH: mobileControlsH,
            sheetH: mobileSheetH,
          }),
    [hud, mode, mobileChipsH, mobileControlsH, mobileSheetH, mobileSheetShown, safeArea]
  );
  // The activity log floats permanently on desktop; on mobile it is a sheet the
  // Log button opens. The hand is a drawer on mobile portrait (direction B) —
  // closed at rest, so the board keeps the whole screen.
  const [logOpen, setLogOpen] = useState(false);
  // "Which cards are gone?" is asked all game and decides whether an attack is
  // safe. Both piles are public; on a phone they used to sit two taps deep in a
  // seat sheet, so they get their own button next to the log (player feedback).
  const [discardsOpen, setDiscardsOpen] = useState(false);
  const [handOpen, setHandOpen] = useState(false);

  // Choose-a-player card faces (issue #861 — The Narrator's Foreshadowing): the
  // CARD_REVEALEDs from the SAME STATE batch that opened the current prompt,
  // keyed by promptId so an older batch's reveal can never attach to a later
  // prompt and a mid-prompt reconnect (no events replayed) simply finds none.
  const [promptReveals, setPromptReveals] = useState<{ promptId: string; reveals: RevealedCard[] } | null>(null);
  useEffect(() => {
    const p = snapshot?.prompt;
    const mine = p && p.player === snapshot?.view.you ? p : null;
    const reveals: RevealedCard[] = (snapshot?.events ?? []).flatMap((e) =>
      e.type === "CARD_REVEALED" ? [{ player: e.player, card: e.card }] : [],
    );
    setPromptReveals((prev) => {
      if (!mine) return null;
      if (prev?.promptId === mine.promptId) return reveals.length ? { promptId: mine.promptId, reveals } : prev;
      return reveals.length ? { promptId: mine.promptId, reveals } : null;
    });
  }, [snapshot]);

  // Activity feed: diff each view against the previous one (see gameLog.ts).
  const [logEntries, setLogEntries] = useState<ProLogEntry[]>([]);
  // Slow mode (#703): the batch the action spotlight is describing, tagged with
  // the snapshot it was computed from so the panel never renders stale text.
  const [spotlight, setSpotlight] = useState<{
    for: unknown;
    batch: ActionSpotlightBatch;
  } | null>(null);
  // The end reason (p2p #1397): GAME_ENDED rides in the final STATE's events
  // and nowhere else — it is not on the view, and the server omits events on
  // a reconnect — so it is captured the moment it arrives and kept for the
  // post-game panel. Null after a reload into a finished room: the panel
  // then omits the line rather than guess.
  const [gameEndReason, setGameEndReason] = useState<GameEndReason | null>(null);
  useEffect(() => {
    setGameEndReason(null);
  }, [roomId]);
  useEffect(() => {
    const reason = snapshot ? gameEndReasonOf(snapshot.events) : null;
    if (reason) setGameEndReason(reason);
  }, [snapshot]);

  const prevViewRef = useRef<PlayerView | null>(null);
  // Live sub-attack chain (issue #596): the ref is the running value the next batch
  // advances from; the state copy is what the combat panel renders.
  const chainRef = useRef<SubAttackChainState>(EMPTY_SUB_ATTACK_CHAIN);
  const [chain, setChain] = useState<SubAttackChainState>(EMPTY_SUB_ATTACK_CHAIN);
  // Last Keen Hearing reveal, kept for its panel (U3); folded per STATE batch in
  // useProSocket (lib/pro/revealedHand.ts), not from `snapshot`.
  const revealedHand = revealState.panel;
  const logSeqRef = useRef(0);
  // One monotonic id per appended STATE batch (issue #298) — every line of a
  // batch shares it, so the log panel groups a single player action together.
  const logBatchRef = useRef(0);
  useEffect(() => {
    if (!snapshot) return;
    const next = snapshot.view;
    // Same stable squad numbers the board badges carry (issue #560), so a feed
    // line about one of six identical clones names the exact token ("Clone
    // Trooper 3 takes 2 damage"). Off-board scope: the clone this batch just
    // defeated still has to be nameable in its own death line.
    const logBadges = squadBadges(next.fighters, { includeOffBoard: true });
    const diff = diffViews(
      prevViewRef.current,
      next,
      (c) => cardLabel(next.catalog, c),
      snapshot.events,
      (f) => badgedFighterName(next.fighters, logBadges, f.id)
    );
    // Sub-attack CHAIN bookkeeping (issue #596 ↔ engine #359). Runs here because
    // this is the one effect that already sees BOTH views of a batch, and the
    // parent card of a chain is only readable in the pre-batch one. `before` is the
    // count entering the batch, so the n-th followup this batch dispatches is hit
    // `before + n + 1`.
    const before = chainRef.current;
    const after = advanceSubAttackChain(before, prevViewRef.current, next, snapshot.events);
    chainRef.current = after;
    setChain(after);
    const chainTitle = parentCardTitle(next.catalog, after.parent);
    // Decoratively enrich with the engine's structured events for THIS batch —
    // tags discards with their reason and logs scheduled/delayed effects, value
    // changes, and gained actions. No events → same as diffViews. See enrichLines.
    const enriched =
      snapshot.events.length
        ? enrichLines(diff, snapshot.events, {
            label: (source) => resolveEventSource(next, source),
            you: next.you,
            seat: (player) => seatLabel(next, player),
            fighter: (id) => badgedFighterName(next.fighters, logBadges, id),
            heroOf: (player) => next.players.find((p) => p.id === player)?.heroId,
            combatCards: combatCardsOf(prevViewRef.current),
            chain: (ordinal) =>
              subAttackChainProgress(chainTitle, before.hits + ordinal + 1)?.text ?? null,
          })
        : diff;
    // A batch that spent an action but produced nothing visible (an empty-deck
    // draw that moves no one — issue #509) would otherwise drop out entirely,
    // leaving a spent action with zero trace in the feed. Fall back to a
    // minimal line so the action still renders as its own labeled group.
    const fallback =
      enriched.length === 0
        ? actionFallbackLine(snapshot.events, next.you, (player) => seatLabel(next, player))
        : undefined;
    const lines = fallback ? [fallback] : enriched;
    // Tag against the PRE-batch view, so a broadcast whose turn number went
    // BACKWARDS (undo rewind, resume/correction) files under the turn it
    // interrupted instead of minting an out-of-place TURN section (issue #522).
    const { turn, turnActor } = batchTurnTag(prevViewRef.current, next);
    prevViewRef.current = next;
    const phase = batchPhase(snapshot.events);
    // Slow mode (issue #703): the action spotlight is rendered from THESE lines —
    // the feed's own text for this batch — so the two can never diverge. Captured
    // only while the toggle is on, so an ordinary session does no extra render
    // work at all.
    //
    // ONLY for the batch the socket is actually holding. Every other applied
    // snapshot — a flush's trailing batches, and above all the cap overflow that
    // keeps the board moving behind the panel — must leave the description the
    // player is mid-read alone. Getting this wrong is what made the spotlight
    // appear to advance on its own after a busy bot turn.
    if (slowModeRef.current && slowModeHeldRef.current === snapshot) {
      const actor = batchActor(snapshot.events);
      setSpotlight({
        for: snapshot,
        batch: {
          lines,
          events: snapshot.events,
          phase,
          actor: actor ? seatLabel(next, actor) : null,
        },
      });
    }
    if (lines.length === 0) return;
    const ts = Date.now();
    const batchId = logBatchRef.current++;
    // Prepend the batch whole (newest group on top) but keep the batch's lines
    // in emission order so a single action reads chronologically top-down —
    // attack → reveal → outcome → damage → discards (issue #402). diffViews
    // emits the combat lifecycle before damage; enrichLines' additions trail
    // the batch, which is correct once the batch is no longer reversed.
    setLogEntries((cur) =>
      [
        ...lines.map((l) => ({ ...l, key: `log-${logSeqRef.current++}`, ts, turn, turnActor, batchId, phase })),
        ...cur,
      ].slice(0, 120)
    );
  }, [snapshot]);

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

  // No undo UI in this view (#1678): an opponent's request must not hang on a
  // dialog that is never shown, so it is declined at once.
  const undoOffered = features.undo;
  useEffect(() => {
    if (!undoOffered && incomingUndo) respondToUndo(false);
  }, [undoOffered, incomingUndo, respondToUndo]);

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

  // Illegal action (p2p #840): the reducer rejected our last action — a stale
  // view, or a double-tap's second send. The socket is open and the board is
  // exactly as it was, so this is a one-shot notice like SERVER_ERROR, never
  // the "We lost your game" screen. Stable id: a tap burst makes one toast.
  useEffect(() => {
    if (!illegalAction) return;
    toast.error(proErrorMessage("ILLEGAL_ACTION"), { id: "pro-illegal-action" });
    acknowledgeIllegalAction();
  }, [illegalAction, acknowledgeIllegalAction]);

  // Stale-view resync (p2p #848): repeated rejections with no STATE in between
  // made useProSocket ask the server for a fresh view (a RECONNECT on the live
  // socket). Hold a "refreshing" toast until that STATE lands, then flip the
  // same toast to a one-line all-clear so the player knows why the board moved.
  // Mirrors the reconnecting-toast pattern above; never the loss screen.
  const wasResyncingRef = useRef(false);
  useEffect(() => {
    const id = "pro-resync";
    if (resyncing) {
      toast.dismiss("pro-illegal-action"); // superseded — the resync IS the answer
      toast.loading("Board out of date — refreshing from the server…", { id });
      wasResyncingRef.current = true;
    } else if (wasResyncingRef.current) {
      wasResyncingRef.current = false;
      toast.success("Board refreshed.", { id });
    }
    return () => toast.dismiss(id);
  }, [resyncing]);

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

  return { lingeringCombat, lingerHold, chain, soleActionRef, hotkeyActionsRef, relocateArmed, defenderSwap, attackerSwap, combatTargeting, ownerTokenState, ownerHeroIds, resolveFighterToken, cosmetics, mulliganAnswer, promptReveals, poseAnchor, promptStep, selectedFighter, hoveredFighter, step, setPromptStep, setStep, poseChoice, moveChoice, hoveredSpace, setPoseChoice, setPendingMove, setSelectedFighter, setRelocateArmed, setPoseAnchor, setMoveChoice, setHandOpen, mobile, hud, rail, resolveCard, resolveHero, resolveRuleCards, soundOn, visualOn, toggleSound, toggleVisual, hideCosmetics, toggleHideCosmetics, pace, cyclePace, boardView, toggleBoardView, mode, figureStyles, figureStyle, chooseFigureStyle, zoneDiscs, toggleZoneDiscs, heroPiece, turnReminderOn, toggleTurnReminder, setReportBugOpen, strike, mobileSheetShown, handOpen, boardFighters, boardFx, pendingMove, incomingMove, positionSwaps, clearIncoming, setHoveredSpace, setHoveredFighter, zoomMapOn, boardFitInset, tokenLifeOn, tokenGestures, fighterElsRef, reducedMotion, combatValueFx, clashRef, paceScale, iForfeited, gameEndReason, setForfeitOpen, mobileSheetRef, setMobileSheetShown, TableBoard, tableStrike, hurtKey, arcs, combatCallouts, turnReminderPulse, mobileChipsRef, setHudOverlayEl, spotlight, forfeitOpen, setIForfeited, setMulliganAnswer, discardsOpen, setDiscardsOpen, revealedHand, hudBottom, logEntries, logOpen, setLogOpen, reportBugOpen, mobileControlsRef };
};

export type GameViewState = ReturnType<typeof useGameViewState>;

export const GameViewBody = ({
  socket,
  state,
  host = NO_HOST,
  features = FULL_GAME_FEATURES,
  opponentHand,
}: {
  socket: UseProSocketReturn;
  state: GameViewState;
  host?: GameViewHost;
  features?: GameViewFeatures;
  /**
   * The opponent's hand, shown face up beside the board (a puzzle, #1678).
   * Until the server carries it on the view (an optional `hand` on
   * `view.opponent` in puzzle rooms) the caller passes it here; once it does,
   * the view's own copy is used when this is omitted.
   */
  opponentHand?: CardInstanceId[] | null;
}) => {
  const { snapshot, seatPresence, opponentConnected, heroes, respondToPrompt, sendAction, status, roomId, turnTimer, roomInfo, slowModeHeld, replayBundle, undoPending, requestUndo, slowModePending, advanceSlowMode, skipSlowMode, incomingUndo, respondToUndo } = socket;
  const { lingeringCombat, lingerHold, chain, soleActionRef, hotkeyActionsRef, relocateArmed, defenderSwap, attackerSwap, combatTargeting, ownerTokenState, ownerHeroIds, resolveFighterToken, cosmetics, mulliganAnswer, promptReveals, poseAnchor, promptStep, selectedFighter, hoveredFighter, step, setPromptStep, setStep, poseChoice, moveChoice, hoveredSpace, setPoseChoice, setPendingMove, setSelectedFighter, setRelocateArmed, setPoseAnchor, setMoveChoice, setHandOpen, mobile, hud, rail, resolveCard, resolveHero, resolveRuleCards, soundOn, visualOn, toggleSound, toggleVisual, hideCosmetics, toggleHideCosmetics, pace, cyclePace, boardView, toggleBoardView, mode, figureStyles, figureStyle, chooseFigureStyle, zoneDiscs, toggleZoneDiscs, heroPiece, turnReminderOn, toggleTurnReminder, setReportBugOpen, strike, mobileSheetShown, handOpen, boardFighters, boardFx, pendingMove, incomingMove, positionSwaps, clearIncoming, setHoveredSpace, setHoveredFighter, zoomMapOn, boardFitInset, tokenLifeOn, tokenGestures, fighterElsRef, reducedMotion, combatValueFx, clashRef, paceScale, iForfeited, gameEndReason, setForfeitOpen, mobileSheetRef, setMobileSheetShown, TableBoard, tableStrike, hurtKey, arcs, combatCallouts, turnReminderPulse, mobileChipsRef, setHudOverlayEl, spotlight, forfeitOpen, setIForfeited, setMulliganAnswer, discardsOpen, setDiscardsOpen, revealedHand, hudBottom, logEntries, logOpen, setLogOpen, reportBugOpen, mobileControlsRef } = state;
  const {
    tournament,
    slowMode = false,
    toggleSlowMode,
    rematchHref = null,
    rematchNegotiation = null,
    accountStatus = "loading",
    copyReplayShareLink,
    sharingReplay = false,
    accountState,
    earned,
    gameStats,
    clockMs,
    firstPlayer,
    nextUp,
    mapSubmit = null,
    setSubmitMapOpen,
    submitMapOpen = false,
    onLeave,
  } = host;
  // Null on /pro/game. Inside a frame the view fills the frame, not the screen.
  const frame = useProContained();
  const contained = frame !== null;
  // The portrait controls row (Log · Played · hand peek · menu) needs 390px. A
  // narrower FRAME drops the two button labels (the icons and aria-labels
  // stay) so the menu is not pushed past the panel's edge.
  const iconOnlyControls = frame !== null && frame.width < 390;
  if (!snapshot) return null;

  const { view, legalActions, prompt } = snapshot;
  // Sub-attack chain progress for the combat ON THE TABLE (issue #596 ↔ engine
  // #359). Non-null only while that combat is a SYNTHETIC followup — an ordinary
  // combat never wears a chain tag — and only when there is something worth naming
  // (a lone Grievous droid shot stays unlabeled; see subAttackChainProgress).
  // Reads the lingering combat too, so the tag survives the linger snapshot the
  // strike beat renders after a combat resolves.
  // While a HOLD is active (#602) the frozen combat keeps the panel even though a
  // new one is live, so a chained attack's commit can't yank the previous combat's
  // faces out from under its still-flying damage arc. Outside a hold this is exactly
  // `view.combat ?? lingeringCombat` as before. Presentation only — nothing else in
  // the page (legal actions, prompts, the defender's decision buttons) reads it.
  const panelCombat = panelCombatFor(view.combat, lingeringCombat, lingerHold);
  const chainCombat = panelCombat;
  const combatChain =
    chainCombat?.attackerCard && isSubAttackInstance(chainCombat.attackerCard.instance)
      ? subAttackChainProgress(parentCardTitle(view.catalog, chain.parent), chain.hits)
      : null;
  // Effect-initiated attack tag (#671 ↔ engine #463, protocol v32). Gated off the
  // attack card's instance id, exactly as the chain tag is — a linked printed card
  // is `<cardDefId>#linked` — so it needs no cross-batch bookkeeping and it follows
  // the lingering combat through the strike beat for free.
  const combatEffectAttack = effectAttackTagFor(view.catalog, panelCombat?.attackerCard?.instance);
  const myTurn = view.activePlayer === view.you;
  const multiplayerView = view.players.length > 2;
  // Forfeit is offered ONLY through the legal-action surface (unbrewed-engine
  // #117): the engine enumerates FORFEIT in the seat's legalActions exactly while
  // it may forfeit — on its own clock, live, not yet eliminated. Gating the dock
  // button on this (rather than re-deriving duel-vs-multiplayer rules client-side)
  // means it renders in every format the engine allows and vanishes the instant
  // the seat is out of turn order, with no seat-count/seat-id special-casing.
  const canForfeit = features.forfeit && legalActions.some((a) => a.type === "FORFEIT");
  // Eliminated-and-spectating: a continuing game (no winner) where every fighter
  // this seat owns is swept. True after your own forfeit in team/ffa play and
  // after a team-game combat death — either way you watch the board play on.
  const myFighters = view.fighters.filter((f) => f.owner === view.you);
  const iAmSpectating = !view.winner && myFighters.length > 0 && myFighters.every((f) => f.defeated);
  // Team affiliation (issue #195): the viewer's team (self + ally) for the board's
  // shared ring. Empty in duel/ffa/older-server views → the board draws no ring.
  const friendlyOwners = deriveTeams(view.players, view.you).friendlyOwners;
  const activeTurnLabel = myTurn ? "YOUR TURN" : `${playerLabel(view, view.activePlayer).toUpperCase()} TURN`;
  // At-a-glance dock banner for dropped players (issue #222). In multiplayer the
  // seat-identified presence map is authoritative (multiple seats can drop
  // independently); duel keeps the coarse boolean untouched. The per-seat card
  // badge + countdown live in ProHud — this is just the banner copy.
  const droppedSeats = Object.keys(seatPresence).length;
  const disconnectedLabel = multiplayerView
    ? droppedSeats > 1
      ? `${droppedSeats} players disconnected`
      : droppedSeats === 1
      ? "player disconnected"
      : null
    : opponentConnected
    ? null
    : "opponent disconnected";
  // RESPOND_PROMPT renders through the PromptPanel; MOVE_FIGHTER,
  // RELOCATE_FIGHTER (engine #535 — the server offers ONE PER candidate origin
  // space) and PLACE_SIDEKICK render as clickable board spaces — listing one
  // button per destination just floods the sidebar (and card actions live on
  // the hand). FORFEIT: engine #32 enumerates it in legalActions during PLAY
  // (its isMember gate needs it there), but we render it ONLY through the
  // confirm-gated dock button — a raw one-click sidebar entry would be the
  // exact misfire we guard. One shared list (lib/pro/actionDock) so this filter
  // and `soleAction` can never disagree on what a dock action is.
  const listActions = legalActions.filter((a) => !NON_DOCK_ACTION_TYPES.includes(a.type));
  // The one dock action a spacebar press may fire (issue #353): eligible only
  // when, ignoring FORFEIT, exactly one legal action remains and it's a dock
  // action with no prompt open. Synced into the ref the keydown listener reads.
  const sole = soleAction(legalActions, prompt);
  soleActionRef.current = sole;
  // Grouped + numbered dock rows (issue #514). Combat-first ordering with
  // dividers; hotkeys assigned after the sort. A live prompt owns the keyboard,
  // so the digits go inert while one is open — the rows themselves still render.
  const dockActionRows = dockRows(listActions);
  hotkeyActionsRef.current = prompt
    ? []
    : dockActionRows.filter((r) => r.hotkey != null).map((r) => r.action);

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
  // the wrong one. Badge the matching token with a number and append it to the
  // button label, so "with Raptor 2" visibly points at the #2 token.
  const nameOf = (id: FighterId) => fighterName(view.fighters, id);
  //
  // Issue #560 makes that numbering PERSISTENT and STABLE. #161 (and its v28
  // move-chooser extension) numbered by first-seen order among the open prompt's
  // candidates, so the badges vanished with the prompt and "Clone Trooper 2" could
  // be a different token next turn — with a six-clone squad that's the whole
  // problem, since the summon lands in the ATTACKER's zone and "Same heart, same
  // blood" cares which clone sits at 1 HP. squadBadges numbers off the engine id
  // instead and derives the set from the roster, so every same-named board-mate is
  // badged at all times and the numbers never reshuffle. See lib/pro/squadNumbers.
  const attackerBadge = squadBadges(view.fighters);
  /** A fighter's name with its stable squad number, when it has one ("Larry 2"). */
  const badgedName = (id: FighterId) => badgedFighterName(view.fighters, attackerBadge, id);

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
  // Maneuver-ORIGIN relocation (engine #535 ↔ protocol 34): while maneuvering, the
  // server offers one RELOCATE_FIGHTER per space the selected fighter may START its
  // maneuver from. A free teleport, not a step — and Dean's ruling keeps the
  // server's offers the single source of truth, so the board never guesses: the
  // dashed origin picks (the cyan `relocateSpaces`) exist ONLY while the dock's
  // "Start maneuver elsewhere" row has armed the mode. Unarmed, the board behaves
  // exactly as if the trait were absent — an adjacent origin stays an ordinary
  // (free-step) click, and no relocation is ever sent from a bare board click.
  // Every offered space draws the pick, adjacent ones included: a relocation is
  // free, so "relocate next door, then walk" is a real line. Empty whenever
  // disarmed — eligibility is never computed here.
  //
  // #764: the ROWS come from the offers, not from `selectedFighter`. #747 read
  // the selection, so on a solo seat (Jason, DOPE) the affordance only existed
  // after clicking the one token on the board and the whole feature read as
  // broken. Derived in lib/pro/relocateMode so both the visibility rule and the
  // labels are unit-pinned.
  const relocateMode = deriveRelocateMode({
    turnPhase: view.turnPhase,
    legalActions,
    armed: relocateArmed,
    nameOf: badgedName,
  });
  const relocateActions = relocateMode.armedTarget?.originActions ?? new Map<SpaceId, Action>();
  const relocateSpaces = [...relocateActions.keys()];
  // The defender substitution, rendered (protocol v34 ↔ engine #494). One copy
  // helper feeds all three surfaces — the board chip, the combat-panel tag and
  // the log line — so they can never word the same fact differently. Names come
  // from `badgedName`, which is what every other fighter-naming surface uses, so
  // a substitution between two same-named sidekicks still names the right one.
  //
  // TWO SOURCES, ONE STATEMENT. `defenderSwap` is the mid-combat substitution beat
  // (v34's event); `defenderRedirect` is the standing declared-vs-actual fact, which
  // covers the bonus attack that opened elsewhere (#694). The substitution wins when
  // both are live — it is the more specific description of the same fighter — and it
  // is asked of the combat each surface actually draws: the panel keeps a frozen
  // combat through the strike beat, the board follows the live view.
  const defenderSwapCopy = defenderSwap
    ? defenderSwapText(
        badgedName(defenderSwap.from),
        badgedName(defenderSwap.to),
        defenderChangeKind(defenderSwap)
      )
    : null;
  // The attacker-side takeover (protocol v36), same three channels: dock tag,
  // board ring + chip, log line. Retired by the hook when `combat.attacker` moves on.
  const attackerSwapCopy = attackerSwap
    ? attackerSwapText(badgedName(attackerSwap.from), badgedName(attackerSwap.to))
    : null;
  const boardAttackerStepIn =
    attackerSwap && attackerSwapCopy
      ? { fighterId: attackerSwap.to, chip: attackerSwapCopy.chip, blurb: attackerSwapCopy.full }
      : null;
  const redirectCopy = (combat: ViewCombat | null) => {
    if (defenderSwapCopy) return null;
    const r = defenderRedirect(combatTargeting, combat);
    return r
      ? { to: r.to, ...defenderSwapText(badgedName(r.from), badgedName(r.to), "REDIRECTED") }
      : null;
  };
  const panelRedirect = redirectCopy(panelCombat);
  const boardRedirect = redirectCopy(view.combat);
  /** what the combat panel tags — substitution first, else the redirect. */
  const combatDefenderTag = defenderSwapCopy ?? panelRedirect;
  /** which board token gets the violet ring + chip, and what it says. */
  const boardDefenderStepIn =
    defenderSwap && defenderSwapCopy
      ? { fighterId: defenderSwap.to, chip: defenderSwapCopy.chip, blurb: defenderSwapCopy.full }
      : boardRedirect
        ? { fighterId: boardRedirect.to, chip: boardRedirect.chip, blurb: boardRedirect.full }
        : null;
  // Board-token art for one fighter. Hoisted out of the <ProBoard> call so the
  // dock's attack rows (issue #514) paint the SAME face the board does — one
  // resolver, so a flag-driven portrait swap can never show two different heads.
  const fighterTokenArt = (f: ViewFighter): string | null => {
    // A flag-driven portrait swap (Thetis tide) wins for the HERO token;
    // otherwise fall back to the deck's fixed per-hero token art.
    const st = ownerTokenState[f.owner];
    if (f.kind === "HERO" && st?.heroArtUrl) return st.heroArtUrl;
    const heroId = ownerHeroIds[f.owner];
    return heroId ? resolveFighterToken(heroId, f.kind) : null;
  };
  // Cosmetic rim tier for a hero's board token (issue #613/#615). PURELY
  // DECORATIVE: it rides BESIDE `fighterTokenArt` above rather than inside it,
  // so a hero-state portrait swap keeps deciding the picture and this only ever
  // adds chrome around it. Sidekicks are deferred (design doc §10b), so the
  // whole chain starts at the HERO check. Seat-keyed rather than hero-keyed —
  // `ViewFighter` carries an owner, so a mirror match paints each seat's own
  // rim — with the local `pro:cosmetics:debug` registry behind it for any seat
  // that published no blob.
  const fighterTokenRim = (f: ViewFighter): CosmeticRimTier | null => {
    if (f.kind !== "HERO") return null;
    return tokenRimForSeat(cosmetics, f.owner, ownerHeroIds[f.owner]);
  };
  // A board OBJECT that came from a fighter (protocol v26 `ViewToken.origin` —
  // Gerry's corpses) resolves through the SAME art path as a living token, so a
  // Larry's body on the board is recognisably that Larry. The fighter record is
  // still in `view.fighters` after the defeat (off-board, `defeated:true`), which is
  // why this can look it up at all. Card-placed objects (totems) carry no origin and
  // fall through to null, keeping their registry sprite.
  const originFighterOf = (t: ViewToken): ViewFighter | null => {
    const id = boardObjectOriginFighter(t);
    return id ? (fighterById.get(id as FighterId) ?? null) : null;
  };
  const boardObjectArt = (t: ViewToken): string | null => {
    const f = originFighterOf(t);
    return f ? fighterTokenArt(f) : null;
  };
  const boardObjectOriginName = (t: ViewToken): string | null => originFighterOf(t)?.name ?? null;
  /** Name + token art for a dock attack row; null when the view lost the fighter. */
  const fighterFace = (id: FighterId) => {
    const f = fighterById.get(id);
    return f ? { name: nameOf(id), artUrl: fighterTokenArt(f) } : null;
  };
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

  // Bought attack range (issue #668 ↔ engine #456). Cecil Palmer's rule card lets a
  // declaration SPEND Broadcast tokens for extra reach, and engine RULING R5 keeps
  // that off the wire entirely: `legalActions` just contains an attack on a fighter
  // three spaces away, and the tokens are auto-deducted the instant it is declared.
  // So the client reprices the server's own offers with the SAME predicate the engine
  // enumerated them with (lib/pro/rangePurchase.ts), purely to say what it costs
  // BEFORE the click. We explain what the server offered; we never re-check legality,
  // and a cost we cannot derive simply annotates nothing.
  const boughtRange = boughtRangeAttacks(view, legalActions);
  const rangePurchaseChip = (a: Action) => {
    if (a.type !== "DECLARE_ATTACK") return null;
    const b = boughtRange.find((x) => x.attacker === a.attacker && x.target === a.target);
    return b ? { chip: boughtRangeChip(b), blurb: boughtRangeBlurb(b) } : null;
  };
  // The BOARD price is looked up through `attackActions` rather than over the whole
  // offer list, because a board click sends exactly ONE of a target's offers (that
  // map is keyed by target, last write wins — the #161 ambiguity the dock exists to
  // resolve). Pricing the same action the click will send is what keeps the chip
  // honest when two of Cecil's fighters can reach one enemy at different prices —
  // e.g. Khoshekh adjacent for free while Cecil pays 2 to cross the room.
  const boughtRangeTargets = [...attackActions.values()].flatMap((a) => {
    const priced = rangePurchaseChip(a);
    return priced && a.type === "DECLARE_ATTACK" ? [{ id: a.target, ...priced }] : [];
  });

  // Prompts answer via the board too: a CHOOSE_SPACE option names its space in
  // option.id (place ops), option.data.space, or option.label (token ops label
  // a token's space, e.g. destroy-totem); CHOOSE_TARGET options a fighter id.
  // Board-answerable options become highlights; the rest stay panel buttons.
  const promptForMe = prompt && prompt.player === view.you ? prompt : null;
  // Opening-hand mulligan (issue #622 ↔ engine #395). On the wire it is an
  // ordinary prompt, but it is a one-time whole-attention decision, so it renders
  // as a modal (MulliganDialog) instead of a dock panel — and is suppressed from
  // the panel below so it lives in exactly ONE place. Every other prompt kind,
  // and every server that never opens this window, is untouched.
  const mulliganPrompt = isMulliganPrompt(prompt) ? prompt : null;
  const mulliganAwaitsMe =
    !!mulliganPrompt &&
    mulliganPrompt.player === view.you &&
    mulliganAnswer?.promptId !== mulliganPrompt.promptId;
  const mapSpaceIds = new Set(view.map.spaces.map((s) => s.id));
  const fighterIds = new Set(view.fighters.map((f) => f.id));
  const optionSpace = (o: LegalOption): SpaceId | null => {
    if (mapSpaceIds.has(o.id)) return o.id;
    const dataSpace = (o.data as { space?: string } | undefined)?.space;
    if (dataSpace && mapSpaceIds.has(dataSpace)) return dataSpace;
    if (mapSpaceIds.has(o.label)) return o.label;
    return null;
  };
  // space -> optionIdS. Until protocol v26 this was a space -> ONE optionId map,
  // justified by "tokens never share a space". v26 retired that assumption: board
  // objects no longer participate in occupancy, so two corpses — or a corpse and a
  // totem — can sit on one space, and a destroy-object prompt then offers SEVERAL
  // options naming the same space (`execDestroyToken` labels each option with its
  // token's space). The old Map silently kept the last of them, which made one
  // offered object unclickable and left its button stranded in the panel.
  //
  // So: key the FULL list. A space with exactly one option answers on click exactly
  // as before; an ambiguous space stays highlighted (its objects are still what the
  // prompt is about) but every one of its options falls through to the panel, where
  // `boardObjectOptionLabel` below tells them apart — a board click cannot express
  // "the older of the two corpses here" and must not guess.
  const promptSpaceMap = buildPromptSpaceMap(
    promptForMe?.kind === "CHOOSE_SPACE" ? promptForMe.options : [],
    (o) => optionSpace(o as LegalOption)
  );
  const promptSpaceOptions = promptSpaceMap.bySpace as Map<SpaceId, string[]>;
  /** Only the spaces whose click is unambiguous — the ones a board click can answer. */
  const promptUnambiguousSpaces = promptSpaceMap.unambiguous as Map<SpaceId, string>;
  const promptSpaceIds = [...promptSpaceOptions.keys()];
  /**
   * Panel label for a CHOOSE_SPACE option that names a board OBJECT. The engine
   * labels these with the object's SPACE, which is ambiguous exactly when it matters
   * (two corpses on one space read as two identical "s12" buttons). Re-label from the
   * live token so kind and countdown are visible; options that aren't objects, or
   * whose token the view no longer holds, keep the server's own label untouched.
   */
  const tokensById = new Map((view.tokens ?? []).map((t) => [t.id, t]));
  const boardObjectOptionLabel = (o: LegalOption): string => {
    const tokenId = (o.data as { tokenId?: string } | undefined)?.tokenId;
    const token = tokenId ? tokensById.get(tokenId) : undefined;
    if (!token) return o.label;
    const visual = boardObjectVisualFor(token);
    const name = boardObjectOriginName(token);
    const turns = token.ownerTurnsRemaining;
    const life = turns === undefined || turns === null ? "" : ` · ${turns} turn${turns === 1 ? "" : "s"} left`;
    return `${visual.label}${name ? ` of ${name}` : ""} at ${token.space}${life}`;
  };
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
  // Pick-a-player reveals (issue #861): a CHOOSE_TARGET whose options ALL name a
  // player (option.data.player) and whose batch carried a CARD_REVEALED for each
  // of those players — The Narrator's Foreshadowing shape. Render each target's
  // revealed card as a face with a seat caption instead of an A1/B1 button.
  // Anything else (Choose Opponent with no reveals in its batch, fighter/space
  // targets) yields [] and keeps today's rendering.
  const promptRevealMatches =
    promptReveals && promptForMe && promptReveals.promptId === promptForMe.promptId
      ? revealedPlayerPickOptions(promptForMe, promptReveals.reveals)
      : [];
  const promptRevealCardOptions = promptRevealMatches.map((o) => {
    const seat = view.players.find((p) => p.id === o.player);
    const name = seat ? seatNameplate(seat, view.players.length) : o.player.toUpperCase();
    const rel = deriveTeams(view.players, view.you).relationOf(o.player);
    const suffix = rel === "ally" ? " (ally)" : "";
    return { id: o.id, instance: o.instance, caption: `${name}${suffix}` };
  });
  // Two-space (LARGE fighter) move choice (issue #132): a card's "move up to N
  // spaces" effect on Triceratops emits CHOOSE_SPACE options encoded as
  // "<head>|<tail>" pairs, which optionSpace can't resolve — so instead of a wall
  // of opaque "s12|s13" buttons, parse the pairs and light up the board. The pick
  // is a two-tap gesture (poseAnchor) resolved by resolvePoseClick in onSpaceClick.
  const poseOptions = parsePoseOptions(promptForMe, mapSpaceIds);
  const poseIndex = buildPoseIndex(poseOptions);
  const activePoseAnchor =
    promptForMe && poseAnchor?.promptId === promptForMe.promptId ? poseAnchor.space : null;
  // Only UNAMBIGUOUS space options count as board-answered; every option sharing a
  // space with another falls through to the panel (see promptSpaceOptions above).
  const promptBoardIds = new Set([
    ...promptUnambiguousSpaces.values(),
    ...promptTargetIds,
    ...poseOptions.map((p) => p.optionId),
    ...promptCardOptions.map((c) => c.id),
    ...promptRevealCardOptions.map((c) => c.id),
  ]);
  const promptButtonOptions = disambiguateLabels(
    promptForMe
      ? promptForMe.options
          .filter((o) => !promptBoardIds.has(o.id))
          .map((o) => ({ ...o, label: boardObjectOptionLabel(o) }))
      : []
  );
  // ---- Incremental EFFECT movement (issue #654 ↔ engine #411) ----------------
  // A CHOOSE_SPACE move prompt now carries the mover's own step graph, so a card /
  // scheme move ("move up to 3 spaces") is WALKED one space at a time — exactly like
  // a maneuver (#285) — and answered ONCE with the route taken, because for several
  // cards (Chicken Legs, Stampede, Batman, Keaton) the route IS the effect. No graph
  // (older server, placement/token prompt) ⇒ every line below goes null and the
  // one-click prompt flow is byte-for-byte what it was.
  // #658: a LARGE mover walks POSES, so its graph arrives under its own field and is
  // folded into the very same MoveGraph shape (nodes keyed "<lead>|<trail>"). Exactly
  // one of the two is ever present for a given prompt.
  const promptLargeGraph =
    promptForMe?.kind === "CHOOSE_SPACE" ? promptForMe.largeMoveGraph ?? null : null;
  const promptGraphRaw =
    promptForMe?.kind === "CHOOSE_SPACE"
      ? promptForMe.moveGraph ?? (promptLargeGraph ? poseGraph(promptLargeGraph) : null)
      : null;
  // Where the mover's body starts: a space for a NORMAL fighter, the ordered pose
  // (head, tail) for a LARGE one — which orientation leads is the first step's job.
  const promptMover = promptGraphRaw
    ? view.fighters.find((f) => f.id === promptGraphRaw.fighter) ?? null
    : null;
  const promptMoverNode =
    promptMover?.space == null
      ? null
      : promptMover.tailSpace
        ? poseNode(promptMover.space, promptMover.tailSpace)
        : promptMover.space;
  // The prompt's own OPTIONS are the authoritative resting places (the engine builds
  // `canStop` from exactly that set); projecting them onto the graph means a space
  // the prompt doesn't offer can never be committed to, whatever the graph says. A
  // LARGE prompt offers POSES, so the projection is by order-independent pose key —
  // the walked pose and the offered destination cover the same two spaces whichever
  // end happened to lead.
  const promptGraph =
    promptGraphRaw && promptMoverNode
      ? restrictStops(
          promptGraphRaw,
          promptLargeGraph
            ? poseOptions.map((o) => poseStopKey(poseNode(o.spaces[0], o.spaces[1])))
            : promptSpaceIds
        )
      : null;
  const promptStepState: StepState | null =
    promptGraph && promptForMe && promptMoverNode
      ? promptStep &&
        promptStep.promptId === promptForMe.promptId &&
        promptStep.state.origin === promptMoverNode
        ? promptStep.state
        : startStepping(promptMoverNode)
      : null;
  // "Walking" = at least one hop previewed. Fresh, the prompt looks and behaves
  // exactly as it did before this ticket.
  const promptStepWalking = !!(promptGraph && promptStepState && !isStepFresh(promptStepState));
  // While walking the board offers only the next legal hops (which include
  // pass-through spaces you may cross but not stop on); fresh, it keeps the full
  // offered-destination highlight so a far one-click still answers in one click.
  const promptStepHighlights: SpaceId[] | null =
    promptGraph && promptStepState && promptStepWalking
      ? legalNextSteps(promptGraph, promptStepState).map(leadOf)
      : null;
  const promptStepRemaining =
    promptGraph && promptStepState ? stepRemaining(promptGraph, promptStepState) : 0;
  const promptStepCanCommit = !!(
    promptGraph &&
    promptStepState &&
    canCommitStep(promptGraph, promptStepState)
  );
  // The ghost's route while walking — nothing sent, purely a local preview.
  const promptPreviewMove: PendingMove | null =
    promptGraph && promptStepState && promptStepWalking
      ? {
          fighterId: promptGraph.fighter,
          path: stepCommitPath(promptStepState),
          trailPath: stepCommitTrailPath(promptStepState),
        }
      : null;
  /** The server's canonical path to `space`, from the option that offers it. A LARGE
   *  prompt names its destinations by POSE, not by space, and carries no per-option
   *  route — so a far one-click there keeps answering with the option id alone (the
   *  server walks its own canonical path, exactly as it always has) and only the
   *  near, one-hop clicks become a walk. */
  const promptOptionPath = (space: SpaceId): SpaceId[] | null => {
    if (promptLargeGraph) return null;
    const optionId = promptUnambiguousSpaces.get(space);
    const option = optionId ? promptForMe?.options.find((o) => o.id === optionId) : undefined;
    const path = (option?.data as { path?: SpaceId[] } | undefined)?.path;
    return Array.isArray(path) && path.length > 0 ? path : null;
  };

  // issue #412: state the move budget on a CHOOSE_SPACE *move* prompt (the
  // "Move up to N spaces" summary rides in `prompt.description`). A LARGE mover's
  // pose prompt is always a move; other CHOOSE_SPACE prompts are detected by the
  // description's move verb. null for placement/token prompts (keep their copy).
  // While a route is being walked (#654) the same line also counts down what is
  // LEFT, recomputed from the live step state after every hop.
  const promptBudgetLineBase = moveBudgetLine(promptForMe, poseIndex.size > 0);
  const promptBudgetLine = promptStepWalking
    ? steppingBudgetLine(promptBudgetLineBase, promptStepRemaining)
    : promptBudgetLineBase;

  // issue #663 — Skull Kid's Clock Tower. The five mitigation yes/no prompts all carry
  // the SAME static engine label, so the client supplies the running reduction that
  // makes them decidable. Pure and view-shaped: null for every prompt in every other
  // game (see lib/pro/clockTower.ts), so it is computed unconditionally.
  const promptNoteLine = clockTowerMitigationLine(prompt, view.players, view.you);

  // Prompt attribution (protocol v10, issue #35 / #147 / #151): `prompt.source`
  // names WHAT opened this prompt and is sent to BOTH players — a resolving card
  // (`{ card }`, face public to both) or a hero ability (`{ hero }`). We show the
  // asking card + an "Effect of …" line to chooser AND spectator alike.
  const promptSource = prompt?.source ?? null;
  const sourceCardInstance =
    promptSource && "card" in promptSource ? promptSource.card : null;
  const sourceLabel: string | null = !promptSource
    ? null
    : emergenceCaption(prompt, snapshot?.events) ??
      ("card" in promptSource
        ? `Effect of ${cardTitle(view.catalog, promptSource.card)}`
        : `${heroNameOf(heroes, viewHeroIdOf(view, promptSource.hero)) ?? "Hero"}'s ability`);

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
  // scheme CHOOSE_SPACE moves and older servers leave `moveGraph` null → today's
  // one-click canonical-path move.
  // #658: LARGE (two-space) fighters step too — their graph is pose-shaped and rides
  // its own field, folded here into the same MoveGraph the machine walks. The body's
  // start "node" is the ordered pose (head, tail); the first hop picks which end leads.
  const selectedBody = selectedFighter != null
    ? view.fighters.find((f) => f.id === selectedFighter) ?? null
    : null;
  const selectedOrigin =
    selectedBody?.space == null
      ? null
      : selectedBody.tailSpace
        ? poseNode(selectedBody.space, selectedBody.tailSpace)
        : selectedBody.space;
  const moveGraph =
    view.turnPhase === "MANEUVER_MOVE" && selectedFighter != null
      ? view.moveGraphs?.find((g) => g.fighter === selectedFighter) ??
        (() => {
          const large = view.largeMoveGraphs?.find((g) => g.fighter === selectedFighter);
          return large ? poseGraph(large) : null;
        })()
      : null;
  /** True while the selected/prompted mover walks POSES rather than spaces. */
  const largeStepping = !!(moveGraph && isPoseGraph(moveGraph));
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
    moveGraph && stepState && !isStepFresh(stepState)
      ? legalNextSteps(moveGraph, stepState).map(leadOf)
      : null;
  // The ghost's route (nothing sent yet) — only once at least one hop is taken. A
  // LARGE walk also carries the previewed body's trailing end, so the ghost shows the
  // whole two-space body rather than just the end that is leading.
  const previewMove: PendingMove | null =
    moveGraph && stepState && selectedFighter && !isStepFresh(stepState)
      ? {
          fighterId: selectedFighter,
          path: stepCommitPath(stepState),
          trailPath: stepCommitTrailPath(stepState),
        }
      : null;
  // Board-level stepping affordance state (issue #285): only meaningful once a
  // hop is previewed (previewMove non-null). `stepMovesLeft` counts remaining
  // hops; `stepCanEnd` gates the "End move here" commit on a legal resting spot.
  const stepMovesLeft = moveGraph && stepState ? stepRemaining(moveGraph, stepState) : 0;
  const stepCanEnd = !!(moveGraph && stepState && canCommitStep(moveGraph, stepState));

  // ---- Snake-step disambiguation (issue #658 ↔ engine #415) -----------------
  // Walking a LARGE body is a single-choice gesture everywhere but one click: a
  // space BOTH ends could lead into (first hop only — after that the leading end is
  // fixed and the trail just follows), or a far destination the server offers under
  // several final poses. `applyClick` refuses to guess and hands back the candidate
  // poses; the player settles it by clicking the space the body should KEEP.
  /** Every MOVE_FIGHTER route the server enumerated to `space` for this mover. */
  const canonicalManeuverPaths = (space: SpaceId): SpaceId[][] =>
    (spaceActions.get(space) ?? []).flatMap((a) =>
      a.type === "MOVE_FIGHTER" && a.fighter === selectedFighter ? [a.path] : []
    );
  /** The walk that currently owns board clicks: an open move prompt's, else the
   *  selected fighter's maneuver. Null when nothing is being stepped. */
  const stepWalk =
    promptForMe && promptGraph && promptStepState
      ? {
          key: promptForMe.promptId,
          graph: promptGraph,
          state: promptStepState,
          canonical: (space: SpaceId) => promptOptionPath(space),
          commitFarJump: true,
          advance: (st: StepState) => setPromptStep({ promptId: promptForMe.promptId, state: st }),
          commit: (st: StepState) => commitPromptStep(st),
        }
      : moveGraph && stepState && selectedFighter
        ? {
            key: selectedFighter,
            graph: moveGraph,
            state: stepState,
            canonical: canonicalManeuverPaths,
            commitFarJump: false,
            advance: (st: StepState) => setStep({ fighter: selectedFighter, state: st }),
            commit: (st: StepState) => commitStep(st),
          }
        : null;
  const resolveStepClick = (space: SpaceId) =>
    stepWalk
      ? applyStepClick(stepWalk.graph, stepWalk.state, space, stepWalk.canonical(space), {
          commitFarJump: stepWalk.commitFarJump,
        })
      : null;
  // The open pose pick, re-derived from the graph rather than cached: nothing about
  // the walk can change while it is open, so the click that raised it still resolves
  // to the same candidates.
  const poseChoiceOptions: PoseChoice[] =
    stepWalk && poseChoice?.key === stepWalk.key
      ? (() => {
          const res = resolveStepClick(poseChoice.space);
          return res?.type === "choosePose" ? res.options : [];
        })()
      : [];
  const poseChoiceHint =
    poseChoiceOptions.length > 0
      ? `this move can end with your body in ${poseChoiceOptions.length} positions — click the gold space it should KEEP`
      : null;

  // Board copy for an open prompt. #658: once a LARGE mover carries a pose graph the
  // move is WALKED, so the old "click the second gold space to finish the move" is
  // gone from the primary flow — it survives only while the two-tap fallback is
  // actually anchored (a far head several poses could end on), and for a graph-less
  // pose prompt (older server, placement/SETUP_TAIL), which still works exactly as
  // it always did.
  const promptBoardHint =
    // A pose pick already has its own line in the dock — don't say it twice.
    poseChoiceHint !== null
      ? null
      : poseIndex.size > 0
        ? activePoseAnchor
          ? "click the second gold space to finish the move"
          : promptGraph
            ? "click a near gold space to step one at a time, or a far one to move straight there"
            : `click a gold space to move (${poseIndex.size} destination${poseIndex.size === 1 ? "" : "s"})`
        : promptSpaceIds.length > 0
          ? `click a gold space on the board (${promptSpaceIds.length} option${promptSpaceIds.length === 1 ? "" : "s"})`
          : promptTargetIds.length > 0
            ? "click a pulsing fighter on the board"
            : null;

  const highlightedSpaces =
    // #658: an open pose pick owns the board outright — only the two (or more)
    // spaces that answer it are lit, so the question can't be misread.
    poseChoiceOptions.length > 0
      ? poseChoiceOptions.map((o) => o.pose.trail)
      : [
          ...(stepHighlights ??
            [...spaceActions.entries()]
              .filter(([, actions]) => matchesFighter(actions, focusFighter).length > 0)
              .map(([space]) => space)),
          // #654: mid-route, the offered destinations give way to the next legal hops.
          ...(promptStepHighlights ?? promptSpaceIds),
          // #658: once the LARGE body is being WALKED the next legal hops are the
          // whole story — the offered destinations (and the old two-tap pose pick,
          // which survives only as the far-click fallback) step aside.
          ...(poseIndex.size > 0 && !promptStepWalking
            ? poseHighlights(poseIndex, activePoseAnchor)
            : []),
        ];
  // While a pose pick is open the mover's own body spaces ARE the answer, so its
  // token must forward clicks to the space beneath (ProBoard only does that for a
  // token that isn't itself a click target) — drop it from the fighter highlights.
  const highlightedFighters = [
    ...attackActions.keys(),
    ...movableFighters,
    ...promptTargetIds,
  ].filter((id) => poseChoiceOptions.length === 0 || id !== stepWalk?.graph.fighter);

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
  // Why the dashed rings are on the board (engine #535). Only while the mode is
  // armed (the rings only exist then); never states a rule — the server already
  // decided what is offered.
  const relocateHint = relocateMode.armedTarget
    ? `tip: click a dashed space to start the maneuver there`
    : null;

  // Commit the walked effect-move route as ONE prompt answer (issue #654): the
  // option we ended on plus the route actually taken, so `passedThrough` (the
  // "each fighter it moved through" cards) reflects where the player really went.
  // One answer = one prompt window, one log line, one undo unit, and one multi-hop
  // FIGHTER_MOVED for the opponent's tween.
  const commitPromptStep = (state: StepState) => {
    if (!promptForMe || !promptGraph) return;
    const path = stepCommitPath(state);
    const dest = path[path.length - 1];
    // A LARGE walk answers with the DESTINATION POSE's own option id (the two final
    // spaces, whichever end led) — the id the prompt already offered; a NORMAL one
    // answers with the destination space's.
    const pose = previewPose(state);
    const optionId = pose
      ? poseIndex.optionFor(pose.lead, pose.trail)
      : promptUnambiguousSpaces.get(dest);
    if (!optionId || path.length < 2) return; // never answer with a route we can't name
    // A dropped repeat of the answer already in flight (#847) gets no tween.
    if (!respondToPrompt(promptForMe.promptId, optionId, path)) return;
    setPromptStep(null);
    setPoseChoice(null);
    setPendingMove({
      fighterId: promptGraph.fighter,
      path,
      trailPath: stepCommitTrailPath(state),
    });
  };

  // Commit the accumulated incremental-maneuver walk as ONE MOVE_FIGHTER (issue
  // #285): the engine already accepts arbitrary legal paths incl. revisits, so
  // the opponent sees a single multi-hop tween and it's one undo unit. The path
  // is client-constructed — MOVE_FIGHTER is the sanctioned exception to "only
  // send what the server offered".
  const commitStep = (state: StepState) => {
    if (!selectedFighter) return;
    // For a LARGE body this is the LEADING END's route — the engine reads the final
    // pose off its last two entries, so the tail needs no separate answer (#658).
    const path = stepCommitPath(state);
    // A send the hook dropped (a repeat of the move already in flight, #847)
    // gets no tween: nothing went out, so nothing is about to arrive.
    const sent = sendAction({ type: "MOVE_FIGHTER", player: view.you, fighter: selectedFighter, path });
    if (sent && path.length >= 2) {
      setPendingMove({ fighterId: selectedFighter, path, trailPath: stepCommitTrailPath(state) });
    }
    setStep(null);
    setPoseChoice(null);
    setSelectedFighter(null);
  };

  const onSpaceClick = (space: SpaceId) => {
    // Maneuver-ORIGIN relocation (engine #535) answers first ONLY while the dock
    // row armed the mode: it is its own gesture, never a hop — one click sends the
    // server's exact offered action, the figure is PLACED, and the mode disarms.
    // Unarmed the board click is untouched — the step machine, pose picks and move
    // answers below behave exactly as on main, and no relocation is ever sent
    // from a bare board click (review of #748; the pure dispatch is unit-pinned
    // in lib/pro/relocateMode).
    const relocateClick = resolveRelocateBoardClick({
      armed: relocateMode.armedTarget != null,
      space,
      originActions: relocateActions,
    });
    if (relocateClick.kind === "relocate") {
      sendAction(relocateClick.action);
      setStep(null); // any previewed walk is discarded — nothing was sent; the placement supersedes it
      setRelocateArmed(null);
      return;
    }
    if (relocateClick.kind === "ignored") return; // armed: the dashed origins are the only clickable spaces
    // #658: an open snake-step pose pick answers first — the click that raised it
    // could be read two ways, and this one says which body position was meant.
    if (poseChoiceOptions.length > 0 && stepWalk) {
      const picked = poseChoiceOptions.find((o) => o.pose.trail === space);
      setPoseChoice(null);
      if (picked) {
        if (picked.commit) stepWalk.commit(picked.state);
        else stepWalk.advance(picked.state);
        return;
      }
      // Not one of the two answers — the pick is dropped and the click is treated
      // as a fresh one below.
    }
    // Incremental stepping (#285 maneuver, #654 effect move, #658 LARGE bodies) owns
    // the board wherever the server sent a graph: a neighbouring space walks the
    // ghost one hop (nothing sent), a far offered space still answers in ONE click,
    // and only the commit talks to the server. It runs BEFORE the two-tap pose pick
    // so a LARGE body's near click WALKS instead of anchoring — the two-tap survives
    // (below) only as the fallback for a far head that several poses could end on.
    if (stepWalk) {
      const res = resolveStepClick(space);
      if (res?.type === "step") {
        setPoseAnchor(null); // the walk supersedes any half-made two-tap pick
        if (res.commit) stepWalk.commit(res.state);
        else stepWalk.advance(res.state);
        return;
      }
      if (res?.type === "choosePose") {
        setPoseAnchor(null);
        setPoseChoice({ key: stepWalk.key, space });
        return;
      }
      // Mid-route far jumps stay disabled (the client owns no pathfinding, and
      // answering from the origin would silently throw the walked route away): say
      // so rather than teleporting. For a LARGE mover that also has to cover the
      // POSE ends, which the two-tap pick below would otherwise answer with —
      // silently discarding the route walked so far. Everything else falls through:
      // an unofferable space still gets #412's honest feedback below.
      if (
        promptForMe &&
        promptStepWalking &&
        (promptSpaceOptions.has(space) || poseIndex.spaces.has(space))
      ) {
        toast("Step one space at a time, or cancel the route to jump.", {
          id: "pro-step-far",
          icon: "👣",
        });
        return;
      }
      // A maneuver's graph owns its clicks outright — stepped, committed or ignored,
      // it never falls through to the one-click commit at the bottom.
      if (!promptForMe) return;
    }
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
    const promptOption = promptForMe ? promptUnambiguousSpaces.get(space) : undefined;
    if (promptForMe && promptOption) {
      respondToPrompt(promptForMe.promptId, promptOption);
      setSelectedFighter(null);
      return;
    }
    // …unless several offered objects share this space (protocol v26 — two corpses,
    // or a corpse and a totem). A click can't say WHICH, and picking one silently
    // would be a guess, so send the player to the labelled panel buttons.
    const ambiguous = promptForMe ? (promptSpaceOptions.get(space)?.length ?? 0) : 0;
    if (promptForMe && ambiguous > 1) {
      toast(`${ambiguous} objects on this space — pick one in the panel`, {
        id: "pro-object-ambiguous",
        icon: "🪦",
      });
      return;
    }
    // issue #412: tapping a visible-but-unofferable space during a move prompt
    // used to be a SILENT no-op (which read as "the game won't let me" — see
    // issue #326's LARGE King Kong vs. the Hut portal). Give lightweight, honest
    // feedback instead. Offered spaces already returned above; placement/token
    // CHOOSE_SPACE prompts return null here and fall through unchanged.
    if (promptForMe?.kind === "CHOOSE_SPACE") {
      const feedback = unofferableMoveFeedback({
        prompt: promptForMe,
        space,
        offeredSpaces: new Set([...promptSpaceOptions.keys(), ...poseIndex.spaces]),
        largeMover: poseIndex.size > 0,
        spaceRegion: view.map.spaces.find((s) => s.id === space)?.region ?? null,
      });
      if (feedback) {
        toast(feedback, { id: "pro-move-unreachable", icon: "🚫" });
        return;
      }
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
  // the fighter's real space (the server path may omit it as path[0]). No tween
  // for a send the hook dropped (#847) — a phantom one would only clear via
  // usePendingMoveTimeout, not because the fighter arrived.
  const commitMoveOrAction = (action: Action, _space: SpaceId) => {
    if (!sendAction(action)) return;
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
      // A dropped repeat of the in-flight attack (#847) leaves the selection
      // and any previewed walk exactly as they were: nothing new was sent.
      if (sendAction(attack)) {
        setSelectedFighter(null);
        setStep(null);
      }
    } else if (movableFighters.has(id)) {
      // Stepping (issue #285): the selected fighter's token stays at its ORIGIN
      // while the ghost previews elsewhere, so clicking it steps BACK one hop
      // toward origin when that's legal (keeps back-and-forth reachable). If it
      // isn't an adjacent step, fall through to toggling the selection.
      // A LARGE body has no step-back: the lead may never re-enter the trail's space
      // (it would pass through itself), so its own token just toggles the selection.
      if (moveGraph && stepState && !largeStepping && id === selectedFighter && !isStepFresh(stepState)) {
        const res = applyStepClick(moveGraph, stepState, stepState.origin, null);
        if (res.type === "step") {
          if (res.commit) commitStep(res.state);
          else setStep({ fighter: id, state: res.state });
          return;
        }
      }
      setSelectedFighter((cur) => (cur === id ? null : id));
      setStep(null); // selecting/deselecting always starts a fresh preview
      setPoseChoice(null);
    }
  };

  // Battlefield items (v17) — ALL presentation. Item labels come from the static
  // map.items; token PRESENCE and attach eligibility come from the server (view.
  // itemTokens + the offered attachItem commit variants). We never re-derive item
  // legality — the badge/label/attach control only surface what the server sent.
  const itemDefById = new Map((view.map.items ?? []).map((it) => [it.id, it]));
  // Open information (p2p #731): the dock's "Use <label> — <effect>" row reads
  // the whole item def off the same live token map the badge does.
  const liveItemForSpace = (space: SpaceId): ProMapItem | undefined => {
    const id = view.itemTokens?.[space];
    return id ? itemDefById.get(id) : undefined;
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

  // Playing from the mobile hand drawer closes it (direction B): the card is
  // gone from the hand and whatever the play triggers — a prompt, a combat —
  // wants the screen. Desktop's fan has no drawer, so this is just `sendAction`
  // there.
  const playFromHand = (action: Action) => {
    // Only a send that really went out closes the drawer (#847): a dropped
    // repeat of the play already in flight would otherwise shut it for nothing.
    if (sendAction(action)) setHandOpen(false);
  };

  // …and it opens itself when the decision on the table is about a card in YOUR
  // hand — a prompt whose own options name hand instances. Deliberately NOT
  // "any hand card is playable while a prompt is open": a CHOOSE SPACE prompt
  // leaves the hand playable too, and opening the drawer over the board for it
  // is exactly the wrong move. Never during the mulligan, which puts the
  // opening hand on screen itself.
  // Not in the tabletop HUD, whose drawer would cover the question (#874).
  const handDecision = handDecisionKeyFor({
    shell: mobile ? (hud ? "hud" : rail ? "rail" : "portrait") : false,
    promptId: prompt?.promptId ?? null,
    mulligan: !!mulliganPrompt,
    optionInstances: promptCardOptions.map((o) => o.instance),
    hand: view.self.hand,
  });


  // The HUD's data, built once and worn by whichever arrangement is mounted
  // (issue #708): the desktop plates + chip cluster, or the mobile match strip,
  // whose seat sheets render the very same SeatPlate.
  const hudProps: ProHudProps = {
    view,
    status,
    // A tournament room's code stays private: no "Copy join link — room X"
    // chip or menu item; its seats are reserved.
    roomId: tournament?.tagged || !features.roomLink ? null : roomId,
    seatPresence,
    turnTimer: features.turnTimer ? turnTimer : null,
    turnTimerSeconds: features.turnTimer ? roomInfo?.turnTimerSeconds : undefined,
    resolveCard,
    resolveHero,
    resolveRuleCards,
    labelFor: (c) => cardLabel(view.catalog, c),
    soundOn,
    visualFxOn: visualOn,
    onToggleSound: features.soundToggles ? toggleSound : undefined,
    onToggleVisualFx: features.soundToggles ? toggleVisual : undefined,
    opponentCosmeticsHidden: hideCosmetics,
    // Only offered once an opponent has actually published something —
    // otherwise it is a chip that visibly does nothing in every guest
    // game, which is most of them.
    onToggleOpponentCosmetics: cosmetics.hasOpponentCosmetics ? toggleHideCosmetics : undefined,
    slowModeOn: slowMode,
    onToggleSlowMode: toggleSlowMode,
    slowModeHolding: !!slowModeHeld,
    pace,
    onCyclePace: cyclePace,
    boardView,
    onToggleBoardView: features.tableBoard ? toggleBoardView : undefined,
    boardViewLockedHint: boardViewLockedHint(mode),
    figureStyle: boardView === "table" && figureStyles.length > 0 ? figureStyle : undefined,
    figureStyles: boardView === "table" ? figureStyles : undefined,
    onChooseFigureStyle: boardView === "table" && figureStyles.length > 0 ? chooseFigureStyle : undefined,
    // Zone discs (#1395): a tabletop-only control, like the figure style.
    zoneDiscs: boardView === "table" ? zoneDiscs : undefined,
    onToggleZoneDiscs: boardView === "table" ? toggleZoneDiscs : undefined,
    // The credit for the miniature each seat's hero stands as on the table.
    figureCreditFor: boardView === "table" ? (seat: string) => pieceCredit(heroPiece(seat)) : undefined,
    turnReminderOn,
    onToggleTurnReminder: features.turnReminder ? toggleTurnReminder : undefined,
    onReportBug: features.reportBug ? () => setReportBugOpen(true) : undefined,
  };

  // Face-down combat slots show the committing player's deck cardback (#735),
  // resolved from the SAME combat the panel renders — the frozen hold snapshot
  // during a strike linger, the live combat otherwise — so the back matches the
  // cards actually on the table.
  const panelC = visualOn ? panelCombat : view.combat;
  const cardbackFor = (pid: PlayerId | undefined): string | undefined => {
    const heroId = pid ? viewHeroIdOf(view, pid) : null;
    return heroId ? heroDeckMeta(heroId)?.cardbackUrl : undefined;
  };
  // The decision dock/sheet, built once and placed by the arrangement: fixed
  // at the right edge on desktop, or inside the mobile bottom container
  // (portrait) / rail (landscape) further down (issue #708).
  const sheetCombat = visualOn ? panelCombat : view.combat;
  // Once the combat is decided and its strike beat has played, its result is a
  // one-liner and the phone sheet lets go of the board (mobile polish).
  const combatSummary =
    sheetCombat?.outcome && !strike ? combatOutcomeBannerText(sheetCombat.outcome, sheetCombat.attackDamageDealt) : null;
  // The hand fan peek stands over the bottom of any portrait sheet or pick bar
  // (mobile step 3 + polish) — over the combat card picker, the action tiles,
  // the confirm buttons. Hide it while one is up; a hand prompt brings it back.
  const handPeekHidden = mobile && !rail && mobileSheetShown && !handOpen && !handDecision;
  // The rail's card picker already shows the cards in question as faces; the
  // hand strip under it would only squeeze the picker below the fold.
  const railPickerOpen = mobile && rail && cardChoiceGroups(dockActionRows.map((r) => r.action)).length > 0;

  // The board's data, built once and worn by whichever presentation is mounted
  // (tabletop board view phase 1): the flat board or the tabletop one. Kept as
  // one object so the two stay wired identically — a prop added here reaches
  // both without hunting down two call sites.
  const boardProps: ProBoardProps = {
    map: view.map,
    fighters: boardFighters,
    tokens: view.tokens,
    highlightedSpaces: [...new Set(highlightedSpaces)],
    relocateSpaces,
    relocateArmed: relocateMode.armedTarget != null,
    highlightedFighters: [...new Set(highlightedFighters)],
    focusFighters: mobile && !rail && sheetCombat && !combatSummary ? [sheetCombat.attacker, sheetCombat.target] : undefined,
    selectedFighter,
    attack: view.combat ? { attacker: view.combat.attacker, target: view.combat.target } : null,
    defenderStepIn: boardDefenderStepIn,
    attackerStepIn: boardAttackerStepIn,
    friendlyOwners,
    fighterBadges: attackerBadge,
    extendedReachTargets: [...extendedReachTargets],
    boughtRangeTargets,
    fighterTokenArt,
    fighterTokenBadge: (f) => ownerTokenState[f.owner]?.badge ?? null,
    fighterTokenRim,
    boardObjectArt,
    boardObjectOriginName,
    fx: boardFx,
    pendingMove: pendingMove ?? incomingMove,
    swaps: positionSwaps,
    // #654: the effect-move ghost rides the same preview channel as the
    // maneuver one — only one of the two can be live at a time (a prompt
    // owns the board while it is open).
    previewMove: previewMove ?? promptPreviewMove,
    onPendingMoveSettled: () => {
      setPendingMove(null);
      clearIncoming();
    },
    closedRegions: view.closedRegions,
    itemTokens: view.itemTokens,
    onSpaceClick,
    onFighterClick,
    onSpaceHover: setHoveredSpace,
    onFighterHover: setHoveredFighter,
    moveHint,
    imgMaxH: zoomMapOn ? undefined : `calc(${proVh(100)} - 16rem)`,
    zoomable: zoomMapOn,
    // Portrait phones only (issue #708): stand the landscape map on end so it
    // uses the screen's long axis. Landscape is already the map's own
    // orientation, and desktop never rotates.
    rotated: mode === "portrait",
    fitInset: boardFitInset,
    tokenLife: tokenLifeOn ? tokenGestures : null,
    fighterEls: fighterElsRef,
  };

  const dockEl = (
    <ProDock
      view={view}
      batchEvents={snapshot?.events}
      myTurn={myTurn}
      activeTurnLabel={activeTurnLabel}
      disconnectedLabel={disconnectedLabel}
      stepping={
        previewMove
          ? {
              fighterName: selectedFighter?.split("/")[1] ?? "",
              movesLeft: stepMovesLeft,
              canEnd: stepCanEnd,
              instanceKey: `${selectedFighter}@${selectedOrigin}`,
              onEnd: () => stepState && commitStep(stepState),
              onCancel: () => {
                setStep(null);
                setPoseChoice(null);
              },
            }
          : // Effect-move stepping (#654) reuses the very same controls; only the
            // commit wording changes ("Commit here" answers the prompt, it doesn't
            // end a maneuver), and Cancel drops the local route with nothing sent.
            promptPreviewMove && promptStepState
            ? {
                fighterName: badgedName(promptPreviewMove.fighterId),
                movesLeft: promptStepRemaining,
                canEnd: promptStepCanCommit,
                commitLabel: "Commit here",
                onEnd: () => commitPromptStep(promptStepState),
                onCancel: () => {
                  setPromptStep(null);
                  setPoseChoice(null);
                },
              }
            : null
      }
      moveChoiceNames={moveChoice ? moveChoice.candidates.map((id) => badgedName(id)) : null}
      poseChoiceHint={poseChoiceHint}
      selectedFighterName={selectedFighter ? selectedFighter.split("/")[1] : null}
      stepwiseMoves={!!moveGraph}
      highlightedCount={highlightedSpaces.length}
      attackTargetCount={attackActions.size}
      boostHint={boostHint}
      relocateHint={relocateHint}
      relocateArmRows={relocateMode.rows.map((r) => ({
        label: r.label,
        armed: r.armed,
        // Arming SELECTS (#764): the dashed origins are drawn for the armed
        // fighter, so the selection must follow the row or the board would show
        // someone else's affordances underneath them. A previewed walk / open
        // pose pick belongs to the old selection and is dropped. Disarming
        // leaves the selection alone — the player is now looking at that
        // fighter's ordinary moves.
        onToggle: () => {
          if (r.armed) {
            setRelocateArmed(null);
            return;
          }
          setRelocateArmed(r.fighter);
          setSelectedFighter(r.fighter);
          setStep(null);
          setPoseChoice(null);
        },
      }))}
      combatPanel={
        /* Strike beat (#381): while a combat that resolved+ended in one batch
           lingers, keep rendering the panel from the frozen snapshot so the
           slam can play — including OVER a freshly committed next combat while
           the hold lasts (#602). Visual-fx off ⇒ no linger, no hold, no strike
           (outcome still lives in the activity log); the panel just renders the
           live combat and unmounts as before. */
        (visualOn ? panelCombat : view.combat) ? (
          <CombatPanel
            combat={(visualOn ? panelCombat : view.combat)!}
            catalog={view.catalog}
            resolveCard={resolveCard}
            you={view.you}
            selfCommitted={view.self.committedCard}
            attackerCardbackUrl={cardbackFor(panelC?.attackerPlayer)}
            defenderCardbackUrl={cardbackFor(panelC?.defenderPlayer)}
            strike={visualOn ? strike : null}
            valueFx={visualOn && !reducedMotion ? combatValueFx : undefined}
            clashRef={clashRef}
            chain={combatChain}
            effectAttack={combatEffectAttack}
            defenderCallout={combatDefenderTag}
            attackerCallout={attackerSwapCopy}
            compact={mobile && !rail}
            fighterName={nameOf}
            factor={paceScale}
          />
        ) : null
      }
      promptPanel={
        prompt && !mulliganPrompt ? (
          <PromptPanel
            prompt={prompt}
            you={view.you}
            onRespond={respondToPrompt}
            buttonOptions={promptButtonOptions}
            cardOptions={[...promptCardOptions, ...promptRevealCardOptions]}
            boardHint={promptBoardHint && mobile ? touchCopy(promptBoardHint) : promptBoardHint}
            budgetLine={promptBudgetLine}
            noteLine={promptNoteLine}
            previewInstance={promptCardInstance}
            sourceInstance={sourceCardInstance}
            sourceLabel={sourceLabel}
            resolveCard={resolveCard}
            catalog={view.catalog}
          />
        ) : null
      }
      hasPrompt={!!prompt}
      rows={dockActionRows}
      soleAction={sole}
      describe={(a) =>
        describeAction(view.catalog, a, { nameOf, attackerBadge, itemForSpace: liveItemForSpace, attachItem: attachItemContext })
      }
      isExtendedReach={isExtendedReach}
      rangePurchaseChip={rangePurchaseChip}
      fighterFace={fighterFace}
      attackerBadge={attackerBadge}
      onAction={sendAction}
      legalActionCount={legalActions.length}
      iAmSpectating={iAmSpectating}
      iForfeited={iForfeited}
      multiplayerView={multiplayerView}
      // A tournament game never rematches (the engine refuses it, v37): the
      // next game of the match is a new ticket from the match page.
      rematchHref={tournament?.at || !features.rematch ? null : rematchHref}
      rematchNegotiation={tournament?.at || !features.rematch ? null : rematchNegotiation}
      endAction={tournament?.endAction}
      endNote={tournament?.endNote(view, multiplayerView)}
      replayHref={replayBundle ? `/pro/replays?open=${replayId(replayBundle)}` : null}
      onCopyShareLink={
        replayBundle && accountStatus === "signed-in" && copyReplayShareLink ? () => void copyReplayShareLink() : undefined
      }
      shareLinkBusy={sharingReplay}
      postGame={{
        endReason: gameEndReason,
        heroNameOf: (heroId) => heroNameOf(heroes, heroId),
        bots: roomInfo?.bots ?? null,
        accountStatus,
        username: accountState?.account?.username ?? null,
        earned,
        stats: gameStats,
        clockMs,
        firstPlayer,
        xpMultiplier: roomInfo?.xpMultiplier ?? null,
        nextUp,
      }}
      undoPending={undoPending}
      onUndo={features.undo ? requestUndo : undefined}
      canForfeit={canForfeit}
      onForfeit={() => setForfeitOpen(true)}
      mobile={mobile ? (hud ? "hud" : rail ? "rail" : "portrait") : false}
      mobileHandOpen={handOpen}
      mobileSheetRef={mobileSheetRef}
      onMobileSheetShown={setMobileSheetShown}
      boardPickHint={prompt && !mulliganPrompt && promptBoardHint ? (mobile ? touchCopy(promptBoardHint) : promptBoardHint) : null}
      mobileHandPeekHidden={handPeekHidden}
      combatSummary={mobile ? combatSummary : null}
      renderCard={(card) => (
        <CardFace card={resolveCard(card)} fallback={cardLabel(view.catalog, card)} touchPeekOnly />
      )}
    />
  );

  // The dock's only content once the game is decided is the end screen.
  const dockShown = features.postGame || !isGameOver(view);
  // A puzzle's face-up opponent hand (#1678): the prop, else the view's own.
  const openHand = opponentHand ?? (view.opponent as (typeof view.opponent & { hand?: CardInstanceId[] }) | null)?.hand ?? null;
  const openHandOwner = view.opponent?.id ?? view.players.find((p) => p.id !== view.you)?.id ?? null;

  return (
    <ProErrorBoundary
      roomId={roomId}
      seat={view.you}
      stateHash={stateHash(view)}
      onLeave={onLeave}
    >
    <CardPreviewProvider>
    {tournament?.strip(view, multiplayerView)}
    <Box
      data-testid="pro-game-view"
      h={contained ? "100%" : "calc(100svh - var(--match-banner-h, 0px))"}
      overflow="hidden"
      bg={TABLE_BG}
      position="relative"
    >
      {/* Playtesting a custom board (this player created it): a near-invisible
          link to submit it to unbrewed. Covers the AI case, where the pre-game
          waiting screen — which also offers this — is never shown. */}
      {mapSubmit && (
        <Link
          as="button"
          onClick={() => setSubmitMapOpen?.(true)}
          bg="transparent"
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
      {mapSubmit && (
        <SubmitMapDialog
          isOpen={submitMapOpen}
          onClose={() => setSubmitMapOpen?.(false)}
          map={mapSubmit.map}
          json={mapSubmit.json}
        />
      )}

      {/* Board stage. With zoom on (the default) the board fills this box edge
          to edge and the fixed HUD/hand/dock float over it — the board's own
          fit transform, not padding, is what keeps the field clear of them, so
          a drag can carry it under the overlays. Flag off = the old boxed
          board, centered inside padding reserved for those same overlays. */}
      <Flex
        // The zoomable board pans and zooms under the chrome, past the edges
        // of the view — by design; scripts/pro/embedCheck.mjs skips it.
        data-pro-bleed=""
        h="100%"
        alignItems={zoomMapOn ? "stretch" : "center"}
        justifyContent="center"
        p={zoomMapOn ? 0 : "1rem"}
        pt={zoomMapOn ? 0 : "7.5rem"}
        pb={zoomMapOn ? 0 : "8.5rem"}
        pr={zoomMapOn ? 0 : { base: "1rem", lg: "20rem" }}
      >
        {/* One prop object feeds whichever board component is mounted (tabletop
            board view phase 1) — same game, same socket, same handlers; only
            the presentation differs. See lib/pro/boardView.ts. */}
        {boardView === "table" && TableBoard ? (
          <TableBoard
            {...boardProps}
            fighterFigure={(f) => (f.kind === "HERO" ? heroPiece(f.owner).figure : null)}
            fighterMini3d={(f) => (f.kind === "HERO" ? heroPiece(f.owner).mini3d : null)}
            resetViewSpot={hud ? HUD_RESET_VIEW_SPOT : undefined}
            fighterStrike={tableStrike}
            zoneDiscs={zoneDiscs}
          />
        ) : (
          <ProBoard {...boardProps} />
        )}
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
      {visualOn && combatCallouts.length > 0 && (
        // Full-bleed flourishes: a banner may run edge to edge and past
        // (scripts/pro/embedCheck.mjs skips them). `contents`: no box of its own.
        <Box data-pro-bleed="" display="contents">
          {combatCallouts.map((item) => (
            <CombatCalloutOverlay key={item.key} item={item} view={view} resolveCard={resolveCard} />
          ))}
        </Box>
      )}

      {/* Turn reminder's foreground cue (player request: nudge someone who
          forgot it's their move) — a small, repeatable pulse, deliberately NOT
          gated on pro-visual-fx like the callouts above: it is the on-screen
          half of a three-channel nudge (vibration/sound/title carry the rest),
          not decorative juice, so turning visual-fx off must not silence it
          too. Its own dedicated toggle (turnReminderOn) is what turns it off. */}
      <TurnReminderCue pulse={turnReminderPulse} />

      {/* floating player plates + room/connection chips (sandbox HUD DNA);
          report-bug chip (issue #125/#138) shares this row so it doesn't
          overlap the invite/connection chips — beta badge distinguishes it
          from the activity-log icon (#87); both open the same ReportBugDialog. */}
      {/* Top-of-screen HUD. Desktop keeps the floating plates + chip cluster;
          a phone gets the one-line match strip, whose seat chips open the same
          SeatPlate as a sheet (issue #708). Gated on the layout EFFECT, not a
          per-element media query, so the static export's first paint is the
          desktop one and hydration stays quiet. */}
      {mobile ? (
        <ProMobileHud
          {...hudProps}
          layoutMode={mode}
          chipsRef={mobileChipsRef}
          hud={hud}
          portraitFor={(seat) => {
            const hero = view.fighters.find((f) => f.owner === seat && f.kind === "HERO");
            return hero ? fighterTokenArt(hero) : null;
          }}
        />
      ) : (
        <ProHud {...hudProps} overlayRef={setHudOverlayEl} />
      )}

      {/* Slow mode (issue #703): one opponent action at a time, held until the
          player clicks OK. Renders nothing at all when the socket isn't holding —
          which is always, with the toggle off. */}
      <ActionSpotlight
        batch={slowModeHeld && spotlight?.for === slowModeHeld ? spotlight.batch : null}
        pending={slowModePending}
        resolveCard={resolveCard}
        labelFor={(c) => cardLabel(view.catalog, c)}
        onAdvance={advanceSlowMode}
        onSkipAll={skipSlowMode}
      />

      {/* Floating decision dock — turn state, combat, prompts, actions. Owns
          its own drag/collapse/persistence (issue #451); the two big inline
          panels ride in as slots so they can stay in this file. */}
      {!mobile && dockShown && dockEl}


      {/* concede confirmation (issue #140) — sends FORFEIT on confirm. In
          multiplayer this resigns your seat (you may keep spectating), so the
          dialog copy adapts; `iForfeited` lets the spectator panel say so. */}
      {features.forfeit && <ForfeitDialog
        isOpen={forfeitOpen}
        onClose={() => setForfeitOpen(false)}
        multiplayer={multiplayerView}
        signedIn={accountStatus === "signed-in"}
        onConfirm={() => {
          setIForfeited(true);
          sendAction({ type: "FORFEIT", player: view.you });
        }}
      />}

      {/* undo accept/reject prompt (issue #154) — shown to the opponent of the
          requester; the server pushed the list of actions to be rewound. */}
      {features.undo && <UndoRequestDialog
        isOpen={!!incomingUndo}
        you={view.you}
        actions={incomingUndo?.rewindActions ?? []}
        onAccept={() => respondToUndo(true)}
        onReject={() => respondToUndo(false)}
      />}

      {/* opening-hand mulligan (issue #622) — keep or redraw the five cards you
          were dealt. Open for the WHOLE window (including while the opponent is
          the one being asked) so the hand stays on screen and the waiting state
          is honest; it never shows the opponent's answer, which arrives in the
          log once the engine closes the window. */}
      <MulliganDialog
        isOpen={!!mulliganPrompt}
        hand={view.self.hand}
        resolveCard={resolveCard}
        labelFor={(c) => cardLabel(view.catalog, c)}
        options={mulliganAwaitsMe ? (mulliganPrompt?.options ?? []) : []}
        awaitingYou={mulliganAwaitsMe}
        decided={mulliganAnswer?.choice ?? null}
        multiplayer={multiplayerView}
        timer={
          // Same gate the HUD plate uses for this seat's bar — the modal hides
          // that bar, so the clock rides along inside it while you decide.
          features.turnTimer && mulliganAwaitsMe && turnTimer?.player === view.you && turnTimer.deadline != null && roomInfo?.turnTimerSeconds
            ? { deadline: turnTimer.deadline, totalSeconds: roomInfo.turnTimerSeconds }
            : null
        }
        onChoose={(optionId) => {
          if (!mulliganPrompt) return;
          const option = mulliganPrompt.options.find((o) => o.id === optionId) ?? null;
          setMulliganAnswer({
            promptId: mulliganPrompt.promptId,
            choice: option ? mulliganChoiceOf(option) : null,
          });
          respondToPrompt(mulliganPrompt.promptId, optionId);
        }}
      />

      {/* activity feed — bottom-left parchment panel on desktop; on mobile the
          same panel as a sheet the match strip's log button opens (#708). */}
      <ProDiscardsSheet
        isOpen={discardsOpen}
        onClose={() => setDiscardsOpen(false)}
        seats={view.players.map((seat) => ({
          id: seat.id,
          name: view.fighters.find((f) => f.owner === seat.id && f.kind === "HERO")?.name ?? seat.id.toUpperCase(),
          discard: seat.discard,
          you: seat.id === view.you,
        }))}
        resolveCard={resolveCard}
        labelFor={(c) => cardLabel(view.catalog, c)}
      />

      {openHand && openHandOwner && (
        <RevealedHandPanel
          key="open-hand"
          revealed={{ revealer: view.you, owner: openHandOwner, turn: view.turnNumber, cards: openHand }}
          top={!mobile && hudBottom > 0 ? hudBottom + REVEALED_PANEL_GAP_PX : undefined}
          heroName={view.fighters.find((f) => f.owner === openHandOwner && f.kind === "HERO")?.name ?? seatLabel(view, openHandOwner)}
          title={`${view.fighters.find((f) => f.owner === openHandOwner && f.kind === "HERO")?.name ?? seatLabel(view, openHandOwner)}'s hand`}
          note="face up"
          resolveCard={resolveCard}
          labelFor={(c) => cardLabel(view.catalog, c)}
        />
      )}

      {revealedHand && !openHand && (
        <RevealedHandPanel
          // a newer reveal starts expanded, whatever the last one was collapsed to
          key={`${revealedHand.owner}:${revealedHand.turn}:${revealedHand.cards.join(",")}`}
          revealed={revealedHand}
          top={!mobile && hudBottom > 0 ? hudBottom + REVEALED_PANEL_GAP_PX : undefined}
          heroName={
            view.fighters.find((f) => f.owner === revealedHand.owner && f.kind === "HERO")?.name ??
            seatLabel(view, revealedHand.owner)
          }
          resolveCard={resolveCard}
          labelFor={(c) => cardLabel(view.catalog, c)}
        />
      )}

      <ProLog
        entries={logEntries}
        resolveCard={resolveCard}
        labelFor={(c) => cardLabel(view.catalog, c)}
        onReportBug={features.reportBug ? () => setReportBugOpen(true) : undefined}
        mobile={mobile}
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
      />

      {/* prefilled-GitHub-issue bug report with auto-captured game context (#87) */}
      {features.reportBug && <ReportBugDialog
        isOpen={reportBugOpen}
        onClose={() => setReportBugOpen(false)}
        view={view}
        roomId={roomId}
        entries={logEntries}
      />}

      {/* hand — docked fan over the bottom edge, sandbox style */}
      {!mobile && !isGameOver(view) && (
        <Flex data-testid="pro-hand-dock" data-pro-bleed="" position="fixed" bottom="-0.75rem" left="0" right="0" justifyContent="center" zIndex={160} pointerEvents="none">
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
      )}

      {/* Mobile chrome (issue #708, direction B). Nothing here is a band the
          board has to make room for: the pill row floats, the hand is a
          fan-peek until it is tapped, and the log/overflow buttons sit in the
          bottom corners. Portrait stacks them over the board's bottom edge;
          landscape stands the decision stack + hand up as a right rail so the
          board keeps everything to the left of it. */}
      {mobile && !rail && (
        <Flex
          ref={mobileControlsRef}
          data-testid="pro-mobile-controls"
          position="fixed"
          left={0}
          right={0}
          bottom={0}
          zIndex={160}
          direction="column"
          gap="0.5rem"
          pb="0.75rem"
          pointerEvents="none"
          sx={{
            paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            paddingLeft: "env(safe-area-inset-left, 0px)",
            paddingRight: "env(safe-area-inset-right, 0px)",
          }}
        >
          {dockShown && dockEl}
          {/* Above the decision sheet inside this container, so the log, the
              hand and the overflow menu stay reachable while a prompt holds
              the sheet open. */}
          <Flex
            position="relative"
            zIndex={3}
            alignItems="flex-end"
            justifyContent="space-between"
            gap="0.5rem"
            px="0.6rem"
          >
            <Flex
              {...MOBILE_BTN}
              as="button"
              aria-label="Activity log"
              pointerEvents="auto"
              onClick={() => setLogOpen(true)}
            >
              <TbList size="1rem" /> {!iconOnlyControls && "Log"}
            </Flex>
            <Flex
              {...MOBILE_BTN}
              as="button"
              aria-label="Discard piles"
              pointerEvents="auto"
              onClick={() => setDiscardsOpen(true)}
            >
              <TbCards size="1rem" /> {!iconOnlyControls && "Played"}
            </Flex>
            <HandDecisionWatcher promptKey={handDecision} onOpen={() => setHandOpen(true)} />
            {!handPeekHidden && (
              <ProMobileHand
                hand={view.self.hand}
                resolveCard={resolveCard}
                labelFor={(c) => cardLabel(view.catalog, c)}
                actionsFor={actionsForCard}
                onAction={playFromHand}
                deckCount={view.self.deckCount}
                discardCount={view.self.discard.length}
                isOpen={handOpen}
                onOpen={() => setHandOpen(true)}
                onClose={() => setHandOpen(false)}
              />
            )}
            <Box pointerEvents="auto">
              <ProMobileMenu {...hudProps} placement="top-end" onForfeit={canForfeit && view.phase === "PLAY" && !view.winner ? () => setForfeitOpen(true) : undefined} />
            </Box>
          </Flex>
        </Flex>
      )}

      {/* Tabletop HUD (landscape, tabletop board): the dock renders its own
          banner, hexagons and side sheet; the hand fans over the bottom edge
          and the log / discards / menu stand in a column on the left. */}
      {hud && (
        <>
          {dockShown && dockEl}
          <TableHudHand
            besideSheet={mobileSheetShown}
            hand={view.self.hand}
            resolveCard={resolveCard}
            labelFor={(c) => cardLabel(view.catalog, c)}
            actionsFor={actionsForCard}
            onAction={playFromHand}
            deckCount={view.self.deckCount}
            discardCount={view.self.discard.length}
            isOpen={handOpen}
            onOpen={() => setHandOpen(true)}
            onClose={() => setHandOpen(false)}
          />
          <TableHudSideButtons
            onOpenLog={() => setLogOpen(true)}
            onOpenDiscards={() => setDiscardsOpen(true)}
            menu={
              <ProMobileMenu
                {...hudProps}
                placement="right-start"
                onForfeit={canForfeit && view.phase === "PLAY" && !view.winner ? () => setForfeitOpen(true) : undefined}
              />
            }
          />
        </>
      )}

      {/* Landscape rail: decision stack on top, compact hand strip below. */}
      {mobile && rail && !hud && (
        <Flex
          data-testid="pro-mobile-rail"
          position="fixed"
          top={0}
          right={0}
          bottom={0}
          width={RAIL_WIDTH_CSS}
          zIndex={160}
          direction="column"
          gap="0.5rem"
          p="0.5rem"
          bg="rgba(30, 15, 34, 0.72)"
          borderLeft="1px solid rgba(224, 168, 46, 0.3)"
          sx={{
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))",
            paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
            paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <Flex alignItems="center" gap="0.4rem" flexShrink={0}>
            <Flex
              {...MOBILE_BTN}
              as="button"
              aria-label="Activity log"
              minH={TAP_TARGET}
              px="0.6rem"
              onClick={() => setLogOpen(true)}
            >
              <TbList size="0.9rem" /> Log
            </Flex>
            <Flex
              {...MOBILE_BTN}
              as="button"
              aria-label="Discard piles"
              minH={TAP_TARGET}
              px="0.6rem"
              onClick={() => setDiscardsOpen(true)}
            >
              <TbCards size="0.9rem" /> Played
            </Flex>
            <Box flex={1} />
            <ProMobileMenu {...hudProps} placement="bottom-end" onForfeit={canForfeit && view.phase === "PLAY" && !view.winner ? () => setForfeitOpen(true) : undefined} />
          </Flex>
          {dockShown && dockEl}
          {!railPickerOpen && (
          <RailHand
            hand={view.self.hand}
            resolveCard={resolveCard}
            labelFor={(c) => cardLabel(view.catalog, c)}
            actionsFor={actionsForCard}
            onAction={playFromHand}
          />
          )}
        </Flex>
      )}
    </Box>
    </CardPreviewProvider>
    </ProErrorBoundary>
  );
};

// ---------------------------------------------------------------------------
// The embeddable component
// ---------------------------------------------------------------------------

export interface GameViewProps {
  /**
   * The socket driving this view: the return of `useProSocket`. The caller owns
   * it (creates or joins the room, decides what to show before the first STATE).
   * For a panel that shares a page with the real game, open it with
   * `useProSocket(url, debug, slowMode, undefined, { ephemeral: true })`.
   */
  socket: UseProSocketReturn;
  /**
   * Lay the view out inside its parent box instead of the viewport. The parent
   * must have a size (the view fills 100% of it). Default false: the view owns
   * the page, exactly as /pro/game does.
   */
  contained?: boolean;
  /** Overrides on top of the mode's defaults (FULL_ / CONTAINED_GAME_FEATURES). */
  features?: Partial<GameViewFeatures>;
  /** See `GameViewBody`. */
  opponentHand?: CardInstanceId[] | null;
  /** The `slowMode` the socket was opened with, so the hold spotlight matches it. */
  slowMode?: boolean;
  /** Rendered until the socket's first STATE arrives. Default: nothing. */
  fallback?: ReactNode;
}

const GameViewInner = ({
  socket,
  features,
  opponentHand,
  slowMode = false,
  fallback = null,
}: Omit<GameViewProps, "contained" | "features"> & { features: GameViewFeatures }) => {
  const state = useGameViewState({ socket, slowMode, features });
  if (!socket.snapshot) return <>{fallback}</>;
  return <GameViewBody socket={socket} state={state} host={{ slowMode }} features={features} opponentHand={opponentHand} />;
};

/**
 * The in-game Pro view as a component (issue #1678). Mount it with a socket;
 * with `contained` it lives entirely inside its parent box — no viewport
 * sizing, no fixed chrome or portals outside the box, layout from the box's
 * width, keyboard shortcuts only while the box has focus, and nothing written
 * to the page (title, URL, zoom, navigation).
 */
export const GameView = ({ contained = false, features, ...rest }: GameViewProps) => {
  const merged = useMemo<GameViewFeatures>(
    () => ({ ...(contained ? CONTAINED_GAME_FEATURES : FULL_GAME_FEATURES), ...features }),
    [contained, features]
  );
  if (!contained) return <GameViewInner {...rest} features={merged} />;
  return (
    <ProContainedFrame bg={TABLE_BG}>
      <GameViewInner {...rest} features={merged} />
    </ProContainedFrame>
  );
};
