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
  TbWand,
  TbWandOff,
  TbChevronUp,
  TbChevronDown,
  TbArrowBackUp,
  TbFlask,
  TbBug,
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
import { DeckImportHeroType } from "@/components/DeckPool/deck-import.type";
import { CardInstanceId, PlayerId, PlayerView, ViewFighter, ViewPlayer } from "@/lib/pro/protocol";
import { isLargeFighter, LARGE_FIGHTER_BLURB } from "@/lib/pro/largeReach";
import { deriveTeams } from "@/lib/pro/teams";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { FlagHudChip, ResolveCard, ResolveHero, flagChipsFor } from "@/lib/pro/useProCardArt";
import { DEFAULT_PLATE_LAYOUT, PlateLayout, PlateSeat, useHudPlates } from "@/lib/pro/useHudPlates";
import { CardFace } from "./ProHand";
import { ProConnectionStatus, SeatPresence, TurnTimer } from "@/lib/pro/useProSocket";
import { FLAGS, useFlags } from "@/lib/flags";

// Team-affiliation accent (issue #195). A teal that reads clearly as "friendly"
// and stays distinct from the gold TURN chip and from every per-seat identity
// color (gold/blue/green/magenta) so the ALLY chip never blends into a plate.
const ALLY_ACCENT = "#39B7A8";

// ---------------------------------------------------------------------------
// Flag HUD chip — always-visible public-state pill (tide today; any future
// flag-driven deck by adding a FLAG_HUD_CHIPS entry, see useProCardArt.ts)
// ---------------------------------------------------------------------------

