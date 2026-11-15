import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Flex,
  Grid,
  Link as ChakraLink,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { FaArrowLeft } from "react-icons/fa";
import {
  POPULAR_DECKS,
  PopularDeckMeta,
} from "@/lib/constants/top-decks";
import { DECK_HERO_IDS } from "@/lib/pro/useProCardArt";
import { DISCORD_FALLBACK_INVITE } from "@/lib/hooks/useDiscordWidget";
import { useProLiveRosterState } from "@/lib/pro/useProLiveRoster";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";
import { useFlag } from "@/lib/flags";
import { AccountChip } from "@/components/Account/AccountChip";
// Loaded on demand: its bracket/match helpers stay out of the /pro first load (#1265).
const NextMatchBanner = dynamic(() => import("@/components/Tournaments/NextMatchBanner").then((m) => m.NextMatchBanner), {
  ssr: false,
});
import { HeroPreviewModal } from "@/components/Pro/HeroPreviewModal";
import { ProHeroVideo } from "@/components/Pro/ProHeroVideo";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import type { HeroListing } from "@/lib/pro/protocol";
import { FALLBACK_BOT_TIERS, TIER_ORDER, botTierMeta } from "@/lib/pro/botTiers";
import { lookingCount } from "@/lib/pro/quickPlayLobby";
import { listRecentHeroes } from "@/lib/pro/recentRooms";
import { getChangelogEntries } from "@/lib/changelog/entries";
import type { ChangelogEntry } from "@/lib/changelog/types";
import { posterUrl } from "@/lib/changelog/media";
import {
  FEED_LIMIT,
  entryKindLabel,
  featuredEntries,
  feedDate,
  launcherCtaHref,
  proFeedEntries,
  takeUnseenProEntries,
} from "@/lib/pro/launcherFeed";
import { listTournaments } from "@/lib/tournaments/api";
import { tournamentPath } from "@/lib/tournaments/links";
import type { Tournament } from "@/lib/tournaments/types";

/**
 * /pro — the Pro launcher (unbrewed-p2p-1626).
 *
 * This page used to be a second, non-working copy of the `/pro/game` picker: a
 * fighter grid, a seat strip and a board picker that were all just links, most
 * of whose choices were dropped on the way in. Regulars bookmark the lobby, so
 * the page now has a different job:
 *
 *  - a front door for NEW players (what Pro is, and one obvious first game:
 *    the Easy bot), and
 *  - a news board for RETURNING ones (the newest fighters and features, what's
 *    new since their last visit, and a way straight back to their fighters).
 *
 * It never asks a question `/pro/game` asks again. Every play button is a door
 * into the lobby carrying at most ONE preset (`?vs=`, `?quick=1`, `?hero=`).
 *
 * Data, all already public: the changelog (`pro: true` entries) for the feed,
 * the live LIST_HEROES roster (+ LIST_LOBBIES for "N waiting"), the public
 * tournaments list, and this browser's recently played fighters, which is also
 * what tells a returning player from a new one.
 */
type RosterStatus = "ready" | "lab";

interface RosterEntry {
  /** stable identity: the server hero id */
  key: string;
  /** the full deck title (may carry a ` ★` reflavored suffix) */
  name: string;
  /** just the fighter ("Voldemort", not "Voldemort (The Wizarding World)") */
  shortName: string;
  status: RosterStatus;
  heroId: string;
  listing: HeroListing;
  /** presentation extras, when a top-decks tile exists for this hero */
  deck?: PopularDeckMeta;
}

type Visitor = "new" | "returning";

/** Tile colour for a served hero with no top-decks entry yet. */
const DEFAULT_HIGHLIGHT = "#3B2A47";

/** Select-screen tag: a solid gold, slightly skewed chip (text stays upright). */
const skewChip = (deg = -6) => ({
  transform: `skewX(${deg}deg)`,
  "& > *": { transform: `skewX(${-deg}deg)` },
});

const CARD = {
  p: "0.9rem 1rem",
  borderRadius: "0.6rem",
  bg: "rgba(250,235,215,0.05)",
  border: "1px solid rgba(250,235,215,0.12)",
} as const;

const GOLD_BTN = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "SpaceGrotesk",
  fontWeight: 700,
  fontSize: "0.85rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  px: "1.1rem",
  py: "0.6rem",
  borderRadius: "0.4rem",
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep", textDecoration: "none" },
  transition: "background 0.15s",
};

const GHOST_BTN = {
  ...GOLD_BTN,
  fontWeight: 600,
  bg: "rgba(20,8,24,0.4)",
  color: "brand.parchment",
  border: "1px solid rgba(250,235,215,0.35)",
  _hover: { bg: "whiteAlpha.200", textDecoration: "none" },
};

