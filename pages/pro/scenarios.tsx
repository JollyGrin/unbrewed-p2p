/**
 * /pro/scenarios — public, unlinked catalogue of curated server-side replay
 * vectors. The client only displays scenario metadata and precomputed God-view
 * frames; the private Pro server still owns all rules execution.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Spinner,
  Tag,
  Text,
  useToast,
} from "@chakra-ui/react";
import { TbPlayerPlay, TbRefresh } from "react-icons/tb";
import { ReplayScrubber } from "@/components/Pro/ReplayScrubber";
import type { ReplayExpansion } from "@/lib/pro/protocol";
import {
  fetchScenarioCatalogue,
  fetchScenarioReplay,
  type ScenarioSummary,
} from "@/lib/pro/scenariosApi";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
const BTN = { size: "sm" as const, bg: "whiteAlpha.200", color: "brand.parchment", _hover: { bg: "whiteAlpha.400" } };
const BTN_GOLD = { ...BTN, bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accentDeep" } };

const groupByDeck = (scenarios: ScenarioSummary[]) => {
  const buckets = new Map<string, ScenarioSummary[]>();
  for (const scenario of scenarios) {
    const key = scenario.deckId;
    const next = buckets.get(key) ?? [];
    next.push(scenario);
    buckets.set(key, next);
  }
  return [...buckets.entries()];
};

const ScenarioCard = ({
  scenario,
  busy,
  onRun,
}: {
  scenario: ScenarioSummary;
  busy: boolean;
  onRun: () => void;
}) => (
  <Box
    bg="rgba(20,8,24,0.5)"
    border="1px solid"
    borderColor="whiteAlpha.200"
    borderRadius="0.65rem"
    p="0.75rem"
    minH="12rem"
    display="flex"
    flexDirection="column"
    gap="0.55rem"
  >
    <Box flex="1" minW={0}>
      <Text fontFamily="BebasNeueRegular" fontSize="1.05rem" letterSpacing="0.04em" lineHeight="1.05" noOfLines={2}>
        {scenario.title}
      </Text>
      <Text opacity={0.75} fontSize="0.78rem" mt="0.35rem" noOfLines={3}>
        {scenario.description}
      </Text>
      <Flex gap="0.25rem" flexWrap="wrap" mt="0.55rem">
        {scenario.tags.slice(0, 3).map((tag) => (
          <Tag key={tag} size="sm" bg="whiteAlpha.200" color="brand.parchment" fontSize="0.65rem" minH="1.25rem">
            {tag}
          </Tag>
        ))}
        {scenario.tags.length > 3 && (
          <Tag size="sm" bg="whiteAlpha.100" color="brand.parchment" fontSize="0.65rem" minH="1.25rem">
            +{scenario.tags.length - 3}
          </Tag>
        )}
      </Flex>
    </Box>

    <Flex justify="space-between" align="center" gap="0.5rem">
      <Box fontSize="0.68rem" opacity={0.62} minW={0}>
        <Text>{scenario.actionCount} actions</Text>
        <Text fontFamily="monospace" noOfLines={1}>{scenario.expectedFinalHash}</Text>
      </Box>
      <Button {...BTN_GOLD} size="xs" flexShrink={0} leftIcon={<TbPlayerPlay />} isLoading={busy} onClick={onRun}>
        Run
      </Button>
    </Flex>
  </Box>
);

const ScenariosPageBody = () => {
  const toast = useToast();
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expansion, setExpansion] = useState<ReplayExpansion | null>(null);

  const decks = useMemo(() => groupByDeck(scenarios), [scenarios]);

  const loadCatalogue = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const res = await fetchScenarioCatalogue({ signal });
    if (signal?.aborted) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setScenarios(res.scenarios);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadCatalogue(controller.signal);
    return () => controller.abort();
  }, [loadCatalogue]);

  const runScenario = useCallback(
    async (scenario: ScenarioSummary) => {
      setBusyId(scenario.id);
      const res = await fetchScenarioReplay(scenario.id);
      setBusyId(null);
      if (!res.ok) {
        toast({ title: "Couldn't load scenario", description: res.message, status: "error", duration: 7000 });
        return;
      }
      setExpansion(res.expansion);
    },
    [toast],
  );

  if (expansion) {
    return <ReplayScrubber expansion={expansion} onExit={() => setExpansion(null)} exitLabel="← back to scenarios" />;
  }

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment" px={{ base: "1rem", md: "2rem" }} py="2.5rem">
      <Flex direction="column" maxW="58rem" mx="auto" gap="1.5rem">
        <Flex justify="space-between" align="flex-end" flexWrap="wrap" gap="1rem">
          <Box>
            <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem">
              SCENARIOS
            </Heading>
            <Text opacity={0.78} fontSize="0.92rem" maxW="42rem">
              Fixed Pro test vectors, expanded by the server through the current rules engine. Use these to visually confirm card behavior, prompts, movement, and animation timing.
            </Text>
          </Box>
          <Button {...BTN} leftIcon={<TbRefresh />} onClick={() => loadCatalogue()} isLoading={loading}>
            Refresh
          </Button>
        </Flex>

        {loading ? (
          <Flex justify="center" py="5rem"><Spinner color="brand.accent" /></Flex>
        ) : error ? (
          <Box bg="rgba(20,8,24,0.5)" border="1px solid" borderColor="#E06A5E" borderRadius="0.7rem" p="1rem">
            <Text color="#E06A5E" fontWeight="bold">Couldn&apos;t load scenarios</Text>
            <Text fontSize="0.86rem" opacity={0.8} mt="0.35rem">{error}</Text>
          </Box>
        ) : decks.length === 0 ? (
          <Flex direction="column" align="center" gap="0.75rem" py="4rem" opacity={0.7}>
            <Text>No scenarios published yet.</Text>
          </Flex>
        ) : (
          <Grid gap="1.5rem">
            {decks.map(([deckId, deckScenarios]) => (
              <Box key={deckId}>
                <Flex align="baseline" gap="0.5rem" mb="0.65rem">
                  <Heading fontFamily="BebasNeueRegular" fontWeight="normal" letterSpacing="0.04em" fontSize="1.6rem">
                    {deckScenarios[0]?.deckName ?? deckId}
                  </Heading>
                  <Text fontSize="0.75rem" opacity={0.58}>{deckScenarios.length} scenario{deckScenarios.length === 1 ? "" : "s"}</Text>
                </Flex>
                <Grid templateColumns={{ base: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }} gap="0.7rem">
                  {deckScenarios.map((scenario) => (
                    <ScenarioCard
                      key={scenario.id}
                      scenario={scenario}
                      busy={busyId === scenario.id}
                      onRun={() => runScenario(scenario)}
                    />
                  ))}
                </Grid>
              </Box>
            ))}
          </Grid>
        )}
      </Flex>
    </Box>
  );
};

const ScenariosPage = () => (
  <>
    <Head>
      <title>Unbrewed Pro — Scenarios</title>
    </Head>
    <ScenariosPageBody />
  </>
);

export default ScenariosPage;