// Optional per-flag glyph. A registry entry with no icon here renders text-only
// (zero component surgery for a new flag-driven deck). Tide gets the game-icons
// rising/ebbing-wave pair so HIGH vs LOW reads at a glance — but the WORDS carry
// the meaning; the icon is reinforcement, never the sole signal.
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
const FlagChip = ({ chip, on }: { chip: FlagHudChip; on: boolean }) => {
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
      style={{
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
// Discard viewer (public info for both seats)
// ---------------------------------------------------------------------------

const DiscardModal = ({
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

const SeatPlate = ({
  label,
  hero,
  heroId,
  heroFighter,
  sidekicks,
  flags,
  isLocal,
  isActive,
  isAlly,
  presence,
  timer,
  hand,
  deckCount,
  discard,
  labelFor,
  resolveCard,
  layout,
  hydrated,
  onUpdate,
}: {
  label: string;
  hero: DeckImportHeroType | null;
  /** server hero id — gates flag chips (tide only shows for tide heroes) */
  heroId: string;
  heroFighter: ViewFighter | undefined;
  sidekicks: ViewFighter[];
  /** public per-player engine flags (tide etc.); undefined on older servers */
  flags?: Record<string, boolean>;
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
  /** own hand instances, or a count for the opponent */
  hand: CardInstanceId[] | number;
  deckCount: number;
  discard: CardInstanceId[];
  labelFor: (instance: CardInstanceId) => string;
  resolveCard: ResolveCard;
  layout: PlateLayout;
  hydrated: boolean;
  onUpdate: (partial: Partial<PlateLayout>) => void;
}) => {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const handCount = typeof hand === "number" ? hand : hand.length;
  const heroName = heroFighter?.name ?? hero?.name ?? "";
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

  // ----- reusable pieces (shared by the live plate and the hover-peek) -----
  const renderNameBlock = (withAbility: boolean) => (
    <Box minW={0}>
      {withAbility ? (
        <Tooltip
          hasArrow
          placement="bottom-start"
          bg="brand.surfaceDim"
          color="brand.parchment"
          label={
            hero?.specialAbility || isLargeHero || sidekicks.length ? (
              <Box maxW="18rem" p="0.25rem" whiteSpace="pre-wrap" fontSize="0.78rem">
                <Text fontWeight="bold" mb="0.25rem" color="brand.accent">
                  {heroName}
                </Text>
                {hero?.specialAbility?.trim()}
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
            )
          }
        >
          <PlayerName>{label}</PlayerName>
        </Tooltip>
      ) : (
        <PlayerName>{label}</PlayerName>
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

  // Public flag pills (issue #233): always-visible on BOTH seats' cards for heroes
  // with a flag mechanic (tide today). Generic over the FLAG_HUD_CHIPS registry —
  // non-flag heroes get an empty list and render exactly as before. Keyed by
  // on/off state so a mid-game flip remounts the chip and replays its pulse.
  const flagTags = flagChipsFor(heroId, flags).map(({ chip, on }) => (
    <FlagChip key={`${chip.flag}-${on ? "on" : "off"}`} chip={chip} on={on} />
  ));

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
          {presenceTag}
          {allyTag}
          {turnTag}
        </Flex>
      </PlayerTitleBar>
      {presenceRow}
      {statsPanel}
      {sidekickRows}
      {pipFooter}
      {timerBar}
    </StatContainer>
  );

  // shared drag/handle props for the live plate's title bar
  const titleBarDrag = {
    onPointerDown: (e: React.PointerEvent) => dragControls.start(e),
    onDoubleClick: resetPos,
    sx: { cursor: "grab", touchAction: "none" as const },
  };

  return (
    <>
      <DiscardModal
        title={`${heroName} — discard pile`}
        cards={discard}
        resolveCard={resolveCard}
        labelFor={labelFor}
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
      />
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
                  {presenceTag}
                  {allyTag}
                  {turnTag}
                  {controls}
                </Flex>
              </PlayerTitleBar>
              {timerBar}
            </StatContainer>
          </Tooltip>
        ) : (
          <StatContainer isLocal={isLocal}>
            <PlayerTitleBar {...titleBarDrag}>
              {renderNameBlock(true)}
              <Flex alignItems="center" gap="0.3rem" flexShrink={0}>
                {flagTags}
                {presenceTag}
                {allyTag}
                {turnTag}
                {controls}
              </Flex>
            </PlayerTitleBar>
            {presenceRow}
            {statsPanel}
            {sidekickRows}
            {pipFooter}
            {timerBar}
          </StatContainer>
        )}
      </motion.div>
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
  labelFor: (instance: CardInstanceId) => string;
  /** sound / visual effect toggles (useGameFx) — chips hidden when omitted */
  soundOn?: boolean;
  visualFxOn?: boolean;
  onToggleSound?: () => void;
  onToggleVisualFx?: () => void;
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
  labelFor,
  soundOn,
  visualFxOn,
  onToggleSound,
  onToggleVisualFx,
  onReportBug,
}: ProHudProps) => {
  const heroOf = (player: PlayerId) =>
    view.fighters.find((f) => f.owner === player && f.kind === "HERO");
  const sidekicksOf = (player: PlayerId) =>
    view.fighters.filter((f) => f.owner === player && f.kind === "SIDEKICK");
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting;
  const seats: ViewPlayer[] = view.players.length
    ? view.players
    : [
        {
          id: view.self.id,
          heroId: view.self.heroId,
          you: true,
          hand: view.self.hand,
          handCount: view.self.hand.length,
          deckCount: view.self.deckCount,
          discard: view.self.discard,
          committedCard: view.self.committedCard,
          hasCommitted: !!view.self.committedCard,
          counters: view.self.counters,
          flags: view.self.flags,
        },
        ...(view.opponent
          ? [{
              id: view.opponent.id,
              heroId: view.opponent.heroId,
              you: false,
              handCount: view.opponent.handCount,
              deckCount: view.opponent.deckCount,
              discard: view.opponent.discard,
              hasCommitted: view.opponent.hasCommitted,
              counters: view.opponent.counters,
              flags: view.opponent.flags,
            }]
          : []),
      ];

  // Team affiliation (issue #195). Inactive (no ALLY chips) unless the view is a
  // real team format — duel/ffa/older-server views derive `active: false` and
  // render exactly as before. The fallback duel `seats` above carry no `team`,
  // which also derives inactive.
  const teams = deriveTeams(seats, view.you);

  const { plates, hydrated, update } = useHudPlates();
  const seatUpdate = (seat: PlateSeat) => (partial: Partial<PlateLayout>) =>
    update(seat, partial);
  const seatLabel = (seat: ViewPlayer) =>
    seat.you ? "You" : seats.length === 2 ? "Opponent" : seat.id.toUpperCase();
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
            label={seatLabel(seat)}
            hero={resolveHero(seat.heroId)}
            heroId={seat.heroId}
            heroFighter={heroOf(seat.id)}
            sidekicks={sidekicksOf(seat.id)}
            flags={seat.flags}
            isLocal={seat.you}
            isActive={showLiveTurnChrome(view) && view.activePlayer === seat.id}
            isAlly={teams.relationOf(seat.id) === "ally"}
            presence={presenceOf(seat)}
            timer={timerOf(seat)}
            hand={seat.you ? seat.hand ?? view.self.hand : seat.handCount}
            deckCount={seat.deckCount}
            discard={seat.discard}
            labelFor={labelFor}
            resolveCard={resolveCard}
            layout={plates[seat.id] ?? DEFAULT_PLATE_LAYOUT}
            hydrated={hydrated}
            onUpdate={seatUpdate(seat.id)}
          />
        ))}
      </HudOverlay>
      <ChipCluster>
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
      </ChipCluster>
    </>
  );
};