export const ProLanding = () => {
  const [replaysEnabled] = useFlag("replays");
  const router = useRouter();
  // `?debug` (any value, incl. bare `?debug`) reveals debug-only decks the
  // server hides by default. See lib/pro/protocol.ts v15/v18.
  const debug = router.query.debug !== undefined;
  const { heroes: liveHeroes, offline, lobbies } = useProLiveRosterState(PRO_WS_URL, debug, true, true);
  const [previewEntry, setPreviewEntry] = useState<RosterEntry>();
  const [showAllFighters, setShowAllFighters] = useState(false);
  const aboutRef = useRef<HTMLDetailsElement>(null);

  // Browser-only reads happen after mount, so the static export and the first
  // client render agree (the new-player view, which is also what crawlers see).
  const [visitor, setVisitor] = useState<Visitor>("new");
  const [recentHeroIds, setRecentHeroIds] = useState<string[]>([]);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  const feed = useMemo(() => proFeedEntries(getChangelogEntries()), []);
  const featured = useMemo(() => featuredEntries(feed), [feed]);
  const [slide, setSlide] = useState(0);
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);

  useEffect(() => {
    const recent = listRecentHeroes();
    setRecentHeroIds(recent);
    setVisitor(recent.length > 0 ? "returning" : "new");
    setUnseen(takeUnseenProEntries(feed));
  }, [feed]);

  useEffect(() => {
    let alive = true;
    void listTournaments().then((r) => {
      if (alive && r.ok) setTournaments(r.value);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The server's reply IS the roster; POPULAR_DECKS only decorates it.
  const roster: RosterEntry[] = (liveHeroes ?? []).map((listing) => {
    const deck = deckForHeroId(listing.heroId);
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
  const rosterById = new Map(roster.map((e) => [e.heroId, e]));
  const recentFighters = recentHeroIds
    .map((id) => rosterById.get(id))
    .filter((e): e is RosterEntry => !!e)
    .slice(0, 4);

  // Every tier any served hero advertises, in ladder order (the always-on set
  // when the server doesn't advertise per-hero tiers).
  const advertisedTiers = new Set<string>(FALLBACK_BOT_TIERS);
  for (const h of liveHeroes ?? []) for (const t of h.botTiers ?? []) advertisedTiers.add(t);
  const ladder = TIER_ORDER.filter((t) => advertisedTiers.has(t)).map(botTierMeta);

  const waiting = lobbies ? lookingCount(lobbies) : null;
  const openEvents = (tournaments ?? [])
    .filter((t) => t.status === "running" || (t.status === "signup" && t.signupOpen))
    .slice(0, 2);

  // Every internal link keeps the debug session alive.
  const withDebug = (href: string) =>
    debug ? `${href}${href.includes("?") ? "&" : "?"}debug=1` : href;

  const isNew = visitor === "new";
  const boardCount = MAP_CATALOG.filter((entry) => !entry.hidden).length;
  const current = featured[Math.min(slide, featured.length - 1)];

  const openAbout = () => {
    const el = aboutRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <Box position="relative" minH="100svh" bg="brand.surfaceDim" color="brand.parchment" overflowX="clip">
      {/* Looping footage of a real Pro game behind the top of the page, mounted
          after hydration and only when the gates allow it. */}
      <ProHeroVideo />
      <Box
        position="fixed"
        inset="0"
        pointerEvents="none"
        bg="radial-gradient(ellipse 80% 60% at 50% -10%, rgba(224,168,46,0.14), transparent 60%)"
      />

      <Box position="relative" maxW="64rem" mx="auto" px={{ base: "1rem", md: "1.25rem" }} pb="5rem">
        {/* header */}
        <Flex as="header" justifyContent="space-between" alignItems="center" py="1rem" gap="0.75rem">
          <Flex alignItems="center" gap="0.9rem" minW={0}>
            <ChakraLink
              as={Link}
              href="/"
              display="flex"
              alignItems="center"
              gap="0.4rem"
              fontFamily="SpaceGrotesk"
              fontSize="0.8rem"
              opacity={0.7}
              _hover={{ opacity: 1, textDecoration: "none" }}
            >
              <FaArrowLeft size="0.65rem" /> unbrewed
            </ChakraLink>
            <Text
              as="h1"
              fontFamily="LeagueGothic"
              textTransform="uppercase"
              fontSize={{ base: "1.6rem", md: "1.9rem" }}
              lineHeight="1"
              whiteSpace="nowrap"
            >
              Unbrewed{" "}
              <Box as="span" color="brand.accent">
                Pro
              </Box>
            </Text>
            <Flex
              display={{ base: "none", sm: "flex" }}
              fontFamily="SpaceGrotesk"
              fontSize="0.6rem"
              fontWeight={700}
              letterSpacing="0.2em"
              px="0.55rem"
              py="0.15rem"
              bg="brand.accent"
              color="brand.surfaceDim"
              sx={skewChip()}
            >
              <Text>OPEN BETA</Text>
            </Flex>
          </Flex>
          {/* Optional Discord account (#459) — hidden unless the accounts API answers. */}
          <AccountChip />
        </Flex>

        {/* Tournaments (#1220): only for a signed-in entrant with an open match. */}
        <NextMatchBanner />

        {/* banner: the intro for a new player, the newest updates for a returning one */}
        {isNew || !current ? (
          <Banner
            kicker="Rules-enforced Unmatched"
            title="A referee for every game"
            text="Play community Unmatched decks in your browser. Only legal moves are allowed, the combat math is done for you, and hands stay hidden. Play a bot, a friend or a stranger. No account, no install."
            primary={{ label: "Play your first game →", href: withDebug("/pro/game?vs=ai-easy") }}
            secondary={{ label: "What's new", href: "#whats-new" }}
          />
        ) : (
          <Banner
            kicker={`${entryKindLabel(current)} · ${feedDate(current.date)}`}
            title={current.title}
            text={current.summary}
            art={current.video ? posterUrl(current.video.slug) : null}
            primary={
              launcherCtaHref(current)
                ? { label: `${current.cta?.label ?? "Play now"} →`, href: withDebug(launcherCtaHref(current)!) }
                : { label: "Play →", href: withDebug("/pro/game") }
            }
            secondary={{ label: "All updates", href: "/changelog" }}
            slides={featured.length}
            slide={slide}
            onSlide={setSlide}
          />
        )}

        {/* play bar: doors into the lobby, each carrying at most one preset */}
        <Flex
          as="nav"
          aria-label="Play"
          mt="0.7rem"
          gap="0.5rem"
          flexDir={{ base: "column", md: "row" }}
          p="0.6rem"
          borderRadius="0.8rem"
          bg="linear-gradient(180deg, rgba(224,168,46,0.12), rgba(224,168,46,0.04))"
          border="1px solid rgba(224,168,46,0.35)"
        >
          <ChakraLink
            as={Link}
            href={withDebug("/pro/game")}
            display="flex"
            alignItems="center"
            justifyContent="center"
            px="2rem"
            py={{ base: "0.4rem", md: 0 }}
            fontFamily="LeagueGothic"
            fontSize="2.1rem"
            letterSpacing="0.06em"
            bg="brand.accent"
            color="brand.surfaceDim"
            boxShadow="0 0 22px rgba(224,168,46,0.45)"
            _hover={{ bg: "brand.accentDeep", textDecoration: "none" }}
            sx={skewChip()}
          >
            <Text>PLAY</Text>
          </ChakraLink>
          <Grid flex="1" templateColumns={{ base: "1fr", sm: "repeat(3, 1fr)" }} gap="0.4rem">
            <Door
              href={withDebug(isNew ? "/pro/game?vs=ai-easy" : "/pro/game?vs=ai")}
              title="🤖 vs Bot"
              sub={isNew ? "The Easy bot, to learn the ropes" : "From Easy to the toughest we have"}
            />
            <Door
              href={withDebug("/pro/game?quick=1")}
              title="⚡ Quick Match"
              sub={waiting ? `${waiting} waiting right now` : "Pair up with the next player"}
              hot={!!waiting}
            />
            <Door href={withDebug("/pro/game")} title="🔗 Invite a friend" sub="Make a room, send the link" />
          </Grid>
        </Flex>

        {/* live line */}
        <Flex mt="0.5rem" px="0.2rem" gap="0.9rem" flexWrap="wrap" fontFamily="SpaceGrotesk" fontSize="0.72rem" opacity={0.75}>
          {waiting !== null && waiting > 0 && (
            <Text>
              <Box as="span" color="#5fd38a">●</Box> {waiting} waiting for a Quick Match
            </Text>
          )}
          <Text>
            {!liveHeroes
              ? offline
                ? "Roster offline"
                : "Loading roster…"
              : `${readyEntries.length} fighters${labEntries.length > 0 ? ` · ${labEntries.length} in the lab` : ""}`}
          </Text>
          <Text>{boardCount} boards</Text>
          {!isNew && <Text opacity={0.7}>Tip: bookmark /pro/game to go straight to the lobby</Text>}
        </Flex>

        <Grid templateColumns={{ base: "1fr", md: "1.45fr 1fr" }} gap="1rem" mt="1.75rem" alignItems="start">
          {/* what's new */}
          <Box as="section" id="whats-new" aria-labelledby="whats-new-head" minW={0}>
            <Flex justifyContent="space-between" alignItems="baseline" mb="0.6rem">
              <SectionHead id="whats-new-head" mb="0">
                What&apos;s new
                {unseen.size > 0 && (
                  <Box
                    as="span"
                    ml="0.5rem"
                    verticalAlign="0.2em"
                    fontFamily="SpaceGrotesk"
                    fontSize="0.6rem"
                    fontWeight={700}
                    letterSpacing="0.05em"
                    px="0.4rem"
                    py="0.1rem"
                    borderRadius="full"
                    bg="#39B7A8"
                    color="brand.surfaceDim"
                  >
                    {unseen.size} NEW
                  </Box>
                )}
              </SectionHead>
              <ChakraLink as={Link} href="/changelog" fontFamily="SpaceGrotesk" fontSize="0.75rem" color="brand.accent">
                All updates →
              </ChakraLink>
            </Flex>
            <Flex as="ul" listStyleType="none" flexDir="column" gap="0.5rem">
              {feed.slice(0, FEED_LIMIT).map((entry) => (
                <FeedPost key={entry.id} entry={entry} unseen={unseen.has(entry.id)} withDebug={withDebug} />
              ))}
            </Flex>
          </Box>

          {/* side cards */}
          <Flex flexDir="column" gap="0.7rem" minW={0}>
            {isNew ? (
              <Box {...CARD} borderColor="rgba(57,183,168,0.45)" bg="rgba(57,183,168,0.08)">
                <CardHead>New to Pro?</CardHead>
                <Box as="ol" pl="1.1rem" mt="0.3rem" fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.85}>
                  <Box as="li" mt="0.2rem">Hit <b>Play</b> and pick any fighter. Random is fine.</Box>
                  <Box as="li" mt="0.2rem">Start against the <b>Easy bot</b>. It plays random legal moves.</Box>
                  <Box as="li" mt="0.2rem">Click a highlighted move. The referee handles the rest.</Box>
                </Box>
                <Flex flexDir="column" gap="0.25rem" mt="0.5rem" fontFamily="SpaceGrotesk" fontSize="0.75rem">
                  {["No account, no install", "Works on your phone", "Every game saves a replay"].map((line) => (
                    <Text key={line}>
                      <Box as="span" color="brand.accent" fontWeight={700} mr="0.4rem">✓</Box>
                      {line}
                    </Text>
                  ))}
                </Flex>
                <ChakraLink as={Link} href={withDebug("/pro/game?vs=ai-easy")} {...GOLD_BTN} w="100%" mt="0.7rem">
                  Play vs Easy bot →
                </ChakraLink>
              </Box>
            ) : (
              <Box {...CARD} borderColor="rgba(57,183,168,0.45)" bg="rgba(57,183,168,0.08)">
                <CardHead>Jump back in</CardHead>
                {recentFighters.length > 0 ? (
                  <Flex flexDir="column" gap="0.35rem" mt="0.45rem">
                    {recentFighters.map((e) => (
                      <ChakraLink
                        key={e.key}
                        as={Link}
                        href={withDebug(`/pro/game?hero=${e.heroId}`)}
                        display="flex"
                        alignItems="center"
                        gap="0.6rem"
                        p="0.35rem"
                        borderRadius="0.4rem"
                        _hover={{ bg: "whiteAlpha.100", textDecoration: "none" }}
                      >
                        <Token entry={e} />
                        <Text flex="1" fontFamily="SpaceGrotesk" fontSize="0.82rem" fontWeight={600} noOfLines={1}>
                          {e.shortName}
                        </Text>
                        <Text fontFamily="SpaceGrotesk" fontSize="0.7rem" color="#39B7A8" whiteSpace="nowrap">
                          Play again →
                        </Text>
                      </ChakraLink>
                    ))}
                  </Flex>
                ) : (
                  <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.8} mt="0.3rem">
                    Your recent fighters show up here.
                  </Text>
                )}
                {replaysEnabled && (
                  <ChakraLink as={Link} href="/pro/replays" display="inline-block" mt="0.5rem" fontFamily="SpaceGrotesk" fontSize="0.75rem" color="brand.accent">
                    Your replays →
                  </ChakraLink>
                )}
              </Box>
            )}

            <Box {...CARD}>
              <CardHead link={{ label: "All →", href: "/tournaments" }}>Tournaments</CardHead>
              {openEvents.length > 0 ? (
                <Flex flexDir="column" gap="0.45rem" mt="0.45rem">
                  {openEvents.map((t) => (
                    <Flex key={t.id} alignItems="center" gap="0.6rem">
                      <Box flex="1" minW={0}>
                        <Text fontFamily="SpaceGrotesk" fontSize="0.82rem" fontWeight={600} noOfLines={1}>
                          {t.name}
                        </Text>
                        <Text fontFamily="SpaceGrotesk" fontSize="0.7rem" opacity={0.6}>
                          {t.status === "running" ? "Live" : "Signup open"} · {t.entryCount} / {t.size} players
                        </Text>
                      </Box>
                      <ChakraLink
                        as={Link}
                        href={tournamentPath(t.slug)}
                        fontFamily="SpaceGrotesk"
                        fontSize="0.7rem"
                        fontWeight={700}
                        px="0.5rem"
                        py="0.2rem"
                        border="1px solid"
                        borderColor="brand.accent"
                        color="brand.accent"
                        borderRadius="0.3rem"
                        _hover={{ bg: "rgba(224,168,46,0.15)", textDecoration: "none" }}
                      >
                        {t.status === "running" ? "VIEW" : "JOIN"}
                      </ChakraLink>
                    </Flex>
                  ))}
                </Flex>
              ) : (
                <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.8} mt="0.3rem">
                  Run a single-elimination or round-robin bracket and share the link.{" "}
                  <ChakraLink as={Link} href="/tournaments?new=1" color="brand.accent">
                    Create one →
                  </ChakraLink>
                </Text>
              )}
            </Box>

            <Box {...CARD}>
              <CardHead>Fighters</CardHead>
              <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.8} mt="0.2rem">
                {!liveHeroes
                  ? offline
                    ? "Couldn't reach the referee server. The lobby will load the roster."
                    : "Loading the roster…"
                  : `${readyEntries.length} battle-ready${labEntries.length > 0 ? ` · ${labEntries.length} in the lab` : ""}. Every deck is hand-converted into engine rules, a few at a time.`}
              </Text>
              {roster.length > 0 && (
                <>
                  <Flex mt="0.5rem" alignItems="center">
                    {readyEntries.slice(0, 6).map((e, i) => (
                      <Box key={e.key} ml={i === 0 ? 0 : "-0.45rem"}>
                        <Token entry={e} ring />
                      </Box>
                    ))}
                    <Box
                      as="button"
                      type="button"
                      onClick={() => setShowAllFighters((v) => !v)}
                      aria-expanded={showAllFighters}
                      ml="0.6rem"
                      fontFamily="SpaceGrotesk"
                      fontSize="0.72rem"
                      color="brand.accent"
                    >
                      {showAllFighters ? "Hide list" : `See all ${roster.length} →`}
                    </Box>
                  </Flex>
                  {showAllFighters && (
                    <Flex as="ul" listStyleType="none" flexWrap="wrap" gap="0.3rem" mt="0.6rem" aria-label="All fighters">
                      {roster.map((e) => (
                        <Box as="li" key={e.key}>
                          <Box
                            as="button"
                            type="button"
                            onClick={() => setPreviewEntry(e)}
                            fontFamily="SpaceGrotesk"
                            fontSize="0.72rem"
                            px="0.5rem"
                            py="0.2rem"
                            borderRadius="full"
                            border="1px solid rgba(250,235,215,0.18)"
                            bg={e.status === "lab" ? "transparent" : "rgba(250,235,215,0.06)"}
                            _hover={{ borderColor: "brand.accent" }}
                          >
                            {e.shortName}
                            {e.status === "lab" && (
                              <Box as="span" ml="0.3rem" fontSize="0.55rem" letterSpacing="0.1em" opacity={0.7}>
                                LAB
                              </Box>
                            )}
                          </Box>
                        </Box>
                      ))}
                    </Flex>
                  )}
                </>
              )}
              <Text fontFamily="SpaceGrotesk" fontSize="0.72rem" opacity={0.65} mt="0.6rem">
                Want a deck added? Ask in{" "}
                <ChakraLink href={DISCORD_FALLBACK_INVITE} isExternal color="brand.accent" fontWeight={700}>
                  #pro-deck-request
                </ChakraLink>{" "}
                on Discord.
              </Text>
            </Box>

            <Box {...CARD}>
              <CardHead>Bots</CardHead>
              <Flex gap="0.2rem" mt="0.45rem">
                {ladder.map((tier, i) => (
                  <Box
                    key={tier.id}
                    flex="1"
                    textAlign="center"
                    fontFamily="SpaceGrotesk"
                    fontSize="0.65rem"
                    py="0.3rem"
                    borderRadius="0.25rem"
                    bg={`rgba(224,168,46,${0.06 + (0.3 * i) / Math.max(1, ladder.length - 1)})`}
                    title={tier.tooltip}
                  >
                    {tier.label.replace(/ bot$/, "")}
                  </Box>
                ))}
              </Flex>
              <Text fontFamily="ArchivoNarrow" fontSize="0.9rem" opacity={0.8} mt="0.45rem">
                No LLM: a search that plays games out in its head. Real players still beat Expert about 7 times in 10.
              </Text>
              <Box
                as="button"
                type="button"
                onClick={openAbout}
                mt="0.3rem"
                fontFamily="SpaceGrotesk"
                fontSize="0.72rem"
                color="brand.accent"
              >
                How they work →
              </Box>
            </Box>
          </Flex>
        </Grid>

        {/* About: the explainer, collapsed but in the DOM (crawlers and the
            curious both still get it). */}
        <Box
          as="details"
          ref={aboutRef}
          mt="1.75rem"
          {...CARD}
          p="0"
          sx={{ "& > summary::-webkit-details-marker": { display: "none" } }}
        >
          <Flex
            as="summary"
            cursor="pointer"
            listStyleType="none"
            justifyContent="space-between"
            alignItems="baseline"
            gap="1rem"
            px="1rem"
            py="0.8rem"
          >
            <Text fontFamily="BebasNeueRegular" fontSize="1.35rem" letterSpacing="0.05em">
              About Unbrewed Pro
            </Text>
            <Text fontFamily="ArchivoNarrow" fontSize="0.85rem" opacity={0.6} textAlign="right">
              Formats, boards, replays, the bots, what&apos;s next ▾
            </Text>
          </Flex>
          <Box px="1rem" pb="1.25rem">
            <Text fontFamily="ArchivoNarrow" fontSize="1rem" lineHeight="1.55" opacity={0.85} maxW="44rem">
              Full rules enforcement for Unmatched, in your browser. A referee server allows only legal moves, does the
              combat math for you, and keeps hands truly hidden. The free-form sandbox isn&apos;t going anywhere; Pro is
              an additional way to play.
            </Text>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="0.75rem" mt="1rem">
              {MODES.map((mode) => (
                <Box key={mode.title}>
                  <Text fontFamily="BebasNeueRegular" fontSize="1.15rem" letterSpacing="0.05em" color="brand.accent">
                    {mode.title}
                  </Text>
                  <Text fontFamily="ArchivoNarrow" fontSize="0.95rem" opacity={0.8} mt="0.15rem">
                    {mode.text}
                  </Text>
                </Box>
              ))}
            </Grid>

            <SectionHead mb="0.5rem">What&apos;s next</SectionHead>
            <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="0.75rem">
              {WHATS_NEXT.map((item) => (
                <Box key={item.tag}>
                  <Text fontFamily="SpaceGrotesk" fontSize="0.65rem" fontWeight={700} letterSpacing="0.18em" color="brand.accent" opacity={0.8}>
                    {item.tag}
                  </Text>
                  <Text fontFamily="ArchivoNarrow" fontSize="0.95rem" opacity={0.8} mt="0.15rem">
                    {item.text}
                  </Text>
                </Box>
              ))}
            </Grid>

            <Box as="section" aria-labelledby="pro-ai-deep-dive">
              <SectionHead id="pro-ai-deep-dive" mb="0.3rem">
                How the bots actually work
              </SectionHead>
              <Text fontFamily="ArchivoNarrow" fontSize="1rem" fontStyle="italic" opacity={0.75} maxW="44rem">
                No LLM, no cloud model — a search algorithm that plays out games in its head. Here&apos;s the real
                mechanism, in plain terms.
              </Text>
              <Grid as="ol" listStyleType="none" templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap="0.75rem" mt="1rem">
                {AI_DEEP_DIVE.map((beat) => (
                  <Box as="li" key={beat.title} {...CARD}>
                    <Text fontFamily="BebasNeueRegular" fontSize="1.15rem" letterSpacing="0.05em" lineHeight="1.15" color="brand.accent">
                      {beat.title}
                    </Text>
                    <Text fontFamily="ArchivoNarrow" fontSize="0.95rem" opacity={0.8} mt="0.35rem">
                      {beat.text}
                    </Text>
                  </Box>
                ))}
              </Grid>
            </Box>
          </Box>
        </Box>

        {/* footer */}
        <Text mt="1.25rem" fontFamily="SpaceGrotesk" fontSize="0.78rem" opacity={0.6} lineHeight="1.7">
          Itching for a deck that isn&apos;t converted yet? The{" "}
          <ChakraLink as={Link} href="/connect" textDecoration="underline" _hover={{ color: "brand.accent" }}>
            sandbox
          </ChakraLink>{" "}
          plays all 40+ decks today — it just trusts you with the rulebook. ·{" "}
          <ChakraLink as={Link} href="/pro/scenarios" textDecoration="underline" _hover={{ color: "brand.accent" }}>
            Scenarios
          </ChakraLink>
          {replaysEnabled && (
            <>
              {" · "}
              <ChakraLink as={Link} href="/pro/replays" textDecoration="underline" _hover={{ color: "brand.accent" }}>
                Replays
              </ChakraLink>
            </>
          )}
        </Text>
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
          previewEntry && {
            hp: previewEntry.listing.hp,
            move: previewEntry.listing.move,
            reach: previewEntry.listing.reach,
          }
        }
      />
    </Box>
  );
};

