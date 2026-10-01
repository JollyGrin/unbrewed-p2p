/**
 * Adventure end screen body (#1159): the "why" under the verdict headline — what happened,
 * the breakout timeline ("how it happened"), and where the threat came from. Presentation
 * only; every string comes from `lib/pro/adventureVerdict`.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import type { AdventureVerdictModel } from "@/lib/pro/adventureVerdict";

export const AdventureVerdictBody = ({ model, narrow = false }: { model: AdventureVerdictModel; narrow?: boolean }) => (
  <Flex direction="column" align="center" gap="0.35rem" maxW="34rem" textAlign="center" data-testid="adventure-verdict">
    {model.kicker && (
      <Text fontSize="0.7rem" letterSpacing="0.2em" fontWeight={700} color="brand.parchment" opacity={0.7}>
        {model.kicker}
      </Text>
    )}
    {model.lines.map((line) => (
      <Text key={line} fontSize={narrow ? "0.85rem" : "0.95rem"} color="brand.parchment">
        {line}
      </Text>
    ))}
    {model.releases.length > 0 && (
      <Box w="100%">
        <Text fontSize="0.65rem" letterSpacing="0.18em" fontWeight={700} opacity={0.65} color="brand.parchment" mb="0.25rem">
          HOW IT HAPPENED
        </Text>
        <Flex gap="0.4rem" justify="center" wrap="wrap">
          {model.releases.map((t, i) => (
            <Box
              key={i}
              data-final={t.final ? "true" : undefined}
              px="0.6rem"
              py="0.35rem"
              minW="6.5rem"
              borderRadius="md"
              border="1px solid"
              borderColor={t.final ? "red.300" : "whiteAlpha.300"}
              bg={t.final ? "rgba(166,28,36,0.35)" : "blackAlpha.400"}
              fontSize="0.75rem"
              color="brand.parchment"
              textAlign="left"
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
    )}
    {model.facts.map((f) => (
      <Text key={f.label} fontSize="0.78rem" color="brand.parchment" opacity={0.9}>
        <Text as="span" fontWeight={700} opacity={0.75}>{f.label}: </Text>
        {f.text}
      </Text>
    ))}
  </Flex>
);
