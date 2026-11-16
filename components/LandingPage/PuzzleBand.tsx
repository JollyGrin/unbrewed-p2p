import { useCallback, useState } from "react";
import type { ComponentType } from "react";
import { Box, Flex, Spinner, Text } from "@chakra-ui/react";
import Link from "next/link";
import { Eyebrow, H2, Section } from "./ui";
import { LANDING_PUZZLE, LANDING_STILL } from "./landingPuzzle";
import { trackLandingCta, trackOnce } from "@/lib/growthAnalytics";
// Types only (erased at build): the panel itself is imported on the click.
import type { PuzzlePanelProps, PuzzlePanelStatus } from "@/components/Pro/Puzzle/PuzzlePanel";

/** The game table's felt (GameView's TABLE_BG), so the swap to the live panel keeps its colours. */
const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
const RULE = "1px solid rgba(224, 168, 46, 0.25)";

/**
 * One box for the still and the live panel, so the swap moves nothing. A phone
 * gets a tall box (the panel's phone arrangement), wider screens a landscape
 * one (board left, decisions and hand in a rail). The landscape box is kept
 * low and the band wide on purpose: the view only moves the board out from
 * under the opponent's face-up hand when the room beside that hand is still as
 * wide as the board (insetForOpenHand), and the heroes start under it otherwise.
 */
const BOX_H = { base: "min(calc(100svh - 1.5rem), 38rem)", md: "32rem" };
const BOX_MIN_H = { base: "34rem", md: "32rem" };

type Stage = "still" | "opening" | "live" | "failed";

/**
 * The landing puzzle (issue #1680): a still of the position with the goal as
 * real text, which becomes the live `PuzzlePanel` on the first click. Until
 * that click this is an `<img>` and some text: no socket, no room, no board
 * and no game code. The panel's chunk is fetched by the click.
 */