// ---------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------

type Cta = { label: string; href: string };

const Banner = ({
  kicker,
  title,
  text,
  art = null,
  primary,
  secondary,
  slides = 0,
  slide = 0,
  onSlide,
}: {
  kicker: string;
  title: string;
  text: string;
  art?: string | null;
  primary: Cta;
  secondary: Cta;
  slides?: number;
  slide?: number;
  onSlide?: (i: number) => void;
}) => (
  <Box
    as="section"
    aria-label={kicker}
    position="relative"
    mt="0.75rem"
    minH={{ base: "15rem", md: "16rem" }}
    display="flex"
    alignItems="flex-end"
    borderRadius="0.8rem"
    overflow="hidden"
    border="1px solid rgba(224,168,46,0.3)"
    bgColor="rgba(20,8,24,0.55)"
    bgImage={art ? `url("${art}")` : undefined}
    bgSize="cover"
    bgPos="center"
  >
    <Box
      position="absolute"
      inset="0"
      bg="linear-gradient(90deg, rgba(20,8,24,0.95) 0%, rgba(20,8,24,0.72) 50%, rgba(20,8,24,0.15) 100%)"
    />
    <Box position="relative" p={{ base: "1rem", md: "1.3rem" }} maxW="28rem">
      <Text fontFamily="SpaceGrotesk" fontSize="0.65rem" fontWeight={700} letterSpacing="0.2em" color="brand.accent" textTransform="uppercase">
        {kicker}
      </Text>
      <Text
        as="h2"
        fontFamily="LeagueGothic"
        textTransform="uppercase"
        fontSize={{ base: "2.6rem", md: "3.3rem" }}
        lineHeight="0.9"
        mt="0.3rem"
      >
        {title}
      </Text>
      <Text fontFamily="ArchivoNarrow" fontSize="1rem" lineHeight="1.4" opacity={0.9} mt="0.5rem">
        {text}
      </Text>
      <Flex gap="0.5rem" mt="0.9rem" flexWrap="wrap">
        <ChakraLink as={Link} href={primary.href} {...GOLD_BTN}>
          {primary.label}
        </ChakraLink>
        <ChakraLink as={Link} href={secondary.href} {...GHOST_BTN}>
          {secondary.label}
        </ChakraLink>
      </Flex>
    </Box>
    {slides > 1 && onSlide && (
      <Flex position="absolute" right="0.9rem" bottom="0.8rem" gap="0.3rem" role="group" aria-label="Featured updates">
        {Array.from({ length: slides }, (_, i) => (
          <Box
            key={i}
            as="button"
            type="button"
            aria-label={`Show update ${i + 1} of ${slides}`}
            aria-pressed={i === slide}
            onClick={() => onSlide(i)}
            w="1.3rem"
            h="0.5rem"
            display="flex"
            alignItems="center"
          >
            <Box w="100%" h="3px" borderRadius="2px" bg={i === slide ? "brand.accent" : "rgba(250,235,215,0.3)"} />
          </Box>
        ))}
      </Flex>
    )}
  </Box>
);

