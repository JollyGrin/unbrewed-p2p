/**
 * Matched mode on `/pro/game` (issue #1556): a 👋 was accepted, so the picker
 * stops being "create a room" and becomes "you and <name> — pick and Go".
 *
 * - `PartnerCard` takes the rules strip's "CREATE A ROOM" header: the partner's
 *   avatar disc (the ribbon's), name, badge, and live from the lobby SNAPSHOT
 *   their fighter ("picking…" until they lock one) and "Ready" once they're in.
 * - `PairActions` takes the dock's Create / Quick Match (and the mobile bar's):
 *   one Go and a Cancel.
 *
 * Pure presentation; the pair state machine is `lib/pro/lobbyPair.ts`.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { BadgeGlyph, badgeArtName, isKnownBadge } from "@/components/Badges/BadgeGlyph";
import { AvatarDisc } from "@/components/Pro/LobbyRibbon";
import type { Avatar } from "@/lib/pro/quickPlayLobby";

const TEAL = "#39B7A8";
const DIM = "rgba(250,235,215,0.6)";

export interface PartnerModel {
  avatar: Avatar;
  name: string;
  badge: string | null;
  /** their locked fighter; null = still picking */
  heroName: string | null;
  /** they are in (the host's room is up) */
  ready: boolean;
}

export const PartnerCard = ({ partner }: { partner: PartnerModel }) => (
  <Flex data-testid="pair-partner" align="center" gap="0.6rem" minW="0">
    <AvatarDisc avatar={partner.avatar} size={34} dot="live" />
    <Flex direction="column" lineHeight="1.15" minW="0">
      <Text fontFamily="LeagueGothic" fontSize="1.35rem" letterSpacing="0.08em" whiteSpace="nowrap">
        MATCHED WITH{" "}
        <Box as="span" color="brand.accent">
          {partner.name.toUpperCase()}
        </Box>
        {partner.badge && isKnownBadge(partner.badge) ? (
          <Box as="span" ml="0.3rem" display="inline-flex" verticalAlign="middle">
            <BadgeGlyph id={partner.badge} size="0.9rem" title={badgeArtName(partner.badge)} />
          </Box>
        ) : null}
      </Text>
      <Text as="span" fontFamily="SpaceGrotesk" fontSize="0.68rem" color={DIM} whiteSpace="nowrap" data-testid="pair-partner-status">
        {partner.heroName ? (
          <Box as="span" color="brand.primary">
            {partner.heroName}
          </Box>
        ) : (
          "picking…"
        )}
        {partner.ready && (
          <Box as="span" color={TEAL} fontWeight={600}>
            {" · Ready"}
          </Box>
        )}
        {" · pick your fighter"}
      </Text>
    </Flex>
  </Flex>
);

export interface PairActionsProps {
  partnerName: string;
  /** a real fighter is locked and the game socket is up */
  canGo: boolean;
  /** guest pressed Go before the host's room arrived */
  waiting: boolean;
  /** "2×" while the Quick Play bonus runs */
  bonusLabel: string | null;
  onGo: () => void;
  onCancel: () => void;
  /** the mobile bar's one-row layout */
  compact?: boolean;
}

export const PairActions = ({ partnerName, canGo, waiting, bonusLabel, onGo, onCancel, compact = false }: PairActionsProps) => (
  <Flex direction={compact ? "row" : "column"} align={compact ? "center" : "stretch"} gap="0.4rem" flex={compact ? "1" : undefined} minW="0">
    <Button
      type="button"
      data-testid="pair-go"
      onClick={onGo}
      isDisabled={!canGo || waiting}
      title={canGo ? undefined : "Pick a fighter first"}
      flex={compact ? "1" : undefined}
      h="auto"
      py={compact ? "9px" : "11px"}
      px="18px"
      borderRadius="6px"
      fontFamily="LeagueGothic"
      fontSize={compact ? "17px" : "20px"}
      letterSpacing="0.08em"
      textTransform="uppercase"
      flexDirection="column"
      lineHeight="1.05"
      bg="linear-gradient(180deg, #F0C874, #E0A82E 45%, #C48F1E)"
      color="#2c1a10"
      boxShadow="0 4px 0 #8a6420, 0 10px 22px rgba(0,0,0,0.45)"
      _hover={{ transform: "translateY(-1px)", bg: "linear-gradient(180deg, #F0C874, #E0A82E 45%, #C48F1E)" }}
      _active={{ transform: "translateY(2px)", boxShadow: "0 2px 0 #8a6420" }}
      _disabled={{ filter: "grayscale(0.75) brightness(0.65)", boxShadow: "none", cursor: "not-allowed", opacity: 1 }}
    >
      {waiting ? `Ready — waiting for ${partnerName}` : "Go"}
      {bonusLabel && !waiting && (
        <Box as="span" data-testid="pair-go-bonus" display="block" fontFamily="SpaceGrotesk" fontWeight={600} fontSize="0.6rem" letterSpacing="0.05em" opacity={0.75}>
          {bonusLabel} XP
        </Box>
      )}
    </Button>
    <Button
      type="button"
      data-testid="pair-cancel"
      onClick={onCancel}
      variant="link"
      minH="40px"
      fontFamily="SpaceGrotesk"
      fontWeight="normal"
      fontSize="0.75rem"
      color="whiteAlpha.700"
      _hover={{ color: "brand.accent" }}
    >
      Cancel
    </Button>
  </Flex>
);
