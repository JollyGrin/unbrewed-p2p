/**
 * Pro player HUD — floating frosted plates over the board, built from the
 * SAME styled pieces the sandbox header uses (header.styles.tsx) so the two
 * modes feel like one app. Read-only by design: every number comes from the
 * server view; there are no adjust buttons because the referee owns the state.
 */
import { useEffect, useRef, useState } from "react";
import { animate, motion, useDragControls, useMotionValue } from "framer-motion";
import { keyframes } from "@emotion/react";
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Switch,
  Tag,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { LinkIcon } from "@chakra-ui/icons";
import {
  TbSword,
  TbBow,
  TbCards,
  TbGrave2,
  TbEyeOff,
  TbSparkles,
  TbWand,
  TbWandOff,
  TbChevronUp,
  TbChevronDown,
  TbArrowBackUp,
  TbFlask,
  TbBug,
  TbHourglass,
} from "react-icons/tb";
import { GiFootprint, GiHearts, GiHighTide, GiLowTide } from "react-icons/gi";
import { IoMdHand, IoMdVolumeHigh, IoMdVolumeOff } from "react-icons/io";
import { IconType } from "react-icons";
import {
  ChipCluster,
  HeroName,
  HudOverlay,
  MoveChip,
  Pip,
  PipFooter,
  PlayerName,
  PlayerTitleBar,
  StatContainer,
  StatLine,
  StatsPanel,
} from "@/components/Game/Header/header.styles";
import { InGameAccountChip } from "@/components/Account/AccountChip";
import { SPOTLIGHT_Z } from "./ActionSpotlight";
import { useAccount } from "@/lib/account/useAccount";
import { seatNameplate } from "@/lib/pro/playerIdentity";
import { BadgeGlyph, badgeArtName, isKnownBadge } from "@/components/Badges/BadgeGlyph";
import { DeckImportHeroType, DeckImportRuleCardType } from "@/components/DeckPool/deck-import.type";
import { CardInstanceId, PileEntry, PlayerId, PlayerView, ViewFighter, ViewPlayer } from "@/lib/pro/protocol";
import { isLargeFighter, LARGE_FIGHTER_BLURB } from "@/lib/pro/largeReach";
import { deriveTeams } from "@/lib/pro/teams";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { ResolveCard, ResolveHero, ResolveRuleCards } from "@/lib/pro/useProCardArt";
import {
  FlagHudChip,
  flagChipsFor,
  counterChipsFor,
  pileDisplayName,
  pileCardIds,
  pileCreditFor,
} from "@/lib/pro/heroStateFlags";
import { DEFAULT_PLATE_LAYOUT, PlateLayout, PlateSeat, useHudPlates } from "@/lib/pro/useHudPlates";
import { useCardPreview } from "./CardPreview";
import { CardFace } from "./ProHand";
import { ProConnectionStatus, SeatPresence, TurnTimer } from "@/lib/pro/useProSocket";
import { FLAGS, useFlags } from "@/lib/flags";

// Team-affiliation accent (issue #195). A teal that reads clearly as "friendly"
// and stays distinct from the gold TURN chip and from every per-seat identity
// color (gold/blue/green/magenta) so the ALLY chip never blends into a plate.
const ALLY_ACCENT = "#39B7A8";

// ---------------------------------------------------------------------------
// Flag HUD chip — always-visible public-state pill (tide + druid form today; any
// future flag-driven state by adding a HERO_STATE_FLAGS entry, which lights up
// this nameplate AND the fighter-token badge — see lib/pro/heroStateFlags.ts)
// ---------------------------------------------------------------------------

// Optional per-flag nameplate glyph. A registry entry with no icon here renders
// text-only (zero component surgery for a new flag-driven state). Tide gets the
// game-icons rising/ebbing-wave pair so HIGH vs LOW reads at a glance — but the
// WORDS carry the meaning; the icon is reinforcement, never the sole signal.
const FLAG_CHIP_ICONS: Record<string, { on: IconType; off: IconType }> = {
  HIGH_TIDE: { on: GiHighTide, off: GiLowTide },
};

// Kept generic over on/off (flag active vs absent) rather than per-flag, so any
// future two-state flag reads with the same saturated/muted grammar.
const flagChipPalette = (on: boolean) =>
  on
    ? { bg: "#2E6E8E", color: "#EAF6FB", ring: "rgba(140, 205, 235, 0.6)" }
    : { bg: "#586A73", color: "#E9F0F3", ring: "rgba(165, 190, 200, 0.45)" };

/**
 * One flag pill, styled in the counter-chip visual family. `key`ed by its state
 * upstream so a mid-game flip (HIGH TIDE <-> LOW TIDE from a "Turn the tide."
 * card) REMOUNTS it and replays the entrance pulse — the flip is noticeable with
 * no manual prev-value bookkeeping.
 */
const FlagChip = ({
  chip,
  on,
  onClick,
}: {
  chip: FlagHudChip;
  on: boolean;
  /** present for a pile-sourced chip — clicking opens the pile card list. The
   *  pointerdown is swallowed so the click never starts a plate drag. */
  onClick?: () => void;
}) => {
  const icons = FLAG_CHIP_ICONS[chip.flag];
  const Icon = icons ? (on ? icons.on : icons.off) : null;
  const label = on ? chip.onLabel : chip.offLabel;
  const pal = flagChipPalette(on);
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 20 }}
      aria-label={label}
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            title: `${label} — view the tucked cards`,
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      style={{
        cursor: onClick ? "pointer" : undefined,
        display: "inline-flex",
        alignItems: "center",
        gap: "0.2rem",
        flexShrink: 0,
        padding: "0.1rem 0.4rem",
        borderRadius: "0.375rem",
        fontSize: "0.65rem",
        fontWeight: 700,
        lineHeight: 1.4,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        background: pal.bg,
        color: pal.color,
        boxShadow: `inset 0 0 0 1px ${pal.ring}`,
      }}
    >
      {Icon && <Icon size={12} />}
      {label}
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// Public card-zone viewer (public info for both seats): the discard pile, and —
// since protocol v25 — a named set-aside pile (Luke's TRAINING cards tucked under
// his hero card). Both zones are fully public, so either seat can open EITHER
// player's list; the only difference is the title and which ids are passed in.
// ---------------------------------------------------------------------------

const CardListModal = ({
  title,
  cards,
  resolveCard,
  labelFor,
  isOpen,
  onClose,
}: {
  title: string;
  cards: CardInstanceId[];
  resolveCard: ResolveCard;
  labelFor: (instance: CardInstanceId) => string;
  isOpen: boolean;
  onClose: () => void;
}) => (
  <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered>
    <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
    <ModalContent bg="brand.surface" color="brand.parchment">
      <ModalHeader fontFamily="BebasNeueRegular" letterSpacing="0.04em">
        {title}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb="1.5rem">
        {cards.length === 0 ? (
          <Text opacity={0.6}>empty</Text>
        ) : (
          <Flex gap="0.6rem" flexWrap="wrap">
            {cards.map((c, i) => (
              <Box key={`${c}-${i}`} w="8rem" sx={{ aspectRatio: "63 / 88" }}>
                <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
              </Box>
            ))}
          </Flex>
        )}
      </ModalBody>
    </ModalContent>
  </Modal>
);