const Door = ({ href, title, sub, hot = false }: { href: string; title: string; sub: string; hot?: boolean }) => (
  <ChakraLink
    as={Link}
    href={href}
    display="block"
    p="0.45rem 0.65rem"
    borderRadius="0.5rem"
    bg="rgba(250,235,215,0.05)"
    border="1px solid"
    borderColor={hot ? "rgba(95,211,138,0.5)" : "rgba(250,235,215,0.12)"}
    _hover={{ borderColor: "brand.accent", textDecoration: "none" }}
    transition="border-color 0.15s"
  >
    <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.05em" lineHeight="1.1">
      {title}
    </Text>
    <Text fontFamily="SpaceGrotesk" fontSize="0.68rem" opacity={0.65}>
      {sub}
    </Text>
  </ChakraLink>
);

const FeedPost = ({
  entry,
  unseen,
  withDebug,
}: {
  entry: ChangelogEntry;
  unseen: boolean;
  withDebug: (href: string) => string;
}) => {
  const href = launcherCtaHref(entry);
  const poster = entry.video ? posterUrl(entry.video.slug) : null;
  const kind = entryKindLabel(entry);
  return (
    <Box
      as="li"
      position="relative"
      display="grid"
      gridTemplateColumns={poster ? "5.6rem 1fr" : "1fr"}
      gap="0.7rem"
      borderRadius="0.55rem"
      overflow="hidden"
      bg="rgba(250,235,215,0.05)"
      border="1px solid"
      borderColor={unseen ? "rgba(57,183,168,0.55)" : "rgba(250,235,215,0.12)"}
    >
      {poster && (
        <Box minH="5.2rem" bgColor="rgba(250,235,215,0.06)" bgImage={`url("${poster}")`} bgSize="cover" bgPos="center" aria-hidden />
      )}
      <Box py="0.55rem" pr="0.7rem" pl={poster ? 0 : "0.8rem"} minW={0}>
        <Flex gap="0.45rem" alignItems="center" fontFamily="SpaceGrotesk" fontSize="0.6rem" fontWeight={700} letterSpacing="0.14em">
          <Text
            px="0.3rem"
            borderRadius="0.2rem"
            bg={kind === "NEW FIGHTER" ? "rgba(224,168,46,0.2)" : "rgba(57,183,168,0.2)"}
            color={kind === "NEW FIGHTER" ? "brand.accent" : "#39B7A8"}
          >
            {kind}
          </Text>
          <Text opacity={0.55} fontWeight={500} letterSpacing="0.05em">
            {feedDate(entry.date)}
          </Text>
          {unseen && (
            <Text color="#39B7A8" letterSpacing="0.08em">
              NEW
            </Text>
          )}
        </Flex>
        <Text fontFamily="ArchivoNarrow" fontWeight={600} fontSize="1rem" lineHeight="1.2" mt="0.2rem">
          {entry.title}
        </Text>
        <Text fontFamily="ArchivoNarrow" fontSize="0.85rem" opacity={0.72} mt="0.1rem" noOfLines={2}>
          {entry.summary}
        </Text>
        {href && (
          <ChakraLink as={Link} href={withDebug(href)} display="inline-block" mt="0.25rem" fontFamily="SpaceGrotesk" fontSize="0.72rem" color="brand.accent">
            {entry.cta?.label ?? "Play now"} →
          </ChakraLink>
        )}
      </Box>
    </Box>
  );
};

