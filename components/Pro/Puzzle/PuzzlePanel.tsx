/**
 * The puzzle panel (issue #1679): one embeddable component for the four places
 * a puzzle is played — the landing page, /puzzles, the Quick Play search and a
 * lobby wait.
 *
 * It opens its OWN socket to the engine (`usePuzzleSocket`), creates a puzzle
 * room and mounts the contained in-game view (`<GameView contained>`, #1678)
 * between a header (goal, source, action pips) and a footer (hint, reset, solve
 * rate, mute). The verdict covers the panel when a try ends.
 *
 * The client knows NO rules: the goal line, the pips' count, whether a try is
 * solved, the HP left, the hint and the solution are all the server's words.
 *
 * Sizing: the panel fills its parent (`100% × 100%`), so the parent must have a
 * size. The view inside picks its arrangement from what is left after the
 * header and footer (`containedLayoutMode`).
 *
 * Nothing here touches the host page: no title, no URL, no toast, no sound
 * until the visitor unmutes, and the page keeps its own scroll over the board.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Box, Button, Flex, IconButton, Spinner, Text } from "@chakra-ui/react";
import { TbBulb, TbRefresh, TbVolume, TbVolumeOff } from "react-icons/tb";

import { VS_BOT_HREF } from "@/components/LandingPage/content";
import { BTN, BTN_GOLD, GameView, TABLE_BG, type GameViewFeatures } from "@/components/Pro/GameView";
import { track } from "@/lib/analytics";
import type { ProLogEntry } from "@/lib/pro/gameLog";
import type { Action, PuzzleContext, PuzzleSummary, SpaceId } from "@/lib/pro/protocol";
import { puzzleSourceLine, solveRateLine, usePuzzleCatalogue } from "@/lib/pro/puzzleCatalogue";
import { markPuzzleSolved, nextUnsolvedPuzzle, readSolvedPuzzles, useSolvedPuzzles } from "@/lib/pro/puzzleProgress";
import { botFallbackHref } from "@/lib/pro/quickMatch";
import { usePuzzleSocket } from "@/lib/pro/usePuzzleSocket";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import { colors, fonts } from "@/styles/style";

export interface PuzzlePanelProps {
  /** Where the panel is embedded. Recorded with every attempt and analytics event. */
  context: PuzzleContext;
  /** The puzzle to open. Omitted: the first one this browser has not solved. */
  puzzleId?: string;
  /**
   * Freeze the panel: inputs off, the board and the try kept, the socket left
   * open. Clearing it resumes where the visitor was.
   */
  paused?: boolean;
  /**
   * An honest solve: the solution was not shown first, in this room or earlier
   * on this page load. `first`: this browser's first solve of that puzzle.
   */
  onSolved?: (solve: { puzzleId: string; tries: number; seconds: number; first: boolean }) => void;
  /** Open the socket and the room at mount (default). False: a "Start puzzle" button first. */
  autoStart?: boolean;
  /** "Next puzzle" moved the panel to another puzzle (the host may mirror it, e.g. in its URL). */
  onPuzzleChange?: (puzzleId: string) => void;
  /** The engine to talk to. Default: the site's Pro engine. */
  wsUrl?: string;
  /** How long the final board stays in view before the verdict covers it (ms). */
  resultDelayMs?: number;
  /**
   * What the panel has to show, for a host that covers it until there is
   * something to play (the landing still, #1680; a lobby wait, #1681):
   * `loading` until a position is on the table (again for each new room: "Next
   * puzzle", a reload), `ready` while one is (and for any state that waits on
   * the visitor: "Start puzzle", timed out, all solved), `unavailable` when
   * the engine or the puzzle cannot be reached (or the connection is lost).
   * In a waiting context the panel renders nothing once it is `unavailable`,
   * so the host can put its own screen back.
   */
  onStatus?: (status: PuzzlePanelStatus) => void;
}

export type PuzzlePanelStatus = "loading" | "ready" | "unavailable";

/** What a puzzle has no use for, and what must not reach the host page. */
const PUZZLE_FEATURES: Partial<GameViewFeatures> = {
  forfeit: false,
  undo: false,
  reportBug: false,
  turnTimer: false,
  postGame: false,
  soundToggles: false,
  boardGestures: false,
  // A puzzle is not the place to change how /pro/game plays on this device.
  deviceSettings: false,
};

