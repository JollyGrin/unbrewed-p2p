/**
 * The floating decision dock on /pro/game — turn chips, board hints, the
 * combat/prompt panels, the legal-action list, and the Undo/Forfeit buttons.
 *
 * Extracted from pages/pro/game.tsx (issue #451). It borrows the HUD plate's
 * interaction DNA (components/Pro/ProHud.tsx `SeatPlate`): a framer-motion
 * wrapper dragged from a slim title bar, collapse toggle, and a layout
 * persisted to localStorage via `useDockLayout`.
 *
 * The one rule this component owns beyond layout: a collapsed dock must never
 * hide a decision the engine is waiting on. See `needsInput` below.
 */
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Kbd, Link, Tag, Text, Tooltip } from "@chakra-ui/react";
import { animate, motion, useDragControls, useMotionValue } from "framer-motion";
import {
  TbArrowNarrowRight,
  TbChevronDown,
  TbChevronUp,
  TbExternalLink,
  TbGripHorizontal,
  TbPlus,
} from "react-icons/tb";
import { Action, FighterId, PlayerView } from "@/lib/pro/protocol";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { isViewerOnWinningTeam } from "@/lib/pro/teams";
import { LARGE_FIGHTER_BLURB, LARGE_REACH_CHIP } from "@/lib/pro/largeReach";
import { ItemGlyph } from "@/components/Pro/ItemBadge";
import { tokenInitials } from "./FighterTokenPortrait";
import { DockRow } from "@/lib/pro/actionDock";
import { useDockLayout } from "@/lib/pro/useDockLayout";

/** Width of the dock's default right-edge slot. */
const DOCK_WIDTH = "18.5rem";

const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};

/**
 * Chip-scale circular token face for an attack row (issue #514).
 *
 * Mirrors the board token's art-clip + initials treatment — same `tokenInitials`
 * ProBoard and the hero-preview portrait share, same center-top cover crop — at
 * a size that sits inline in a dock button. The board's own token stays bespoke
 * (HP/reach badges, move tweens); the one badge that DOES ride here is the #161
 * disambiguator, because it is exactly what ties this row to a board token.
 *
 * `face` may be null (a fighter the view no longer carries) — render nothing
 * rather than an empty disc.
 */
const DockTokenFace = ({
  face,
  badge,
}: {
  face: { name: string; artUrl: string | null } | null;
  badge?: number;
}) => {
  if (!face) return null;
  return (
    <Box as="span" position="relative" display="inline-flex" flexShrink={0} title={face.name}>
      <Box
        as="span"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        boxSize="1.5rem"
        borderRadius="50%"
        overflow="hidden"
        bg="radial-gradient(circle at 50% 30%, #3d2249 0%, var(--chakra-colors-brand-surfaceDim) 80%)"
        border="1px solid"
        borderColor="rgba(224,168,46,0.7)"
      >
        {face.artUrl ? (
          <Box
            as="img"
            src={face.artUrl}
            alt=""
            draggable={false}
            w="100%"
            h="100%"
            sx={{
              objectFit: "cover",
              objectPosition: "center top",
              transform: "scale(1.2)",
              transformOrigin: "center top",
            }}
          />
        ) : (
          <Text as="span" fontFamily="BebasNeueRegular" fontSize="0.62rem" lineHeight={1}>
            {tokenInitials(face.name)}
          </Text>
        )}
      </Box>
      {badge != null && (
        <Flex
          as="span"
          position="absolute"
          top="-0.28rem"
          left="-0.28rem"
          minWidth="1.15em"
          bg="brand.surfaceDim"
          color="#fff"
          border="1px solid #fff"
          borderRadius="999px"
          px="0.15em"
          fontSize="0.58rem"
          fontWeight="bold"
          lineHeight="1.4"
          alignItems="center"
          justifyContent="center"
          title={`#${badge}`}
        >
          {badge}
        </Flex>
      )}
    </Box>
  );
};

/** Incremental stepping state, when a local hop-by-hop preview runs — a maneuver
 *  (#285) or a card/scheme move prompt (#654); both walk the same way. */
