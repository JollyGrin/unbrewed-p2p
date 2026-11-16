/**
 * `/puzzles` (issue #1679): the puzzle panel at a comfortable size, with a strip
 * of the catalogue to jump between puzzles. Works logged out. A FIXED route
 * (the static export emits `puzzles.html`); the puzzle rides the query
 * (`?p=<id>`), so a puzzle can be linked to.
 */
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { Box, Flex, Heading, Text } from "@chakra-ui/react";
import { TbCheck } from "react-icons/tb";

import { PageSeo } from "@/components/Helmet/Head";
import { SiteNav } from "@/components/SiteNav";
import { usePuzzleCatalogue } from "@/lib/pro/puzzleCatalogue";
import { nextUnsolvedPuzzle, readSolvedPuzzles, useSolvedPuzzles } from "@/lib/pro/puzzleProgress";

// The panel carries the whole in-game view: its own chunk, client only.
const PuzzlePanel = dynamic(() => import("@/components/Pro/Puzzle/PuzzlePanel"), { ssr: false });

const PAGE_BG = "#1c1020";

export default function PuzzlesPage() {
  const router = useRouter();
  const catalogue = usePuzzleCatalogue();
  const solved = useSolvedPuzzles();
  // The static export renders with an empty query: wait for the real one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && router.isReady;

  const linked = typeof router.query.p === "string" ? router.query.p : null;
  // The puzzle on the table, and a counter that remounts the panel when the
  // visitor jumps (so picking the puzzle already up starts it afresh).
  const [selected, setSelected] = useState<string | null>(null);
  const [jump, setJump] = useState(0);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!ready || picked || catalogue.status === "loading") return;
    setPicked(true);
    const puzzles = catalogue.puzzles ?? [];
    // An unknown `?p=` is dropped in favour of the first unsolved puzzle; with
    // no catalogue at all the link is trusted and the panel reports the rest.
    const valid = linked && (catalogue.status !== "ready" || puzzles.some((p) => p.id === linked)) ? linked : null;
    setSelected(valid ?? nextUnsolvedPuzzle(puzzles, readSolvedPuzzles())?.id ?? null);
  }, [ready, picked, catalogue, linked]);

  const show = useCallback(
    (id: string) => {
      setSelected(id);
      void router.replace({ pathname: router.pathname, query: { p: id } }, undefined, { shallow: true, scroll: false });
    },
    [router]
  );

  return (
    <Box bg={PAGE_BG} color="brand.parchment" fontFamily="SpaceGrotesk" minH="100svh" overflowX="hidden">
      <PageSeo
        path="/puzzles"
        title="Puzzles | Unbrewed"
        description="Unbrewed puzzles: one frozen turn from a game, one goal. Defeat the enemy hero before the turn ends."
      />
      <Box bg="brand.highlight" color="brand.secondary">
        <SiteNav />
      </Box>
      <Flex as="main" direction="column" gap="0.9rem" maxW="76rem" mx="auto" px={{ base: "0.5rem", md: "1.5rem" }} py={{ base: "0.9rem", md: "1.5rem" }}>
        <Box px={{ base: "0.25rem", md: 0 }}>
          <Heading as="h1" fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.04em" textTransform="uppercase" fontSize={{ base: "2rem", md: "2.6rem" }}>
            Puzzles
          </Heading>
          <Text opacity={0.8} fontSize="0.92rem" maxW="40rem">
            One frozen turn, one goal. The opponent&apos;s hand is face up and it will defend as well as it can.
          </Text>
        </Box>

        {catalogue.puzzles && (
          <Flex as="nav" aria-label="Puzzles" data-testid="puzzle-strip" gap="0.5rem" overflowX="auto" pb="0.25rem" px={{ base: "0.25rem", md: 0 }}>
            {catalogue.puzzles.map((p, i) => {
              const on = p.id === selected;
              const done = solved.includes(p.id);
              return (
                <Flex
                  as="button"
                  key={p.id}
                  data-testid="puzzle-strip-item"
                  data-puzzle={p.id}
                  data-solved={done ? "true" : "false"}
                  aria-current={on ? "true" : undefined}
                  aria-label={`Puzzle ${i + 1}: ${p.heroes.enemy.name}${done ? ", solved" : ""}`}
                  onClick={() => {
                    setJump((n) => n + 1);
                    show(p.id);
                  }}
                  align="center"
                  gap="0.45rem"
                  flexShrink={0}
                  px="0.7rem"
                  py="0.4rem"
                  borderRadius="0.6rem"
                  border="1px solid"
                  borderColor={on ? "brand.accent" : "whiteAlpha.300"}
                  bg={on ? "rgba(224, 168, 46, 0.14)" : "whiteAlpha.50"}
                  _hover={{ bg: "whiteAlpha.200" }}
                >
                  <Text fontFamily="LeagueGothic" fontSize="1.25rem" lineHeight={1} color="brand.accent">
                    {i + 1}
                  </Text>
                  <Text fontSize="0.82rem" fontWeight={600} whiteSpace="nowrap">
                    {p.heroes.enemy.name}
                  </Text>
                  {done && <Box as={TbCheck} aria-hidden color="brand.positive" boxSize="1rem" />}
                </Flex>
              );
            })}
          </Flex>
        )}

        {/* The panel fills this box. Wide screens get a landscape box (board
            left, decisions and hand in the right rail); a phone gets a tall one. */}
        <Box
          data-testid="puzzle-box"
          w="100%"
          h={{ base: "min(calc(100svh - 1.5rem), 47rem)", lg: "clamp(34rem, calc(100svh - 15rem), 46rem)" }}
          minH={{ base: "36rem", lg: "34rem" }}
        >
          {ready && picked && (
            <PuzzlePanel key={jump} context="page" puzzleId={selected ?? undefined} onPuzzleChange={show} />
          )}
        </Box>
      </Flex>
    </Box>
  );
}
