/**
 * The presence pill at the right end of `/pro/game`'s rules strip (issue #1542):
 * "7 here · 3 looking" with a stacked avatar row and a live dot. Without lobby
 * presence it reads "3 looking" alone. The page mounts it only when
 * `presencePillModel` returns a model (never an empty box).
 */
import { Box, Flex, keyframes, Text } from "@chakra-ui/react";
import { AvatarDisc } from "@/components/Pro/LobbyRibbon";
import type { PresencePillModel } from "@/lib/pro/quickPlayLobby";

const pulse = keyframes`0%,100% { opacity: 1 } 50% { opacity: .35 }`;

export const PresencePill = ({ model }: { model: PresencePillModel }) => (
  <Flex
    data-testid="presence-pill"
    align="center"
    gap="0.6rem"
    h="24px"
    pl="0.7rem"
    pr={model.avatars.length > 0 ? "0.25rem" : "0.7rem"}
    borderRadius="999px"
    border="1px solid"
    borderColor="rgba(57,183,168,0.45)"
    bg="rgba(57,183,168,0.08)"
    fontFamily="SpaceGrotesk"
    fontSize="0.72rem"
    whiteSpace="nowrap"
  >
    <Box
      as="span"
      w="7px"
      h="7px"
      borderRadius="50%"
      bg="brand.positive"
      boxShadow="0 0 8px #2F9E68"
      sx={{ animation: `${pulse} 1.6s ease-in-out infinite`, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
    />
    <Text as="span">
      {model.here !== null && (
        <>
          <Box as="b" color="#39B7A8" fontWeight={600}>
            {model.here} here
          </Box>
          {" · "}
        </>
      )}
      <Box as="span" color="brand.accent" fontWeight={600}>
        {model.looking} looking
      </Box>
    </Text>
    {model.avatars.length > 0 && (
      <Flex as="span" align="center">
        {model.avatars.map((a, i) => (
          <Box as="span" key={a.key} ml={i === 0 ? 0 : "-7px"}>
            <AvatarDisc avatar={a} size={20} ring="#2C1831" />
          </Box>
        ))}
        {model.overflow > 0 && (
          <Box as="span" ml="-7px">
            <AvatarDisc
              avatar={{ key: "more", initial: `+${model.overflow}`, colour: "#444", title: `${model.overflow} more` }}
              size={20}
              ring="#2C1831"
            />
          </Box>
        )}
      </Flex>
    )}
  </Flex>
);
