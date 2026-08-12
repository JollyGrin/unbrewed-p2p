/**
 * The "these numbers are for fun" line every PUBLIC stats surface carries
 * (issue #590) — the leaderboard and other players' profiles.
 *
 * It is on the public pages and not on your own /account for a reason. Your own
 * record is a shelf of things you did; a ranked board invites a stranger to
 * read it as a claim about who is better, and it can't support that. Seat
 * identity is client-claimed and UNVERIFIED (engine #345 / #344: the display
 * name and player id ride the join message and nothing checks them), so the
 * honest framing is a trophy cabinet, not a ladder.
 *
 * Deliberately one quiet sentence rather than a warning box: it should read as
 * the site being straight with you, not as a disclaimer somebody's lawyer
 * asked for.
 */
import { Text } from "@chakra-ui/react";

export const STATS_CAVEAT =
  "These numbers are for fun. Seats are claimed by the player's own browser and nothing verifies them, so treat this as a trophy shelf rather than a competitive ranking.";

export const StatsCaveat = (props: React.ComponentProps<typeof Text>) => (
  <Text
    data-testid="stats-caveat"
    fontSize="0.78rem"
    opacity={0.6}
    lineHeight="1.4"
    {...props}
  >
    {STATS_CAVEAT}
  </Text>
);
