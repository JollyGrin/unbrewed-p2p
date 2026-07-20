import { useState } from "react";
import {
  Box,
  Button,
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
import { useProLiveRosterState } from "@/lib/pro/useProLiveRoster";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import { useFlag } from "@/lib/flags";
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";
import { MAP_CATALOG, FORMAT_BADGE, eligibleFormats } from "@/lib/pro/mapCatalog";
import type { BotDifficulty, HeroListing } from "@/lib/pro/protocol";
import { vsParamFor } from "@/lib/pro/vsParam";

/**
 * The roster is server-first, exactly like the game page's fighter picker
 * (pages/pro/game.tsx): the live LIST_HEROES reply IS the roster, and each
 * entry's tier decides whether it renders as a battle-ready or an in-the-lab
 * tile. A hero merged into the engine therefore appears here with zero
 * frontend edits, and the two surfaces can't drift — they read the same list.
 *
 * POPULAR_DECKS is joined in (by DECK_HERO_IDS) for presentation only: card-back
 * art, like count, highlight colour, and the deck id the preview modal fetches.
 * A served hero with no tile entry still renders — plain colour, server name,
 * no likes badge. Decks the server does NOT serve are the "challengers
 * approaching" queue.
 *
 * There is deliberately no hardcoded heroId→name fallback here: a hand-kept
 * snapshot is exactly what went stale before (prod advertised 14 battle-ready
 * while the server served 15). Pre-reply we show skeletons; if the socket never
 * connects we say so.
 */
type RosterStatus = "ready" | "lab" | "locked";

interface RosterEntry {
  /** stable identity: the server hero id, or the deck id for locked decks */
  key: string;
  /** tile caption — the full deck title (may carry a ` ★` reflavored suffix) */
  name: string;
  /** just the fighter, for the announcer and tooltips ("Voldemort", not
   *  "Voldemort (The Wizarding World)") */
  shortName: string;
  status: RosterStatus;
  /** server hero id — set for everything the server actually serves */
  heroId?: string;
  /** the server listing, for ready/lab entries */
  listing?: HeroListing;
  /** presentation extras, when a top-decks tile exists for this hero */
  deck?: PopularDeckMeta;
}

/** Tile colour for a served hero with no top-decks entry yet. */
const DEFAULT_HIGHLIGHT = "#3B2A47";

const tileIn = keyframes`
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const readyPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #E0A82E, 0 0 18px rgba(224, 168, 46, 0.35); }
  50%      { box-shadow: 0 0 0 2px #E0A82E, 0 0 30px rgba(224, 168, 46, 0.65); }
`;

/** Every entrance/pulse animation on this page opts out under prefers-reduced-motion. */
const REDUCED_MOTION = "@media (prefers-reduced-motion: reduce)";
const NO_MOTION = { [REDUCED_MOTION]: { animation: "none", opacity: 1, transform: "none" } };

/** Select-screen tag: a solid gold, slightly skewed chip (text stays upright). */
const skewChip = (deg = -6) => ({
  transform: `skewX(${deg}deg)`,
  "& > *": { transform: `skewX(${-deg}deg)` },
});

export const ProLanding = () => {
  const [replaysEnabled] = useFlag("replays");
  const [picked, setPicked] = useState<RosterEntry>();
  const [hovered, setHovered] = useState<RosterEntry>();
  const [previewEntry, setPreviewEntry] = useState<RosterEntry>();
  // The seat strip's P2 occupant — display-scale only. It exists to set the
  // difficulty the primary CTA carries in `?vs=`, not to create a room here.
  const [p2, setP2] = useState<SeatOccupant>("medium");
  const [lockedOpen, setLockedOpen] = useState(false);
  const router = useRouter();
  // `?debug` (any value, incl. bare `?debug`) reveals debug-only decks the
  // server hides by default. See lib/pro/protocol.ts v15/v18.
  const debug = router.query.debug !== undefined;
  const { heroes: liveHeroes, offline } = useProLiveRosterState(PRO_WS_URL, debug);

  // The server's reply IS the roster. Everything below is a projection of it;
  // POPULAR_DECKS only decorates. Note the server already applies the debug
  // gate — reflavored/lab-only heroes are simply absent from a non-debug
  // reply — so there is no client-side visibility filter to keep in sync.
  const roster: RosterEntry[] = (liveHeroes ?? []).map((listing) => {
    const deck = deckForHeroId(listing.heroId);
    // Prefer the curated tile copy where it exists: the engine's own display
    // names are raw deck titles ("TRICERATOPS", a trailing-space "gingerbread
    // man ") that read badly on a landing page. The server name is the
    // fallback, so a hero with no tile entry still renders with a real name.
    // Under ?debug a reflavored deck gets a ` ★` so it reads apart from the
    // identically named spice remix that replaced it.
    const serverName = listing.name.trim();
    const star = listing.tier === "reflavored" ? " ★" : "";
    return {
      key: listing.heroId,
      name: `${deck?.name ?? serverName}${star}`,
      shortName: `${deck?.hero ?? serverName}${star}`,
      status: listing.tier === "lab" ? "lab" : "ready",
      heroId: listing.heroId,
      listing,
      deck,
    };
  });

  const readyEntries = roster.filter((e) => e.status === "ready");
  const labEntries = roster.filter((e) => e.status === "lab");
  // Ready tiles first, then lab; locked decks live in the drawer below the grid.
  const gridEntries = [...readyEntries, ...labEntries];

  // "Challengers approaching" = tiles the server does NOT serve. Reflavored
  // baselines never queue here: their spice replacement is already on the grid
  // under the same name, so listing them would read as a duplicate fighter.
  const lockedEntries: RosterEntry[] = liveHeroes
    ? POPULAR_DECKS.filter(
        (d) =>
          d.tier !== "reflavored" &&
          !liveHeroes.some((h) => h.heroId === DECK_HERO_IDS[d.id])
      ).map((deck) => ({
        key: deck.id,
        name: deck.name,
        shortName: deck.hero,
        status: "locked" as const,
        deck,
      }))
    : [];

  // Every internal link keeps the debug session alive.
  const withDebug = (href: string) =>
    debug ? `${href}${href.includes("?") ? "&" : "?"}debug=1` : href;
  // Primary CTA follows the seat strip: a bot seat carries its difficulty into
  // the create screen's `?vs=` preset; a human seat is just the normal create flow.
  const primaryHref =
    p2 === "human" ? withDebug("/pro/game") : withDebug(`/pro/game?vs=${vsParamFor(p2)}`);
  const primaryLabel = p2 === "human" ? "Create a room →" : "Play vs AI →";

  // Announcer reacts to hover first (the live cursor), falling back to the pick.
  const spotlight = hovered ?? picked;
  const announcer = !spotlight
    ? "Pick a fighter — gold tiles jump straight into a match"
    : spotlight.status === "ready"
      ? `${spotlight.shortName.toUpperCase()} IS READY — CLICK TO ENTER THE ARENA`
      : spotlight.status === "lab"
        ? `${spotlight.shortName.toUpperCase()} IS IN THE LAB — STRESS-TESTING THE RULES ENGINE`
        : `${spotlight.shortName.toUpperCase()} AWAITS CONVERSION — RULES SUPPORT COMES DECK BY DECK`;

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
          <Flex
            fontFamily="SpaceGrotesk"
            fontSize="0.7rem"
            fontWeight={700}
            letterSpacing="0.2em"
            px="0.7rem"
            py="0.25rem"
            bg="brand.accent"
            color="brand.surfaceDim"
            sx={skewChip()}
          >
            <Text>OPEN BETA</Text>
          </Flex>
        </Flex>

        {/* title block */}
        <Box as="section" mt="2.5rem" mb="2rem">
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
            Full rules enforcement for Unmatched, in your browser. A referee
            server allows only legal moves, does the combat math for you, and
            keeps hands truly hidden — so you can battle a friend, a stranger,{" "}
            <b>or an AI, right now</b>. No account, no install: pick a fighter
            and go.
          </Text>
          <Text
            mt="0.9rem"
            maxW="38rem"
            fontFamily="SpaceGrotesk"
            fontSize="0.8rem"
            lineHeight="1.6"
            opacity={0.55}
          >
            Every deck is hand-converted into engine rules, so the roster grows a
            few fighters at a time
            {readyEntries.length > 0 && ` — ${readyEntries.length} are battle-ready today`}.
            The free-form sandbox isn&apos;t going anywhere; Pro is an additional
            way to play.
          </Text>
        </Box>

        {/* above-the-fold CTAs */}
        <Flex as="section" flexDir="column" gap="0.9rem">
          <Flex gap="0.7rem" flexWrap="wrap" alignItems="center">
            <ChakraLink
              as={Link}
              href={primaryHref}
              display="inline-flex"
              alignItems="center"
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="0.95rem"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px="1.6rem"
              py="0.8rem"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep", textDecoration: "none" }}
              transition="background 0.15s"
              sx={skewChip()}
            >
              <Text>{primaryLabel}</Text>
            </ChakraLink>
            <ChakraLink
              as={Link}
              href={withDebug("/pro/game")}
              display="inline-flex"
              alignItems="center"
              fontFamily="SpaceGrotesk"
              fontSize="0.95rem"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px="1.6rem"
              py="0.8rem"
              border="1px solid"
              borderColor="whiteAlpha.400"
              color="brand.parchment"
              _hover={{ bg: "whiteAlpha.200", textDecoration: "none" }}
              transition="background 0.15s"
              sx={skewChip()}
            >
              <Text>Challenge a friend</Text>
            </ChakraLink>
          </Flex>

          <Flex
            gap="0.75rem"
            alignItems="center"
            fontFamily="SpaceGrotesk"
            fontSize="0.78rem"
            opacity={0.6}
          >
            {/* Replays ships dark: this entry only appears once the beta flag is on. */}
            {replaysEnabled && (
              <>
                <ChakraLink
                  as={Link}
                  href="/pro/replays"
                  textDecoration="underline"
                  _hover={{ color: "brand.accent" }}
                >
                  Replays
                </ChakraLink>
                <Text aria-hidden>·</Text>
              </>
            )}
            <ChakraLink
              as={Link}
              href="/pro/scenarios"
              textDecoration="underline"
              _hover={{ color: "brand.accent" }}
            >
              Scenarios
            </ChakraLink>
          </Flex>

          {/* seat strip — a display-scale replica of the create screen's seat bar.
              Its only job is choosing the difficulty the primary CTA carries. */}
          <Flex
            mt="0.4rem"
            gap="0.5rem"
            alignItems="stretch"
            flexWrap={{ base: "wrap", sm: "nowrap" }}
            maxW="34rem"
          >
            <SeatPlate tag="P1 · YOU" title="Your fighter" />
            <Flex
              alignItems="center"
              px="0.3rem"
              fontFamily="LeagueGothic"
              fontSize="1.6rem"
              color="#D64545"
              textShadow="0 2px 12px rgba(214,69,69,0.5)"
            >
              VS
            </Flex>
            <SeatPlate
              tag="P2"
              title={p2 === "human" ? "Open seat" : `AI · ${p2}`}
              occupant={p2}
              onChange={setP2}
            />
          </Flex>
        </Flex>

        {/* pick your mode */}
        <Box as="section" mt="4rem">
          <SectionHead>Pick your mode</SectionHead>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="0.75rem">
            {MODES.map((mode) => (
              <Box
                key={mode.title}
                p="1rem"
                borderRadius="0.5rem"
                bg="rgba(250,235,215,0.05)"
                border="1px solid rgba(250,235,215,0.12)"
              >
                <Text
                  fontFamily="BebasNeueRegular"
                  fontSize="1.25rem"
                  letterSpacing="0.06em"
                  color="brand.accent"
                >
                  {mode.title}
                </Text>
                <Text fontFamily="ArchivoNarrow" fontSize="0.95rem" opacity={0.8} mt="0.2rem">
                  {mode.text}
                </Text>
              </Box>
            ))}
          </Grid>
        </Box>

        {/* roster */}
        <Flex as="section" flexDir="column" gap="0.9rem" mt="4rem">
          <Flex alignItems="baseline" justifyContent="space-between" gap="1rem">
            <SectionHead mb="0">Choose your fighter</SectionHead>
            <Text
              fontFamily="SpaceGrotesk"
              fontSize="0.8rem"
              color="brand.accent"
              whiteSpace="nowrap"
            >
              {!liveHeroes
                ? offline
                  ? "roster offline"
                  : "loading roster…"
                : `${readyEntries.length} battle-ready${
                    labEntries.length > 0 ? ` · ${labEntries.length} in the lab` : ""
                  }`}
            </Text>
          </Flex>

          <Grid
            templateColumns="repeat(auto-fill, minmax(150px, 1fr))"
            gap="0.5rem"
          >
            {/* Pre-reply the roster is genuinely unknown, so the grid holds its
                shape with skeletons rather than asserting a stale hero list. */}
            {!liveHeroes && !offline &&
              Array.from({ length: SKELETON_TILES }, (_, i) => (
                <SkeletonTile key={i} index={i} />
              ))}
            {gridEntries.map((entry, i) => {
              // Ready tiles navigate straight into create-a-room with the hero
              // preselected; lab tiles stay inspect-only. Carry `debug` through
              // so a reflavored pick stays selectable and the debug session
              // continues on the game page.
              const href =
                entry.status === "ready"
                  ? withDebug(`/pro/game?hero=${entry.heroId}`)
                  : undefined;
              return (
                <RosterTile
                  key={entry.key}
                  entry={entry}
                  index={i}
                  href={href}
                  isPicked={picked?.key === entry.key}
                  onPick={() => setPicked(entry)}
                  onHover={setHovered}
                  onPreview={() => setPreviewEntry(entry)}
                />
              );
            })}
          </Grid>

          {/* The socket never answered: say so plainly instead of pulsing
              skeletons forever. Every CTA above still works — the game page
              runs its own LIST_HEROES and may well succeed. */}
          {offline && (
            <Text
              fontFamily="SpaceGrotesk"
              fontSize="0.85rem"
              textAlign="center"
              opacity={0.6}
              py="1rem"
            >
              Couldn&apos;t reach the referee server, so the roster isn&apos;t
              listed here. Head into the arena — the fighter picker will load it
              there.
            </Text>
          )}

          {/* announcer bar */}
          <Flex
            mt="0.75rem"
            minH="3.4rem"
            alignItems="center"
            justifyContent="center"
            border="1px dashed"
            borderColor={spotlight ? "brand.accent" : "rgba(250,235,215,0.2)"}
            borderRadius="0.5rem"
            px="1rem"
            transition="border-color 0.2s"
          >
            <Text
              fontFamily="BebasNeueRegular"
              fontSize={{ base: "1.1rem", md: "1.4rem" }}
              letterSpacing="0.08em"
              textAlign="center"
              color={
                spotlight?.status === "ready" ? "brand.accent" : undefined
              }
              opacity={spotlight ? 1 : 0.45}
            >
              {announcer}
            </Text>
          </Flex>

          {/* locked decks: out of the grid, behind a challengers-approaching drawer */}
          {lockedEntries.length > 0 && (
            <Box>
              <Flex
                as="button"
                type="button"
                onClick={() => setLockedOpen((v) => !v)}
                aria-expanded={lockedOpen}
                w="100%"
                alignItems="center"
                justifyContent="center"
                gap="0.5rem"
                py="0.7rem"
                borderRadius="0.5rem"
                border="1px solid rgba(250,235,215,0.18)"
                bg="rgba(250,235,215,0.04)"
                fontFamily="BebasNeueRegular"
                fontSize="1.05rem"
                letterSpacing="0.1em"
                _hover={{ bg: "rgba(250,235,215,0.08)", borderColor: "brand.accent" }}
                transition="background 0.15s, border-color 0.15s"
              >
                {lockedEntries.length} challengers approaching {lockedOpen ? "▲" : "▼"}
              </Flex>
              {lockedOpen && (
                <Box mt="0.6rem">
                  <Flex flexWrap="wrap" gap="0.35rem">
                    {lockedEntries.map((entry) => (
                      <Flex
                        key={entry.key}
                        alignItems="center"
                        gap="0.35rem"
                        px="0.55rem"
                        py="0.3rem"
                        borderRadius="0.35rem"
                        border="1px solid rgba(250,235,215,0.12)"
                        bg="rgba(250,235,215,0.03)"
                        fontFamily="SpaceGrotesk"
                        fontSize="0.75rem"
                        color="whiteAlpha.700"
                        filter="grayscale(1)"
                      >
                        <FaLock size="0.6rem" />
                        {entry.name}
                      </Flex>
                    ))}
                  </Flex>
                  <Text
                    mt="0.6rem"
                    fontFamily="SpaceGrotesk"
                    fontSize="0.75rem"
                    opacity={0.5}
                  >
                    Conversions are prioritised by demand — the decks people ask
                    for most get hand-written into engine rules first.
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Flex>

        {/* stage select */}
        <Box as="section" mt="4rem">
          <SectionHead>Stage select</SectionHead>
          <Grid
            templateColumns="repeat(auto-fill, minmax(160px, 1fr))"
            gap="0.5rem"
          >
            {MAP_CATALOG.filter((entry) => !entry.hidden).map((entry) => (
              <ChakraLink
                key={entry.id}
                as={Link}
                href={withDebug("/pro/game")}
                display="block"
                borderRadius="0.5rem"
                overflow="hidden"
                border="1px solid rgba(250,235,215,0.14)"
                position="relative"
                _hover={{ textDecoration: "none", borderColor: "brand.accent" }}
                transition="border-color 0.15s"
              >
                <Box
                  h="5rem"
                  // bgColor, not the `bg` shorthand: `bg` compiles to
                  // `background:` and would reset the image set above it.
                  bgColor="rgba(250,235,215,0.06)"
                  bgImage={entry.thumbnailUrl ? `url("${entry.thumbnailUrl}")` : undefined}
                  bgSize="cover"
                  bgPos="center"
                />
                <Flex
                  direction="column"
                  gap="0.25rem"
                  p="0.5rem"
                  bg="rgba(20,8,24,0.75)"
                >
                  <Text
                    fontFamily="SpaceGrotesk"
                    fontWeight={700}
                    fontSize="0.78rem"
                    noOfLines={1}
                  >
                    {entry.title}
                  </Text>
                  <Flex gap="0.25rem" flexWrap="wrap">
                    {eligibleFormats(entry.map).map((formatId) => (
                      <Text
                        key={formatId}
                        fontFamily="SpaceGrotesk"
                        fontSize="0.6rem"
                        letterSpacing="0.1em"
                        px="0.3rem"
                        py="0.05rem"
                        borderRadius="0.2rem"
                        bg="rgba(224,168,46,0.2)"
                        color="brand.accent"
                      >
                        {FORMAT_BADGE[formatId]}
                      </Text>
                    ))}
                  </Flex>
                </Flex>
              </ChakraLink>
            ))}
            <ChakraLink
              as={Link}
              href={withDebug("/pro/game")}
              display="flex"
              alignItems="center"
              justifyContent="center"
              textAlign="center"
              minH="8rem"
              px="0.6rem"
              borderRadius="0.5rem"
              border="1px dashed rgba(250,235,215,0.3)"
              fontFamily="SpaceGrotesk"
              fontSize="0.78rem"
              opacity={0.7}
              _hover={{ opacity: 1, borderColor: "brand.accent", textDecoration: "none" }}
              transition="opacity 0.15s, border-color 0.15s"
            >
              + import map JSON
            </ChakraLink>
          </Grid>
        </Box>

        {/* what's next */}
        <Box as="section" mt="4rem">
          <SectionHead>What&apos;s next</SectionHead>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="0.75rem">
            {WHATS_NEXT.map((item) => (
              <Box key={item.tag}>
                <Text
                  fontFamily="SpaceGrotesk"
                  fontSize="0.65rem"
                  fontWeight={700}
                  letterSpacing="0.18em"
                  color="brand.accent"
                  opacity={0.8}
                >
                  {item.tag}
                </Text>
                <Text fontFamily="ArchivoNarrow" fontSize="0.95rem" opacity={0.8} mt="0.15rem">
                  {item.text}
                </Text>
              </Box>
            ))}
          </Grid>

          <Text mt="2rem" fontFamily="SpaceGrotesk" fontSize="0.8rem" opacity={0.55}>
            Itching for a deck that isn&apos;t converted yet? The{" "}
            <ChakraLink
              as={Link}
              href="/connect"
              textDecoration="underline"
              _hover={{ color: "brand.accent" }}
            >
              sandbox
            </ChakraLink>{" "}
            plays all 40+ decks today — it just trusts you with the rulebook.
          </Text>
        </Box>
      </Box>

      {/* A served hero with no tile entry has no deck JSON to fetch (deckId
          null); the modal still shows its name and the stats off the listing. */}
      <HeroPreviewModal
        isOpen={!!previewEntry}
        onClose={() => setPreviewEntry(undefined)}
        deckId={previewEntry?.deck?.id ?? null}
        heroName={previewEntry?.name ?? ""}
        heroId={previewEntry?.heroId}
        quickStats={
          previewEntry?.listing && {
            hp: previewEntry.listing.hp,
            move: previewEntry.listing.move,
            reach: previewEntry.listing.reach,
          }
        }
      />
    </Box>
  );
};

const SectionHead = ({ children, mb = "1rem" }: { children: React.ReactNode; mb?: string }) => (
  <Text
    fontFamily="BebasNeueRegular"
    fontSize={{ base: "1.6rem", md: "2rem" }}
    letterSpacing="0.06em"
    mb={mb}
  >
    {children}
  </Text>
);

/** Parallel facts about what ships today — deliberately unnumbered (not a sequence). */
const MODES = [
  {
    title: "Three ways to fight",
    text: "Duel 1v1, 3-player free-for-all, and 2v2 teams. An optional 30/60/90s move timer keeps games brisk.",
  },
  {
    title: "Bots at three levels",
    text: "Warm up on Easy, spar Medium, sweat against Hard's Monte-Carlo brain. Solo matches start instantly.",
  },
  {
    title: "Five boards — or yours",
    text: "The Mended Drum, Island of Despair, City Docks, Polus, Weathertop — or import a custom map.",
  },
  {
    title: "Every match, a replay",
    text: "Finished games auto-save. Scrub them in god-view — every hand face-up — and share a replay code.",
  },
];

const WHATS_NEXT = [
  {
    tag: "TRAINING",
    text: "A harder AI. The next brain (ISMCTS) is in its gauntlet now — it graduates when it beats the current champ.",
  },
  {
    tag: "MATCHMAKING",
    text: "Find a stranger faster. Public lobbies exist today; proper matchmaking is the next step.",
  },
  {
    tag: "NEW FORMAT",
    text: "2v1 Boss. Two heroes against one overpowered villain — the engine already speaks it.",
  },
  {
    tag: "ROSTER",
    text: "More fighters. New conversions land as they clear testing.",
  },
];

/** Who fills a seat in the landing's display-scale seat strip. */
type SeatOccupant = "human" | BotDifficulty;

const SEAT_CHIPS: { v: SeatOccupant; label: string }[] = [
  { v: "human", label: "Hum" },
  { v: "easy", label: "AI·E" },
  { v: "medium", label: "AI·M" },
  { v: "hard", label: "AI·H" },
];

/**
 * A cosmetic echo of the create screen's `SeatPlate` (pages/pro/game.tsx). It is
 * deliberately a local copy rather than an import: the real one is wired to
 * socket/room state and a four-seat layout, and reusing it here would drag that
 * whole create-flow contract onto a static marketing page.
 */
const SeatPlate = ({
  tag,
  title,
  occupant,
  onChange,
}: {
  tag: string;
  title: string;
  occupant?: SeatOccupant;
  onChange?: (v: SeatOccupant) => void;
}) => {
  const isAi = !!occupant && occupant !== "human";
  const you = !onChange;
  return (
    <Flex
      flex="1 1 10.5rem"
      minW="10.5rem"
      borderRadius="0.6rem"
      border="1px solid"
      borderColor={you ? "brand.accentDeep" : isAi ? "brand.accent" : "whiteAlpha.200"}
      bg={
        you
          ? "linear-gradient(105deg, rgba(224,168,46,0.14), rgba(0,0,0,0.3) 60%)"
          : "rgba(0,0,0,0.3)"
      }
      p="0.55rem 0.65rem"
      gap="0.6rem"
      align="center"
      overflow="hidden"
      sx={skewChip(-3)}
    >
      <Flex
        w="2.6rem"
        h="2.6rem"
        flex="none"
        borderRadius="0.4rem"
        border="1px solid"
        borderColor="whiteAlpha.200"
        bg="brand.surfaceDim"
        align="center"
        justify="center"
        fontSize="1.1rem"
        color="whiteAlpha.700"
        aria-hidden
      >
        {you ? "?" : isAi ? "🤖" : "👤"}
      </Flex>
      <Box minW="0" flex="1">
        <Text
          fontFamily="SpaceGrotesk"
          fontSize="0.6rem"
          letterSpacing="0.14em"
          color={you ? "brand.accent" : "whiteAlpha.600"}
        >
          {tag}
        </Text>
        <Text
          fontFamily="BebasNeueRegular"
          fontSize="0.95rem"
          letterSpacing="0.03em"
          noOfLines={1}
        >
          {title}
        </Text>
        {onChange && (
          <Flex gap="0.25rem" mt="0.3rem" flexWrap="wrap">
            {SEAT_CHIPS.map((chip) => {
              const active = occupant === chip.v;
              return (
                <Button
                  key={chip.v}
                  type="button"
                  size="xs"
                  aria-pressed={active}
                  h="1.3rem"
                  minW="auto"
                  px="0.45rem"
                  fontSize="0.62rem"
                  fontFamily="SpaceGrotesk"
                  onClick={() => onChange(chip.v)}
                  bg={active ? "brand.accent" : "rgba(0,0,0,0.3)"}
                  color={active ? "brand.surfaceDim" : "brand.parchment"}
                  border="1px solid"
                  borderColor={active ? "brand.accent" : "whiteAlpha.200"}
                  _hover={{ borderColor: active ? "brand.accentDeep" : "whiteAlpha.400" }}
                >
                  {chip.label}
                </Button>
              );
            })}
          </Flex>
        )}
      </Box>
    </Flex>
  );
};

/**
 * The one crossover from server hero id back to the presentation tile. Built
 * once at module load: DECK_HERO_IDS is deck id → hero id, and POPULAR_DECKS is
 * small, but the roster maps over it per render.
 */
const DECK_BY_HERO_ID: Record<string, PopularDeckMeta> = Object.fromEntries(
  POPULAR_DECKS.flatMap((deck) => {
    const heroId = DECK_HERO_IDS[deck.id];
    return heroId ? [[heroId, deck] as const] : [];
  })
);
const deckForHeroId = (heroId: string): PopularDeckMeta | undefined =>
  DECK_BY_HERO_ID[heroId];

/** How many placeholder tiles stand in for the roster before it arrives. */
const SKELETON_TILES = 12;

const skeletonPulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.65; }
`;

/** Pre-reply placeholder — same footprint as a real tile, no hero claimed. */
const SkeletonTile = ({ index }: { index: number }) => (
  <Box
    aria-hidden
    h="5.5rem"
    borderRadius="0.5rem"
    border="2px solid rgba(250,235,215,0.08)"
    bg="rgba(250,235,215,0.06)"
    sx={{
      animation: `${skeletonPulse} 1.6s ease-in-out ${index * 0.08}s infinite`,
      [REDUCED_MOTION]: { animation: "none", opacity: 0.4 },
    }}
  />
);

const RosterTile = ({
  entry,
  index,
  href,
  isPicked,
  onPick,
  onHover,
  onPreview,
}: {
  entry: RosterEntry;
  index: number;
  /** when set, the tile navigates into the game instead of inspect-only picking */
  href?: string;
  isPicked: boolean;
  onPick: () => void;
  /** announcer spotlight follows the cursor; undefined clears it */
  onHover: (entry: RosterEntry | undefined) => void;
  onPreview: () => void;
}) => {
  const { deck, name, shortName, status } = entry;
  const locked = status === "locked";
  const tile = (
      <Flex
        onClick={href ? undefined : onPick}
        onMouseEnter={() => onHover(entry)}
        onMouseLeave={() => onHover(undefined)}
        onFocus={() => onHover(entry)}
        onBlur={() => onHover(undefined)}
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
        sx={{
          ...(status === "ready"
            ? { animation: `${tileIn} 0.4s ease-out ${index * 0.03}s forwards, ${readyPulse} 2.6s ease-in-out infinite` }
            : {}),
          // The entrance slide and the ready-pulse are both decorative; under
          // reduced motion the tile simply appears, fully opaque.
          ...NO_MOTION,
        }}
        transition="transform 0.15s ease-in-out, filter 0.2s"
        transform={isPicked ? "scale(1.04)" : undefined}
        zIndex={isPicked ? 1 : undefined}
        _hover={{
          transform: "scale(1.04)",
          filter: "none",
          zIndex: 1,
          [REDUCED_MOTION]: { transform: "none" },
        }}
        filter={locked && !isPicked ? "grayscale(0.9) brightness(0.55)" : undefined}
        // Art is a presentation extra: a served hero with no tile entry gets the
        // neutral highlight and no card back, and still reads as a real tile.
        bg={deck?.highlightColour ?? DEFAULT_HIGHLIGHT}
        bgImage={deck?.cardbackUrl ? `url(${deck.cardbackUrl})` : undefined}
        bgSize="cover"
        bgPos="center"
      >
        <Box
          position="absolute"
          inset="0"
          bg="linear-gradient(180deg, rgba(20,8,24,0) 20%, rgba(20,8,24,0.85) 100%)"
        />
        {status !== "locked" && (
          <Flex
            position="absolute"
            top="0.35rem"
            left="0.4rem"
            fontFamily="SpaceGrotesk"
            fontSize="0.55rem"
            fontWeight={700}
            letterSpacing="0.12em"
            px="0.35rem"
            py="0.1rem"
            bg={status === "ready" ? "brand.accent" : "rgba(224,168,46,0.25)"}
            color={status === "ready" ? "brand.surfaceDim" : "brand.accent"}
            sx={skewChip()}
          >
            <Text>{status === "ready" ? "PLAY NOW" : "IN THE LAB"}</Text>
          </Flex>
        )}
        <Flex
          as="button"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPreview();
          }}
          aria-label={`Preview ${shortName}`}
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
            {name}
          </Text>
          <Flex alignItems="center" gap="0.25rem" color="#FAEBD7" pl="0.25rem">
            {locked ? (
              <FaLock size="0.65rem" opacity={0.8} />
            ) : (
              // No tile entry means no like count to show — the badge is
              // omitted rather than rendered as a zero.
              deck && (
                <>
                  <FaHeart size="0.6rem" />
                  <Text fontSize="0.7rem">{deck.likes}</Text>
                </>
              )
            )}
          </Flex>
        </Flex>
      </Flex>
  );
  const frozenAt = status === "ready" && deck ? frozenAtForDeck(deck.id) : null;
  const inspectHint =
    status === "ready"
      ? `${shortName} — playable now, click to enter the arena${
          frozenAt ? ` (rules version frozen ${frozenAt})` : ""
        }`
      : status === "lab"
      ? `${shortName} — stress-testing the engine's rule language`
      : `${shortName} — not yet converted (every deck's rules are hand-tuned)`;
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
