/**
 * The "Here now" ribbon (issue #1542): one horizontally scrolling row between the
 * roster header and the tiles on `/pro/game`. Gold chips are open lobbies (each
 * with an inline Join), dim chips are players on the page (each with a 👋 when the
 * lobby socket is up), a dashed tail counts tables in play, and a skewed gold tag
 * at the right end advertises the Quick Play bonus while it runs.
 *
 * Pure presentation: the chip list, labels and ordering come from
 * `lib/pro/quickPlayLobby.ts`. The page decides whether to mount it at all
 * (hidden, never an empty box, while disconnected).
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { BadgeGlyph, badgeArtName, isKnownBadge } from "@/components/Badges/BadgeGlyph";
import { BONUS_PROMO_LINE, tablesInPlayLabel, type Avatar, type RibbonItem } from "@/lib/pro/quickPlayLobby";

const TEAL = "#39B7A8";
const DIM = "rgba(250,235,215,0.6)";

/** A round initial on the player's colour, with an optional live/away dot. */
export const AvatarDisc = ({
  avatar,
  size = 24,
  dot,
  ring,
}: {
  avatar: Avatar;
  size?: number;
  /** "live" = green dot, "away" = grey dot, absent = none */
  dot?: "live" | "away";
  /** border colour, for discs that overlap in a stack */
  ring?: string;
}) => (
  <Flex
    as="span"
    position="relative"
    flex="none"
    w={`${size}px`}
    h={`${size}px`}
    borderRadius="50%"
    bg={avatar.colour}
    color="#fff"
    align="center"
    justify="center"
    fontFamily="SpaceGrotesk"
    fontWeight={600}
    fontSize={`${Math.max(8, Math.round(size * 0.42))}px`}
    lineHeight="1"
    border={ring ? `2px solid ${ring}` : undefined}
    title={avatar.title}
    aria-hidden
  >
    {avatar.initial}
    {dot && (
      <Box
        as="span"
        position="absolute"
        right="-2px"
        bottom="-2px"
        w="8px"
        h="8px"
        borderRadius="50%"
        bg={dot === "live" ? "brand.positive" : "#888"}
        border="2px solid"
        borderColor="brand.surface"
      />
    )}
  </Flex>
);

/** The skewed gold "2× XP" tag the button, ribbon and Join sublines share. */
export const BonusTag = ({ label, testId }: { label: string; testId?: string }) => (
  <Box
    as="span"
    flex="none"
    data-testid={testId}
    fontFamily="BebasNeueRegular"
    letterSpacing="0.06em"
    fontSize="0.95rem"
    bg="brand.accent"
    color="brand.surfaceDim"
    px="0.5rem"
    py="0.2rem"
    borderRadius="4px"
    whiteSpace="nowrap"
    transform="skewX(-6deg)"
  >
    <Box as="span" display="inline-block" transform="skewX(6deg)">
      {label}
    </Box>
  </Box>
);

const Badge = ({ id }: { id: string | null }) =>
  id && isKnownBadge(id) ? <BadgeGlyph id={id} size="0.75rem" title={badgeArtName(id)} /> : null;

export interface LobbyRibbonProps {
  items: RibbonItem[];
  /** SNAPSHOT.here; null without presence (the key then reads just "live") */
  here: number | null;
  /** the running bonus, pre-formatted; null = no tags anywhere */
  bonus: { label: string } | null;
  onJoin: (roomId: string) => void;
  /** absent = no lobby socket, so no 👋 buttons */
  onNudge?: (presenceId: string) => void;
  /** presence ids we waved at and are waiting on (button reads "waiting…" until answered) */
  waved?: ReadonlySet<string>;
  /** we are in a pair (#1556): Join and 👋 stay visible but disabled */
  disabled?: boolean;
}

