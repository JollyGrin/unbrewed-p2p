/**
 * /leaderboard — the public board (issue #590).
 *
 * Public and sign-in-free: one `GET /leaderboard`, no cookie, no probe of its
 * own. The API ranks (XP desc, wins then username as tie-breaks) and sends the
 * rank per row; this file renders that order verbatim rather than re-sorting,
 * because the only thing a second opinion here could do is disagree with the
 * number printed beside each player.
 *
 * Every row links to `/stats?u=<username>` — the same profile view /account
 * renders for you — and a signed-in viewer's own row is marked, which is the
 * one piece of personalisation on the page.
 *
 * The board is a claim about people, so it carries the caveat (see
 * StatsCaveat): seat identity is client-claimed and unverified, and these
 * numbers are a trophy shelf rather than a ladder.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { FaDiscord } from "react-icons/fa";

import { badgeArtName, BadgeGlyph, isKnownBadge } from "@/components/Badges/BadgeGlyph";
import { AccountShell, Panel } from "@/components/Account/Shell";
import { StatsCaveat } from "@/components/Account/StatsCaveat";
import { relativeDate } from "@/lib/account/gameHistory";
import { LeaderboardRow } from "@/lib/account/leaderboard";
import { profileHref } from "@/lib/account/publicProfile";
import { useAccount } from "@/lib/account/useAccount";
import { useLeaderboard } from "@/lib/account/useLeaderboard";

const BORDER = "1px solid rgba(72, 40, 79, 0.15)";

const HeadCell = (props: React.ComponentProps<typeof Box>) => (
  <Box
    as="th"
    scope="col"
    textAlign="right"
    fontFamily="ArchivoNarrow"
    fontWeight={400}
    fontSize="0.7rem"
    letterSpacing="0.06em"
    textTransform="uppercase"
    opacity={0.6}
    py="0.4rem"
    px="0.4rem"
    whiteSpace="nowrap"
    {...props}
  />
);

const Cell = (props: React.ComponentProps<typeof Box>) => (
  <Box
    as="td"
    textAlign="right"
    py="0.45rem"
    px="0.4rem"
    borderBottom={BORDER}
    fontSize="0.85rem"
    whiteSpace="nowrap"
    {...props}
  />
);

const Avatar = ({ url, name }: { url: string | null; name: string }) =>
  url ? (
    // Plain <img>, not next/image: statically exported, so no optimizer, and
    // the Discord CDN host would need config. Decorative — the name is beside it.
    <Box
      as="img"
      data-testid="leaderboard-avatar"
      src={url}
      alt=""
      boxSize="1.6rem"
      borderRadius="full"
      objectFit="cover"
      flexShrink={0}
    />
  ) : (
    <Box
      boxSize="1.6rem"
      borderRadius="full"
      bg="rgba(72, 40, 79, 0.15)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      aria-hidden
      title={name}
    >
      <FaDiscord size="0.9rem" />
    </Box>
  );

const Row = ({ row, isSelf }: { row: LeaderboardRow; isSelf: boolean }) => (
  <Box
    as="tr"
    data-testid="leaderboard-row"
    data-self={isSelf ? "true" : undefined}
    bg={isSelf ? "rgba(72, 40, 79, 0.1)" : undefined}
    _hover={{ bg: "rgba(72, 40, 79, 0.06)" }}
  >
    <Cell textAlign="right" fontFamily="LeagueGothic" fontSize="1.2rem" opacity={0.8}>
      {row.rank}
    </Cell>
    <Cell textAlign="left" w="100%" minW="10rem" whiteSpace="normal">
      <Flex align="center" gap="0.5rem" minW={0}>
        <Avatar url={row.avatarUrl} name={row.username} />
        <Text
          as={NextLink}
          href={profileHref(row.username)}
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          overflow="hidden"
          textOverflow="ellipsis"
          _hover={{ textDecoration: "underline" }}
        >
          {row.username}
        </Text>
        {/* Only art this build knows: the badge id is an unverified string from
            a public payload, exactly like the HUD's (#347), so an id we have no
            glyph for renders nothing rather than a fallback shape. */}
        {isKnownBadge(row.selectedBadge) && row.selectedBadge ? (
          <BadgeGlyph
            id={row.selectedBadge}
            size="1.1rem"
            title={badgeArtName(row.selectedBadge)}
          />
        ) : null}
        {isSelf ? (
          <Text
            fontFamily="ArchivoNarrow"
            fontSize="0.62rem"
            letterSpacing="0.08em"
            textTransform="uppercase"
            opacity={0.7}
          >
            You
          </Text>
        ) : null}
      </Flex>
    </Cell>
    <Cell fontFamily="LeagueGothic" fontSize="1.2rem">
      {/* Level 0 is real; null means the API didn't send one. */}
      {row.level === null ? "—" : row.level}
    </Cell>
    <Cell>{row.xp.toLocaleString()}</Cell>
    <Cell display={{ base: "none", sm: "table-cell" }}>{row.wins}</Cell>
    <Cell display={{ base: "none", sm: "table-cell" }}>{row.gamesPlayed}</Cell>
  </Box>
);

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="0.88rem" opacity={0.75} py="0.6rem">
    {children}
  </Text>
);

