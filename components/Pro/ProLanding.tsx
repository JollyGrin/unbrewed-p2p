import { useState } from "react";
import {
  Box,
  Flex,
  Grid,
  Link as ChakraLink,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { FaArrowLeft, FaHeart, FaLock } from "react-icons/fa";
import { TbInfoCircle } from "react-icons/tb";
import {
  POPULAR_DECKS,
  PopularDeckMeta,
} from "@/lib/constants/top-decks";
import { DECK_HERO_IDS } from "@/lib/pro/useProCardArt";
import { frozenAtForDeck } from "@/lib/pro/evergreenManifest";
import { useProLiveRoster } from "@/lib/pro/useProLiveRoster";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import { useFlag } from "@/lib/flags";
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";

/**
 * Pro roster status. Ready = decks the live server actually serves right
 * now — fetched over the same LIST_HEROES protocol the game page uses
 * (see useProLiveRoster), so a deck merging into the engine repo shows up
 * here with no frontend edit required. FALLBACK_READY only covers the gap
 * before that first reply lands (or if the socket never connects). Lab =
 * DSL stress-test decks: they shape the engine but aren't launch content,
 * and the server never lists them, so this stays a manual set.
 */
const FALLBACK_READY: Record<string, string> = {
  kdKM: "King Kong",
  taranis: "King Taranis",
  // Spice remix (display name "Thetis") is the default-roster Thetis; the
  // reflavored baseline `thetis` is hidden unless ?debug (see roster filter).
  "thetis-spice": "Thetis",
  piper: "The Piper of the Underroads",
  "hollow-oak": "The Hollow Oak",
  lDOM: "The Mandalorian",
  pk1x: "Thrall",
  "3jgd": "R2-D2",
  LWNZ: "Gingerbread man",
  "1Y5J": "Triceratops",
  "yAJ-": "Baba Yaga",
  QkB1: "Buster Keaton",
};
const IN_THE_LAB: Record<string, string> = {
  "72Dz": "Pinocchio",
  G_nr: "Schrödinger's Cat",
};

const tileIn = keyframes`
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const readyPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #E0A82E, 0 0 18px rgba(224, 168, 46, 0.35); }
  50%      { box-shadow: 0 0 0 2px #E0A82E, 0 0 30px rgba(224, 168, 46, 0.65); }
`;

export const ProLanding = () => {
  const [replaysEnabled] = useFlag("replays");
  const [picked, setPicked] = useState<PopularDeckMeta>();
  const [previewDeck, setPreviewDeck] = useState<PopularDeckMeta>();
  const router = useRouter();
  // `?debug` (any value, incl. bare `?debug`) reveals the reflavored/baseline
  // decks the server hides by default. See lib/pro/protocol.ts v15.
  const debug = router.query.debug !== undefined;
  const liveHeroes = useProLiveRoster(PRO_WS_URL, debug);

  // A deck is reflavored (hidden unless ?debug, ★-suffixed under it) when our
  // static POPULAR_DECKS tag says so OR the live roster reports
  // tier === 'reflavored'. The server omits reflavored heroes from a non-debug
  // listing, so the static tag is what hides the tile before/without a live
  // roster; under ?debug the server sends the tier and both agree.
  const isReflavored = (deck: PopularDeckMeta) =>
    deck.tier === "reflavored" ||
    liveHeroes?.find((h) => h.heroId === DECK_HERO_IDS[deck.id])?.tier ===
      "reflavored";

  // The default roster never renders reflavored decks; ?debug shows them.
  const visibleDecks = debug
    ? POPULAR_DECKS
    : POPULAR_DECKS.filter((d) => !isReflavored(d));

  // Client-side display name only: under ?debug a reflavored deck gets a ` ★`
  // so it reads apart from its identically-named spice replacement. Never
  // mutates the deck data.
  const displayName = (deck: PopularDeckMeta) =>
    debug && isReflavored(deck) ? `${deck.name} ★` : deck.name;

  // Once the server has replied, its roster is authoritative: a deck's
  // server hero id being present is what "ready" means. Until then (or if
  // the socket never connects), fall back to the last-known-good set below.
  const SUPPORTED: Record<string, string> = liveHeroes
    ? Object.fromEntries(
        visibleDecks
          .filter((d) => liveHeroes.some((h) => h.heroId === DECK_HERO_IDS[d.id]))
          .map((d) => [d.id, d.hero])
      )
    : FALLBACK_READY;
  const rosterRank = (deckId: string) =>
    SUPPORTED[deckId] ? 0 : IN_THE_LAB[deckId] ? 1 : 2;
  const readyCount = Object.keys(SUPPORTED).length;

  return (
    <Box minH="100svh" bg="brand.surfaceDim" color="brand.parchment">
      {/* subtle arena backdrop: radial spotlight + scanline grain */}
      <Box
        position="fixed"
        inset="0"
        pointerEvents="none"
        bg="radial-gradient(ellipse 80% 60% at 50% -10%, rgba(224,168,46,0.14), transparent 60%),
            repeating-linear-gradient(0deg, rgba(250,235,215,0.015) 0 1px, transparent 1px 3px)"
      />

      <Box position="relative" maxW="64rem" mx="auto" px="1.25rem" pb="6rem">
        {/* header */}
        <Flex
          as="header"
          justifyContent="space-between"
          alignItems="center"
          py="1.25rem"
        >
          <ChakraLink
            as={Link}
            href="/"
            display="flex"
            alignItems="center"
            gap="0.5rem"
            fontFamily="SpaceGrotesk"
            fontSize="0.85rem"
            opacity={0.7}
            _hover={{ opacity: 1, textDecoration: "none" }}
          >
            <FaArrowLeft size="0.7rem" /> unbrewed
          </ChakraLink>
          <Text
            fontFamily="SpaceGrotesk"
            fontSize="0.7rem"
            letterSpacing="0.2em"
            px="0.6rem"
            py="0.2rem"
            border="1px solid"
            borderColor="brand.accent"
            borderRadius="999px"
            color="brand.accent"
          >
            IN DEVELOPMENT
          </Text>
        </Flex>

        {/* title block */}
        <Box as="section" mt="2.5rem" mb="3rem">
          <Text
            fontFamily="LeagueGothic"
            textTransform="uppercase"
            fontSize={{ base: "4rem", md: "6.5rem" }}
            lineHeight="0.85"
            letterSpacing="0.01em"
          >
            Unbrewed{" "}
            <Box as="span" color="brand.accent">
              Pro
            </Box>
          </Text>
          <Text
            mt="1.25rem"
            maxW="38rem"
            fontFamily="ArchivoNarrow"
            fontSize="1.1rem"
            lineHeight="1.55"
            opacity={0.9}
          >
            The sandbox lets you play Unmatched any way you like — Pro is the
            opposite promise: <b>a referee</b>. A server enforces the full
            rules — legal moves only, automated combat math, properly hidden
            hands — so you can battle strangers without trusting them, and one
            day fight an AI. Every fighter&apos;s cards must be hand-converted
            into engine rules, so the roster opens a few heroes at a time.
          </Text>
          <Text
            mt="0.9rem"
            fontFamily="SpaceGrotesk"
            fontSize="0.8rem"
            opacity={0.55}
          >
            The free-form sandbox isn&apos;t going anywhere — Pro is an
            additional way to play, not a replacement.
          </Text>
        </Box>

        {/* roster */}
        <Flex as="section" flexDir="column" gap="0.9rem">
          <Flex alignItems="baseline" justifyContent="space-between" gap="1rem">
            <Text
              fontFamily="BebasNeueRegular"
              fontSize={{ base: "1.6rem", md: "2rem" }}
              letterSpacing="0.06em"
            >
              Choose your fighter
            </Text>
            <Text
              fontFamily="SpaceGrotesk"
              fontSize="0.8rem"
              color="brand.accent"
              whiteSpace="nowrap"
            >
              {readyCount} of {visibleDecks.length} ready
            </Text>
          </Flex>

          <Grid
            templateColumns="repeat(auto-fill, minmax(150px, 1fr))"
            gap="0.5rem"
          >
            {/* playable first, then lab, then locked — within each group keep like-order */}
            {[...visibleDecks]
              .sort((a, b) => rosterRank(a.id) - rosterRank(b.id))
              .map((deck, i) => {
              const status = SUPPORTED[deck.id]
                ? "ready"
                : IN_THE_LAB[deck.id]
                ? "lab"
                : "locked";
              // Ready tiles the game page can actually launch (a server hero id
              // exists) navigate straight into create-a-room with that hero
              // preselected. Everything else stays an inspect-only tile. Carry
              // `debug` through so a reflavored pick stays selectable and the
              // debug session continues on the game page.
              const serverHeroId = DECK_HERO_IDS[deck.id];
              const href =
                status === "ready" && serverHeroId
                  ? `/pro/game?hero=${serverHeroId}${debug ? "&debug=1" : ""}`
                  : undefined;
              return (
                <RosterTile
                  key={deck.id}
                  deck={deck}
                  displayName={displayName(deck)}
                  index={i}
                  status={status}
                  href={href}
                  isPicked={picked?.id === deck.id}
                  onPick={() => setPicked(deck)}
                  onPreview={() => setPreviewDeck(deck)}
                />
              );
            })}
          </Grid>

          {/* announcer bar */}
          <Flex
            mt="0.75rem"
            minH="3.4rem"
            alignItems="center"
            justifyContent="center"
            border="1px dashed"
            borderColor={picked ? "brand.accent" : "rgba(250,235,215,0.2)"}
            borderRadius="0.5rem"
            px="1rem"
            transition="border-color 0.2s"
          >
            <Text
              fontFamily="BebasNeueRegular"
              fontSize={{ base: "1.1rem", md: "1.4rem" }}
              letterSpacing="0.08em"
              textAlign="center"
              color={picked && SUPPORTED[picked.id] ? "brand.accent" : undefined}
              opacity={picked ? 1 : 0.45}
            >
              {!picked && "Select a fighter to inspect the roster"}
              {picked &&
                SUPPORTED[picked.id] &&
                `${picked.hero} is live — click the tile to enter the arena`}
              {picked &&
                IN_THE_LAB[picked.id] &&
                `${picked.hero} is in the lab — its weird mechanics are stress-testing the rules engine`}
              {picked &&
                !SUPPORTED[picked.id] &&
                !IN_THE_LAB[picked.id] &&
                `${picked.hero} awaits conversion — rules support comes deck by deck`}
            </Text>
          </Flex>

          {/* Primary entry point: pick a hero on the game page (or skip straight
              to create-a-room with no preselection). Subtle — /pro is unlisted. */}
          <Flex justifyContent="center" mt="0.25rem" gap="0.6rem" flexWrap="wrap">
            <ChakraLink
              as={Link}
              href={debug ? "/pro/game?debug=1" : "/pro/game"}
              display="inline-flex"
              alignItems="center"
              gap="0.4rem"
              fontFamily="SpaceGrotesk"
              fontSize="0.8rem"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px="1.1rem"
              py="0.5rem"
              borderRadius="999px"
              border="1px solid"
              borderColor="brand.accent"
              color="brand.accent"
              _hover={{ bg: "brand.accent", color: "brand.surfaceDim", textDecoration: "none" }}
              transition="background 0.15s, color 0.15s"
            >
              Start a match →
            </ChakraLink>
            {/* Replays ships dark: this entry only appears once the beta flag is on. */}
            {replaysEnabled && (
              <ChakraLink
                as={Link}
                href="/pro/replays"
                display="inline-flex"
                alignItems="center"
                gap="0.4rem"
                fontFamily="SpaceGrotesk"
                fontSize="0.8rem"
                letterSpacing="0.08em"
                textTransform="uppercase"
                px="1.1rem"
                py="0.5rem"
                borderRadius="999px"
                border="1px solid"
                borderColor="whiteAlpha.400"
                color="brand.parchment"
                _hover={{ bg: "whiteAlpha.200", textDecoration: "none" }}
                transition="background 0.15s"
              >
                Replays (beta)
              </ChakraLink>
            )}
          </Flex>
        </Flex>

        {/* how it becomes real */}
        <Box as="section" mt="4rem">
          <Text
            fontFamily="BebasNeueRegular"
            fontSize="1.5rem"
            letterSpacing="0.06em"
            mb="1rem"
          >
            The road to the arena
          </Text>
          <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap="0.75rem">
            {ROADMAP.map((step, i) => (
              <Box
                key={step.title}
                p="1rem"
                borderRadius="0.5rem"
                bg="rgba(250,235,215,0.05)"
                border="1px solid rgba(250,235,215,0.12)"
              >
                <Text fontFamily="LeagueGothic" fontSize="2rem" color="brand.accent">
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.9rem">
                  {step.title}
                </Text>
                <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.75} mt="0.35rem">
                  {step.text}
                </Text>
              </Box>
            ))}
          </Grid>
          <Text mt="1.5rem" fontFamily="SpaceGrotesk" fontSize="0.8rem" opacity={0.55}>
            Itching to play right now? The{" "}
            <ChakraLink
              as={Link}
              href="/connect"
              textDecoration="underline"
              _hover={{ color: "brand.accent" }}
            >
              sandbox
            </ChakraLink>{" "}
            plays every deck today — it just trusts you with the rulebook.
          </Text>
        </Box>
      </Box>

      <HeroPreviewModal
        isOpen={!!previewDeck}
        onClose={() => setPreviewDeck(undefined)}
        deckId={previewDeck?.id ?? null}
        heroName={previewDeck?.hero ?? ""}
        heroId={previewDeck ? DECK_HERO_IDS[previewDeck.id] : undefined}
      />
    </Box>
  );
};

