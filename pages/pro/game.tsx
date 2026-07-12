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
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/router";
import { Box, Button, Flex, Grid, Link, Menu, MenuButton, MenuItem, MenuList, Tag, Text, Textarea, Tooltip } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { MOVE_STEP_SECONDS, PendingMove, ProBoard } from "@/components/Pro/ProBoard";
import { ProErrorBoundary } from "@/components/Pro/ProErrorBoundary";
import { assignableSeats, BotSlotPlan, CreateSeats, SlotOccupant } from "@/components/Pro/CreateSeats";
import { stateHash } from "@/lib/pro/stateHash";
import {
  Action,
  BotDifficulty,
  BotSeatFill,
  CardInstanceId,
  CardMeta,
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
import { saveReplay } from "@/lib/pro/replayStore";
import { proErrorMessage } from "@/lib/pro/proErrors";
import { ProConnectionStatus, useProSocket } from "@/lib/pro/useProSocket";
import { normalizeMap } from "@/lib/pro/normalizeMap";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { mapSubmissionIssueUrl } from "@/lib/pro/mapIssue";
import { RecentRoom, getTabToken, listRecentRooms } from "@/lib/pro/recentRooms";
import { HERO_DECK_IDS, ResolveCard, useProCardArt } from "@/lib/pro/useProCardArt";
import { frozenAtForHero } from "@/lib/pro/evergreenManifest";
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { TbBow, TbChevronDown, TbExternalLink, TbInfoCircle, TbSword } from "react-icons/tb";
import { CardFace, ProHand } from "@/components/Pro/ProHand";
import { CardPreviewProvider } from "@/components/Pro/CardPreview";
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";
import { ProHud } from "@/components/Pro/ProHud";
import { ProLog, ProLogEntry } from "@/components/Pro/ProLog";
import { ReportBugDialog } from "@/components/Pro/ReportBugDialog";
import { ForfeitDialog } from "@/components/Pro/ForfeitDialog";
import { UndoRequestDialog } from "@/components/Pro/UndoRequestDialog";
import { GameLostScreen } from "@/components/Pro/GameLostScreen";
import { diffViews, enrichLines, seatLabel } from "@/lib/pro/gameLog";
import { cardAffordances, cardLabel, cardTitle, describeAction } from "@/lib/pro/actionDock";
import {
  isExtendedReachAttack,
  LARGE_FIGHTER_BLURB,
  LARGE_REACH_CHIP,
  SpaceReach,
} from "@/lib/pro/largeReach";
import { useFlag } from "@/lib/flags";
import { maneuverBoostHint } from "@/lib/pro/maneuverHint";
import { buildPoseIndex, parsePoseOptions, poseHighlights, resolvePoseClick } from "@/lib/pro/moveChoice";
import { useGameFx } from "@/lib/pro/useGameFx";
import { useCombatCallouts, CombatCalloutItem } from "@/lib/pro/combatFx";
import { useIncomingMoveTween } from "@/lib/pro/moveTween";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";
import { PRO_WS_URL as WS_URL } from "@/lib/pro/wsUrl";
import { formatChoice, PRO_FORMATS, ProFormatId, teamComposition } from "@/lib/pro/multiplayerPlaytest";
import { deriveTeams, isViewerOnWinningTeam } from "@/lib/pro/teams";
import {
  CUSTOM_MAP_ID,
  FORMAT_BADGE,
  MAP_CATALOG,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  eligibleFormats,
  ineligibleReason,
  mapEligibleForFormat,
} from "@/lib/pro/mapCatalog";

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

// --- Combat Callouts (issue #162, gated behind the `combatFx` flag) ---------
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
 * The overlay for one live combat callout. Decorative only, pointer-transparent,
 * and above the board/vignette. `reveal` names its source with the SAME resolver
 * the activity log uses (`resolveEventSource`); a real source shows its art via
 * CardFace, while the redacted `'(hidden)'` placeholder shows a HiddenRevealBack
 * card-back so it stays art-forward instead of bare text. `item.slot` cascades
 * overlapping reveals down-right so they never stack dead-center.
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

  // reveal — float the source card's art + name center-screen.
  const hidden = item.source === "(hidden)";
  const card = hidden ? null : resolveCard(item.source);
  const name = resolveEventSource(view, item.source);
  // Cascade overlapping reveals down-right from dead-center (slot 0) so a
  // multi-reveal turn fans out instead of piling on one spot.
  const slot = item.kind === "reveal" ? item.slot ?? 0 : 0;
  return (
    <Flex
      position="fixed"
      top={`calc(46% + ${slot * 1.4}rem)`}
      left={`calc(50% + ${slot * 1.6}rem)`}
      zIndex={205}
      direction="column"
      alignItems="center"
      gap="0.75rem"
      pointerEvents="none"
      animation={`${calloutReveal} 2.3s ease-out both`}
    >
      <Box w={{ base: "9rem", md: "12rem" }} sx={{ aspectRatio: "63 / 88" }} filter="drop-shadow(0 8px 24px rgba(0,0,0,0.6))">
        {hidden ? <HiddenRevealBack /> : <CardFace card={card} fallback={name} />}
      </Box>
      <Text
        fontFamily="BebasNeueRegular"
        fontSize={{ base: "1.4rem", md: "1.9rem" }}
        letterSpacing="0.06em"
        textAlign="center"
        color="brand.parchment"
        textShadow="0 2px 8px rgba(0,0,0,0.7)"
      >
        {name}
      </Text>
    </Flex>
  );
};

