/**
 * `/tournaments?t=<slug>&m=<matchId>` placeholder until the match page
 * (#1218) lands: the bracket links here, so the link must resolve.
 */
import { Box, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import { matchHref } from "@/lib/tournaments/bracket";
import { tournamentPath } from "@/lib/tournaments/share";

import { Btn, Card, Page } from "./ui";

export const MatchStub = ({ slug, matchId }: { slug: string; matchId: string }) => (
  <Page
    title="Match"
    path={matchHref(slug, matchId)}
    eyebrow={<><NextLink href="/tournaments">Tournaments</NextLink> / <NextLink href={tournamentPath(slug)}>Bracket</NextLink></>}
    heading="Match"
  >
    <Card p="20px" maxW="32rem" data-testid="match-stub">
      <Text fontWeight={700}>The match page is on its way.</Text>
      <Text fontSize="14px" opacity={0.8} mt="6px">
        Ready-checks, the Play button and results for this match will live here. For now, follow it on the bracket.
      </Text>
      <Box mt="14px"><Btn href={tournamentPath(slug)} variant="ink">Back to the bracket</Btn></Box>
    </Card>
  </Page>
);