const OPPONENT_HAND_LABEL = { title: "Opponent's hand", note: "shown in puzzles" };

/** Contexts where the panel only fills a wait: no way out to a full game, and no error cards. */
export const isWaitingContext = (context: PuzzleContext): boolean => context === "quick_search" || context === "lobby_wait";

export const PUZZLE_RESULT_DELAY_MS = 1200;
const NOTICE_MS = 5000;

// `puzzle_started` fires once per puzzle per page load ("a sitting"), however
// many panels or remounts there are.
const startedThisSitting = new Set<string>();
// Puzzles whose solution this page load has shown. A fresh room (`restart()`)
// forgets that on the server; the visitor does not, so a solve after it is
// never reported as their own (#1687) — and every later room for that puzzle
// is created with `solutionSeen`, so the server does not record one either
// (engine #1078).
const solutionSeenThisSitting = new Set<string>();
const solutionSeenBefore = (puzzleId: string) => solutionSeenThisSitting.has(puzzleId);
/** Test-only. */
export const __resetPuzzleSittingForTests = () => {
  startedThisSitting.clear();
  solutionSeenThisSitting.clear();
};

/** The panel width from which `/puzzles` shows this try's log beside the board. */
export const PUZZLE_LOG_MIN_WIDTH_PX = 1000;

/** The view's log (newest action first, lines in order within one) as plain lines, oldest first. */
export const puzzleLogLines = (entries: ProLogEntry[]): { key: string; text: string; who: ProLogEntry["who"] }[] => {
  const batches: ProLogEntry[][] = [];
  for (const entry of entries) {
    const last = batches[batches.length - 1];
    if (last && last[0].batchId === entry.batchId) last.push(entry);
    else batches.push([entry]);
  }
  return batches
    .reverse()
    .flat()
    .map(({ key, text, who }) => ({ key, text, who }));
};

const Display = ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
  <Text fontFamily={fonts.LeagueGothic} fontWeight={400} textTransform="uppercase" letterSpacing="0.02em" lineHeight={1.05} color="brand.parchment" {...rest}>
    {children}
  </Text>
);

const Small = ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
  <Text fontFamily={fonts.SpaceGrotesk} fontSize="0.8rem" color="brand.parchment" opacity={0.8} {...rest}>
    {children}
  </Text>
);

/**
 * A state that takes the panel's whole box: the verdict, paused, a quiet
 * failure. With a `label` it is a named region (a verdict: focus moves to its
 * main button, which reads the region's name out with it). With `status` the
 * whole cover is a status, read out when it appears: only for a cover that is
 * nothing but words. A cover with a button in it marks its own line of text
 * as the status instead (`STATUS`), so the button is not read as part of it.
 */
const STATUS = { role: "status" } as const;
const Cover = ({ testId, dim = true, label, status = false, children }: { testId: string; dim?: boolean; label?: string; status?: boolean; children: ReactNode }) => (
  <Flex
    data-testid={testId}
    position="absolute"
    inset={0}
    zIndex={5}
    {...(label ? { role: "region", "aria-label": label } : status ? STATUS : {})}
    direction="column"
    align="center"
    justify="center"
    textAlign="center"
    gap="0.6rem"
    p="1.25rem"
    bg={dim ? "rgba(28, 16, 32, 0.86)" : TABLE_BG}
    sx={dim ? { backdropFilter: "blur(2px)" } : undefined}
  >
    {children}
  </Flex>
);

const Pips = ({ allowed, remaining }: { allowed: number; remaining: number }) => (
  <Flex data-testid="puzzle-pips" role="img" aria-label={`${remaining} of ${allowed} actions left`} gap="0.35rem" align="center" flexShrink={0}>
    {Array.from({ length: allowed }, (_, i) => {
      const filled = i < remaining;
      return (
        <Box
          key={i}
          data-testid="puzzle-pip"
          data-filled={filled ? "true" : "false"}
          w="0.9rem"
          h="0.9rem"
          borderRadius="50%"
          border={`2px solid ${colors.brand.accent}`}
          bg={filled ? "brand.accent" : "transparent"}
          transition="background 200ms ease"
        />
      );
    })}
  </Flex>
);