/** The reveal beat: cards flip in from edge-on, defender a breath later. */
const flipIn = keyframes`
  from { transform: perspective(600px) rotateY(88deg) scale(1.12); opacity: 0.4; }
  60%  { transform: perspective(600px) rotateY(-8deg) scale(1.06); opacity: 1; }
  to   { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
`;

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
}) => (
  <Box textAlign="center">
    <Text opacity={0.6} fontSize="0.75rem" mb="0.25rem">
      {label}
    </Text>
    <Box w="6.5rem" sx={{ aspectRatio: "63 / 88" }} mx="auto" position="relative">
      {card ? (
        // keyed by instance: mounts fresh at reveal, so the flip plays exactly once
        <Box
          key={card.instance}
          w="100%"
          h="100%"
          animation={`${flipIn} 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.1) ${revealDelay} both`}
        >
          <CardFace card={resolveCard(card.instance)} fallback={cardLabel(catalog, card.instance)} />
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
      <Text fontSize="0.95rem" fontWeight="bold" color="brand.accent">
        {card.effectiveValue}
        {card.boosts.length ? ` (+${card.boosts.length} boost)` : ""}
      </Text>
    )}
    {detail && (
      <Text fontSize="0.75rem" opacity={0.7}>
        {detail}
      </Text>
    )}
  </Box>
);