export const LobbyRibbon = ({ items, here, bonus, onJoin, onNudge, waved, disabled = false }: LobbyRibbonProps) => (
  <Flex
    data-testid="lobby-ribbon"
    flex="none"
    align="center"
    gap="0.5rem"
    px="0.55rem"
    py="0.35rem"
    minH="48px"
    minW="0"
    borderRadius="0.6rem"
    bg="rgba(0,0,0,0.28)"
    border="1px solid"
    borderColor="rgba(224,168,46,0.3)"
    overflow="hidden"
  >
    <Flex direction="column" gap="0.1rem" flex="none" pr="0.5rem" borderRight="1px solid" borderColor="whiteAlpha.200">
      <Text fontFamily="LeagueGothic" fontSize="1rem" lineHeight="1" letterSpacing="0.08em" color={TEAL}>
        HERE NOW
      </Text>
      <Text fontFamily="SpaceGrotesk" fontSize="0.55rem" fontWeight={600} letterSpacing="0.12em" color="whiteAlpha.600">
        {here !== null ? `${here} · LIVE` : "LIVE"}
      </Text>
    </Flex>
    <Flex
      data-testid="lobby-ribbon-scroll"
      flex="1"
      minW="0"
      gap="0.4rem"
      align="center"
      overflowX="auto"
      sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
    >
      {items.length === 0 && (
        <Text fontSize="0.68rem" color={DIM} fontFamily="SpaceGrotesk" whiteSpace="nowrap">
          No one waiting yet — Quick Match opens a public table the next player lands in.
        </Text>
      )}
      {items.map((item) => {
        if (item.kind === "lobby") {
          return (
            <Flex
              key={item.key}
              data-testid="ribbon-lobby"
              data-room={item.roomId}
              flex="none"
              align="center"
              gap="0.45rem"
              pl="0.4rem"
              pr="0.3rem"
              py="0.2rem"
              borderRadius="7px"
              border="1px solid"
              borderColor="rgba(224,168,46,0.5)"
              bg="rgba(224,168,46,0.07)"
            >
              <AvatarDisc avatar={item.avatar} dot="live" />
              <Flex direction="column" lineHeight="1.15" fontFamily="SpaceGrotesk">
                <Flex as="span" align="center" gap="0.2rem" fontSize="0.72rem" fontWeight={600} whiteSpace="nowrap">
                  {item.name}
                  <Badge id={item.badge} />
                </Flex>
                <Text as="span" fontSize="0.6rem" color={DIM} whiteSpace="nowrap">
                  <Box as="span" color="brand.primary">
                    {item.heroName}
                  </Box>
                  {` · ${item.age}`}
                  {item.timer ? ` · ${item.timer}` : ""}
                </Text>
              </Flex>
              <Button
                type="button"
                onClick={() => onJoin(item.roomId)}
                isDisabled={disabled}
                aria-label={`Join ${item.name} (${item.heroName})`}
                minH="40px"
                h="auto"
                px="0.6rem"
                py="0.3rem"
                borderRadius="5px"
                bg="brand.accent"
                color="brand.surfaceDim"
                fontFamily="LeagueGothic"
                fontWeight="normal"
                letterSpacing="0.08em"
                fontSize="0.9rem"
                textTransform="uppercase"
                lineHeight="1"
                boxShadow="0 2px 0 #8a6420"
                flexDirection="column"
                _hover={{ bg: "brand.accentDeep" }}
              >
                Join
                {bonus && (
                  <Box as="span" display="block" fontFamily="SpaceGrotesk" fontWeight={600} fontSize="0.5rem" letterSpacing="0.05em" opacity={0.75} mt="0.1rem">
                    {bonus.label} XP
                  </Box>
                )}
              </Button>
            </Flex>
          );
        }
        if (item.kind === "player") {
          const didWave = waved?.has(item.id) ?? false;
          // A paired player (#1556) is not wave-able: no button at all.
          const canWave = !!onNudge && !item.paired;
          return (
            <Flex
              key={item.key}
              data-testid="ribbon-player"
              flex="none"
              align="center"
              gap="0.45rem"
              pl="0.4rem"
              pr={canWave ? "0.3rem" : "0.55rem"}
              py="0.2rem"
              minH="44px"
              borderRadius="7px"
              border="1px solid"
              borderColor="whiteAlpha.200"
              bg="whiteAlpha.50"
            >
              <AvatarDisc avatar={item.avatar} dot={item.state === "idle" ? "away" : "live"} />
              <Flex direction="column" lineHeight="1.15" fontFamily="SpaceGrotesk">
                <Flex as="span" align="center" gap="0.2rem" fontSize="0.72rem" fontWeight={600} whiteSpace="nowrap">
                  {item.name}
                  <Badge id={item.badge} />
                </Flex>
                <Text as="span" fontSize="0.6rem" color={DIM} whiteSpace="nowrap">
                  {item.heroName && item.state !== "idle" ? (
                    <>
                      <Box as="span" color="brand.primary">
                        {item.heroName}
                      </Box>
                      {" · "}
                    </>
                  ) : null}
                  {item.stateLine}
                </Text>
              </Flex>
              {canWave && (
                <Button
                  type="button"
                  onClick={() => onNudge?.(item.id)}
                  isDisabled={didWave || disabled}
                  title={didWave ? "Waiting for an answer" : "Want to play?"}
                  aria-label={`Wave at ${item.name}`}
                  minW="40px"
                  minH="40px"
                  h="auto"
                  px="0.4rem"
                  borderRadius="5px"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  bg="transparent"
                  color="brand.primary"
                  fontSize="0.9rem"
                  _hover={{ bg: "whiteAlpha.100" }}
                >
                  {didWave ? (
                    <Box as="span" fontFamily="SpaceGrotesk" fontSize="0.6rem" color={DIM}>
                      waiting…
                    </Box>
                  ) : (
                    "👋"
                  )}
                </Button>
              )}
            </Flex>
          );
        }
        return (
          <Flex
            key={item.key}
            data-testid="ribbon-tail"
            flex="none"
            align="center"
            px="0.55rem"
            py="0.3rem"
            minH="36px"
            borderRadius="7px"
            border="1px dashed"
            borderColor="whiteAlpha.300"
            color={DIM}
            fontSize="0.62rem"
            fontFamily="SpaceGrotesk"
            whiteSpace="nowrap"
          >
            {tablesInPlayLabel(item.tablesInPlay)}
          </Flex>
        );
      })}
    </Flex>
    {bonus && (
      <Flex
        data-testid="ribbon-bonus"
        flex="none"
        align="center"
        gap="0.4rem"
        px="0.55rem"
        py="0.3rem"
        ml="0.25rem"
        borderRadius="6px"
        bg="brand.accent"
        color="brand.surfaceDim"
        transform="skewX(-6deg)"
        fontFamily="BebasNeueRegular"
        letterSpacing="0.06em"
        fontSize="0.8rem"
      >
        <Box
          as="span"
          transform="skewX(6deg)"
          fontFamily="LeagueGothic"
          fontSize="1.2rem"
          lineHeight="1"
          bg="brand.surfaceDim"
          color="brand.accent"
          px="0.3rem"
          borderRadius="3px"
        >
          {bonus.label}
        </Box>
        <Box as="span" transform="skewX(6deg)" lineHeight="1.1" display={{ base: "none", md: "block" }}>
          XP on Quick Match
          <Box as="span" display="block" fontFamily="SpaceGrotesk" fontWeight={500} fontSize="0.52rem" letterSpacing="0.08em" opacity={0.75}>
            {BONUS_PROMO_LINE}
          </Box>
        </Box>
      </Flex>
    )}
  </Flex>
);