/** A fighter's round token: card-back art when a tile entry has some, else its colour + initial. */
const Token = ({ entry, ring = false }: { entry: RosterEntry; ring?: boolean }) => {
  const art = entry.deck?.cardbackUrl;
  return (
    <Box
      w="1.9rem"
      h="1.9rem"
      flexShrink={0}
      borderRadius="full"
      border={ring ? "2px solid" : "1px solid"}
      borderColor={ring ? "brand.surfaceDim" : "rgba(250,235,215,0.2)"}
      bgColor={entry.deck?.highlightColour ?? DEFAULT_HIGHLIGHT}
      bgImage={art ? `url("${art}")` : undefined}
      bgSize="cover"
      bgPos="center"
      display="flex"
      alignItems="center"
      justifyContent="center"
      fontFamily="LeagueGothic"
      fontSize="1rem"
      title={entry.shortName}
      aria-hidden
    >
      {!art && entry.shortName.replace(/^the /i, "").charAt(0).toUpperCase()}
    </Box>
  );
};

const CardHead = ({ children, link }: { children: React.ReactNode; link?: Cta }) => (
  <Flex justifyContent="space-between" alignItems="baseline">
    <Text fontFamily="BebasNeueRegular" fontSize="1.25rem" letterSpacing="0.05em">
      {children}
    </Text>
    {link && (
      <ChakraLink as={Link} href={link.href} fontFamily="SpaceGrotesk" fontSize="0.7rem" color="brand.accent">
        {link.label}
      </ChakraLink>
    )}
  </Flex>
);

