import { Box, Flex } from "@chakra-ui/react";

/**
 * An enemy's face: its initial on an enemy-red ring. No enemy art exists client-side yet
 * (unbrewed-p2p#1104), so `src` is the slot for it — pass the image URL once it lands and
 * the initial steps aside. Never point this at third-party fan art.
 */
export const EnemyToken = ({
  name,
  src = null,
  size = "2.4rem",
  villain = false,
}: {
  name: string;
  /** enemy art URL (#1104); null/absent → the initial */
  src?: string | null;
  size?: string;
  villain?: boolean;
}) => (
  <Flex
    data-testid="enemy-token"
    w={size}
    h={size}
    flexShrink={0}
    align="center"
    justify="center"
    borderRadius="50%"
    overflow="hidden"
    border={villain ? "2px solid #E58B8B" : "2px solid rgba(229,139,139,0.5)"}
    bg="rgba(180,60,60,0.28)"
    color="#F2A3A3"
    fontFamily="BebasNeueRegular"
    fontSize="1.15rem"
    aria-hidden
  >
    {src ? <Box as="img" src={src} alt="" w="100%" h="100%" objectFit="cover" /> : (name.trim()[0] ?? "?").toUpperCase()}
  </Flex>
);