// ---------------------------------------------------------------------------
// One seat plate
// ---------------------------------------------------------------------------

/** Tiny ghost icon button for the plate's collapse / reset controls. Its
 *  pointerdown is swallowed so it never starts a plate drag. */
const CtrlBtn = ({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Flex
    as="button"
    type="button"
    aria-label={title}
    title={title}
    onPointerDown={(e) => e.stopPropagation()}
    onDoubleClick={(e) => e.stopPropagation()}
    onClick={onClick}
    alignItems="center"
    justifyContent="center"
    w="1.15rem"
    h="1.15rem"
    borderRadius="0.35rem"
    color="rgba(231, 204, 152, 0.72)"
    _hover={{ bg: "rgba(231, 204, 152, 0.16)", color: "brand.primary" }}
    transition="background 0.15s ease, color 0.15s ease"
  >
    {children}
  </Flex>
);

/** mm:ss for a non-negative second count. */
export const fmtCountdown = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Copy shown once the countdown hits 0. The engine only injects the abandonment
// forfeit at the disconnected seat's NEXT clock edge (engine PR #125 — FORFEIT is
// legal on-clock only), so the deadline can pass while another player is still
// mid-turn and the sweep lands seconds later (~15s observed). A clock frozen at
// 0:00 over-promises exactness; this says what actually happens next.
export const FORFEIT_AT_NEXT_TURN = "auto-forfeits on their next turn";

/**
 * Auto-forfeit countdown (issue #222). Drives off the SERVER deadline
 * (`autoForfeitAt`, epoch ms): every tick it recomputes remaining from
 * `Date.now()` rather than decrementing a local counter, so it never drifts and
 * self-corrects across a backgrounded tab. Once it reaches 0 it stops ticking
 * and switches to the "next turn" copy (issue #226) — kept until the forfeit
 * STATE arrives and clears the whole badge — instead of sitting at a stale 0:00.
 */
export const ForfeitCountdown = ({ deadline }: { deadline: number }) => {
  const remaining = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const [secs, setSecs] = useState(remaining);
  useEffect(() => {
    setSecs(remaining()); // resync immediately when the deadline changes
    const id = setInterval(() => setSecs(remaining()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);
  if (secs === 0) return <>{FORFEIT_AT_NEXT_TURN}</>;
  return <>auto-forfeit in {fmtCountdown(secs)}</>;
};

// ---------------------------------------------------------------------------
// Move timer draining bar (issue #223)
// ---------------------------------------------------------------------------

/** Seconds of remaining time under which the bar turns insistent (color + pulse). */
export const MOVE_TIMER_URGENT_S = 10;

/** Remaining milliseconds on the clock, clamped at 0. Pure — driven by the SERVER
 *  deadline, never a local counter, so it can't drift. */
export const moveTimerRemainingMs = (deadline: number, now: number) =>
  Math.max(0, deadline - now);

/** Fraction of the full window still remaining (0–1), for the bar width. The
 *  window length is the room's `turnTimerSeconds`; a non-positive total (or a
 *  deadline already past) reads 0. */
export const moveTimerFraction = (deadline: number, totalSeconds: number, now: number) => {
  if (totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, (deadline - now) / (totalSeconds * 1000)));
};

const urgentPulse = keyframes`
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
`;

/**
 * The acting seat's draining bar (issue #223, desync fix #283). Reads the SERVER
 * `deadline` (epoch ms) every animation frame and recomputes remaining from
 * `Date.now()` — no free-running local timer, so it never drifts and self-corrects
 * across a backgrounded tab.
 *
 * The bar's 100% is anchored to the remaining time captured the instant THIS
 * deadline first arrived (see `windowRef`), NOT the room's fixed `totalSeconds`.
 * That keeps the fill a pure function of the client's own clock: it starts full
 * and empties exactly at `deadline`, in lockstep with the numeric readout (both
 * derive from the same `remaining`). Anchoring to `totalSeconds` instead let
 * client/server clock skew — or any per-decision window that didn't equal the
 * room setting — desync the two: a lagging client pinned the fill at 100% while
 * the number ticked an inflated count (bar "frozen"), and a leading client (or a
 * shorter window) started the fill part-drained so it never read full at turn
 * start (#283). Re-anchors whenever `deadline` changes (a new TURN_TIMER) and on
 * refocus. Clamps at 0. Subtle gold at rest; shifts to an insistent red pulse
 * inside the last MOVE_TIMER_URGENT_S seconds. Every seat renders the bar for
 * whoever is on the clock, so it doubles as a "waiting on them" cue.
 */
export const MoveTimerBar = ({
  deadline,
  totalSeconds,
}: {
  deadline: number;
  totalSeconds: number;
}) => {
  // The window this deadline was armed with, in the client's clock frame: the
  // remaining time when we first saw it (falls back to the room setting for an
  // already-elapsed deadline, so the denominator is never zero/negative).
  const windowRef = useRef(Math.max(1, totalSeconds * 1000));
  const anchor = () => {
    windowRef.current = Math.max(
      moveTimerRemainingMs(deadline, Date.now()),
      1
    );
  };
  const read = () => {
    const now = Date.now();
    const remaining = moveTimerRemainingMs(deadline, now);
    return {
      fraction: Math.min(1, Math.max(0, remaining / windowRef.current)),
      secs: Math.ceil(remaining / 1000),
    };
  };
  const [{ fraction, secs }, setState] = useState(() => {
    anchor();
    return read();
  });
  useEffect(() => {
    anchor(); // re-anchor the 100% window to the fresh deadline…
    setState(read()); // …and resync the readout immediately
    let raf = requestAnimationFrame(function loop() {
      setState(read());
      raf = requestAnimationFrame(loop);
    });
    // rAF is throttled/suspended while the tab is backgrounded; snap back to the
    // true remaining the moment it returns rather than waiting for the next frame.
    const onVisible = () => {
      if (!document.hidden) setState(read());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, totalSeconds]);

  const urgent = secs <= MOVE_TIMER_URGENT_S;
  const fillColor = urgent ? "#C0392B" : "brand.accent";
  return (
    <Box px="0.85rem" pt="0.15rem" pb="0.4rem" aria-label="move timer">
      <Flex justifyContent="space-between" alignItems="center" mb="0.15rem">
        <Text
          fontSize="0.55rem"
          fontFamily="SpaceGrotesk"
          letterSpacing="0.08em"
          textTransform="uppercase"
          opacity={0.6}
        >
          on the clock
        </Text>
        <Text
          fontSize="0.62rem"
          fontFamily="SpaceGrotesk"
          fontWeight="bold"
          sx={{ fontVariantNumeric: "tabular-nums" }}
          color={urgent ? "#F0A6A0" : "brand.parchment"}
          opacity={urgent ? 1 : 0.75}
        >
          {fmtCountdown(Math.max(0, secs))}
        </Text>
      </Flex>
      <Box h="4px" borderRadius="2px" bg="rgba(20, 8, 24, 0.55)" overflow="hidden">
        <Box
          h="100%"
          borderRadius="2px"
          bg={fillColor}
          width={`${fraction * 100}%`}
          data-urgent={urgent ? "true" : "false"}
          data-fill={Math.round(fraction * 100)}
          transition="width 0.1s linear, background 0.3s ease"
          sx={urgent ? { animation: `${urgentPulse} 1s ease-in-out infinite` } : undefined}
        />
      </Box>
    </Box>
  );
};

export const SeatPlate = ({
  seatId,
  label,
  hero,
  ruleCards,
  heroId,
  heroFighter,
  sidekicks,
  flags,
  counters,
  piles,
  nameOfPlayer,
  wonCombat,
  isLocal,
  isActive,
  isAlly,
  presence,
  timer,
  avatarUrl,
  badge,
  hand,
  deckCount,
  discard,
  ongoingScheme,
  labelFor,
  resolveCard,
  layout,
  hydrated,
  onUpdate,
  variant = "plate",
}: {
  /** WHOSE plate this is — the pile's HOST, which is what a bare pile entry means
   *  (protocol v33). Needed to tell an own entry from a foreign one. */
  seatId: PlayerId;
  label: string;
  hero: DeckImportHeroType | null;
  /** deck-level "extra rules" cards (issue #372) — e.g. Clone Troopers' board
   *  cap; shown in the name-plate tooltip. [] when the deck has none. */
  ruleCards: DeckImportRuleCardType[];
  /** server hero id — gates flag chips (tide only shows for tide heroes) */
  heroId: string;
  heroFighter: ViewFighter | undefined;
  sidekicks: ViewFighter[];
  /** public per-player engine flags (tide etc.); undefined on older servers */
  flags?: Record<string, boolean>;
  /** public per-player engine counters (Nancy's CLUE etc.; PlayerView.counters).
   *  Drives the counter nameplate pill + token badge; undefined on older servers. */
  counters?: Record<string, number>;
  /** public per-player set-aside piles (Luke's TRAINING cards tucked under his
   *  hero card; PlayerView.piles, protocol v25). Drives the same pill + token
   *  badge as a counter, and makes the pill open the pile's card list. undefined
   *  on older servers, or when this seat has tucked nothing. */
  /** v33 (engine #481): each entry is a bare instance id — THIS seat controls the
   *  card, which is every entry in the game before Boba Fett — or
   *  `{card, controller}` for a card another seat tucked here. A card tucked under
   *  an opponent's hero card (Boba Fett's bounties) sits in the HOST's `piles`,
   *  which is where it renders, but it is still the tucker's card. Read entries
   *  through `pileEntryCard` / `pileEntryController`, and NEVER key a pile list by
   *  instance id: ids are minted per seat, so two same-deck seats can put the SAME
   *  id in one pile (that is the bug #481 fixed). */
  piles?: Record<string, PileEntry[]>;
  /** seat label for a PlayerId — used only to attribute a foreign-controlled pile
   *  ("2 by Boba Fett"). Omitted by callers with no seat table. */
  nameOfPlayer?: (id: PlayerId) => string;
  /** won >=1 combat this turn (ViewPlayer.wonCombatThisTurn) — shows a "combat won"
   *  chip that explains why Grievous's conditional AFTER effects fire differently.
   *  Turn-scoped: clears at turn start. undefined on older servers → no chip. */
  wonCombat?: boolean;
  isLocal: boolean;
  isActive: boolean;
  /** teammate of the viewing player (team formats only) — shows an ALLY chip */
  isAlly: boolean;
  /** move-timer window for THIS seat (issue #223): the server `deadline` and the
   *  room's window length, present only while this seat's clock is running in a
   *  timed room. undefined → no bar (untimed room, or not this seat's clock). */
  timer?: { deadline: number; totalSeconds: number };
  /** seat disconnected mid-game (issue #222): shows an offline badge, plus a
   *  non-drifting auto-forfeit countdown when `autoForfeitAt` is set. undefined =
   *  connected (or duel, which never populates this). */
  presence?: SeatPresence;
  /** Discord avatar for the LOCAL seat only (issue #568), rendered beside the
   *  nameplate. Read locally from `useAccount()` — avatars deliberately do NOT
   *  cross the protocol, so an opponent's plate never carries one. undefined =
   *  signed out, no avatar set, or the opponent's plate → nothing renders. */
  avatarUrl?: string | null;
  /** This seat's broadcast badge id (issue #577, engine #347) — public, so it
   *  renders on BOTH plates. Opaque and unverified: an id with no art here
   *  renders nothing at all. undefined = the seat wears none, or an older
   *  server → nothing renders. */
  badge?: string;
  /** own hand instances, or a count for the opponent */
  hand: CardInstanceId[] | number;
  deckCount: number;
  discard: CardInstanceId[];
  ongoingScheme: CardInstanceId | null;
  labelFor: (instance: CardInstanceId) => string;
  resolveCard: ResolveCard;
  layout: PlateLayout;
  hydrated: boolean;
  onUpdate: (partial: Partial<PlateLayout>) => void;
  /**
   * "plate" is the desktop floating card — draggable, collapsible, with the
   * hero's rules text behind a hover tooltip. "sheet" (issue #708) is the same
   * seat rendered full-width inside the mobile seat drawer: no drag, no
   * collapse, and every hover-only fact — the hero ability, the deck's extra
   * rules, the sidekick lines — spelled out inline, because a phone has no
   * hover.
   */
  variant?: "plate" | "sheet";
}) => {
  const [discardOpen, setDiscardOpen] = useState(false);
  // Which set-aside pile this plate is inspecting (v25), by pile name; null =
  // closed. Held per-plate so a seat's pill always opens THAT seat's pile — the
  // zone is public, so this works identically on the local and opponent plates.
  const [openPile, setOpenPile] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const handCount = typeof hand === "number" ? hand : hand.length;
  const heroName = heroFighter?.name ?? hero?.name ?? "";
  const rules = ruleCards.filter((r) => r.content?.trim());
  const ranged = heroFighter ? heroFighter.reach === "RANGED" : hero?.isRanged;
  const heroHp = heroFighter ? `${heroFighter.hp}/${heroFighter.maxHp}` : "–";
  const isLargeHero = !!heroFighter && isLargeFighter(heroFighter);
  const collapsed = layout.collapsed;
  const moved = layout.x !== 0 || layout.y !== 0;

  // Drag transform lives on this WRAPPER (motion values), never on
  // StatContainer, whose own `transform` is reserved for the :hover lift.
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const initRef = useRef(false);
  useEffect(() => {
    // apply the stored offset exactly once, after localStorage hydrates
    if (hydrated && !initRef.current) {
      initRef.current = true;
      x.set(layout.x);
      y.set(layout.y);
    }
  }, [hydrated, layout.x, layout.y, x, y]);

  const persistPos = () => onUpdate({ x: x.get(), y: y.get() });
  const resetPos = () => {
    const spring = { type: "spring" as const, stiffness: 500, damping: 40 };
    animate(x, 0, spring);
    animate(y, 0, spring);
    onUpdate({ x: 0, y: 0 });
  };
  const toggleCollapse = () => onUpdate({ collapsed: !collapsed });

  // The seat's worn badge (issue #577), on BOTH plates — this is the first
  // cosmetic the opponent can see, which is the whole point of putting it on
  // the wire. Unlike the avatar it is NOT local: it comes from the seat's
  // broadcast state, so your own plate shows it for the same reason theirs does.
  //
  // An id this build has no art for renders NOTHING. The engine deliberately
  // never validates the string, so a fallback glyph here would let any client
  // put a shape on your screen by inventing one; a missing chip until the client
  // catches up is the cheaper failure.
  const badgeChip =
    badge && isKnownBadge(badge) ? (
      <Box data-testid="plate-badge" data-badge-id={badge} flexShrink={0}>
        <BadgeGlyph id={badge} size="0.95rem" title={badgeArtName(badge)} />
      </Box>
    ) : null;

  // Your own Discord avatar beside your name (issue #568). Purely local: it is
  // read from `useAccount()` on this machine and never sent, so the opponent's
  // plate shows their NAME and no picture. Decorative (alt="") — the name is
  // right next to it.
  const nameLine =
    avatarUrl || badgeChip ? (
      <Flex alignItems="center" gap="0.35rem" minW={0}>
        {avatarUrl ? (
          <Box
            as="img"
            data-testid="plate-avatar"
            src={avatarUrl}
            alt=""
            boxSize="1rem"
            borderRadius="full"
            objectFit="cover"
            flexShrink={0}
          />
        ) : null}
        <PlayerName>{label}</PlayerName>
        {badgeChip}
      </Flex>
    ) : (
      <PlayerName>{label}</PlayerName>
    );

  // Hero rules text: the deck's special ability, its extra-rules cards, the
  // standing LARGE rule and the sidekick lines. Desktop hangs it off the
  // nameplate as a hover tooltip; the mobile seat sheet renders the very same
  // node inline (issue #708), so the two can never drift.
  const abilityContent =
    hero?.specialAbility || isLargeHero || sidekicks.length || rules.length ? (
      <Box maxW="18rem" p="0.25rem" whiteSpace="pre-wrap" fontSize="0.78rem">
        <Text fontWeight="bold" mb="0.25rem" color="brand.accent">
          {heroName}
        </Text>
        {hero?.specialAbility?.trim()}
        {/* Deck-level "extra rules" cards (issue #372) — distinct from the
            hero's own specialAbility above; each preserves its \n breaks. */}
        {rules.map((rule, i) => (
          <Box key={`${rule.title}-${i}`} mt={hero?.specialAbility || i > 0 ? "0.5rem" : 0}>
            <Text as="span" fontWeight="bold" color="brand.accent">
              {rule.title || "Extra rules"}:
            </Text>{" "}
            {rule.content.trim()}
          </Box>
        ))}
        {/* Standing large-fighter rule (issue #235). Keyed on the live
            two-space signal (heroFighter.tailSpace), so any future LARGE
            hero inherits it without a code change. Copy is shared with the
            attack-reach chip so the two never drift. */}
        {isLargeHero && (
          <Text mt={hero?.specialAbility ? "0.5rem" : 0} color="brand.accent">
            {LARGE_FIGHTER_BLURB}
          </Text>
        )}
        {sidekicks.map((s) => (
          <Text key={s.id} mt="0.4rem" opacity={s.defeated ? 0.6 : 1}>
            <Text as="span" fontWeight="bold" color="brand.accent">
              Sidekick:
            </Text>{" "}
            {s.name} — {s.hp}/{s.maxHp} HP,{" "}
            {s.reach === "RANGED" ? "ranged" : "melee"}
            {isLargeFighter(s) ? " · large" : ""}
            {s.defeated ? " (defeated)" : ""}
          </Text>
        ))}
      </Box>
    ) : (
      "hero rules loading…"
    );

  // ----- reusable pieces (shared by the live plate and the hover-peek) -----
  const renderNameBlock = (withAbility: boolean) => (
    <Box minW={0}>
      {withAbility ? (
        <Tooltip
          hasArrow
          placement="bottom-start"
          bg="brand.surfaceDim"
          color="brand.parchment"
          label={abilityContent}
        >
          {nameLine}
        </Tooltip>
      ) : (
        nameLine
      )}
      {heroName && <HeroName>{heroName}</HeroName>}
    </Box>
  );

  const turnTag = isActive ? (
    <Tag size="sm" bg="brand.accent" color="brand.surfaceDim" flexShrink={0}>
      TURN
    </Tag>
  ) : null;

  // Team formats only (issue #195): mark the viewer's teammate so allies read at
  // a glance from the HUD alone. Distinct teal keeps it clearly NOT the gold TURN
  // chip; hidden entirely in duel/ffa/older-server views (isAlly stays false).
  const allyTag = isAlly ? (
    <Tag size="sm" bg={ALLY_ACCENT} color="brand.surfaceDim" flexShrink={0} letterSpacing="0.04em">
      ALLY
    </Tag>
  ) : null;

  // Public state pills, always-visible on BOTH seats' cards. Flag-driven states
  // (issue #233: tide + druid form) and counter/pile-driven states (issue #420:
  // Nancy's CLUE; issue #539: Luke's TRAINING pile) all project to the same
  // {chip,on} shape and render through one <FlagChip> map — non-participating
  // heroes get empty lists and render exactly as before. Counter/pile chips are
  // hidden at 0. Keyed by chip contents so a value/state change remounts the chip
  // and replays its pulse (CLUES: 2 -> CLUES: 3 re-animates live).
  //
  // A pile-sourced chip carries `pile`, which makes the pill a click target that
  // opens that pile's card list — the zone is public, so this affordance is on
  // BOTH seats' plates and either player can read either pile.
  const flagTags = [
    ...flagChipsFor(heroId, flags),
    ...counterChipsFor(heroId, counters, piles),
  ].map(({ chip, on }) => (
    <FlagChip
      key={`${chip.flag}-${chip.onLabel}-${on ? "on" : "off"}`}
      chip={chip}
      on={on}
      onClick={chip.pile ? () => setOpenPile(chip.pile!) : undefined}
    />
  ));

  // The pile the plate is currently inspecting, resolved live off `piles` (not off
  // the chip snapshot) so an open overlay follows further tucks in the same game.
  const openPileCards = openPile ? pileCardIds(piles?.[openPile]) : [];
  // Cross-player tuck (protocol v0.49.0; v33 moved the fact onto the ENTRY): the
  // pile SITS here, but some or all of its cards may still belong to whoever tucked
  // them — Boba Fett's bounties sit under their victim. `piles` puts the stack in
  // the right place; each entry's `controller` is what stops it reading as the
  // host's own. Attribute by controller, distinct names in seat order, and say
  // nothing at all when no entry is foreign (which is every pile in the game before
  // this deck).
  const openPileCredit = openPile
    ? pileCreditFor(piles?.[openPile], seatId, nameOfPlayer)
    : "";

  // "combat won ✓" chip (issue #288 ↔ engine #160): shown on the acting seat while
  // `wonCombatThisTurn` is set, so a player can see WHY a conditional AFTER effect
  // fired differently (six General Grievous cards gate on it; card 202 sets it even
  // on a loss). Turn-scoped — clears at turn start. Not hero-gated: any deck that
  // one day exposes the flag gets it. Green keeps it clearly NOT the gold TURN chip.
  const combatWonTag = wonCombat ? (
    <Tag size="sm" bg="#3f8f5b" color="brand.surfaceDim" flexShrink={0} letterSpacing="0.03em">
      combat won ✓
    </Tag>
  ) : null;

  const ongoingSchemeCard = ongoingScheme ? resolveCard(ongoingScheme) : null;
  const ongoingSchemeLabel = ongoingScheme ? labelFor(ongoingScheme) : "";
  const ongoingSchemePreview = useCardPreview(ongoingSchemeCard);

  // Public face-up ongoing scheme (protocol v21). A compact title chip keeps the
  // state visible even when the plate is collapsed; the expanded row names the
  // exact card without requiring a modal.
  const ongoingSchemeTag = ongoingScheme ? (
    <Tag
      size="sm"
      bg="#6D4C8D"
      color="brand.parchment"
      flexShrink={0}
      letterSpacing="0.04em"
      cursor={ongoingSchemeCard ? "help" : "default"}
      aria-label={`Ongoing scheme: ${ongoingSchemeLabel}`}
      title={ongoingSchemeLabel}
      {...ongoingSchemePreview}
    >
      ONGOING
    </Tag>
  ) : null;

  const controls = hovered ? (
    <Flex alignItems="center" gap="0.15rem" flexShrink={0}>
      {moved && (
        <CtrlBtn title="Reset position" onClick={resetPos}>
          <TbArrowBackUp size="0.8rem" />
        </CtrlBtn>
      )}
      <CtrlBtn title={collapsed ? "Expand plate" : "Collapse plate"} onClick={toggleCollapse}>
        {collapsed ? <TbChevronDown size="0.8rem" /> : <TbChevronUp size="0.8rem" />}
      </CtrlBtn>
    </Flex>
  ) : null;

  // Disconnect / auto-forfeit (issue #222). Compact red tag for the title bar
  // (both collapsed and expanded plates) — "OFFLINE" when the seat is merely
  // disconnected, the live mm:ss countdown once the server arms an auto-forfeit.
  const presenceTag = presence ? (
    <Tag size="sm" colorScheme="red" flexShrink={0} letterSpacing="0.03em">
      {presence.autoForfeitAt != null ? (
        <ForfeitCountdown deadline={presence.autoForfeitAt} />
      ) : (
        "OFFLINE"
      )}
    </Tag>
  ) : null;

  // Full-width banner under the title bar (expanded plate) with the softer
  // "reconnecting…" framing so the state reads clearly at rest.
  const presenceRow = presence ? (
    <Flex
      alignItems="center"
      gap="0.35rem"
      px="0.85rem"
      py="0.25rem"
      bg="rgba(192, 57, 43, 0.28)"
      color="brand.parchment"
    >
      <Text fontSize="0.68rem" fontFamily="SpaceGrotesk" letterSpacing="0.03em" noOfLines={1}>
        reconnecting…
        {presence.autoForfeitAt != null && (
          <>
            {" "}
            <Text as="span" fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
              <ForfeitCountdown deadline={presence.autoForfeitAt} />
            </Text>
          </>
        )}
      </Text>
    </Flex>
  ) : null;

  // Move timer draining bar (issue #223): a full-width strip at the bottom of the
  // plate while this seat is on the clock. Shown on collapsed and expanded plates
  // (and the hover-peek) so whoever is waiting sees the same countdown.
  const timerBar = timer ? (
    <MoveTimerBar deadline={timer.deadline} totalSeconds={timer.totalSeconds} />
  ) : null;

  const statsPanel = (
    <StatsPanel>
      <StatLine>
        <GiHearts color="#C0392B" size="16px" />
        <Text fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {heroHp}
        </Text>
        {ranged ? <TbBow size="15px" /> : <TbSword size="15px" />}
      </StatLine>
      <MoveChip>
        <GiFootprint size="13px" />
        <Text fontSize="0.8rem" fontWeight="bold">
          {hero?.move ?? "–"}
        </Text>
      </MoveChip>
    </StatsPanel>
  );

  const sidekickRows = sidekicks.map((s) => (
    <Flex
      key={s.id}
      alignItems="center"
      gap="0.35rem"
      px="0.85rem"
      py="0.2rem"
      bg="rgba(44, 24, 49, 0.35)"
      opacity={s.defeated ? 0.45 : 1}
    >
      <Text
        fontSize="0.68rem"
        fontFamily="SpaceGrotesk"
        letterSpacing="0.04em"
        noOfLines={1}
        textDecoration={s.defeated ? "line-through" : undefined}
      >
        {s.name}
      </Text>
      <GiHearts color="#C0392B" size="11px" />
      <Text fontSize="0.72rem" fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {s.hp}/{s.maxHp}
      </Text>
      {s.reach === "RANGED" ? <TbBow size="11px" /> : <TbSword size="11px" />}
    </Flex>
  ));

  const ongoingSchemeRow = ongoingScheme ? (
    <Flex
      alignItems="center"
      gap="0.35rem"
      px="0.85rem"
      py="0.2rem"
      bg="rgba(109, 76, 141, 0.28)"
      color="brand.parchment"
      cursor={ongoingSchemeCard ? "help" : "default"}
      aria-label={`Ongoing scheme: ${ongoingSchemeLabel}`}
      title={ongoingSchemeLabel}
      {...ongoingSchemePreview}
    >
      <TbWand size="12px" />
      <Text
        fontSize="0.62rem"
        fontWeight="bold"
        letterSpacing="0.08em"
        color="brand.accent"
        flexShrink={0}
      >
        ONGOING
      </Text>
      <Text fontSize="0.68rem" fontFamily="SpaceGrotesk" noOfLines={1}>
        {ongoingSchemeLabel}
      </Text>
    </Flex>
  ) : null;

  const pipFooter = (
    <PipFooter>
      <Pip>
        <IoMdHand size="12px" />
        {handCount}
      </Pip>
      <Pip>
        <TbCards size="13px" />
        {deckCount}
      </Pip>
      <Tooltip label="View discard pile" hasArrow>
        <Pip clickable onClick={() => setDiscardOpen(true)}>
          <TbGrave2 size="13px" />
          {discard.length}
        </Pip>
      </Tooltip>
    </PipFooter>
  );

  // The full plate body — reused as the hover-peek label for a collapsed plate
  // (static: no drag handle, no controls, plain name so tooltips don't nest).
  const peekPlate = (
    <StatContainer isLocal={isLocal} sx={{ cursor: "default" }}>
      <PlayerTitleBar>
        {renderNameBlock(false)}
        <Flex alignItems="center" gap="0.3rem" flexShrink={0}>
          {flagTags}
          {combatWonTag}
          {ongoingSchemeTag}
          {presenceTag}
          {allyTag}
          {turnTag}
        </Flex>
      </PlayerTitleBar>
      {presenceRow}
      {statsPanel}
      {sidekickRows}
      {ongoingSchemeRow}
      {pipFooter}
      {timerBar}
    </StatContainer>
  );

  // Mobile seat sheet (issue #708): every fact the desktop plate carries, laid
  // out full-width for a drawer — including the two that were hover-only there
  // (the hero rules text, and the pile/discard pills, which stay tap targets
  // opening the same CardListModal above). No drag handle and no collapse: the
  // drawer's own dismiss is the way out.
  const sheetBody = (
    <Box w="100%">
      <Flex alignItems="flex-start" justifyContent="space-between" gap="0.5rem" px="0.85rem" pt="0.5rem" pb="0.4rem">
        {renderNameBlock(false)}
        <Flex alignItems="center" gap="0.3rem" flexWrap="wrap" justifyContent="flex-end">
          {flagTags}
          {combatWonTag}
          {ongoingSchemeTag}
          {presenceTag}
          {allyTag}
          {turnTag}
        </Flex>
      </Flex>
      {presenceRow}
      {statsPanel}
      {sidekickRows}
      {ongoingSchemeRow}
      {pipFooter}
      {timerBar}
      <Box px="0.85rem" py="0.6rem" color="brand.parchment">
        {abilityContent}
      </Box>
    </Box>
  );

  // shared drag/handle props for the live plate's title bar
  const titleBarDrag = {
    onPointerDown: (e: React.PointerEvent) => dragControls.start(e),
    onDoubleClick: resetPos,
    sx: { cursor: "grab", touchAction: "none" as const },
  };

  return (
    <>
      <CardListModal
        title={`${heroName} — discard pile`}
        cards={discard}
        resolveCard={resolveCard}
        labelFor={labelFor}
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
      />
      {/* Set-aside pile inspection (v25). Same overlay as the discard pile — the
          zone is equally public, so nothing here is gated on `isLocal`. The seat
          `label` leads the title because BOTH plates carry a pill: in a mirror the
          hero name alone can't say whose pile you opened. */}
      <CardListModal
        title={`${label} · ${heroName} — ${
          openPile ? pileDisplayName(openPile) : ""
        }${openPileCredit} (tucked under hero card)`}
        cards={openPileCards}
        resolveCard={resolveCard}
        labelFor={labelFor}
        isOpen={openPile !== null}
        onClose={() => setOpenPile(null)}
      />
      {variant === "sheet" ? (
        sheetBody
      ) : (
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        style={{ x, y, position: "relative", width: "15rem", zIndex: dragging ? 200 : 1 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={() => {
          setDragging(false);
          persistPos();
        }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
      >
        {collapsed ? (
          <Tooltip
            hasArrow={false}
            placement="bottom-start"
            openDelay={0}
            bg="transparent"
            boxShadow="none"
            p={0}
            maxW="none"
            label={peekPlate}
          >
            <StatContainer isLocal={isLocal}>
              <PlayerTitleBar {...titleBarDrag}>
                {renderNameBlock(true)}
                <Flex alignItems="center" gap="0.4rem" flexShrink={0}>
                  <Flex alignItems="center" gap="0.25rem" color="brand.parchment">
                    <GiHearts color="#C0392B" size="14px" />
                    <Text
                      fontWeight="bold"
                      fontSize="0.9rem"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {heroHp}
                    </Text>
                  </Flex>
                  {flagTags}
                  {combatWonTag}
                  {ongoingSchemeTag}
                  {presenceTag}
                  {allyTag}
                  {turnTag}
                  {controls}
                </Flex>
              </PlayerTitleBar>
              {ongoingSchemeRow}
              {timerBar}
            </StatContainer>
          </Tooltip>
        ) : (
          <StatContainer isLocal={isLocal}>
            <PlayerTitleBar {...titleBarDrag}>
              {renderNameBlock(true)}
              <Flex alignItems="center" gap="0.3rem" flexShrink={0}>
                {flagTags}
                {combatWonTag}
                {ongoingSchemeTag}
                {presenceTag}
                {allyTag}
                {turnTag}
                {controls}
              </Flex>
            </PlayerTitleBar>
            {presenceRow}
            {statsPanel}
            {sidekickRows}
            {ongoingSchemeRow}
            {pipFooter}
            {timerBar}
          </StatContainer>
        )}
      </motion.div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Top-right chips (mirrors the sandbox invite/connection cluster)
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<ProConnectionStatus, { color: string; label: string }> = {
  open: { color: "#2F9E68", label: "Connected" },
  connecting: { color: "#E7CC98", label: "Connecting…" },
  reconnecting: { color: "#E7CC98", label: "Reconnecting…" },
  closed: { color: "#FF6347", label: "Disconnected — reconnecting" },
  idle: { color: "#FF6347", label: "No server" },
};

const chipStyles = {
  alignItems: "center",
  gap: "0.3rem",
  px: "0.5rem",
  py: "0.15rem",
  borderRadius: "1rem",
  bg: "rgba(20, 8, 24, 0.55)",
} as const;

// ---------------------------------------------------------------------------
// Beta-features discovery chip + menu (drives lib/flags registry)
// ---------------------------------------------------------------------------

const BetaFeaturesChip = () => {
  const [open, setOpen] = useState(false);
  const flags = useFlags();
  const anyOn = flags.some((f) => f.on);

  return (
    <>
      <Tooltip label="Beta features" hasArrow>
        <Flex
          {...chipStyles}
          as="button"
          cursor="pointer"
          _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
          color="brand.highlight"
          opacity={anyOn ? 1 : 0.55}
          onClick={() => setOpen(true)}
          aria-label="Beta features"
        >
          <TbFlask size="0.85rem" />
        </Flex>
      </Tooltip>
      <Modal isOpen={open} onClose={() => setOpen(false)} size="md" isCentered>
        <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
        <ModalContent bg="brand.surface" color="brand.parchment">
          <ModalHeader
            fontFamily="BebasNeueRegular"
            letterSpacing="0.04em"
            display="flex"
            alignItems="center"
            gap="0.5rem"
          >
            <TbFlask /> Beta features
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="1.5rem">
            <Text opacity={0.65} fontSize="0.82rem" mb="1rem">
              Experimental features — opt in per browser. They stick until you
              turn them off.
            </Text>
            <Flex direction="column" gap="0.9rem">
              {flags.map((f) => (
                <Flex key={f.name} alignItems="center" gap="1rem">
                  <Box flex="1" minW={0}>
                    <Text fontWeight="bold" fontSize="0.9rem">
                      {FLAGS[f.name].label}
                    </Text>
                    <Text opacity={0.6} fontSize="0.78rem">
                      {FLAGS[f.name].desc}
                    </Text>
                  </Box>
                  <Switch
                    isChecked={f.on}
                    onChange={f.toggle}
                    colorScheme="purple"
                    aria-label={`Toggle ${FLAGS[f.name].label}`}
                  />
                </Flex>
              ))}
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

// ---------------------------------------------------------------------------

/**
 * The seat list the HUD renders (issue #708 lifted it out of ProHud so the
 * mobile match strip can build the same one).
 *
 * A live multi-seat view carries `players`; the duel path (and older servers)
 * carries only `self`/`opponent`, so those are projected into the same
 * ViewPlayer shape here rather than in two places.
 */
export const hudSeats = (view: PlayerView): ViewPlayer[] =>
  view.players.length
    ? view.players
    : [
        {
          id: view.self.id,
          heroId: view.self.heroId,
          you: true,
          // #568: the seat's claimed name, when this server broadcasts one.
          displayName: view.self.displayName,
          // #577: and the badge it claimed, same treatment.
          badge: view.self.badge,
          team: view.self.id,
          hand: view.self.hand,
          handCount: view.self.hand.length,
          deckCount: view.self.deckCount,
          discard: view.self.discard,
          ongoingScheme: view.self.ongoingScheme ?? null,
          committedCard: view.self.committedCard,
          hasCommitted: !!view.self.committedCard,
          counters: view.self.counters,
          piles: view.self.piles,
          flags: view.self.flags,
          wonCombatThisTurn: view.self.wonCombatThisTurn,
          lostCombatThisTurn: view.self.lostCombatThisTurn,
          firstAttackThisTurn: view.self.firstAttackThisTurn,
          playedACardThisTurn: view.self.playedACardThisTurn,
          tookDamageThisTurn: view.self.tookDamageThisTurn,
        },
        ...(view.opponent
          ? [{
              id: view.opponent.id,
              heroId: view.opponent.heroId,
              you: false,
              displayName: view.opponent.displayName,
              badge: view.opponent.badge,
              team: view.opponent.id,
              handCount: view.opponent.handCount,
              deckCount: view.opponent.deckCount,
              discard: view.opponent.discard,
              ongoingScheme: view.opponent.ongoingScheme ?? null,
              hasCommitted: view.opponent.hasCommitted,
              counters: view.opponent.counters,
              piles: view.opponent.piles,
              flags: view.opponent.flags,
              wonCombatThisTurn: view.opponent.wonCombatThisTurn,
              lostCombatThisTurn: view.opponent.lostCombatThisTurn,
              firstAttackThisTurn: view.opponent.firstAttackThisTurn,
              playedACardThisTurn: view.opponent.playedACardThisTurn,
              tookDamageThisTurn: view.opponent.tookDamageThisTurn,
            }]
          : []),
      ];

export interface ProHudProps {
  view: PlayerView;
  status: ProConnectionStatus;
  roomId: string | null;
  /**
   * Seat-identified presence (protocol v15): seats currently disconnected
   * mid-game, keyed by runtime seat id. A disconnected seat's plate shows an
   * offline badge; when the entry carries an `autoForfeitAt` deadline it also
   * renders a non-drifting auto-forfeit countdown. Empty/omitted → every plate
   * renders exactly as before (duel is untouched — it never populates this).
   */
  seatPresence?: Record<string, SeatPresence>;
  /**
   * Live move timer (issue #223): the latest TURN_TIMER broadcast — which seat is
   * on the clock and its epoch-ms deadline. The acting seat's plate renders a
   * draining bar off `deadline`. null/omitted (an untimed room) → no bar anywhere,
   * so the HUD renders byte-identically to before.
   */
  turnTimer?: TurnTimer | null;
  /** the room's per-decision window length in seconds (issue #223), sizing the
   *  draining bar. Omitted in an untimed room. */
  turnTimerSeconds?: number;
  resolveCard: ResolveCard;
  resolveHero: ResolveHero;
  /** deck-level "extra rules" cards per hero (issue #372); omit → no rules shown */
  resolveRuleCards?: ResolveRuleCards;
  labelFor: (instance: CardInstanceId) => string;
  /** sound / visual effect toggles (useGameFx) — chips hidden when omitted */
  soundOn?: boolean;
  visualFxOn?: boolean;
  onToggleSound?: () => void;
  onToggleVisualFx?: () => void;
  /** "Hide opponent cosmetics" (issue #615) — the chip is hidden when the
   *  handler is omitted, which the page does until an opponent has actually
   *  published a loadout. Your OWN cosmetics are never affected. */
  opponentCosmeticsHidden?: boolean;
  onToggleOpponentCosmetics?: () => void;
  /** "Slow mode" (issue #703) — hold each opponent action in a spotlight until
   *  the player clicks OK. The chip is hidden when the handler is omitted. */
  slowModeOn?: boolean;
  onToggleSlowMode?: () => void;
  /** true while a paced batch is held on screen. The spotlight's click-anywhere
   *  backdrop covers the whole viewport, which would otherwise bury the very chip
   *  that turns slow mode off — so the cluster floats above it for that window
   *  only. Omitted/false leaves ChipCluster's own z-index untouched. */
  slowModeHolding?: boolean;
  /** opens the ReportBugDialog (issue #125/#138) — chip hidden when omitted */
  onReportBug?: () => void;
}

export const ProHud = ({
  view,
  status,
  roomId,
  seatPresence,
  turnTimer,
  turnTimerSeconds,
  resolveCard,
  resolveHero,
  resolveRuleCards,
  labelFor,
  soundOn,
  visualFxOn,
  onToggleSound,
  onToggleVisualFx,
  opponentCosmeticsHidden,
  onToggleOpponentCosmetics,
  slowModeOn,
  onToggleSlowMode,
  slowModeHolding,
  onReportBug,
}: ProHudProps) => {
  const heroOf = (player: PlayerId) =>
    view.fighters.find((f) => f.owner === player && f.kind === "HERO");
  const sidekicksOf = (player: PlayerId) =>
    view.fighters.filter((f) => f.owner === player && f.kind === "SIDEKICK");
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting;
  // Local-only (issue #568): your own avatar for your own plate. Null for a
  // guest, an unreachable accounts API, or an account with no avatar set — all
  // of which render the plate exactly as it does today.
  const { account } = useAccount();
  const seats: ViewPlayer[] = hudSeats(view);

  // Team affiliation (issue #195). Inactive (no ALLY chips) unless the view is a
  // real team format — duel/ffa/older-server views derive `active: false` and
  // render exactly as before. The fallback duel `seats` above carry no `team`,
  // which also derives inactive.
  const teams = deriveTeams(seats, view.you);

  const { plates, hydrated, update } = useHudPlates();
  const seatUpdate = (seat: PlateSeat) => (partial: Partial<PlateLayout>) =>
    update(seat, partial);
  // Nameplate label (issue #568): a seat's broadcast `displayName` when the
  // player claimed one, otherwise today's "You"/"Opponent"/seat-id fallbacks —
  // so a guest seat, an older server and an old room all read exactly as before.
  const seatLabel = (seat: ViewPlayer) => seatNameplate(seat, seats.length);
  // Label for an arbitrary seat id — the cross-player pile credit (v0.49.0) names
  // the CONTROLLER of a foreign-tucked card, who is by definition not the seat
  // whose plate is rendering. Falls back to the raw id for a seat that has left
  // the view (a resolved elimination), which is still better than no attribution.
  const nameOfPlayer = (id: PlayerId) => {
    const seat = seats.find((s) => s.id === id);
    return seat ? seatLabel(seat) : id;
  };
  // Disconnect/auto-forfeit badge is a multiplayer feature (issue #222): duel
  // keeps its single top-of-HUD "opponent disconnected" chip and renders plates
  // exactly as before, so the presence lookup is gated on a multiplayer view.
  const multiplayer = seats.length > 2;
  const presenceOf = (seat: ViewPlayer) =>
    multiplayer ? seatPresence?.[seat.id] : undefined;
  // Move timer (issue #223): the acting seat gets a draining bar while its clock
  // is running (a live `deadline`) in a timed room. A paused clock (deadline null:
  // bot/disconnected) and every untimed room render no bar. Works for duel and
  // multiplayer alike — the bar tracks whichever seat TURN_TIMER names.
  const timerOf = (seat: ViewPlayer) =>
    turnTimer &&
    turnTimer.player === seat.id &&
    turnTimer.deadline != null &&
    turnTimerSeconds
      ? { deadline: turnTimer.deadline, totalSeconds: turnTimerSeconds }
      : undefined;

  return (
    <>
      <HudOverlay>
        {seats.map((seat) => (
          <SeatPlate
            key={seat.id}
            seatId={seat.id}
            label={seatLabel(seat)}
            hero={resolveHero(seat.heroId)}
            ruleCards={resolveRuleCards?.(seat.heroId) ?? []}
            heroId={seat.heroId}
            heroFighter={heroOf(seat.id)}
            sidekicks={sidekicksOf(seat.id)}
            flags={seat.flags}
            counters={seat.counters}
            piles={seat.piles}
            nameOfPlayer={nameOfPlayer}
            wonCombat={seat.wonCombatThisTurn}
            isLocal={seat.you}
            isActive={showLiveTurnChrome(view) && view.activePlayer === seat.id}
            isAlly={teams.relationOf(seat.id) === "ally"}
            presence={presenceOf(seat)}
            timer={timerOf(seat)}
            avatarUrl={seat.you ? account?.avatarUrl : undefined}
            badge={seat.badge}
            hand={seat.you ? seat.hand ?? view.self.hand : seat.handCount}
            deckCount={seat.deckCount}
            discard={seat.discard}
            ongoingScheme={seat.ongoingScheme ?? null}
            labelFor={labelFor}
            resolveCard={resolveCard}
            layout={plates[seat.id] ?? DEFAULT_PLATE_LAYOUT}
            hydrated={hydrated}
            onUpdate={seatUpdate(seat.id)}
          />
        ))}
      </HudOverlay>
      {/* Lifted above the action spotlight (#703) ONLY while it is holding, and
          as an inline style so the styled-component's own z-index wins back the
          moment it isn't — an ordinary game renders this exactly as before. */}
      <ChipCluster {...(slowModeHolding ? { style: { zIndex: SPOTLIGHT_Z + 2 } } : {})}>
        {onToggleSound && (
          <Tooltip label={soundOn ? "Mute sound effects" : "Unmute sound effects"} hasArrow>
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              opacity={soundOn ? 1 : 0.55}
              onClick={onToggleSound}
              aria-label={soundOn ? "Mute sound effects" : "Unmute sound effects"}
            >
              {soundOn ? <IoMdVolumeHigh size="0.85rem" /> : <IoMdVolumeOff size="0.85rem" />}
            </Flex>
          </Tooltip>
        )}
        {onToggleVisualFx && (
          <Tooltip
            label={visualFxOn ? "Hide visual effects" : "Show visual effects"}
            hasArrow
          >
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              opacity={visualFxOn ? 1 : 0.55}
              onClick={onToggleVisualFx}
              aria-label={visualFxOn ? "Hide visual effects" : "Show visual effects"}
            >
              {visualFxOn ? <TbWand size="0.85rem" /> : <TbWandOff size="0.85rem" />}
            </Flex>
          </Tooltip>
        )}
        {onToggleOpponentCosmetics && (
          <Tooltip
            label={
              opponentCosmeticsHidden
                ? "Show opponent card cosmetics"
                : "Hide opponent card cosmetics"
            }
            hasArrow
          >
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              opacity={opponentCosmeticsHidden ? 0.55 : 1}
              onClick={onToggleOpponentCosmetics}
              aria-label={
                opponentCosmeticsHidden
                  ? "Show opponent card cosmetics"
                  : "Hide opponent card cosmetics"
              }
            >
              {opponentCosmeticsHidden ? (
                <TbEyeOff size="0.85rem" />
              ) : (
                <TbSparkles size="0.85rem" />
              )}
            </Flex>
          </Tooltip>
        )}
        {onToggleSlowMode && (
          // A LABELLED SWITCH, not another icon chip. The icon chips beside it are
          // momentary-looking by design — they flip an effect you can immediately
          // see or hear, so a dimmed icon is enough. Slow mode changes how the
          // whole game is paced and is invisible until the opponent moves, so
          // "which way is it set?" has to be answerable at a glance, without
          // hovering. It keeps the cluster's pill shape and typography (same
          // `chipStyles` as the `room XXXX` chip, which is also text-bearing).
          <Tooltip
            label={
              slowModeOn
                ? "Slow mode is ON — each opponent action waits for your OK"
                : "Slow mode is OFF — opponent actions apply as they arrive"
            }
            hasArrow
          >
            <Flex
              {...chipStyles}
              as="button"
              type="button"
              role="switch"
              aria-checked={!!slowModeOn}
              aria-label={slowModeOn ? "Turn slow mode off" : "Turn slow mode on"}
              onClick={onToggleSlowMode}
              cursor="pointer"
              gap="0.4rem"
              bg={slowModeOn ? "brand.accent" : "rgba(20, 8, 24, 0.55)"}
              _hover={{ bg: slowModeOn ? "brand.accentDeep" : "rgba(20, 8, 24, 0.85)" }}
            >
              <TbHourglass size="0.8rem" color={slowModeOn ? "#2C1831" : "#F1E0C1"} />
              <Text
                fontSize="0.65rem"
                fontFamily="SpaceGrotesk"
                whiteSpace="nowrap"
                color={slowModeOn ? "brand.surfaceDim" : "brand.highlight"}
                fontWeight={slowModeOn ? 700 : 400}
              >
                Slow mode
              </Text>
              {/* Purely the picture of the state — the chip itself is the control,
                  so the Switch must not be a second focusable/clickable thing
                  inside it (a nested label would double-fire the toggle). */}
              <Switch
                size="sm"
                isChecked={!!slowModeOn}
                isReadOnly
                pointerEvents="none"
                tabIndex={-1}
                aria-hidden
                sx={{ ".chakra-switch__track": { bg: slowModeOn ? "brand.surfaceDim" : "whiteAlpha.400" } }}
              />
            </Flex>
          </Tooltip>
        )}
        <BetaFeaturesChip />
        {roomId && (
          <Tooltip label="Copy the join link for this room" hasArrow>
            <Flex
              {...chipStyles}
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/pro/game?room=${roomId}`);
                toast.success("Join link copied!");
              }}
            >
              <LinkIcon color="brand.highlight" boxSize="0.65rem" />
              <Text fontSize="0.65rem" color="brand.highlight" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
                room {roomId}
              </Text>
            </Flex>
          </Tooltip>
        )}
        <Flex {...chipStyles}>
          <Box w="0.45rem" h="0.45rem" borderRadius="50%" bg={display.color} />
          <Text fontSize="0.65rem" color="brand.highlight" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
            {display.label}
          </Text>
        </Flex>
        {onReportBug && (
          <Tooltip
            label="Pro is in beta — you may hit bugs. Click to report one with your game context attached."
            hasArrow
            placement="bottom-end"
          >
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              onClick={onReportBug}
              aria-label="Report a bug"
            >
              <TbBug size="0.85rem" />
              <Text fontSize="0.65rem" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
                Report bug
              </Text>
              <Tag
                size="sm"
                bg="whiteAlpha.400"
                color="brand.highlight"
                fontSize="0.55rem"
                fontWeight="bold"
                letterSpacing="0.04em"
                px="0.3rem"
              >
                BETA
              </Tag>
            </Flex>
          </Tooltip>
        )}
        {/* Optional Discord account (#459). Rides the chip cluster so it can
            never sit over the board; renders nothing for guests-with-no-API,
            and its sign-in deliberately leaves this tab (and its socket)
            alone — see components/Account/AccountChip. */}
        <InGameAccountChip />
      </ChipCluster>
    </>
  );
};