/** The reveal beat + running combat math, straight from the server view. */
const CombatPanel = ({
  combat,
  catalog,
  resolveCard,
  you,
  selfCommitted,
}: {
  combat: ViewCombat;
  catalog: Record<string, CardMeta>;
  resolveCard: ResolveCard;
  you: PlayerView["you"];
  selfCommitted: CardInstanceId | null;
}) => {
  const attackerCommitted = combat.stage !== "COMMIT_ATTACK";
  const pastReveal = !["COMMIT_ATTACK", "COMMIT_DEFENSE"].includes(combat.stage);
  return (
    <Box bg="brand.surface" border="1px solid" borderColor="whiteAlpha.300" borderRadius="0.5rem" p="0.75rem">
      <Flex gap="0.5rem" alignItems="center" mb="0.5rem">
        <Tag colorScheme="red" size="sm">
          COMBAT
        </Tag>
        <Text fontSize="0.8rem" opacity={0.7}>
          {combat.stage.replace(/_/g, " ").toLowerCase()}
        </Text>
      </Flex>
      <Flex gap="1rem" justifyContent="center">
        <CombatSlot
          label="attack"
          card={combat.attackerCard}
          resolveCard={resolveCard}
          facedownInstance={
            !combat.attackerCard && combat.attackerPlayer === you ? selfCommitted : null
          }
          facedownState={attackerCommitted ? "committed" : "deciding"}
          catalog={catalog}
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
        />
      </Flex>
      {combat.outcome && (
        <Text textAlign="center" mt="0.5rem" fontWeight="bold">
          {combat.outcome.replace(/_/g, " ").toLowerCase()}
          {combat.attackDamageDealt !== null ? ` · ${combat.attackDamageDealt} dmg` : ""}
        </Text>
      )}
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

const skeletonPulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.7; }
`;

const StatPip = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <Flex align="center" gap="0.25rem" fontSize="0.8rem" fontWeight="bold">
    {icon}
    <Text sx={{ fontVariantNumeric: "tabular-nums" }}>{label}</Text>
  </Flex>
);

/**
 * One selectable hero card in the lobby picker. Every hero is a community fan
 * deck, so the tile always credits the author ("by …") and carries a corner
 * link to the original unmatched.cards listing. The link is a SIBLING of the
 * select button (overlaid on the same box) — nesting <a> in <button> is
 * invalid HTML and would make the whole tile navigate.
 */
const HeroTile = ({
  hero,
  selected,
  onSelect,
  onPreview,
}: {
  hero: HeroListing;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) => {
  const deck = heroDeckMeta(hero.heroId);
  const cardback = deck?.cardbackUrl;
  const frozenAt = frozenAtForHero(hero.heroId);
  return (
    <Box position="relative" w="100%">
      <Flex
        as="button"
        type="button"
        direction="column"
        onClick={onSelect}
        w="100%"
        sx={{ aspectRatio: "63 / 88" }}
        p="0.75rem"
        borderRadius="0.6rem"
        border="2px solid"
        borderColor={selected ? "brand.accent" : "whiteAlpha.300"}
        bg={cardback ? undefined : "rgba(20, 8, 24, 0.55)"}
        bgImage={cardback ? `url(${cardback})` : undefined}
        bgSize="cover"
        bgPos="center"
        position="relative"
        overflow="hidden"
        textAlign="left"
        transition="border-color 0.15s, transform 0.15s, box-shadow 0.15s"
        transform={selected ? "translateY(-2px)" : undefined}
        boxShadow={selected ? "0 0 0 2px #E0A82E, 0 6px 16px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.4)"}
        _hover={{ borderColor: "brand.accent" }}
      >
        <Box
          position="absolute"
          inset="0"
          bg="linear-gradient(180deg, rgba(20,8,24,0.15) 0%, rgba(20,8,24,0.85) 100%)"
        />
        <Flex direction="column" position="relative" gap="0.5rem" flex="1" justify="flex-end">
          <Box>
            <Text
              fontFamily="BebasNeueRegular"
              fontSize="1.35rem"
              letterSpacing="0.03em"
              lineHeight="1.05"
              textShadow="0 1px 3px rgba(0,0,0,0.9)"
            >
              {/* Reflavored/baseline decks (only reachable under ?debug, which
                  is what surfaces them in the roster) get a ★ so they read apart
                  from their identically-named spice replacement. */}
              {hero.name}
              {hero.tier === "reflavored" ? " ★" : ""}
            </Text>
            {deck && (
              <Text
                fontSize="0.68rem"
                fontStyle="italic"
                color="brand.parchment"
                opacity={0.85}
                textShadow="0 1px 2px rgba(0,0,0,0.9)"
              >
                by {deck.author}
              </Text>
            )}
            {frozenAt && (
              <Text
                fontSize="0.62rem"
                color="brand.parchment"
                opacity={0.7}
                textShadow="0 1px 2px rgba(0,0,0,0.9)"
              >
                rules version frozen {frozenAt}
              </Text>
            )}
          </Box>
          <Flex gap="0.75rem" color="brand.parchment" textShadow="0 1px 2px rgba(0,0,0,0.9)">
            <StatPip icon={<GiHearts color="#C0392B" size="15px" />} label={String(hero.hp)} />
            <StatPip icon={<GiFootprint size="14px" />} label={String(hero.move)} />
            <StatPip
              icon={hero.reach === "RANGED" ? <TbBow size="15px" /> : <TbSword size="15px" />}
              label={hero.reach === "RANGED" ? "rng" : "mel"}
            />
          </Flex>
        </Flex>
      </Flex>
      {deck && !deck.original && (
        <Tooltip
          label={`Community deck by ${deck.author} — view the original on unmatched.cards`}
          hasArrow
          placement="top"
        >
          <Link
            href={`https://unmatched.cards/decks/${deck.id}`}
            isExternal
            aria-label={`View ${hero.name} by ${deck.author} on unmatched.cards`}
            position="absolute"
            top="0.4rem"
            right="0.4rem"
            display="flex"
            alignItems="center"
            justifyContent="center"
            w="1.35rem"
            h="1.35rem"
            borderRadius="0.35rem"
            bg="rgba(20, 8, 24, 0.55)"
            color="whiteAlpha.800"
            transition="color 0.15s, background 0.15s"
            _hover={{ color: "brand.accent", bg: "rgba(20, 8, 24, 0.85)" }}
          >
            <TbExternalLink size="0.9rem" />
          </Link>
        </Tooltip>
      )}
      {/* sibling of the select button, same reason as the external-link icon
          above: nesting a <button> in a <button> is invalid HTML */}
      <Tooltip label={`Preview ${hero.name}`} hasArrow placement="top">
        <Flex
          as="button"
          type="button"
          onClick={onPreview}
          aria-label={`Preview ${hero.name}`}
          position="absolute"
          top="0.4rem"
          left="0.4rem"
          alignItems="center"
          justifyContent="center"
          w="1.35rem"
          h="1.35rem"
          borderRadius="0.35rem"
          bg="rgba(20, 8, 24, 0.55)"
          color="whiteAlpha.800"
          transition="color 0.15s, background 0.15s"
          _hover={{ color: "brand.accent", bg: "rgba(20, 8, 24, 0.85)" }}
        >
          <TbInfoCircle size="0.9rem" />
        </Flex>
      </Tooltip>
    </Box>
  );
};

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
 * The create/join screen. Renders one tile per server-fed hero. While the
 * roster hasn't arrived (`heroes === null`) it shows skeletons — or, if the
 * creator arrived with a valid `?hero=`, that hero as preselected text so they
 * can Create the instant the socket opens (the server validates the hero id).
 */