export interface DockStepping {
  fighterName: string;
  movesLeft: number;
  canEnd: boolean;
  /** Commit-button copy. A maneuver ENDS with the walk ("End move here"); an
   *  effect move ANSWERS a prompt with it ("Commit here"). Defaults to the
   *  maneuver wording so the #285 call site is untouched. */
  commitLabel?: string;
  onEnd: () => void;
  onCancel: () => void;
}

export interface ProDockProps {
  view: PlayerView;
  /** ----- turn chrome ----- */
  myTurn: boolean;
  activeTurnLabel: string;
  /** red "…disconnected" chip copy, or null when everyone is present */
  disconnectedLabel: string | null;
  /** ----- board hints ----- */
  stepping: DockStepping | null;
  /** fighter names that could both move to the clicked space, when ambiguous */
  moveChoiceNames: string[] | null;
  /** LARGE movers (issue #658): copy for the one genuinely ambiguous click in a
   *  snake-step walk — a space both ends of the body could lead into, or a far
   *  destination offered under several final poses. Null the rest of the time. */
  poseChoiceHint?: string | null;
  selectedFighterName: string | null;
  /** true when the selected fighter moves hop-by-hop rather than straight there */
  stepwiseMoves: boolean;
  highlightedCount: number;
  attackTargetCount: number;
  boostHint: string | null;
  /** ----- panel slots (the big inline panels still live in game.tsx) ----- */
  combatPanel: ReactNode;
  promptPanel: ReactNode;
  /** true while the engine is waiting on a prompt response from this seat */
  hasPrompt: boolean;
  /** ----- action list ----- */
  /** grouped + numbered dock rows (lib/pro/actionDock `dockRows`, issue #514) —
   *  already in rendered order, so the chip on a row IS the digit that fires it */
  rows: DockRow[];
  /** the lone eligible action, which the spacebar shortcut fires (issue #353) */
  soleAction: Action | null;
  describe: (action: Action) => string;
  isExtendedReach: (action: Action) => boolean;
  /** Board-token face for a fighter, so an attack row can show attacker → target
   *  in the same art the board draws (issue #514). Returns null when the fighter
   *  is unknown; a null `artUrl` falls back to the board's initials. Omit the
   *  prop entirely (tests, replays) and attack rows stay text-only. */
  fighterFace?: (id: FighterId) => { name: string; artUrl: string | null } | null;
  /** the #161 disambiguation number per attacker, badged onto its face here and
   *  onto the matching board token */
  attackerBadge?: Partial<Record<FighterId, number>>;
  onAction: (action: Action) => void;
  legalActionCount: number;
  iAmSpectating: boolean;
  iForfeited: boolean;
  multiplayerView: boolean;
  /** ----- endgame / controls ----- */
  replayHref: string | null;
  undoPending: boolean;
  onUndo: () => void;
  canForfeit: boolean;
  onForfeit: () => void;
}