const SectionHead = ({
  children,
  mb = "1rem",
  id,
}: {
  children: React.ReactNode;
  mb?: string;
  id?: string;
}) => (
  <Text
    as="h2"
    id={id}
    fontFamily="BebasNeueRegular"
    fontSize={{ base: "1.5rem", md: "1.75rem" }}
    letterSpacing="0.06em"
    mt={id === "whats-new-head" ? 0 : "1.5rem"}
    mb={mb}
  >
    {children}
  </Text>
);

const DECK_BY_HERO_ID: Record<string, PopularDeckMeta> = Object.fromEntries(
  POPULAR_DECKS.flatMap((deck) => {
    const heroId = DECK_HERO_IDS[deck.id];
    return heroId ? [[heroId, deck] as const] : [];
  })
);
const deckForHeroId = (heroId: string): PopularDeckMeta | undefined =>
  DECK_BY_HERO_ID[heroId];

/** The boards the create screen's picker offers (hidden dev boards excluded). */
const PICKER_BOARDS = MAP_CATALOG.filter((entry) => !entry.hidden);

/** Parallel facts about what ships today — deliberately unnumbered (not a sequence). */
const MODES = [
  {
    title: "Three ways to fight",
    text: "Duel 1v1, 3-player free-for-all, and 2v2 teams. An optional 30/60/90s move timer keeps games brisk.",
  },
  {
    title: "Bots at four levels",
    text: "Warm up on Easy, spar Medium, grind Hard's Monte-Carlo search — or challenge Expert, an alpha search bot (ISMCTS) that beats Hard 8 times in 10 in simulation. Real players still beat it more often than not — it's the one we're actively training.",
  },
  {
    // Counted and named from MAP_CATALOG so the copy can't drift from the picker (#1353).
    title: `${PICKER_BOARDS.length} boards — or yours`,
    text: `${PICKER_BOARDS.map((board) => board.title).join(", ")} — or import a custom map.`,
  },
  {
    title: "Every match, a replay",
    text: "Finished games auto-save. Scrub them in god-view — every hand face-up — and share a replay code.",
  },
];