export const LandingPuzzle = () => {
  const [stage, setStage] = useState<Stage>("still");
  const [Panel, setPanel] = useState<ComponentType<PuzzlePanelProps> | null>(null);

  const open = useCallback(() => {
    trackOnce("landing_puzzle_opened", { puzzle_id: LANDING_PUZZLE.id });
    setStage("opening");
    import("@/components/Pro/Puzzle/PuzzlePanel").then(
      (mod) => setPanel(() => mod.PuzzlePanel),
      () => setStage("failed"), // the chunk did not load
    );
  }, []);

  // The still stays up until the panel has a position to show; if it never
  // gets one, the still stays for good. Once live, the panel speaks for itself.
  const onStatus = useCallback((status: PuzzlePanelStatus) => {
    setStage((now) => (now !== "opening" ? now : status === "ready" ? "live" : status === "unavailable" ? "failed" : now));
  }, []);

  const opening = stage === "opening";
  const { goal, source, heroes, image } = LANDING_STILL;

  return (
    <Box
      data-testid="landing-puzzle"
      data-stage={stage}
      position="relative"
      w="100%"
      h={BOX_H}
      minH={BOX_MIN_H}
      borderRadius="12px"
      overflow="hidden"
      bg="brand.surfaceDim"
      boxShadow="0 0 0 1px rgba(224, 168, 46, 0.35), 0 12px 40px rgba(0, 0, 0, 0.5)"
    >
      {Panel && (opening || stage === "live") && (
        // Laid out under the still while it loads (so it is ready at its real
        // size), but out of sight and out of the tab order until it is live.
        <Box position="absolute" inset={0} visibility={stage === "live" ? "visible" : "hidden"}>
          <Panel context="landing" puzzleId={LANDING_PUZZLE.id} onStatus={onStatus} />
        </Box>
      )}

      {stage !== "live" && (
        <Flex data-testid="landing-puzzle-still" direction="column" position="absolute" inset={0} bg="brand.surfaceDim" color="brand.parchment">
          <Box px="0.9rem" py="0.55rem" flexShrink={0} borderBottom={RULE}>
            <Text
              as="h3"
              data-testid="landing-puzzle-goal"
              fontFamily="'LeagueGothic', sans-serif"
              fontWeight={400}
              textTransform="uppercase"
              letterSpacing="0.02em"
              lineHeight={1.05}
              fontSize={{ base: "1.45rem", md: "1.8rem" }}
            >
              {goal}
            </Text>
            <Text data-testid="landing-puzzle-source" fontFamily="SpaceGrotesk" fontSize="0.75rem" opacity={0.8} noOfLines={1}>
              {source}
            </Text>
          </Box>

          <Box position="relative" flex="1" minH={0} bg={TABLE_BG}>
            {/* Plain <img>: the site is a static export (no next/image optimizer). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt={`The starting position: ${heroes.solver} against ${heroes.enemy}`}
              width={image.width}
              height={image.height}
              loading="lazy"
              decoding="async"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: "0.75rem" }}
            />
            {opening && (
              <Flex
                data-testid="landing-puzzle-loading"
                role="status"
                position="absolute"
                inset={0}
                direction="column"
                align="center"
                justify="center"
                gap="0.6rem"
                bg="rgba(28, 16, 32, 0.6)"
              >
                <Spinner color="brand.accent" />
                <Text fontFamily="SpaceGrotesk" fontSize="0.85rem">
                  Loading puzzle…
                </Text>
              </Flex>
            )}
          </Box>

          <Flex align="center" gap="0.75rem" wrap="wrap" px="0.7rem" py="0.55rem" flexShrink={0} borderTop={RULE}>
            {/* The button's ::after covers the whole still, so a click anywhere on it plays. */}
            <Box
              as="button"
              type="button"
              data-testid="landing-puzzle-play"
              onClick={open}
              disabled={opening}
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="0.9rem"
              px="1rem"
              py="0.5rem"
              borderRadius="0.5rem"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              _disabled={{ opacity: 0.7, cursor: "default" }}
              _focusVisible={{ outline: "3px solid", outlineColor: "brand.parchment", outlineOffset: "2px" }}
              _after={{ content: '""', position: "absolute", inset: 0 }}
            >
              {stage === "failed" ? "Try again" : "▶ Play this puzzle"}
            </Box>
            {stage === "failed" ? (
              <Text data-testid="landing-puzzle-failed" role="status" fontFamily="SpaceGrotesk" fontSize="0.85rem">
                The puzzle could not be loaded right now.{" "}
                <Box
                  as={Link}
                  href="/puzzles"
                  onClick={() => trackLandingCta("puzzle", "/puzzles")}
                  position="relative"
                  zIndex={1}
                  fontWeight={700}
                  color="brand.accent"
                  textDecoration="underline"
                >
                  Open the puzzles page
                </Box>
              </Text>
            ) : (
              <Text fontFamily="SpaceGrotesk" fontSize="0.8rem" opacity={0.8}>
                Plays right here. No account needed.
              </Text>
            )}
          </Flex>
        </Flex>
      )}
    </Box>
  );
};

/** Section 2: one puzzle, right under the hero. */
export const PuzzleBand = () => (
  <Section id="puzzle" bg="brand.surfaceDim" color="brand.highlight" inner={{ maxW: "84rem" }}>
    <Flex direction={{ base: "column", xl: "row" }} align={{ base: "stretch", xl: "center" }} gap={{ base: "1.5rem", xl: "2rem" }}>
      <Box flex={{ xl: "0 0 15rem" }}>
        <Eyebrow color="brand.accent">Puzzle</Eyebrow>
        <H2 id="puzzle" color="brand.parchment">
          Your move. Find the kill.
        </H2>
        <Text mt="0.9rem" fontSize="1rem" opacity={0.9}>
          One frozen turn, one goal. The opponent&apos;s hand is face up and it will defend as well as it can.
        </Text>
      </Box>
      <Box flex="1" minW={0}>
        <LandingPuzzle />
      </Box>
    </Flex>
  </Section>
);