/** Opponent choice in the create flow: a human via link, or the server AI. */
type OpponentChoice = "human" | BotDifficulty;

const OPPONENT_CHOICES: { id: OpponentChoice; label: string }[] = [
  { id: "human", label: "Human" },
  { id: "easy", label: "AI · easy" },
  { id: "medium", label: "AI · medium" },
  { id: "hard", label: "AI · hard" },
];

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
  onConfirm,
  customMapJson,
  onCustomMapJsonChange,
  selectedMapId,
  onSelectMap,
  mapError,
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
  onConfirm: () => void;
  /** raw custom-map JSON (create flow only) — persisted in the parent */
  customMapJson: string;
  onCustomMapJsonChange: (json: string) => void;
  /** chosen board: a MAP_CATALOG id, or CUSTOM_MAP_ID for the paste-JSON option */
  selectedMapId: string;
  onSelectMap: (id: string) => void;
  /** local parse error or the server's BAD_MAP message, shown inline */
  mapError: string | null;
}) => {
  // While the list is loading, a valid-looking `?hero=` stands in so the
  // creator isn't blocked; once the list arrives the real selection takes over.
  const effective = selectedHeroId ?? (heroes === null ? heroParam : null);
  const canConfirm = status === "open" && !!effective;
  const format = formatChoice(selectedFormat);
  const multiplayer = selectedFormat !== "duel";
  const [previewHero, setPreviewHero] = useState<HeroListing>();

  return (
    <Flex direction="column" alignItems="center" gap="1.25rem" pt="3.5rem" px="1rem" pb="3rem">
      <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em" textAlign="center">
        {room ? `JOIN ROOM ${room}` : "CREATE A ROOM"}
      </Text>
      <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
        Choose your fighter
      </Text>

      <Grid
        w="100%"
        maxW="34rem"
        templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }}
        gap="0.75rem"
      >
        {heroes === null ? (
          heroParam ? (
            <Flex
              direction="column"
              align="center"
              gap="0.4rem"
              w="100%"
              sx={{ aspectRatio: "63 / 88" }}
              justify="center"
              borderRadius="0.6rem"
              border="2px solid"
              borderColor="brand.accent"
              bg="rgba(20, 8, 24, 0.55)"
              p="0.75rem"
            >
              <Text fontFamily="BebasNeueRegular" fontSize="1.35rem" textAlign="center">
                {prettyHeroId(heroParam)}
              </Text>
              <Text fontSize="0.7rem" opacity={0.6}>
                loading roster…
              </Text>
            </Flex>
          ) : (
            <>
              <SkeletonTile />
              <SkeletonTile />
              <SkeletonTile />
            </>
          )
        ) : heroes.length === 0 ? (
          <Text gridColumn="1 / -1" textAlign="center" opacity={0.7}>
            no heroes available — try again shortly
          </Text>
        ) : (
          heroes.map((h) => (
            <HeroTile
              key={h.heroId}
              hero={h}
              selected={effective === h.heroId}
              onSelect={() => onSelectHero(h.heroId)}
              onPreview={() => setPreviewHero(h)}
            />
          ))
        )}
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

      {!room && (
        <Flex direction="column" alignItems="center" gap="0.65rem">
          <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
            Format
          </Text>
          <Flex gap="0.5rem" flexWrap="wrap" justifyContent="center">
            {PRO_FORMATS.map((f) => (
              <Button
                key={f.id}
                {...BTN}
                size="sm"
                border="2px solid"
                borderColor={selectedFormat === f.id ? "brand.accent" : "transparent"}
                onClick={() => onSelectFormat(f.id)}
              >
                {f.label}
              </Button>
            ))}
          </Flex>
          <Text fontSize="0.7rem" opacity={0.6} textAlign="center">
            {format.detail} · {format.requiredPlayers} players
          </Text>
        </Flex>
      )}

      {/* Board picker (create flow only): one card per built-in board plus a
          "Custom…" card that reveals the paste-JSON textarea. Ineligible boards
          render disabled with the reason — never hidden — mirroring the server's
          per-format map support so a rendered-eligible card never BAD_MAPs. */}
      {!room && (
        <Flex direction="column" alignItems="center" gap="0.65rem" w="100%" maxW="34rem">
          <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
            Board
          </Text>
          <Grid
            w="100%"
            templateColumns={{ base: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" }}
            gap="0.6rem"
          >
            {MAP_CATALOG.map((entry) => {
              const reason = ineligibleReason(entry.map, selectedFormat);
              const eligible = reason === null;
              const selected = selectedMapId === entry.id;
              return (
                <Flex
                  as="button"
                  key={entry.id}
                  direction="column"
                  gap="0.3rem"
                  p="0.35rem"
                  borderRadius="0.5rem"
                  border="2px solid"
                  borderColor={selected ? "brand.accent" : "whiteAlpha.200"}
                  bg="rgba(20, 8, 24, 0.55)"
                  opacity={eligible ? 1 : 0.4}
                  cursor={eligible ? "pointer" : "not-allowed"}
                  transition="border-color 0.15s, opacity 0.15s"
                  _hover={eligible ? { borderColor: selected ? "brand.accent" : "whiteAlpha.400" } : {}}
                  onClick={() => eligible && onSelectMap(entry.id)}
                  disabled={!eligible}
                  textAlign="left"
                >
                  <Box
                    w="100%"
                    sx={{ aspectRatio: "16 / 10" }}
                    borderRadius="0.35rem"
                    bgImage={`url("${entry.thumbnailUrl}")`}
                    bgSize="cover"
                    bgPosition="center"
                    bgColor="rgba(0,0,0,0.4)"
                  />
                  <Text fontFamily="BebasNeueRegular" fontSize="0.85rem" lineHeight="1.05" noOfLines={2}>
                    {entry.title}
                  </Text>
                  <Flex gap="0.25rem" flexWrap="wrap">
                    {eligibleFormats(entry.map).map((fid) => (
                      <Text
                        key={fid}
                        fontSize="0.55rem"
                        fontFamily="SpaceGrotesk"
                        letterSpacing="0.05em"
                        px="0.3rem"
                        borderRadius="0.25rem"
                        bg="whiteAlpha.200"
                        opacity={0.8}
                      >
                        {FORMAT_BADGE[fid]}
                      </Text>
                    ))}
                  </Flex>
                  {!eligible && (
                    <Text fontSize="0.55rem" fontFamily="SpaceGrotesk" color="#E0A06E" opacity={0.85}>
                      {reason}
                    </Text>
                  )}
                </Flex>
              );
            })}

            {/* Custom… card — reveals the paste-JSON textarea below */}
            <Flex
              as="button"
              direction="column"
              gap="0.3rem"
              p="0.35rem"
              borderRadius="0.5rem"
              border="2px dashed"
              borderColor={selectedMapId === CUSTOM_MAP_ID ? "brand.accent" : "whiteAlpha.300"}
              bg="rgba(20, 8, 24, 0.35)"
              cursor="pointer"
              transition="border-color 0.15s"
              _hover={{ borderColor: "whiteAlpha.500" }}
              onClick={() => onSelectMap(CUSTOM_MAP_ID)}
              alignItems="center"
              justifyContent="center"
              textAlign="center"
            >
              <Box w="100%" sx={{ aspectRatio: "16 / 10" }} display="flex" alignItems="center" justifyContent="center">
                <Text fontSize="1.6rem" opacity={0.5}>
                  +
                </Text>
              </Box>
              <Text fontFamily="BebasNeueRegular" fontSize="0.85rem">
                Custom…
              </Text>
              <Text fontSize="0.55rem" fontFamily="SpaceGrotesk" opacity={0.5}>
                paste map JSON
              </Text>
            </Flex>
          </Grid>
        </Flex>
      )}

      {!room && !multiplayer && (
        <Flex direction="column" alignItems="center" gap="0.4rem">
          <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
            Opponent
          </Text>
          <Flex gap="0.5rem" flexWrap="wrap" justifyContent="center">
            {OPPONENT_CHOICES.map((o) => (
              <Button
                key={o.id}
                {...BTN}
                size="sm"
                border="2px solid"
                borderColor={opponent === o.id ? "brand.accent" : "transparent"}
                onClick={() => onSelectOpponent(o.id)}
              >
                {o.label}
              </Button>
            ))}
          </Flex>
          {opponent !== "human" && (
            <Flex direction="column" alignItems="center" gap="0.3rem">
              <Menu placement="bottom">
                <MenuButton
                  as={Button}
                  {...BTN}
                  size="sm"
                  rightIcon={<TbChevronDown />}
                  isDisabled={heroes === null}
                >
                  AI hero: {aiHeroId ? heroNameOf(heroes, aiHeroId) : "Random"}
                </MenuButton>
                <MenuList bg="brand.surface" borderColor="whiteAlpha.300" maxH="16rem" overflowY="auto">
                  <MenuItem onClick={() => onSelectAiHero(null)} bg="transparent" _hover={{ bg: "whiteAlpha.100" }}>
                    Random
                  </MenuItem>
                  {(heroes ?? []).map((h) => (
                    <MenuItem
                      key={h.heroId}
                      onClick={() => onSelectAiHero(h.heroId)}
                      bg="transparent"
                      _hover={{ bg: "whiteAlpha.100" }}
                    >
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
        </Flex>
      )}

      {!room && multiplayer && (
        <CreateSeats
          selectedFormat={selectedFormat}
          botSlotPlan={botSlotPlan}
          onChangeBotSlot={onChangeBotSlot}
        />
      )}

      <Button {...BTN_GOLD} isDisabled={!canConfirm} onClick={onConfirm}>
        {room ? "Join" : multiplayer ? `Create ${format.label}` : opponent === "human" ? "Create" : "Play vs AI"}
      </Button>

      {/* Custom board: the paste-JSON textarea, revealed only when the Custom…
          card above is selected. Behavior (validation, BAD_MAP bounce) unchanged. */}
      {!room && selectedMapId === CUSTOM_MAP_ID && (
        <Box maxW="28rem" w="100%">
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

      <Text fontSize="0.8rem" opacity={0.55}>
        server: {status === "open" ? "connected" : status}
      </Text>
    </Flex>
  );
};

// ---------------------------------------------------------------------------
// LIVE mode
// ---------------------------------------------------------------------------

const LiveGame = ({ room, heroParam, debug }: { room: string | null; heroParam: string | null; debug: boolean }) => {
  const { status, roomId, roomInfo, snapshot, opponentConnected, seatPresence, error, heroes, lobbies, roomPublic, replayBundle, createRoom, joinRoom, sendAction, respondToPrompt, requestUndo, respondToUndo, incomingUndo, undoPending, undoRejected, acknowledgeUndoRejected, undoUnavailable, acknowledgeUndoUnavailable, serverError, acknowledgeServerError, rateLimited, acknowledgeRateLimited, requestLobbies, setVisibility, serverRestarting, gameLost } =
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
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // First space tapped in a two-tap LARGE-fighter move pick (issue #132), scoped
  // to the prompt it belongs to so a stale anchor never leaks into the next one.
  const [poseAnchor, setPoseAnchor] = useState<{ promptId: string; space: SpaceId } | null>(null);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  // Client-side memory that YOU chose to forfeit (vs. being swept by combat), so
  // the continuing-game spectator panel can say "You forfeited — spectating"
  // instead of the generic elimination copy. Resets on refresh — the panel then
  // degrades to the neutral "eliminated" wording, which stays accurate either way.
  const [iForfeited, setIForfeited] = useState(false);
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
  const { resolveCard, resolveHero } = useProCardArt(
    snapshot ? [...new Set(snapshot.view.players.map((p) => p.heroId))] : [],
    snapshot?.view.catalog ?? {}
  );

  // Sounds + transient board visuals, derived by diffing snapshots (useGameFx).
  const { boardFx, hurtKey, soundOn, visualOn, toggleSound, toggleVisual } = useGameFx(snapshot);

  // Combat callouts (issue #162): full-screen turn/defend/reveal flourishes,
  // gated behind the `combatFx` beta flag. Decorative-only; a separate hook so
  // the board-FX loop above stays byte-identical. Off → returns [].
  const [combatFxOn] = useFlag("combatFx");
  const combatCallouts = useCombatCallouts(snapshot, combatFxOn);

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
  const [eventLogOn] = useFlag("eventLog");
  const [logEntries, setLogEntries] = useState<ProLogEntry[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const logSeqRef = useRef(0);
  useEffect(() => {
    if (!snapshot) return;
    const next = snapshot.view;
    const diff = diffViews(prevViewRef.current, next, (c) => cardLabel(next.catalog, c));
    // Decoratively enrich with the engine's structured events for THIS batch —
    // gated behind the eventLog flag. Flag off (or no events) leaves the log
    // byte-identical to the pure diffViews path. See enrichLines in gameLog.ts.
    const lines =
      eventLogOn && snapshot.events.length
        ? enrichLines(diff, snapshot.events, {
            label: (source) => resolveEventSource(next, source),
            you: next.you,
            seat: (player) => seatLabel(next, player),
          })
        : diff;
    prevViewRef.current = next;
    if (lines.length === 0) return;
    const ts = Date.now();
    const turn = next.turnNumber;
    setLogEntries((cur) =>
      [...lines.map((l) => ({ ...l, key: `log-${logSeqRef.current++}`, ts, turn })).reverse(), ...cur].slice(0, 120)
    );
  }, [snapshot, eventLogOn]);

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

  if (!joined) {
    const effectiveHeroId = selectedHeroId ?? (heroes === null ? heroParam : null);
    return (
      <>
        {recentRooms.length > 0 && (
          <Flex direction="column" alignItems="center" gap="0.5rem" pt="1.5rem" mb="-2rem">
            <Text
              fontFamily="BebasNeueRegular"
              fontSize="1rem"
              letterSpacing="0.08em"
              opacity={0.75}
            >
              Resume a recent match
            </Text>
            <Flex gap="0.5rem" flexWrap="wrap" justifyContent="center">
              {recentRooms.map((r) => (
                <Button
                  key={r.roomId}
                  {...BTN}
                  size="sm"
                  onClick={() => {
                    joinRoom(r.roomId, ""); // token path — heroId ignored
                    setJoined(true);
                  }}
                >
                  room {r.roomId} · {agoLabel(r.ts)}
                </Button>
              ))}
            </Flex>
          </Flex>
        )}
        <HeroSelectLobby
          room={room}
          status={status}
          heroes={heroes}
          heroParam={heroParam}
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
                    .filter(([, occupant]) => occupant === "easy")
                    .map(([player]) => ({ player: player as PlayerId, difficulty: "easy" }));
            createRoom(effectiveHeroId, bot, customMap, selectedFormat, botSeats);
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

          {/* team preview (issue #195): in a team format the seat→team mapping is
              fixed, so show who is with whom before the game even starts. The
              viewer's team is listed first and accented. Live ROOM_STATUS roster
              (issue #222) fills each seat with the real hero as it joins — an
              un-filled seat shows "?" ("You + ? vs GINGERBREAD + ?"). */}
          {(() => {
            const comp = teamComposition(roomInfo?.formatId ?? selectedFormat);
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
            const isTeam = !!teamComposition(roomInfo?.formatId ?? selectedFormat);
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

  // Optional filter: click one of your movable fighters to see only ITS moves
  // (matters once a deck has sidekicks; harmless in the Kong mirror).
  const spaceMatches = (actions: Action[]) =>
    selectedFighter
      ? actions.filter((a) => a.type !== "MOVE_FIGHTER" || a.fighter === selectedFighter)
      : actions;
  const highlightedSpaces = [
    ...[...spaceActions.entries()].filter(([, actions]) => spaceMatches(actions).length > 0).map(([space]) => space),
    ...promptSpaceIds,
    ...(poseIndex.size > 0 ? poseHighlights(poseIndex, activePoseAnchor) : []),
  ];
  const highlightedFighters = [...attackActions.keys(), ...movableFighters, ...promptTargetIds];

  // Issue #85: say out loud why boost is (or is no longer) available, instead
  // of letting the affordance silently vanish once the fighters have moved.
  const boostHint = maneuverBoostHint(view, legalActions);

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
    const candidates = spaceMatches(spaceActions.get(space) ?? []);
    if (candidates.length === 0) return;
    const action = candidates[0];
    sendAction(action);
    if (action.type === "MOVE_FIGHTER") {
      // The server's path may or may not include the fighter's current
      // space as path[0] — prepend it if it's missing so the tween always
      // starts from where the token actually is.
      const origin = view.fighters.find((f) => f.id === action.fighter)?.space;
      const fullPath = origin && action.path[0] !== origin ? [origin, ...action.path] : action.path;
      if (fullPath.length >= 2) setPendingMove({ fighterId: action.fighter, path: fullPath });
    }
    setSelectedFighter(null);
  };
  const onFighterClick = (id: FighterId) => {
    if (promptForMe && promptTargetIds.includes(id)) {
      respondToPrompt(promptForMe.promptId, id);
      setSelectedFighter(null);
      return;
    }
    const attack = attackActions.get(id);
    if (attack) {
      sendAction(attack);
      setSelectedFighter(null);
    } else if (movableFighters.has(id)) {
      setSelectedFighter((cur) => (cur === id ? null : id));
    }
  };

  // Hand affordances: a card is playable iff a server-offered action carries
  // its instance id (pure logic in lib/pro/actionDock — seat-agnostic, so a
  // multiplayer BOOST_MOVE from p3 renders and sends exactly like a duel seat).
  const actionsForCard = (instance: CardInstanceId) => cardAffordances(legalActions, instance);

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
          fx={boardFx}
          pendingMove={pendingMove ?? incomingMove}
          onPendingMoveSettled={() => {
            setPendingMove(null);
            clearIncoming();
          }}
          closedRegions={view.closedRegions}
          onSpaceClick={onSpaceClick}
          onFighterClick={onFighterClick}
          imgMaxH="calc(100svh - 16rem)"
          zoomable={zoomMapOn}
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

      {/* combat callouts: turn banner / DEFEND! pulse / scheme-effect card
          reveal (issue #162, gated by the combatFx flag inside useCombatCallouts;
          empty when off or on a pre-v10 server) */}
      {combatCallouts.map((item) => (
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
          {(highlightedSpaces.length > 0 || attackActions.size > 0) && (
            <Text fontSize="0.8rem" color="brand.accent" textShadow="0 1px 3px rgba(0,0,0,0.6)">
              {selectedFighter
                ? `showing moves for ${selectedFighter.split("/")[1]} — click a gold space (click the fighter again to unselect)`
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
          {view.combat && (
            <CombatPanel
              combat={view.combat}
              catalog={view.catalog}
              resolveCard={resolveCard}
              you={view.you}
              selfCommitted={view.self.committedCard}
            />
          )}
          {prompt && (
            <PromptPanel
              prompt={prompt}
              you={view.you}
              onRespond={respondToPrompt}
              buttonOptions={promptButtonOptions}
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
                  <Text as="span">{describeAction(view.catalog, a, { nameOf, attackerBadge })}</Text>
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
            <Text
              fontFamily="LeagueGothic"
              fontSize="3rem"
              color="brand.accent"
              textShadow="0 2px 12px rgba(224,168,46,0.5)"
            >
              {isViewerOnWinningTeam(view) ? "VICTORY!" : "DEFEAT"}
            </Text>
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
  // reflavored/baseline decks the server hides by default — in the picker and in
  // random bot picks. See lib/pro/protocol.ts v15.
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
