/**
 * Adventure end screen (#1159, full-screen per the approved mockup in #1182): the verdict
 * and WHY over the whole table, not inside the Actions dock. "View the board" puts it away
 * to inspect the final position; a chip brings it back. Mounted by `FormatEndScreen` for the
 * whole game, so it can record the round each fighter fell ("defeated R6").
 *
 * No "try again": the rematch ruling refuses a rematch at co-op tables today, so the button
 * would dangle above a refusal. Re-add it here if the ruling changes.
 */
import { Box, Button, Flex, Grid, Link, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { TbExternalLink, TbLink, TbMap, TbPlus, TbTrophy } from "react-icons/tb";
import { adventureVerdictModel, trackDefeatRounds } from "@/lib/pro/adventureVerdict";
import type { AdventureVerdictModel } from "@/lib/pro/adventureVerdict";
import { isViewerOnWinningTeam } from "@/lib/pro/teams";
import type { FighterId, GameEvent, PlayerView } from "@/lib/pro/protocol";
import type { FormatEndScreenProps } from "./FormatEndScreen";

/** Above the dock, HUD and board overlays; below Chakra's modals (1400) and the breakout (1480). */
export const ADVENTURE_END_Z = 1300;

const LBL = { fontFamily: "SpaceGrotesk", fontSize: "0.68rem", letterSpacing: "0.2em", fontWeight: 700 } as const;
const ROSE = "#E58B8B";

/** The round each fighter fell, across STATE batches. */
export const useDefeatRounds = (view: PlayerView, events: readonly GameEvent[] | undefined): Readonly<Record<FighterId, number>> => {
  const [rounds, setRounds] = useState<Readonly<Record<FighterId, number>>>({});
  useEffect(() => {
    if (view.scenario && events) setRounds((cur) => trackDefeatRounds(cur, events, view.initiative?.round));
  }, [view, events]);
  return rounds;
};

const ReleaseTiles = ({ model }: { model: AdventureVerdictModel }) => (
  <Box>
    <Text {...LBL} color="brand.parchment" opacity={0.7} mb="0.5rem">
      HOW IT HAPPENED
    </Text>
    <Flex gap="0.6rem" wrap="wrap">
      {model.releases.map((t, i) => (
        <Box
          key={i}
          data-final={t.final ? "true" : undefined}
          px="0.8rem"
          py="0.6rem"
          minW="9rem"
          borderRadius="10px"
          border="1px solid"
          borderColor={t.final ? ROSE : "whiteAlpha.300"}
          bg={t.final ? "rgba(166,28,36,0.35)" : "blackAlpha.400"}
          fontSize="0.8rem"
          color="brand.parchment"
        >
          <Text fontWeight={700}>
            Round {t.round} · enclosure {t.enclosure}
          </Text>
          {t.final ? (
            <Text color="red.200">game over</Text>
          ) : (
            <Text>
              {t.enemyName} released
              {t.defeatedRound != null && <Text as="span" color="green.300"> — defeated R{t.defeatedRound}</Text>}
            </Text>
          )}
        </Box>
      ))}
    </Flex>
  </Box>
);

const LINK_BTN = {
  minH: "2.75rem",
  w: "100%",
  bg: "rgba(20,8,24,0.72)",
  color: "brand.parchment",
  border: "1px solid rgba(231,204,152,0.25)",
  fontWeight: 600,
  gap: "0.4rem",
  _hover: { bg: "rgba(20,8,24,0.9)", color: "brand.accent", textDecoration: "none" },
} as const;

export const AdventureEndScreen = ({ view, events, replayHref, onCopyShareLink, shareLinkBusy }: FormatEndScreenProps) => {
  const defeatRounds = useDefeatRounds(view, events);
  const [hidden, setHidden] = useState(false);
  const model = adventureVerdictModel(view, defeatRounds);
  if (!model) return null;
  const headline = model.explained ? model.headline : isViewerOnWinningTeam(view) ? "VICTORY!" : "DEFEAT";
  if (hidden)
    return (
      <Button
        data-testid="adventure-end-show"
        position="fixed"
        bottom="1rem"
        left="50%"
        transform="translateX(-50%)"
        zIndex={ADVENTURE_END_Z}
        size="sm"
        bg="brand.accent"
        color="brand.surfaceDim"
        leftIcon={<TbTrophy />}
        _hover={{ bg: "brand.accentDeep" }}
        onClick={() => setHidden(false)}
      >
        {headline} — show the result
      </Button>
    );
  return (
    <Box
      data-testid="adventure-end-screen"
      role="dialog"
      aria-label={headline}
      position="fixed"
      inset="0"
      zIndex={ADVENTURE_END_Z}
      overflowY="auto"
      color="brand.parchment"
      bg="linear-gradient(180deg, rgba(76,38,94,0.97) 0%, rgba(58,26,74,0.94) 60%, rgba(40,16,52,0.88) 100%)"
      px={{ base: "1rem", md: "5rem" }}
      py={{ base: "1.5rem", md: "4rem" }}
    >
      <Grid
        data-testid="adventure-verdict"
        maxW="84rem"
        mx="auto"
        templateColumns={{ base: "1fr", lg: "minmax(0,1fr) 19rem" }}
        gap={{ base: "1.5rem", lg: "3rem" }}
        alignItems="start"
      >
        <Flex direction="column" gap="0.75rem" minW={0}>
          {model.kicker && (
            <Text {...LBL} color={ROSE}>
              {model.kicker}
            </Text>
          )}
          <Text
            data-testid="adventure-end-headline"
            fontFamily="LeagueGothic"
            fontSize={{ base: "3.5rem", md: "7rem" }}
            lineHeight="0.95"
            letterSpacing="0.02em"
          >
            {headline}
          </Text>
          {model.lines.map((line) => (
            <Text key={line} fontSize={{ base: "1rem", md: "1.35rem" }} maxW="48rem">
              {line}
            </Text>
          ))}
        </Flex>
        <Flex direction="column" gap="0.6rem">
          {replayHref && (
            <Button as={Link} href={replayHref} {...LINK_BTN}>
              Watch the replay <TbExternalLink size="0.9rem" />
            </Button>
          )}
          {onCopyShareLink && (
            <Button {...LINK_BTN} isLoading={shareLinkBusy} onClick={onCopyShareLink}>
              <TbLink size="0.9rem" /> Copy share link
            </Button>
          )}
          <Button as={Link} href="/pro/game" {...LINK_BTN}>
            <TbPlus size="0.9rem" /> Back to lobby
          </Button>
          <Button data-testid="adventure-end-hide" {...LINK_BTN} onClick={() => setHidden(true)}>
            <TbMap size="0.9rem" /> View the board
          </Button>
        </Flex>
        {model.releases.length > 0 && (
          <Box gridColumn={{ lg: "1 / -1" }} mt={{ base: 0, md: "1.5rem" }}>
            <ReleaseTiles model={model} />
          </Box>
        )}
        {model.facts.length > 0 && (
          <Flex gridColumn={{ lg: "1 / -1" }} gap="0.75rem" wrap="wrap" mt={{ base: 0, md: "1rem" }}>
            {model.facts.map((f) => (
              <Box
                key={f.label}
                flex="1 1 16rem"
                maxW={{ md: "24rem" }}
                bg="#F6E7D2"
                color="#2A1630"
                borderRadius="10px"
                px="1rem"
                py="0.9rem"
              >
                <Text {...LBL} fontSize="0.62rem" mb="0.35rem" opacity={0.8}>
                  {f.label.toUpperCase()}
                </Text>
                <Text fontSize="0.95rem">{f.text}</Text>
              </Box>
            ))}
          </Flex>
        )}
      </Grid>
    </Box>
  );
};
