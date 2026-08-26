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
import { Fragment, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Kbd, Link, Tag, Text, Tooltip } from "@chakra-ui/react";
import { animate, motion, useDragControls, useMotionValue } from "framer-motion";
import {
  TbArrowNarrowRight,
  TbChevronDown,
  TbChevronUp,
  TbExternalLink,
  TbGripHorizontal,
  TbLink,
  TbPlus,
} from "react-icons/tb";
import { Action, FighterId, PlayerView } from "@/lib/pro/protocol";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { isViewerOnWinningTeam } from "@/lib/pro/teams";
import { LARGE_FIGHTER_BLURB, LARGE_REACH_CHIP } from "@/lib/pro/largeReach";
import { ItemGlyph } from "@/components/Pro/ItemBadge";
import { tokenInitials } from "./FighterTokenPortrait";
import { DockRow } from "@/lib/pro/actionDock";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";
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
  /** Price + tooltip for a DECLARE_ATTACK row the server offered only because
   *  tokens will be spent to reach it (issue #668). Null for a free attack and
   *  for every deck that buys no range; omit the prop entirely (tests, replays)
   *  and attack rows are exactly what they were. */
  rangePurchaseChip?: (action: Action) => { chip: string; blurb: string } | null;
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
  /** Local deep-link into this browser's saved replay — labelled as such (#698). */
  replayHref: string | null;
  /** Upload this match and copy its public share link. Omitted when there is
   *  nothing to upload or nobody to upload as (signed out, bundle not held). */
  onCopyShareLink?: () => void;
  shareLinkBusy?: boolean;
  undoPending: boolean;
  onUndo: () => void;
  canForfeit: boolean;
  onForfeit: () => void;
  /**
   * Render one of the mobile shells instead of the floating desktop dock
   * (issue #708, direction B). Same rows, same panels, same rule that a
   * decision the engine is waiting on can never be tucked out of sight — what
   * changes is the shell around them:
   *
   *  - "portrait": nothing permanent stands on the board, so at rest this is a
   *    floating pill row (the primary action + "N more…"), and the full sheet
   *    slides up over a scrim when the player asks for it or when the decision
   *    is one the pill row cannot carry (a prompt, a combat, a walk in
   *    progress, the endgame).
   *  - "rail": the landscape decision rail — always open, inline, positioned by
   *    the caller.
   *
   * Either way the drag handle, the fixed right-edge slot and the localStorage
   * offset drop away, and the action rows grow to a 44px tap target.
   */
  mobile?: false | "portrait" | "rail";
  /**
   * Portrait only: the hand drawer is open, so the sheet stands ON TOP of it
   * rather than behind it. This is the "a prompt is asking about a card in your
   * hand" case — the question belongs above the cards it is about.
   */
  mobileHandOpen?: boolean;
  /** portrait only: attached to the sheet element so the page can measure it */
  mobileSheetRef?: RefObject<HTMLDivElement>;
  /** portrait only: told whenever the sheet appears/disappears, so the page can
   *  re-fit the board into the space that is left */
  onMobileSheetShown?: (shown: boolean) => void;
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
  rangePurchaseChip,
  fighterFace,
  attackerBadge = {},
  onAction,
  legalActionCount,
  iAmSpectating,
  iForfeited,
  multiplayerView,
  replayHref,
  onCopyShareLink,
  shareLinkBusy = false,
  undoPending,
  onUndo,
  canForfeit,
  onForfeit,
  mobile = false,
  mobileHandOpen = false,
  mobileSheetRef,
  onMobileSheetShown,
}: ProDockProps) => {
  const { layout, hydrated, update } = useDockLayout();
  const [dragging, setDragging] = useState(false);
  // Portrait's sheet is CLOSED at rest, which is the opposite of the desktop
  // dock's stored preference — so it gets its own local state rather than
  // writing a mobile default into the layout every player shares.
  const [sheetOpen, setSheetOpen] = useState(false);

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

  // Board hints as STRINGS, so the mobile pill row can carry the same sentence
  // the sheet does without a second wording of it (issue #708). The desktop
  // copy is untouched — these are the exact texts the body already rendered.
  const moveChoiceLine = moveChoiceNames
    ? // "both" was hardcoded when two candidates was the only case. Protocol
      // v28 (SMALL fighters) makes four same-named Larrys reaching one space
      // ordinary, so the count drives the wording. Names arrive pre-badged
      // ("Larry 2") and the matching number is on the board token.
      `${moveChoiceNames.join(" or ")} can ${
        moveChoiceNames.length > 2 ? "all" : "both"
      } move here — click which fighter should move (or tap the space again to cancel)`
    : null;
  const highlightHint =
    !moveChoiceNames && !poseChoiceHint && !stepping && (highlightedCount > 0 || attackTargetCount > 0)
      ? selectedFighterName
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
            .join(" · ")
      : null;
  const boardHint = moveChoiceLine ?? poseChoiceHint ?? highlightHint;

  // ----- direction B mobile shells (issue #708) ------------------------------
  //
  // The sheet is FORCED open — and cannot be dismissed — for any decision the
  // pill row below cannot itself carry: a prompt, a combat, a walk in progress,
  // the endgame. That is the desktop `needsInput` guard reshaped for a layout
  // where the dock is not permanently on screen; an ordinary "which of these
  // three actions" turn is not forced, because the pill row is showing it.
  const sheetForced = hasPrompt || !!combatPanel || !!view.winner || !!stepping;
  const sheetShown = sheetForced || sheetOpen;
  const portraitSheetShown = mobile === "portrait" && sheetShown;
  useEffect(() => {
    onMobileSheetShown?.(portraitSheetShown);
    // `onMobileSheetShown` is a fresh closure each render; the boolean is the
    // only thing worth reacting to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portraitSheetShown]);

  // The mobile sheet's grab bar: the turn chips (so the sheet answers "whose
  // turn, how many actions left" the moment it opens) and a close affordance
  // that is disabled while the sheet is forced.
  const mobileBar = (
    <Flex
      as="button"
      type="button"
      aria-label={sheetForced ? "A decision is waiting — sheet stays open" : "Close actions"}
      aria-expanded
      disabled={sheetForced}
      onClick={() => !sheetForced && setSheetOpen(false)}
      alignItems="center"
      justifyContent="space-between"
      gap="0.5rem"
      w="100%"
      minH={TAP_TARGET}
      px="0.75rem"
      py="0.4rem"
      textAlign="left"
      borderBottom="1px solid rgba(231, 204, 152, 0.14)"
      cursor={sheetForced ? "default" : "pointer"}
      sx={{ userSelect: "none" }}
    >
      <Box minW={0} flex="1">
        {/* `turnChips` is `false` outside live turn chrome (replay/pre-game), so
            fall back with `||`, not `??`. */}
        {turnChips || (
          <Text
            fontSize="0.68rem"
            letterSpacing="0.08em"
            textTransform="uppercase"
            fontWeight={700}
            color="rgba(231, 204, 152, 0.6)"
          >
            Actions
          </Text>
        )}
      </Box>
      <Flex
        alignItems="center"
        gap="0.3rem"
        flexShrink={0}
        color="rgba(231, 204, 152, 0.72)"
        opacity={sheetForced ? 0.35 : 1}
      >
        <Text fontSize="0.68rem" fontWeight={700} letterSpacing="0.04em" whiteSpace="nowrap">
          Close
        </Text>
        <TbChevronDown size="0.9rem" />
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
      {/* On mobile the chips ride in the sheet's bar, where they stay readable
          when it is collapsed — rendering them again here would just repeat. */}
      {!mobile && turnChips}
      {moveChoiceLine && (
        <Text fontSize="0.8rem" color="#C4B5FD" fontWeight="bold" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {moveChoiceLine}
        </Text>
      )}
      {poseChoiceHint && (
        <Text fontSize="0.8rem" color="#C4B5FD" fontWeight="bold" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {poseChoiceHint}
        </Text>
      )}
      {highlightHint && (
        <Text fontSize="0.8rem" color="brand.accent" textShadow="0 1px 3px rgba(0,0,0,0.6)">
          {highlightHint}
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
              minH={mobile ? TAP_TARGET : "2rem"}
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
                {/* Bought attack range (issue #668). Same slot and shape as the
                    large-reach chip above — both explain a reach the row's text
                    cannot — but in the board's Broadcast violet, and carrying a
                    PRICE: the engine deducts it the moment this row is clicked. */}
                {(() => {
                  const bought = rangePurchaseChip?.(a) ?? null;
                  return bought ? (
                    <Tooltip label={bought.blurb} hasArrow placement="top" openDelay={150}>
                      <Tag size="sm" bg="#C58BE8" color="#241033" fontWeight={700} flexShrink={0}>
                        {bought.chip}
                      </Tag>
                    </Tooltip>
                  ) : null;
                })()}
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
              only renders once the bundle is held, so it always resolves —
              for US. It reads localStorage, so it resolves for nobody else,
              which is why it says "your" and why the share link sits beside it
              rather than behind a page the player has to go find (#698). */}
          {replayHref && (
            <Tooltip label="Saved in this browser — this link only opens for you" hasArrow placement="top">
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
                View your replay <TbExternalLink size="0.85rem" />
              </Link>
            </Tooltip>
          )}
          {/* Upload-then-copy in one action. Only wired when the player is
              signed in and a bundle exists — otherwise there is nothing to
              upload it to, and the local link above is the honest option. */}
          {onCopyShareLink && (
            <Tooltip label="Uploads a copy, then anyone with the link can watch" hasArrow placement="bottom">
              <Button
                variant="link"
                color="brand.parchment"
                opacity={0.85}
                fontWeight="normal"
                fontSize="0.9rem"
                gap="0.3rem"
                isLoading={shareLinkBusy}
                onClick={onCopyShareLink}
                _hover={{ opacity: 1, color: "brand.accent", textDecoration: "none" }}
              >
                <TbLink size="0.85rem" /> Copy share link
              </Button>
            </Tooltip>
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

  // ----- rail (landscape): always open, inline, positioned by the caller -----
  if (mobile === "rail")
    return (
      <Flex direction="column" minH={0} flex="1 1 auto" overflow="hidden">
        <Box px="0.15rem" pb="0.4rem" flexShrink={0}>
          {turnChips}
        </Box>
        {body}
      </Flex>
    );

  // ----- portrait: pill row at rest, sheet over a scrim when it is needed ----
  if (mobile === "portrait") {
    // The one action the pill row promotes: the spacebar's sole action when the
    // engine offers exactly one, otherwise the first row in the dock's own
    // order (maneuver leads that order, which is what a player reaches for).
    const primary = soleAction ?? rows[0]?.action ?? null;
    const extra = Math.max(rows.length - (primary ? 1 : 0), 0);

    if (!sheetShown)
      return (
        <Flex
          data-testid="pro-mobile-pills"
          direction="column"
          alignItems="center"
          gap="0.4rem"
          pointerEvents="none"
        >
          {boardHint && (
            <Text
              maxW="20rem"
              px="0.7rem"
              py="0.25rem"
              borderRadius="999px"
              bg="rgba(20, 8, 24, 0.72)"
              color="brand.accent"
              fontSize="0.72rem"
              textAlign="center"
              noOfLines={2}
              pointerEvents="none"
            >
              {boardHint}
            </Text>
          )}
          <Flex alignItems="center" justifyContent="center" gap="0.5rem" maxW="100%" px="0.5rem">
            {primary ? (
              <Button
                minH="3rem"
                px="1.25rem"
                borderRadius="999px"
                bg="brand.accent"
                color="brand.surfaceDim"
                fontWeight={700}
                fontSize="0.95rem"
                boxShadow="0 6px 20px rgba(12,4,16,0.5)"
                _hover={{ bg: "brand.accent" }}
                _active={{ bg: "brand.accentDeep" }}
                maxW="15rem"
                overflow="hidden"
                pointerEvents="auto"
                onClick={() => onAction(primary)}
              >
                <Text as="span" noOfLines={1}>
                  {describe(primary)}
                </Text>
              </Button>
            ) : (
              liveChrome && (
                <Flex
                  alignItems="center"
                  minH="2.75rem"
                  px="1rem"
                  borderRadius="999px"
                  bg="rgba(44, 24, 49, 0.9)"
                  border="1px solid rgba(250, 235, 215, 0.3)"
                  color="brand.parchment"
                  fontSize="0.8rem"
                  pointerEvents="none"
                >
                  {iAmSpectating
                    ? iForfeited
                      ? "You forfeited — spectating."
                      : "Eliminated — spectating."
                    : multiplayerView
                      ? "waiting on another player…"
                      : "waiting on opponent…"}
                </Flex>
              )
            )}
            <Button
              data-testid="pro-mobile-more"
              minH="3rem"
              px="1rem"
              borderRadius="999px"
              bg="rgba(44, 24, 49, 0.9)"
              color="brand.parchment"
              border="1px solid rgba(250, 235, 215, 0.3)"
              fontSize="0.8rem"
              fontWeight={500}
              _hover={{ bg: "rgba(20, 8, 24, 0.95)" }}
              pointerEvents="auto"
              onClick={() => setSheetOpen(true)}
            >
              {extra > 0 ? `${extra} more…` : "Details"}
            </Button>
          </Flex>
        </Flex>
      );

    return (
      <>
        {/* Scrim. Dismissible only when the sheet was opened by choice — a
            forced decision has nowhere to dismiss TO. */}
        {/* Scrim — ONLY for a sheet the player opened by choice, because its
            only job is "tap away to dismiss".
        
            A FORCED sheet must not have one: half the prompts it carries say
            "click a gold space on the board", and a full-viewport
            `pointer-events: auto` layer over the board silently eats every one
            of those taps (the sheet's own dismiss is disabled while forced, so
            the scrim was pure obstruction). This is the mobile shape of the
            desktop rule that a prompt owns the board.
        
            The z values in this branch are LOCAL to the mobile control
            container the page pins at z 160 — inside it the order runs scrim,
            sheet, then the log/hand/overflow row, so nothing the player needs
            ends up underneath the sheet. */}
        {!mobileHandOpen && !sheetForced && (
          <Box
            data-testid="pro-mobile-sheet-scrim"
            position="fixed"
            inset={0}
            zIndex={1}
            bg="rgba(12, 4, 16, 0.5)"
            pointerEvents="auto"
            onClick={() => setSheetOpen(false)}
          />
        )}
        <Flex
          ref={mobileSheetRef}
          data-testid="pro-mobile-sheet"
          position="fixed"
          left={0}
          right={0}
          bottom={mobileHandOpen ? "62svh" : 0}
          // Above the hand drawer's scrim when it is lifted, so the question is
          // legible over the cards it is asking about.
          zIndex={mobileHandOpen ? 4 : 2}
          direction="column"
          minH={0}
          // `svh`, never `vh`: the mobile URL bar makes `vh` taller than the
          // visible viewport, which is what used to cut the bottom off a
          // combat panel.
          maxH={mobileHandOpen ? "34svh" : "72svh"}
          borderTopRadius="1.1rem"
          overflow="hidden"
          borderTop="2px solid"
          borderColor="brand.accent"
          boxShadow="0 -8px 24px rgba(12, 4, 16, 0.55)"
          bg="linear-gradient(180deg, rgba(58, 33, 64, 0.97), rgba(38, 20, 43, 0.99))"
          pointerEvents="auto"
          sx={{
            // Room for the log / hand / overflow row that floats above this
            // sheet, so the last action row is never tucked under it.
            paddingBottom: mobileHandOpen
              ? undefined
              : "calc(7rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {mobileBar}
          {body}
        </Flex>
      </>
    );
  }

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
