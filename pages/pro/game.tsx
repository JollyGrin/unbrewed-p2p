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
import { Box, Button, Flex, Grid, Link, Menu, MenuButton, MenuItem, MenuList, Tag, Text, Textarea, Tooltip, keyframes } from "@chakra-ui/react";
import { MOVE_STEP_SECONDS, PendingMove, ProBoard } from "@/components/Pro/ProBoard";
import {
  Action,
  BotDifficulty,
  CardInstanceId,
  CardMeta,
  FighterId,
  HeroListing,
  LegalOption,
  PlayerView,
  ProMapDef,
  ReplayBundle,
  SpaceId,
  ViewCombat,
  ViewFighter,
  ViewPrompt,
} from "@/lib/pro/protocol";
import { saveReplay } from "@/lib/pro/replayStore";
import { ProConnectionStatus, useProSocket } from "@/lib/pro/useProSocket";
import { normalizeMap } from "@/lib/pro/normalizeMap";
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
import { diffViews, enrichLines } from "@/lib/pro/gameLog";
import { useFlag } from "@/lib/flags";
import { maneuverBoostHint } from "@/lib/pro/maneuverHint";
import { buildPoseIndex, parsePoseOptions, poseHighlights, resolvePoseClick } from "@/lib/pro/moveChoice";
import { useGameFx } from "@/lib/pro/useGameFx";
import { useCombatCallouts, CombatCalloutItem } from "@/lib/pro/combatFx";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";
import { PRO_WS_URL as WS_URL } from "@/lib/pro/wsUrl";

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

/** Printed-card title via the server catalog ('king-kong/clobber#2' -> 'Clobber'). */
const cardTitle = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const defId = instance.split("#")[0];
  return catalog[defId]?.title ?? defId.split("/").pop() ?? instance;
};

/** Printed-card label via the server catalog ('king-kong/clobber#2' -> 'clobber (3/2)'). */
const cardLabel = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const meta = catalog[instance.split("#")[0]];
  if (!meta) return instance.split("#")[0].split("/").pop() ?? instance;
  const stats = meta.type === "scheme" ? "scheme" : `${meta.value ?? "–"}/${meta.boost ?? "–"}`;
  return `${meta.title} (${stats})`;
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