export const PuzzlePanel = ({
  context,
  puzzleId,
  paused = false,
  onSolved,
  autoStart = true,
  onPuzzleChange,
  wsUrl = PRO_WS_URL,
  resultDelayMs = PUZZLE_RESULT_DELAY_MS,
  onStatus,
}: PuzzlePanelProps) => {
  const waiting = isWaitingContext(context);
  const catalogue = usePuzzleCatalogue(wsUrl);
  const solved = useSolvedPuzzles();

  // Which puzzle is up. The prop leads when given; otherwise the first unsolved
  // one, picked once the catalogue is in. "Next puzzle" moves it from inside.
  const [currentId, setCurrentId] = useState<string | null>(puzzleId ?? null);
  const [allDone, setAllDone] = useState(false);
  // A second lap (#1681): with everything solved, a wait still has a puzzle to
  // offer. The puzzles run again in catalogue order; the solved record stays.
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    if (!puzzleId) return;
    setCurrentId(puzzleId);
    setAllDone(false);
  }, [puzzleId]);
  useEffect(() => {
    if (puzzleId || currentId || allDone || catalogue.status !== "ready") return;
    const first = nextUnsolvedPuzzle(catalogue.puzzles, readSolvedPuzzles());
    if (first) setCurrentId(first.id);
    else setAllDone(true);
  }, [puzzleId, currentId, allDone, catalogue]);

  const [started, setStarted] = useState(autoStart);
  useEffect(() => {
    if (autoStart) setStarted(true);
  }, [autoStart]);

  const room = usePuzzleSocket(wsUrl, { puzzleId: currentId, context, enabled: started && !allDone, solutionSeen: solutionSeenBefore });
  const { socket, phase, info, result, hint, solution, epoch, solverOnRoster, reset, requestHint, requestSolution, restart } = room;
  const snapshot = socket.snapshot;
  const playing = phase === "playing" && !!snapshot && !!info;

  const listed = useMemo(() => catalogue.puzzles?.find((p) => p.id === currentId) ?? null, [catalogue.puzzles, currentId]);
  const puzzle: PuzzleSummary | null = info?.puzzle ?? listed;
  const rateLine = solveRateLine(listed);

  // --- analytics + progress (never per move) --------------------------------
  const markStarted = useCallback(() => {
    const p = info?.puzzle;
    if (!p || startedThisSitting.has(p.id)) return;
    startedThisSitting.add(p.id);
    track("puzzle_started", { puzzle_id: p.id, context, order: p.order });
  }, [info, context]);

  // The solution of the puzzle on the table has been shown: remembered for the
  // page load, across `restart()` and "Next puzzle" and back. (Declared before
  // the verdict's effect below, so a result that says so itself is covered.)
  const solutionOnShow = !!solution || !!info?.solutionShown || !!result?.solutionShown;
  const shownFor = info?.puzzle.id ?? null;
  useEffect(() => {
    if (solutionOnShow && shownFor) solutionSeenThisSitting.add(shownFor);
  }, [solutionOnShow, shownFor]);

  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  const reportedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result || !info) return;
    const key = `${result.roomId}:${result.tryNumber}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    const id = info.puzzle.id;
    const solutionSeen = result.solutionShown || solutionSeenThisSitting.has(id);
    track("puzzle_attempt_finished", {
      puzzle_id: id,
      context,
      result: result.result,
      try_number: result.tryNumber,
      seconds: result.seconds,
      hint_used: result.hintUsed,
      solution_shown: solutionSeen,
    });
    if (result.result !== "solved") return;
    // A solve after the solution was shown is not a solve of the visitor's
    // own: no `puzzle_solved`, no `onSolved`. It is still remembered here, so
    // "Next puzzle" moves on instead of offering this one for ever.
    if (solutionSeen) {
      markPuzzleSolved(id);
      return;
    }
    const first = markPuzzleSolved(id);
    if (first) track("puzzle_solved", { puzzle_id: id, context, tries: result.tryNumber, seconds: result.seconds });
    onSolvedRef.current?.({ puzzleId: id, tries: result.tryNumber, seconds: result.seconds, first });
  }, [result, info, context]);

  // --- the verdict, shown once the last blow has had its moment ---------------
  const [verdict, setVerdict] = useState<"result" | "solution" | null>(null);
  const pendingVerdict: "result" | "solution" | null = result ? "result" : solution === "done" ? "solution" : null;
  useEffect(() => {
    if (!pendingVerdict) {
      setVerdict(null);
      return;
    }
    const timer = setTimeout(() => setVerdict(pendingVerdict), resultDelayMs);
    return () => clearTimeout(timer);
  }, [pendingVerdict, resultDelayMs]);

  // --- the view's notices land in the status line, not the host's toaster -----
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => void (noticeTimer.current && clearTimeout(noticeTimer.current)), []);
  useEffect(() => setNotice(null), [epoch]);

  // Muted until the visitor says otherwise; the control is the interaction.
  const [soundOn, setSoundOn] = useState(false);

  // The view's sends, with the "first interaction" hook on them.
  const gameSocket = useMemo(
    () => ({
      ...socket,
      sendAction: (action: Action) => {
        markStarted();
        return socket.sendAction(action);
      },
      respondToPrompt: (promptId: string, optionId: string, path?: SpaceId[]) => {
        markStarted();
        return socket.respondToPrompt(promptId, optionId, path);
      },
    }),
    [socket, markStarted]
  );

  // Paused or covered by a verdict: the view takes no pointer, focus or key.
  // Only while a board is up: a verdict left over from a room that has since
  // ended (timed out, lost) or from the last puzzle ("all solved") must not
  // deaden the card that takes the stage then, which has buttons of its own.
  const blocked = paused || (playing && verdict !== null && !allDone);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stageRef.current?.toggleAttribute("inert", blocked);
  }, [blocked]);

  // The verdict takes the keyboard with it: focus moves to its main button
  // (the view under it has just gone inert). Not when the visitor's focus is
  // somewhere else on the host page.
  const panelRef = useRef<HTMLDivElement>(null);
  const verdictShown = !paused && playing && !allDone ? (verdict === "result" && result ? `result:${result.result}` : verdict === "solution" ? "solution" : null) : null;
  useEffect(() => {
    const root = panelRef.current;
    if (!verdictShown || !root) return;
    const active = document.activeElement;
    if (active && active !== document.body && !root.contains(active) && !active.contains(root)) return;
    // The marked button, or (a solve with nowhere to go next) the first control the verdict has.
    const target = root.querySelector<HTMLElement>("[data-verdict-primary]") ?? root.querySelector<HTMLElement>('[role="region"] button, [role="region"] a');
    target?.focus({ preventScroll: true });
  }, [verdictShown]);

  // --- this try's log, beside the board where the panel is wide enough --------
  const [log, setLog] = useState<ProLogEntry[]>([]);
  const [panelWidth, setPanelWidth] = useState(0);
  useEffect(() => {
    const root = panelRef.current;
    if (!root) return;
    const measure = () => setPanelWidth(root.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
  const logLines = useMemo(() => puzzleLogLines(log), [log]);
  const logListRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = logListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [logLines]);

  // Where "Next puzzle" would go. With none left it leads to "You solved them
  // all" — but only when that is true: while the puzzle on the table is itself
  // unsolved (a watched solution) there is no next, and no such button.
  const nextUp = catalogue.puzzles ? nextUnsolvedPuzzle(catalogue.puzzles, solved, currentId) : null;
  const canGoNext = !!catalogue.puzzles && (replay || !!nextUp || (!!currentId && solved.includes(currentId)));
  const nextPuzzle = useCallback(() => {
    if (!catalogue.puzzles) return;
    const done = readSolvedPuzzles();
    // On a second lap "next" is simply the next one in the catalogue; after the
    // last one the lap is over and the panel says so again.
    const next = replay
      ? (catalogue.puzzles[catalogue.puzzles.findIndex((p) => p.id === currentId) + 1] ?? null)
      : nextUnsolvedPuzzle(catalogue.puzzles, done, currentId);
    if (!replay && !next && !(currentId && done.includes(currentId))) return;
    track("puzzle_next_clicked", { puzzle_id: currentId ?? undefined, context, next_puzzle_id: next?.id });
    if (!next) {
      setReplay(false);
      setAllDone(true);
      return;
    }
    setCurrentId(next.id);
    onPuzzleChange?.(next.id);
  }, [catalogue.puzzles, currentId, context, onPuzzleChange, replay]);
  const playAgain = useCallback(() => {
    const first = catalogue.puzzles?.[0];
    if (!first) return;
    setReplay(true);
    setAllDone(false);
    setCurrentId(first.id);
    onPuzzleChange?.(first.id);
  }, [catalogue.puzzles, onPuzzleChange]);

  // "Try again": the same room's next try — unless the solution has been shown
  // in it, in which case only a fresh room lets an honest solve count.
  const tryAgain = useCallback(() => {
    if (info?.solutionShown || result?.solutionShown || solution) restart();
    else reset();
  }, [info, result, solution, restart, reset]);

  const solver = puzzle?.heroes.solver;
  const fullGameHref = solver && solverOnRoster ? botFallbackHref(solver.id, "medium") : VS_BOT_HREF;
  const fullGameButton = waiting ? null : (
    <Button
      as="a"
      href={fullGameHref}
      data-testid="puzzle-full-game"
      {...BTN}
      onClick={() =>
        track("puzzle_full_game_clicked", { puzzle_id: currentId ?? undefined, context, hero_preselected: !!solver && solverOnRoster }, { beacon: true })
      }
    >
      Play a full game vs a bot
    </Button>
  );

  const failed = phase === "unavailable" || phase === "lost" || (!puzzleId && !currentId && catalogue.status === "unavailable");
  const gone = failed && waiting;
  const status: PuzzlePanelStatus = failed ? "unavailable" : allDone || !started || phase === "expired" || playing ? "ready" : "loading";
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    onStatusRef.current?.(status);
  }, [status]);
  // In a waiting context a broken puzzle is simply not there.
  if (gone) return null;

  const controlsOff = !playing || blocked;
  const remaining = snapshot && info ? Math.max(0, Math.min(info.actionsAllowed, snapshot.view.actionsRemaining)) : 0;
  const statusLine = solution === "playing" ? "Playing the solution…" : (notice ?? hint);
  const solvedHere = !!currentId && solved.includes(currentId);
  // The board is up (not one of the cards that take the stage instead).
  const boardUp = playing && !allDone;
  const logBeside = boardUp && context === "page" && panelWidth >= PUZZLE_LOG_MIN_WIDTH_PX;

  let stage: ReactNode;
  if (allDone) {
    stage = (
      <Cover testId="puzzle-all-solved" dim={false} label="You solved them all">
        <Display fontSize="2rem">You solved them all</Display>
        <Small>More puzzles are on the way.</Small>
        {/* A wait has no way out to a full game, so it must not end here (#1681). */}
        {waiting && !!catalogue.puzzles?.length && (
          <Button {...BTN_GOLD} data-testid="puzzle-play-again" onClick={playAgain} isDisabled={paused}>
            Play them again
          </Button>
        )}
        {fullGameButton}
      </Cover>
    );
  } else if (failed) {
    stage =
      phase === "lost" ? (
        <Cover testId="puzzle-lost" dim={false}>
          <Small fontSize="0.9rem" {...STATUS}>Connection lost.</Small>
          <Button {...BTN} onClick={restart}>
            Reload puzzle
          </Button>
        </Cover>
      ) : (
        <Cover testId="puzzle-unavailable" dim={false}>
          <Small fontSize="0.9rem" {...STATUS}>Puzzles are unavailable right now.</Small>
          {fullGameButton}
        </Cover>
      );
  } else if (phase === "expired") {
    // The server dropped the room after its idle window. No silent re-open: a
    // tab left alone would hold a room for ever. The visitor asks for it.
    stage = (
      <Cover testId="puzzle-expired" dim={false}>
        <Small fontSize="0.9rem" {...STATUS}>This puzzle timed out.</Small>
        <Button {...BTN_GOLD} onClick={restart} isDisabled={paused}>
          Start again
        </Button>
      </Cover>
    );
  } else if (!started) {
    stage = (
      <Cover testId="puzzle-start" dim={false}>
        <Button {...BTN_GOLD} size="md" onClick={() => setStarted(true)} isDisabled={paused || !currentId}>
          Start puzzle
        </Button>
      </Cover>
    );
  } else if (!playing) {
    stage = (
      <Cover testId="puzzle-loading" dim={false} status>
        <Spinner color="brand.accent" />
        <Small>Loading puzzle…</Small>
      </Cover>
    );
  } else {
    stage = (
      <GameView
        key={epoch}
        socket={gameSocket}
        contained
        features={PUZZLE_FEATURES}
        opponentHandLabel={OPPONENT_HAND_LABEL}
        sound={soundOn}
        onNotice={onNotice}
        onLog={setLog}
      />
    );
  }

  let cover: ReactNode = null;
  // (Not while paused: a paused panel offers nothing to press. The verdict is
  // kept and comes back when the pause clears.)
  if (paused) cover = null;
  else if (playing && verdict === "result" && result && info) {
    const enemy = info.puzzle.heroes.enemy.name;
    if (result.result === "solved") {
      const kind = info.puzzle.source.kind;
      // No "First try" for a solve that followed the solution (in this room or,
      // on a fresh one, earlier on this page load).
      const afterSolution = result.solutionShown || solutionSeenThisSitting.has(info.puzzle.id);
      cover = (
        <Cover testId="puzzle-result-solved" label="Solved">
          <Display fontSize="2.6rem" color="brand.accent">
            Solved
          </Display>
          <Small data-testid="puzzle-result-stats" fontSize="0.9rem" opacity={1}>
            {afterSolution
              ? "Solved after seeing the solution"
              : `${result.tryNumber === 1 ? "First try" : `Try ${result.tryNumber}`} · ${result.seconds.toFixed(1)} seconds`}
          </Small>
          {result.sourceActual && (
            <Small data-testid="puzzle-source-actual" maxW="26rem">
              {kind === "human" ? "In the real game: " : kind === "bot" ? "In the bot game: " : ""}
              {result.sourceActual}
            </Small>
          )}
          {rateLine && <Small data-testid="puzzle-result-rate">{rateLine}</Small>}
          <Flex gap="0.5rem" wrap="wrap" justify="center" mt="0.4rem">
            {canGoNext && (
              <Button {...BTN_GOLD} data-testid="puzzle-next" data-verdict-primary="" onClick={nextPuzzle}>
                Next puzzle
              </Button>
            )}
            {fullGameButton}
          </Flex>
        </Cover>
      );
    } else {
      cover = (
        <Cover testId="puzzle-result-failed" label={`${enemy} survives`}>
          <Display fontSize="2.2rem">{enemy} survives</Display>
          {result.enemyHeroHp !== undefined && (
            <Small data-testid="puzzle-result-hp" fontSize="0.9rem" opacity={1}>
              {result.enemyHeroHp} HP left
            </Small>
          )}
          <Flex gap="0.5rem" wrap="wrap" justify="center" mt="0.4rem">
            <Button {...BTN_GOLD} data-testid="puzzle-try-again" data-verdict-primary="" onClick={tryAgain}>
              Try again
            </Button>
            <Button {...BTN} data-testid="puzzle-show-solution" onClick={requestSolution}>
              Show the solution
            </Button>
          </Flex>
        </Cover>
      );
    }
  } else if (playing && verdict === "solution") {
    cover = (
      <Cover testId="puzzle-solution-done" label="That is the solution">
        <Display fontSize="2.2rem">That is the solution</Display>
        <Small>Now play it yourself.</Small>
        <Flex gap="0.5rem" wrap="wrap" justify="center" mt="0.4rem">
          <Button {...BTN_GOLD} data-testid="puzzle-try-again" data-verdict-primary="" onClick={tryAgain}>
            Try again
          </Button>
          {canGoNext && (
            <Button {...BTN} data-testid="puzzle-next" onClick={nextPuzzle}>
              Next puzzle
            </Button>
          )}
        </Flex>
      </Cover>
    );
  }

  return (
    <Flex
      ref={panelRef}
      data-testid="puzzle-panel"
      data-context={context}
      data-puzzle={currentId ?? ""}
      // A board is on the table (as opposed to a card that takes the stage).
      data-board={boardUp ? "true" : "false"}
      direction="column"
      position="relative"
      w="100%"
      h="100%"
      overflow="hidden"
      borderRadius="12px"
      bg="brand.surfaceDim"
      color="brand.parchment"
      boxShadow="0 0 0 1px rgba(224, 168, 46, 0.35), 0 12px 40px rgba(0, 0, 0, 0.5)"
    >
      <Flex as="header" align="center" gap="0.75rem" px="0.9rem" py="0.55rem" flexShrink={0} borderBottom="1px solid rgba(224, 168, 46, 0.25)">
        <Box flex="1" minW={0}>
          <Display as="h2" data-testid="puzzle-goal" fontSize={{ base: "1.45rem", md: "1.8rem" }}>
            {puzzle?.goal.text ?? "Puzzle"}
          </Display>
          {puzzle && (
            <Small data-testid="puzzle-source" fontSize="0.75rem" noOfLines={1}>
              {puzzleSourceLine(puzzle)}
              {solvedHere ? " · solved" : ""}
            </Small>
          )}
        </Box>
        {playing && <Pips allowed={info.actionsAllowed} remaining={remaining} />}
      </Flex>

      <Flex flex="1" minH={0}>
        <Box ref={stageRef} data-testid="puzzle-stage" position="relative" flex="1" minW={0} bg={TABLE_BG}>
          {stage}
        </Box>
        {logBeside && (
          <Flex
            as="aside"
            data-testid="puzzle-log"
            aria-label="This try"
            direction="column"
            flex="0 0 14rem"
            minH={0}
            borderLeft="1px solid rgba(224, 168, 46, 0.25)"
            bg="rgba(28, 16, 32, 0.55)"
          >
            <Small as="h3" px="0.7rem" pt="0.55rem" pb="0.35rem" fontSize="0.7rem" fontWeight={700} letterSpacing="0.08em" textTransform="uppercase" opacity={0.7}>
              This try
            </Small>
            <Box as="ol" ref={logListRef} role="log" flex="1" minH={0} overflowY="auto" px="0.7rem" pb="0.6rem" sx={{ listStyle: "none" }}>
              {logLines.length === 0 ? (
                <Small as="li" data-testid="puzzle-log-empty" opacity={0.6}>
                  Your moves are listed here as you play.
                </Small>
              ) : (
                logLines.map((line) => (
                  <Small
                    as="li"
                    key={line.key}
                    data-testid="puzzle-log-line"
                    data-who={line.who}
                    py="0.2rem"
                    lineHeight={1.3}
                    opacity={1}
                    color={line.who === "you" ? "brand.parchment" : line.who === "opp" ? "brand.accent" : "whiteAlpha.700"}
                  >
                    {line.text}
                  </Small>
                ))
              )}
            </Box>
          </Flex>
        )}
      </Flex>

      <Flex as="footer" align="center" gap="0.5rem" px="0.7rem" py="0.45rem" flexShrink={0} wrap="wrap" borderTop="1px solid rgba(224, 168, 46, 0.25)">
        <Button {...BTN} leftIcon={<TbBulb />} data-testid="puzzle-hint" isDisabled={controlsOff || !!result || !!solution} onClick={() => { markStarted(); requestHint(); }}>
          Hint
        </Button>
        <Button {...BTN} leftIcon={<TbRefresh />} data-testid="puzzle-reset" isDisabled={controlsOff} onClick={() => { markStarted(); tryAgain(); }}>
          Reset
        </Button>
        <Small data-testid="puzzle-status" role="status" aria-live="polite" flex="1 1 12rem" minW="12rem" opacity={1} noOfLines={3}>
          {statusLine}
        </Small>
        {rateLine && (
          <Small data-testid="puzzle-rate" fontSize="0.75rem" flexShrink={0}>
            {rateLine}
          </Small>
        )}
        <IconButton
          {...BTN}
          data-testid="puzzle-sound"
          // One name, one state: a label that also swapped would say "pressed" twice over.
          aria-label="Puzzle sound"
          aria-pressed={soundOn}
          icon={soundOn ? <TbVolume /> : <TbVolumeOff />}
          isDisabled={paused}
          onClick={() => setSoundOn((on) => !on)}
        />
      </Flex>

      {cover}
      {paused && (
        <Cover testId="puzzle-paused" status>
          <Small fontSize="0.95rem" opacity={1}>
            Puzzle paused. Your progress is kept.
          </Small>
        </Cover>
      )}
    </Flex>
  );
};

export default PuzzlePanel;