export const ProDock = ({
  view,
  myTurn,
  activeTurnLabel,
  disconnectedLabel,
  stepping,
  poseChoiceHint = null,
  moveChoiceNames,
  selectedFighterName,
  stepwiseMoves,
  highlightedCount,
  attackTargetCount,
  boostHint,
  combatPanel,
  promptPanel,
  hasPrompt,
  rows,
  soleAction,
  describe,
  isExtendedReach,
  fighterFace,
  attackerBadge = {},
  onAction,
  legalActionCount,
  iAmSpectating,
  iForfeited,
  multiplayerView,
  replayHref,
  undoPending,
  onUndo,
  canForfeit,
  onForfeit,
}: ProDockProps) => {
  const { layout, hydrated, update } = useDockLayout();
  const [dragging, setDragging] = useState(false);

  // Drag transform lives on the motion wrapper, mirroring SeatPlate.
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

  const persistPos = () => update({ x: x.get(), y: y.get() });
  const resetPos = () => {
    const spring = { type: "spring" as const, stiffness: 500, damping: 40 };
    animate(x, 0, spring);
    animate(y, 0, spring);
    update({ x: 0, y: 0 });
  };

  // The auto-expand guard (issue #451). Whenever the engine is waiting on this
  // seat — a prompt, a combat to resolve, the game's outcome, or any legal
  // action on offer — the dock renders expanded no matter what the stored
  // preference says, and the collapse toggle is locked out so a player can't
  // tuck a required decision out of sight. The preference itself is left
  // untouched, so the dock folds itself back up once the moment passes.
  //
  // Gate on `legalActionCount`, not `myTurn && rows.length`: the engine
  // offers a seat actions outside its own clock (sidekick placement on turn 0
  // is the live case), and board-rendered actions like MOVE_FIGHTER never reach
  // `rows` — both would slip through a turn-scoped check.
  const needsInput = hasPrompt || !!combatPanel || !!view.winner || legalActionCount > 0;
  const collapsed = layout.collapsed && !needsInput;

  const liveChrome = showLiveTurnChrome(view);

  // Key-info band — the one thing a collapsed dock still shows.
  const turnChips = liveChrome && (
    <Flex gap="0.4rem" alignItems="center" flexWrap="wrap">
      <Tag
        size="sm"
        bg={myTurn ? "brand.accent" : "whiteAlpha.300"}
        color={myTurn ? "brand.surfaceDim" : "brand.parchment"}
      >
        {activeTurnLabel}
      </Tag>
      <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
        turn {view.turnNumber}
      </Tag>
      <Tag size="sm" bg="whiteAlpha.300" color="brand.parchment">
        {view.actionsRemaining} actions left
      </Tag>
      {/* The per-seat presence badge + countdown live in ProHud — this chip is
          just the at-a-glance banner (issue #222). */}
      {disconnectedLabel && (
        <Tag size="sm" colorScheme="red">
          {disconnectedLabel}
        </Tag>
      )}
    </Flex>
  );

  const collapseTitle = needsInput
    ? "A decision is waiting — dock stays open"
    : collapsed
    ? "Expand dock"
    : "Collapse dock";

  const titleBar = (
    <Flex
      alignItems="center"
      justifyContent="space-between"
      gap="0.5rem"
      px="0.6rem"
      py="0.35rem"
      borderBottom={collapsed ? "none" : "1px solid rgba(231, 204, 152, 0.14)"}
      onPointerDown={(e) => dragControls.start(e)}
      onDoubleClick={resetPos}
      sx={{ cursor: "grab", touchAction: "none", userSelect: "none" }}
    >
      <Flex alignItems="center" gap="0.35rem" color="rgba(231, 204, 152, 0.6)" minW={0}>
        <TbGripHorizontal size="0.9rem" />
        <Text
          fontSize="0.68rem"
          letterSpacing="0.08em"
          textTransform="uppercase"
          fontWeight={700}
          noOfLines={1}
        >
          Actions
        </Text>
      </Flex>
      <Flex
        as="button"
        type="button"
        aria-label={collapseTitle}
        title={collapseTitle}
        disabled={needsInput}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={() => update({ collapsed: !layout.collapsed })}
        alignItems="center"
        justifyContent="center"
        w="1.15rem"
        h="1.15rem"
        flexShrink={0}
        borderRadius="0.35rem"
        color="rgba(231, 204, 152, 0.72)"
        opacity={needsInput ? 0.35 : 1}
        cursor={needsInput ? "not-allowed" : "pointer"}
        _hover={needsInput ? undefined : { bg: "rgba(231, 204, 152, 0.16)", color: "brand.primary" }}
        transition="background 0.15s ease, color 0.15s ease"
      >
        {collapsed ? <TbChevronDown size="0.8rem" /> : <TbChevronUp size="0.8rem" />}
      </Flex>
    </Flex>
  );

  const body = (
    <Flex
      direction="column"
      gap="0.6rem"
      px="0.6rem"
      pt="0.55rem"
      pb="0.6rem"
      overflowY="auto"
      sx={{ "::-webkit-scrollbar": { display: "none" } }}
    >
      {/* Incremental stepping controls (issue #285; effect moves #654): shown while
          a local hop-by-hop preview is in flight. The commit button sends the
          accumulated path as ONE message — a MOVE_FIGHTER for a maneuver, a
          RESPOND_PROMPT{optionId, path} for a card/scheme move — and auto-commits
          when 0 moves are left; "Cancel" resets the ghost to the origin — nothing
          was sent, so the cancel is free. Addresses the awkward prompt in #169. */}
      {stepping && (
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
            stepping {stepping.fighterName} — {stepping.movesLeft} move
            {stepping.movesLeft === 1 ? "" : "s"} left
          </Text>
          <Text fontSize="0.7rem" color="brand.parchment" opacity={0.85}>
            click a gold space to step (moving back counts too), or:
          </Text>
          <Flex gap="0.4rem">
            <Button
              size="sm"
              flex={1}
              colorScheme="yellow"
              isDisabled={!stepping.canEnd}
              onClick={stepping.onEnd}
            >
              {stepping.commitLabel ?? "End move here"}
            </Button>
            <Button size="sm" flex={1} variant="outline" color="brand.parchment" onClick={stepping.onCancel}>
              Cancel
            </Button>
          </Flex>
        </Flex>
      )}
      {turnChips}
      {moveChoiceNames && (
        <Text fontSize="0.8rem" color="#C4B5FD" fontWeight="bold" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {/* "both" was hardcoded when two candidates was the only case. Protocol
              v28 (SMALL fighters) makes four same-named Larrys reaching one space
              ordinary, so the count drives the wording. Names arrive pre-badged
              ("Larry 2") and the matching number is on the board token. */}
          {moveChoiceNames.join(" or ")} can {moveChoiceNames.length > 2 ? "all" : "both"} move here —
          click which fighter should move (or tap the space again to cancel)
        </Text>
      )}
      {poseChoiceHint && (
        <Text fontSize="0.8rem" color="#C4B5FD" fontWeight="bold" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {poseChoiceHint}
        </Text>
      )}
      {!moveChoiceNames && !poseChoiceHint && !stepping && (highlightedCount > 0 || attackTargetCount > 0) && (
        <Text fontSize="0.8rem" color="brand.accent" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {selectedFighterName
            ? stepwiseMoves
              ? `stepping ${selectedFighterName} — click a near gold space to step one at a time, or a far one to move straight there`
              : `showing moves for ${selectedFighterName} — click a gold space (click the fighter again to unselect)`
            : [
                highlightedCount > 0 &&
                  `click a gold space to move there (${highlightedCount} option${
                    highlightedCount === 1 ? "" : "s"
                  })`,
                attackTargetCount > 0 && "click a pulsing enemy to attack",
              ]
                .filter(Boolean)
                .join(" · ")}
        </Text>
      )}
      {boostHint && (
        <Text fontSize="0.75rem" color="brand.parchment" opacity={0.85} textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {boostHint}
        </Text>
      )}
      {combatPanel}
      {promptPanel}
      <Flex direction="column" gap="0.4rem">
        {rows.map(({ action: a, hotkey, dividerBefore }, i) => (
          <Fragment key={i}>
            {/* Group divider (issue #514): a hairline between bands — maneuver,
                combat, schemes — so the eye lands on the right family of rows
                instead of scanning one undifferentiated stack. */}
            {dividerBefore && <Box h="1px" bg="rgba(231, 204, 152, 0.16)" mx="0.15rem" my="0.1rem" />}
            <Button
              {...BTN}
              bg="rgba(20, 8, 24, 0.65)"
              justifyContent="flex-start"
              whiteSpace="normal"
              height="auto"
              minH="2rem"
              py="0.4rem"
              textAlign="left"
              onClick={() => onAction(a)}
            >
              <Flex as="span" align="center" gap="0.4rem" flexWrap="wrap">
                {/* Number hotkey (issue #514): the digit that fires this row, in
                    rendered order. Only present with 2+ rows — the 1-row case is
                    the spacebar's (#353), whose chip renders on the right below. */}
                {hotkey != null && (
                  <Kbd
                    flexShrink={0}
                    bg="rgba(255,255,255,0.08)"
                    borderColor="rgba(255,255,255,0.25)"
                    color="brand.parchment"
                    fontSize="0.68rem"
                    px="0.35rem"
                  >
                    {hotkey}
                  </Kbd>
                )}
                {/* Scheme-item use (v17): a leading yellow lightning glyph marks
                    this as a BOARD item action, visually distinct from a hand
                    scheme card. The item's label rides in the describe() text. */}
                {a.type === "USE_SCHEME_ITEM" && (
                  <Box as="span" display="inline-flex" boxSize="1.1rem" flexShrink={0}>
                    <ItemGlyph kind="scheme" fill="#E4B106" />
                  </Box>
                )}
                {/* Attack rows show WHO hits WHOM in the board's own token art
                    (issue #514), so picking the right attacker is a glance rather
                    than a name-match. The text label stays — the faces annotate it. */}
                {a.type === "DECLARE_ATTACK" && fighterFace && (
                  <Flex as="span" align="center" gap="0.15rem" flexShrink={0}>
                    <DockTokenFace face={fighterFace(a.attacker)} badge={attackerBadge[a.attacker]} />
                    <Box as="span" color="#E36B6B" display="inline-flex">
                      <TbArrowNarrowRight size="0.95rem" />
                    </Box>
                    <DockTokenFace face={fighterFace(a.target)} />
                  </Flex>
                )}
                <Text as="span">{describe(a)}</Text>
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
                {a === soleAction && (
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
          </Fragment>
        ))}
        {legalActionCount === 0 && !hasPrompt && liveChrome && (
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
              (issue #240). /pro/replays?open=<id> auto-opens it, and the link
              only renders once the bundle is held, so it always resolves. */}
          {replayHref && (
            <Link
              href={replayHref}
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
          {/* Straight back into matchmaking so players can start another game
              without hand-navigating (issue #374). Bare href = full navigation,
              same as the sibling replay link above. */}
          <Link
            href="/pro/game"
            color="brand.parchment"
            opacity={0.85}
            fontSize="0.9rem"
            display="inline-flex"
            alignItems="center"
            gap="0.3rem"
            _hover={{ opacity: 1, color: "brand.accent", textDecoration: "none" }}
          >
            <TbPlus size="0.85rem" /> New game
          </Link>
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
          onClick={onUndo}
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
        <Button size="sm" mt="0.4rem" colorScheme="red" variant="outline" onClick={onForfeit}>
          Forfeit
        </Button>
      )}
    </Flex>
  );

  return (
    <motion.div
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      style={{
        x,
        y,
        position: "fixed",
        right: "0.75rem",
        top: "7.5rem",
        width: DOCK_WIDTH,
        maxHeight: "calc(100vh - 8.5rem)",
        display: "flex",
        flexDirection: "column",
        zIndex: dragging ? 200 : 140,
      }}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        persistPos();
      }}
    >
      <Flex
        direction="column"
        minH={0}
        borderRadius="0.85rem"
        overflow="hidden"
        border="1px solid rgba(231, 204, 152, 0.2)"
        boxShadow="0 12px 30px rgba(12, 4, 16, 0.5)"
        bg="linear-gradient(180deg, rgba(58, 33, 64, 0.72), rgba(44, 24, 49, 0.74))"
        sx={{ backdropFilter: "blur(9px) saturate(1.1)", WebkitBackdropFilter: "blur(9px) saturate(1.1)" }}
      >
        {titleBar}
        {collapsed ? (
          // Collapsed: the key-info band only. Everything that could carry a
          // decision is gated behind `needsInput` above, so nothing is hidden.
          turnChips && (
            <Box px="0.6rem" py="0.5rem">
              {turnChips}
            </Box>
          )
        ) : (
          body
        )}
      </Flex>
    </motion.div>
  );
};