const WHATS_NEXT = [
  {
    tag: "BOT TRAINING",
    text: "Expert is live (alpha) and already tougher than Hard — but real duels expose real gaps: passive defense, missed schemes, deck-specific blind spots. We're closing them with real-game data, not more simulation.",
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

/**
 * "How the AI actually works" (#828). Player-facing, but every claim is checked
 * against the engine (unbrewed-engine): tiers and budgets from ai/registry.ts
 * (easy=random, medium=mc@16, hard=mc@64, expert=ismcts@512, ~1.5s/decision);
 * 82.6% is expert@512 vs hard-64 (#239 arm6); the honesty mechanism is
 * docs/plans/ai-player.md §1/§3; the human numbers (447 of 638 decided duels
 * won by humans) and the weaknesses come from the 2026-09-09 human-telemetry
 * report (F2/F5/F7/F8). Two things the copy must NOT claim: the ISMCTS tree is
 * discarded after every decision (ismctsBot.ts §7 — it doesn't carry anything
 * between moves), and the shuffle-the-hand honesty A/B is designed but still
 * listed as deferred, so it's described as the test, not as a result.
 */
const AI_DEEP_DIVE = [
  {
    title: "Four tiers, one codebase — tuned by how hard it thinks",
    text: "Easy picks a legal move at random. Medium and Hard run the same search — Monte Carlo simulation — just with a bigger budget: Hard mentally plays out roughly 4x more games than Medium before it moves. Expert (alpha) runs a different, smarter search called ISMCTS on about the same time budget as Hard, which is why it's stronger without being slower.",
  },
  {
    title: "What “Monte Carlo simulation” means",
    text: "Before Medium or Hard commits to a move, it doesn't calculate a “best” answer directly — it guesses. For every move it's allowed to make, it plays out dozens of quick, semi-random games to the end (or close to it) and checks who tends to win. The move that wins the most imagined games is the one it actually plays.",
  },
  {
    title: "What makes Expert different: it thinks in lines, not single moves",
    text: "Medium and Hard judge each possible move on its own: try it, play out a game, score it. Expert builds a search tree — ISMCTS, “Information Set Monte Carlo Tree Search” — that branches into the follow-ups too: this move, then that one, then the next. Its imagined games feed back into the tree, so it spends its thinking on the lines that keep looking promising and can spot plays that only pay off a few moves later. In testing, Expert beat Hard in 82.6% of games at about the same time per move (~1.5 seconds) — it wins by thinking better, not longer.",
  },
  {
    title: "It can't peek at your hand — here's how that's enforced",
    text: "Unmatched runs on hidden information: face-down cards, hidden hands, shuffled decks. Before every decision, the bot takes only what it's actually allowed to know — your hand's size, not its contents; both discard piles; whatever has been revealed — and invents a plausible version of the hidden parts, a technique called “determinization.” It plays out its imagined games against that invented hand, never your real one, and the code only lets the bot see hidden cards through that invention step. The test that proves it is simple: shuffle the opponent's real hand before every bot decision. A bot that was peeking gets measurably worse; an honest one doesn't even notice.",
  },
  {
    title: "The honest gap: it's stronger against bots than against you",
    text: "Expert crushes Hard in simulation, but real players still beat Expert about 7 times in 10. That's not a contradiction — Expert's weaknesses are human-shaped, not bot-shaped. It defends more than winning players do (they'll take a hit to keep a good card), it's slower to commit to scheme-based plays than good players are, and it doesn't always catch the deck-specific tells experienced players exploit on sight. Bot-vs-bot testing never surfaces that, because bots don't play those angles either.",
  },
  {
    title: "What we're doing about it",
    text: "Rather than chase a bigger search budget — expensive, and not the actual gap — we're using real games to find and fix the patterns above, starting with capturing full replays of live human-vs-bot matches, so tuning is driven by how people actually beat it rather than by simulated self-play. That work is under way now.",
  },
];