export const LeaderboardPage = () => {
  const { status, board } = useLeaderboard();
  // Only to mark your own row. The probe is the navbar chip's — already in
  // flight on every page — so this page still costs one leaderboard request.
  const { account } = useAccount();
  const me = account?.username.toLowerCase() ?? null;
  // "" for a stamp we couldn't parse — say nothing rather than "Updated .".
  const updated = board?.generatedAt ? relativeDate(board.generatedAt) : "";

  return (
    <AccountShell
      seo={{
        path: "/leaderboard",
        title: "Leaderboard | Unbrewed",
        description:
          "The Unbrewed leaderboard: levels, XP and win counts from finished Pro games.",
      }}
      maxW="56rem"
    >
      <Panel as="section" aria-labelledby="leaderboard-heading">
        <Text
          id="leaderboard-heading"
          as="h1"
          fontFamily="LeagueGothic"
          fontSize="2rem"
          lineHeight="1.05"
        >
          Leaderboard
        </Text>
        <Text fontSize="0.8rem" opacity={0.65} mb="0.7rem">
          Everyone who has finished a Pro game while signed in, by XP.
          {updated ? ` Updated ${updated}.` : null}
        </Text>

        {status === "loading" ? <Quiet>Counting everyone up…</Quiet> : null}

        {status === "unavailable" ? (
          <Quiet>
            The leaderboard is unavailable right now. Everything else on
            Unbrewed works as usual — try again later.
          </Quiet>
        ) : null}

        {status === "ready" && board && board.players.length === 0 ? (
          <Quiet>
            Nobody is on the board yet. Play a Pro game while signed in and
            you&apos;ll be the first.
          </Quiet>
        ) : null}

        {board && board.players.length > 0 ? (
          // The table scrolls inside its own box rather than pushing the page
          // sideways on a phone.
          <Box overflowX="auto">
            <Box as="table" w="100%" style={{ borderCollapse: "collapse" }}>
              <Box as="thead">
                <Box as="tr" borderBottom={BORDER}>
                  <HeadCell>#</HeadCell>
                  <HeadCell textAlign="left">Player</HeadCell>
                  <HeadCell>Level</HeadCell>
                  <HeadCell>XP</HeadCell>
                  <HeadCell display={{ base: "none", sm: "table-cell" }}>
                    Wins
                  </HeadCell>
                  <HeadCell display={{ base: "none", sm: "table-cell" }}>
                    Games
                  </HeadCell>
                </Box>
              </Box>
              <Box as="tbody">
                {board.players.map((row) => (
                  <Row
                    key={row.username}
                    row={row}
                    isSelf={me !== null && row.username.toLowerCase() === me}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        ) : null}

        <StatsCaveat mt="0.9rem" />
      </Panel>
    </AccountShell>
  );
};