/** Presentational label for a server-offered action. */
const describeAction = (catalog: Record<string, CardMeta>, a: Action): string => {
  switch (a.type) {
    case "MANEUVER":
      return "Maneuver";
    case "BOOST_MOVE":
      return `Boost move (discard ${cardLabel(catalog, a.card)})`;
    case "MOVE_FIGHTER":
      return `Move ${a.fighter.split("/")[1]}`;
    case "END_MANEUVER":
      return "End maneuver";
    case "SCHEME":
      return `Scheme: ${cardLabel(catalog, a.card)}`;
    case "DECLARE_ATTACK":
      return `Attack ${a.target.split("/")[1]} with ${a.attacker.split("/")[1]}`;
    case "COMMIT_ATTACK_CARD":
      return `Commit ${cardLabel(catalog, a.card)}`;
    case "COMMIT_DEFENSE_CARD":
      return `Defend with ${cardLabel(catalog, a.card)}`;
    case "DECLINE_DEFENSE":
      return "Don't defend";
    case "DISCARD_TO_LIMIT":
      return `Discard ${cardLabel(catalog, a.card)}`;
    case "PLACE_SIDEKICK":
      return `Place ${a.fighter.split("/")[1]} on ${a.space}`;
    case "RESPOND_PROMPT":
      return "Answer prompt"; // rendered by PromptPanel instead — filtered out of the list
    case "FORFEIT":
      return "Forfeit"; // engine #32 enumerates it, but we filter it out of the list and offer it via the dock button
  }
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
    {/* v10 attribution: WHICH effect is asking — shown to chooser and spectator alike */}
    {sourceLabel && (
      <Text fontSize="0.8rem" mb="0.5rem" color="brand.parchment" opacity={0.85}>
        {sourceLabel}
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
 * The overlay for one live combat callout. Decorative only, pointer-transparent,
 * and above the board/vignette. `reveal` names its source with the SAME resolver
 * the activity log uses (`resolveEventSource`), so `'(hidden)'` reads as
 * "a hidden card" and its face falls back to that text via CardFace.
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
  const card = resolveCard(item.source);
  const name = resolveEventSource(view, item.source);
  return (
    <Flex
      position="fixed"
      top="46%"
      left="50%"
      zIndex={205}
      direction="column"
      alignItems="center"
      gap="0.75rem"
      pointerEvents="none"
      animation={`${calloutReveal} 2.3s ease-out both`}
    >
      <Box w={{ base: "9rem", md: "12rem" }} sx={{ aspectRatio: "63 / 88" }} filter="drop-shadow(0 8px 24px rgba(0,0,0,0.6))">
        <CardFace card={card} fallback={name} />
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
              {hero.name}
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
  onSelectOpponent,
  onSelectHero,
  aiHeroId,
  onSelectAiHero,
  onConfirm,
  customMapJson,
  onCustomMapJsonChange,
  showMapInput,
  onToggleMapInput,
  mapError,
}: {
  room: string | null;
  status: ProConnectionStatus;
  heroes: HeroListing[] | null;
  heroParam: string | null;
  selectedHeroId: string | null;
  opponent: OpponentChoice;
  onSelectOpponent: (o: OpponentChoice) => void;
  onSelectHero: (heroId: string) => void;
  /** the specific hero the AI should play, or null to let the server pick at random */
  aiHeroId: string | null;
  onSelectAiHero: (heroId: string | null) => void;
  onConfirm: () => void;
  /** raw custom-map JSON (create flow only) — persisted in the parent */
  customMapJson: string;
  onCustomMapJsonChange: (json: string) => void;
  showMapInput: boolean;
  onToggleMapInput: () => void;
  /** local parse error or the server's BAD_MAP message, shown inline */
  mapError: string | null;
}) => {
  // While the list is loading, a valid-looking `?hero=` stands in so the
  // creator isn't blocked; once the list arrives the real selection takes over.
  const effective = selectedHeroId ?? (heroes === null ? heroParam : null);
  const canConfirm = status === "open" && !!effective;
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

      <Button {...BTN_GOLD} isDisabled={!canConfirm} onClick={onConfirm}>
        {room ? "Join" : opponent === "human" ? "Create" : "Play vs AI"}
      </Button>

      {/* Power-user affordance (create flow only): playtest an unpublished board
          by pasting its JSON. Kept near-invisible so it doesn't compete for a
          normal player's attention. Composes with a human or AI opponent. */}
      {!room && (
        <Box maxW="28rem" w="100%">
          {!showMapInput ? (
            <Text
              as="button"
              onClick={onToggleMapInput}
              display="block"
              mx="auto"
              fontFamily="SpaceGrotesk"
              fontSize="0.7rem"
              letterSpacing="0.08em"
              opacity={0.35}
              _hover={{ opacity: 0.75 }}
              transition="opacity 0.15s"
            >
              playtest a custom map
            </Text>
          ) : (
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
                  only you set this up · your opponent (or the AI) just plays on it
                </Text>
              )}
            </Flex>
          )}
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

const LiveGame = ({ room, heroParam }: { room: string | null; heroParam: string | null }) => {
  const { status, roomId, snapshot, opponentConnected, error, heroes, lobbies, roomPublic, replayBundle, createRoom, joinRoom, sendAction, respondToPrompt, requestUndo, respondToUndo, incomingUndo, undoPending, undoRejected, acknowledgeUndoRejected, undoUnavailable, acknowledgeUndoUnavailable, requestLobbies, setVisibility, serverRestarting, gameLost } =
    useProSocket(WS_URL);
  const [joined, setJoined] = useState(false);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<OpponentChoice>("human");
  const [aiHeroId, setAiHeroId] = useState<string | null>(null);
  const [selectedFighter, setSelectedFighter] = useState<FighterId | null>(null);
  // First space tapped in a two-tap LARGE-fighter move pick (issue #132), scoped
  // to the prompt it belongs to so a stale anchor never leaks into the next one.
  const [poseAnchor, setPoseAnchor] = useState<{ promptId: string; space: SpaceId } | null>(null);
  const [reportBugOpen, setReportBugOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  // Issue #80: a just-committed MOVE_FIGHTER tweens through its whole path
  // instead of snapping — held here so the board keeps rendering it while
  // the authoritative STATE (which may already show the fighter arrived)
  // comes back over the wire.
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  usePendingMoveTimeout(pendingMove, () => setPendingMove(null));
  // Custom-map playtest (create flow): raw JSON persists across a BAD_MAP bounce
  // so a power user can fix the board and retry without re-pasting.
  const [customMapJson, setCustomMapJson] = useState("");
  const [showMapInput, setShowMapInput] = useState(false);
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
    snapshot ? [snapshot.view.self.heroId, snapshot.view.opponent.heroId] : [],
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
      setShowMapInput(true);
      setMapError(error.message);
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
          onSelectOpponent={setOpponent}
          onSelectHero={setSelectedHeroId}
          aiHeroId={aiHeroId}
          onSelectAiHero={setAiHeroId}
          customMapJson={customMapJson}
          onCustomMapJsonChange={(json) => {
            setCustomMapJson(json);
            if (mapError) setMapError(null); // clear stale error as they edit
          }}
          showMapInput={showMapInput}
          onToggleMapInput={() => setShowMapInput((v) => !v)}
          mapError={mapError}
          onConfirm={() => {
            if (!effectiveHeroId) return;
            if (room) {
              joinRoom(room, effectiveHeroId);
              setSelectedHeroId(effectiveHeroId);
              setJoined(true);
              return;
            }
            // Create flow: parse the optional custom board just-in-time. Local
            // structural errors stay in the lobby; the server re-validates the
            // graph and answers BAD_MAP (handled by the error effect above).
            let customMap: ProMapDef | undefined;
            const trimmed = customMapJson.trim();
            if (trimmed) {
              try {
                customMap = normalizeMap(JSON.parse(trimmed));
              } catch (e) {
                setMapError(e instanceof Error ? e.message : "invalid JSON");
                setShowMapInput(true);
                return;
              }
            }
            setMapError(null);
            const bot =
              opponent === "human"
                ? undefined
                : { difficulty: opponent, ...(aiHeroId ? { heroId: aiHeroId } : {}) };
            createRoom(effectiveHeroId, bot, customMap);
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
  if (error && (error.code === "ROOM_NOT_FOUND" || error.code === "ROOM_FULL")) {
    const msg =
      error.code === "ROOM_NOT_FOUND"
        ? "This room expired or never existed."
        : "This room is already full.";
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
          <Text opacity={0.8}>Waiting for an opponent — the game starts the moment they join.</Text>

          {/* discoverability: invite privately, list publicly, or (soon) fight a bot */}
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
            <Tooltip label="A referee-trained sparring bot is on the roadmap" hasArrow>
              <Button {...BTN} isDisabled>
                play vs bot — coming soon
              </Button>
            </Tooltip>
          </Flex>
          <Text fontSize="0.8rem" opacity={0.5}>
            (testing solo? open that link in a second browser tab)
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
      : `${heroNameOf(heroes, promptSource.hero === view.you ? view.self.heroId : view.opponent.heroId) ?? "Hero"}'s ability`;

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
  // its instance id. Short verb labels; the full sentence stays in the sidebar.
  const actionsForCard = (instance: CardInstanceId) =>
    legalActions.flatMap((a) => {
      if (!("card" in a) || a.card !== instance) return [];
      const label =
        a.type === "SCHEME"
          ? "Scheme"
          : a.type === "BOOST_MOVE"
            ? "Boost move"
            : a.type === "COMMIT_ATTACK_CARD"
              ? "Attack with"
              : a.type === "COMMIT_DEFENSE_CARD"
                ? "Defend with"
                : "Discard"; // DISCARD_TO_LIMIT — the only remaining card-carrying type
      return [{ action: a, label }];
    });

  return (
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
          fx={boardFx}
          pendingMove={pendingMove}
          onPendingMoveSettled={() => setPendingMove(null)}
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
          <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
            <Tag size="sm" bg={myTurn ? "brand.accent" : "whiteAlpha.300"} color={myTurn ? "brand.surfaceDim" : "brand.parchment"}>
              {myTurn ? "YOUR TURN" : "OPPONENT'S TURN"}
            </Tag>
            <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
              turn {view.turnNumber}
            </Tag>
            <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
              {view.actionsRemaining} actions left
            </Tag>
            {!opponentConnected && (
              <Tag size="sm" colorScheme="red">
                opponent disconnected
              </Tag>
            )}
          </Flex>
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
                {describeAction(view.catalog, a)}
              </Button>
            ))}
            {legalActions.length === 0 && !prompt && (
              <Text opacity={0.7} fontSize="0.9rem" color="brand.parchment">
                waiting on opponent…
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
              {view.winner === view.you ? "VICTORY!" : "DEFEAT"}
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
          {/* Forfeit — only while the game is genuinely live (issue #140). Hidden
              during SETUP and once GAME_OVER / a winner exists (no affordances
              remain then). Destructive, so it's red and confirm-gated. */}
          {view.phase === "PLAY" && !view.winner && (
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

      {/* concede confirmation (issue #140) — sends FORFEIT on confirm */}
      <ForfeitDialog
        isOpen={forfeitOpen}
        onClose={() => setForfeitOpen(false)}
        onConfirm={() => sendAction({ type: "FORFEIT", player: view.you })}
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

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
      {WS_URL ? <LiveGame room={room} heroParam={heroParam} /> : <PreviewGame />}
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