const ROADMAP = [
  {
    title: "Engine",
    text: "A headless rules engine — turn structure, movement on real map graphs, the full combat timeline — proven by replaying scripted games.",
  },
  {
    title: "Arena server",
    text: "A referee server that holds the truth: your hand stays hidden, only legal actions reach the board, dice are rolled where no one can peek.",
  },
  {
    title: "Open the doors",
    text: "Jump-in lobbies with the first fighters — no accounts, no installs. More heroes join as their decks are converted. Then: matchmaking, and an AI to spar with.",
  },
];

const RosterTile = ({
  deck,
  displayName,
  index,
  status,
  href,
  isPicked,
  onPick,
  onPreview,
}: {
  deck: PopularDeckMeta;
  /** render name (may carry a ` ★` reflavored suffix under ?debug) */
  displayName: string;
  index: number;
  status: "ready" | "lab" | "locked";
  /** when set, the tile navigates into the game instead of inspect-only picking */
  href?: string;
  isPicked: boolean;
  onPick: () => void;
  onPreview: () => void;
}) => {
  const locked = status === "locked";
  const tile = (
      <Flex
        onClick={href ? undefined : onPick}
        flexDir="column"
        justifyContent="flex-end"
        h="5.5rem"
        p="0.5rem"
        borderRadius="0.5rem"
        cursor="pointer"
        userSelect="none"
        position="relative"
        overflow="hidden"
        opacity={0}
        animation={`${tileIn} 0.4s ease-out ${index * 0.03}s forwards`}
        border="2px solid"
        borderColor={
          status === "ready"
            ? "brand.accent"
            : status === "lab"
            ? "rgba(224,168,46,0.35)"
            : "rgba(250,235,215,0.12)"
        }
        sx={
          status === "ready"
            ? { animation: `${tileIn} 0.4s ease-out ${index * 0.03}s forwards, ${readyPulse} 2.6s ease-in-out infinite` }
            : undefined
        }
        transition="transform 0.15s ease-in-out, filter 0.2s"
        transform={isPicked ? "scale(1.04)" : undefined}
        zIndex={isPicked ? 1 : undefined}
        _hover={{
          transform: "scale(1.04)",
          filter: "none",
          zIndex: 1,
        }}
        filter={locked && !isPicked ? "grayscale(0.9) brightness(0.55)" : undefined}
        bg={deck.highlightColour}
        bgImage={deck.cardbackUrl ? `url(${deck.cardbackUrl})` : undefined}
        bgSize="cover"
        bgPos="center"
      >
        <Box
          position="absolute"
          inset="0"
          bg="linear-gradient(180deg, rgba(20,8,24,0) 20%, rgba(20,8,24,0.85) 100%)"
        />
        {status !== "locked" && (
          <Text
            position="absolute"
            top="0.35rem"
            left="0.4rem"
            fontFamily="SpaceGrotesk"
            fontSize="0.55rem"
            fontWeight={700}
            letterSpacing="0.12em"
            px="0.35rem"
            py="0.1rem"
            borderRadius="0.2rem"
            bg={status === "ready" ? "brand.accent" : "rgba(224,168,46,0.25)"}
            color={status === "ready" ? "brand.surfaceDim" : "brand.accent"}
          >
            {status === "ready" ? "PLAY NOW" : "IN THE LAB"}
          </Text>
        )}
        <Flex
          as="button"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPreview();
          }}
          aria-label={`Preview ${deck.hero}`}
          position="absolute"
          top="0.35rem"
          right="0.4rem"
          alignItems="center"
          justifyContent="center"
          w="1.2rem"
          h="1.2rem"
          borderRadius="0.3rem"
          bg="rgba(20, 8, 24, 0.55)"
          color="#FAEBD7"
          _hover={{ color: "brand.accent", bg: "rgba(20, 8, 24, 0.85)" }}
        >
          <TbInfoCircle size="0.85rem" />
        </Flex>
        <Flex position="relative" justifyContent="space-between" alignItems="end">
          <Text
            color="#FAEBD7"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="0.8rem"
            lineHeight="1.15"
            noOfLines={2}
            textShadow="0 1px 2px rgba(0,0,0,0.8)"
          >
            {displayName}
          </Text>
          <Flex alignItems="center" gap="0.25rem" color="#FAEBD7" pl="0.25rem">
            {locked ? (
              <FaLock size="0.65rem" opacity={0.8} />
            ) : (
              <>
                <FaHeart size="0.6rem" />
                <Text fontSize="0.7rem">{deck.likes}</Text>
              </>
            )}
          </Flex>
        </Flex>
      </Flex>
  );
  const frozenAt = status === "ready" ? frozenAtForDeck(deck.id) : null;
  const inspectHint =
    status === "ready"
      ? `${deck.hero} — playable now, click to enter the arena${
          frozenAt ? ` (rules version frozen ${frozenAt})` : ""
        }`
      : status === "lab"
      ? `${deck.hero} — stress-testing the engine's rule language`
      : `${deck.hero} — not yet converted (every deck's rules are hand-tuned)`;
  return (
    <Tooltip label={inspectHint}>
      {href ? (
        <ChakraLink
          as={Link}
          href={href}
          display="block"
          _hover={{ textDecoration: "none" }}
        >
          {tile}
        </ChakraLink>
      ) : (
        tile
      )}
    </Tooltip>
  );
};
