import { Box, Flex } from "@chakra-ui/react";
import { ENEMY_LOOK, type EnemyRole } from "@/lib/pro/enemyLook";

/**
 * An enemy's face: its initial on the role's ring (`ENEMY_LOOK`: solid ivory-on-crimson villain,
 * dashed salmon minion). No enemy art exists client-side yet
 * (unbrewed-p2p#1104), so `src` is the slot for it — pass the image URL once it lands and
 * the initial steps aside. Never point this at third-party fan art.
 */
export const EnemyToken = ({
  name,
  src = null,
  size = "2.4rem",
  villain = false,
  role,
}: {
  name: string;
  /** enemy art URL (#1104); null/absent → the initial */
  src?: string | null;
  size?: string;
  villain?: boolean;
  /** wins over `villain` */
  role?: EnemyRole;
}) => {
  const resolved: EnemyRole = role ?? (villain ? "VILLAIN" : "MINION");
  const look = ENEMY_LOOK[resolved];
  return (
  <Flex
    data-enemy-role={resolved}
    data-testid="enemy-token"
    w={size}
    h={size}
    flexShrink={0}
    align="center"
    justify="center"
    borderRadius="50%"
    overflow="hidden"
    border={`2px ${look.ringStyle} ${look.ring}`}
    bg={look.plate}
    color={look.ink}
    fontFamily="BebasNeueRegular"
    fontSize="1.15rem"
    aria-hidden
  >
    {src ? <Box as="img" src={src} alt="" w="100%" h="100%" objectFit="cover" /> : (name.trim()[0] ?? "?").toUpperCase()}
  </Flex>
  );
};

/** The role pill: a filled ivory-on-crimson VILLAIN, an outlined dashed-pill MINION. */
export const EnemyRoleBadge = ({ role }: { role: EnemyRole }) => {
  const look = ENEMY_LOOK[role];
  const villain = role === "VILLAIN";
  return (
    <Box
      as="span"
      data-testid="enemy-role-badge"
      data-enemy-role={role}
      display="inline-block"
      px="0.3rem"
      borderRadius={villain ? "sm" : "999px"}
      border={`1px ${look.ringStyle} ${look.ring}`}
      bg={villain ? look.plate : "transparent"}
      color={look.ink}
      fontFamily="SpaceGrotesk"
      fontSize="0.5rem"
      fontWeight="bold"
      letterSpacing="0.14em"
      lineHeight="1.5"
    >
      {look.label}
    </Box>
  );
};
