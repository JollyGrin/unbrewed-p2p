/**
 * Quick Match in the `/pro/game` dock (issue #1542): the upgraded button label and
 * the two panels that stand in for the Create / Quick Match buttons while a search
 * runs ("Finding a match") and for the few seconds after it lands ("Match found").
 * The splash, stage, plates, roster and ribbon around them stay interactive.
 *
 * Presentation only — the page owns the search (lib/pro/quickMatch.ts) and every
 * string that depends on live data is computed in lib/pro/quickPlayLobby.ts.
 */
import { Box, Button, Flex, Text, keyframes } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { BadgeGlyph, badgeArtName, isKnownBadge } from "@/components/Badges/BadgeGlyph";
import { BonusTag } from "@/components/Pro/LobbyRibbon";

const TEAL = "#39B7A8";
const DIM = "rgba(250,235,215,0.6)";
const spin = keyframes`to { transform: rotate(360deg) }`;

/** The two-line label inside the Quick Match button, plus the 2× tag. */
export const QuickMatchLabel = ({ subline, bonusLabel }: { subline: string; bonusLabel: string | null }) => (
  <Flex w="100%" align="center" justify="space-between" gap="0.6rem" textAlign="left">
    <Box as="span" lineHeight="1">
      ⚡ Quick Match
      <Box
        as="span"
        display="block"
        data-testid="quick-match-subline"
        fontFamily="SpaceGrotesk"
        fontWeight={500}
        fontSize="0.6rem"
        letterSpacing="0.04em"
        textTransform="none"
        color={DIM}
        mt="0.2rem"
      >
        {subline}
      </Box>
    </Box>
    {bonusLabel && <BonusTag label={`${bonusLabel} XP`} testId="quick-match-bonus" />}
  </Flex>
);

const MiniButton = ({
  children,
  onClick,
  testId,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
  label?: string;
}) => (
  <Button
    type="button"
    onClick={onClick}
    data-testid={testId}
    aria-label={label}
    minH="40px"
    h="auto"
    px="0.55rem"
    borderRadius="5px"
    border="1px solid"
    borderColor="whiteAlpha.300"
    bg="transparent"
    color="brand.primary"
    fontFamily="SpaceGrotesk"
    fontWeight={600}
    fontSize="0.6rem"
    letterSpacing="0.05em"
    textTransform="uppercase"
    _hover={{ bg: "whiteAlpha.100", borderColor: "brand.accent" }}
  >
    {children}
  </Button>
);

export interface SearchingPanelProps {
  /** "2×" while the bonus runs; null = no tag */
  bonusLabel: string | null;
  progress: string;
  elapsed: string;
  /** copies the room link; absent until our own table exists */
  onInvite?: () => void;
  inviteCopied?: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onBot?: () => void;
  onCancel: () => void;
}

export const SearchingPanel = ({
  bonusLabel,
  progress,
  elapsed,
  onInvite,
  inviteCopied,
  soundOn,
  onToggleSound,
  onBot,
  onCancel,
}: SearchingPanelProps) => (
  <Box
    data-testid="quick-match-searching"
    role="status"
    aria-live="polite"
    borderRadius="7px"
    px="0.75rem"
    py="0.65rem"
    border="1px solid"
    borderColor="brand.accent"
    bg="rgba(224,168,46,0.08)"
  >
    <Flex align="center" gap="0.5rem">
      <Box
        flex="none"
        w="14px"
        h="14px"
        borderRadius="50%"
        border="2px solid rgba(224,168,46,0.3)"
        borderTopColor="brand.accent"
        sx={{ animation: `${spin} 0.9s linear infinite`, "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
      />
      <Text fontFamily="BebasNeueRegular" letterSpacing="0.06em" fontSize="1rem">
        Finding a match
        {bonusLabel && (
          <Box as="span" color="brand.accent">
            {` · ${bonusLabel} XP`}
          </Box>
        )}
      </Text>
    </Flex>
    <Text mt="0.4rem" fontSize="0.66rem" color={DIM} lineHeight="1.4" fontFamily="SpaceGrotesk">
      {progress} Waiting{" "}
      <Box as="b" color="brand.parchment" sx={{ fontVariantNumeric: "tabular-nums" }} data-testid="quick-match-elapsed">
        {elapsed}
      </Box>
    </Text>
    <Flex gap="0.3rem" mt="0.5rem" flexWrap="wrap">
      {onInvite && (
        <MiniButton onClick={onInvite} testId="quick-match-invite">
          {inviteCopied ? "✓ Link copied" : "🔗 Invite link"}
        </MiniButton>
      )}
      <MiniButton
        onClick={onToggleSound}
        testId="lobby-sound-toggle"
        label={soundOn ? "Mute the match-found chime" : "Unmute the match-found chime"}
      >
        {soundOn ? "🔊 Chime" : "🔇 Muted"}
      </MiniButton>
      {onBot && (
        <MiniButton onClick={onBot} testId="quick-match-bot">
          Bot instead
        </MiniButton>
      )}
      <MiniButton onClick={onCancel} testId="quick-match-cancel">
        Cancel
      </MiniButton>
    </Flex>
  </Box>
);

export interface FoundPanelProps {
  name: string;
  badge: string | null;
  heroName: string | null;
  /** "Sarpedon" etc.; null when this page never knew the board (a join) */
  board: string | null;
  rules: string;
  /** "2×" when the room locked a multiplier; null = no line */
  multiplierLabel: string | null;
  secondsLeft: number;
}

export const FoundPanel = ({ name, badge, heroName, board, rules, multiplierLabel, secondsLeft }: FoundPanelProps) => (
  <Box
    data-testid="quick-match-found"
    role="status"
    aria-live="assertive"
    borderRadius="7px"
    px="0.75rem"
    py="0.65rem"
    border="1px solid"
    borderColor={TEAL}
    bg="linear-gradient(135deg, rgba(57,183,168,0.2), rgba(224,168,46,0.15))"
  >
    <Text fontFamily="BebasNeueRegular" letterSpacing="0.06em" fontSize="1.05rem" color={TEAL}>
      Match found · {name}
    </Text>
    <Text mt="0.25rem" fontSize="0.68rem" color={DIM} fontFamily="SpaceGrotesk">
      {heroName && (
        <Box as="b" color="brand.parchment">
          {heroName}
        </Box>
      )}
      {badge && isKnownBadge(badge) && (
        <>
          {" · "}
          <BadgeGlyph id={badge} size="0.75rem" title={badgeArtName(badge)} /> {badgeArtName(badge)}
        </>
      )}
      {". "}
      {board ? (
        <>
          Board rolled: <Box as="b" color="brand.parchment">{board}</Box>, {rules}.
        </>
      ) : (
        <>{rules.charAt(0).toUpperCase() + rules.slice(1)}.</>
      )}
    </Text>
    <Flex mt="0.45rem" justify="space-between" align="center" fontSize="0.66rem" color={DIM} fontFamily="SpaceGrotesk">
      <Text as="span" data-testid="quick-match-found-xp">
        {multiplierLabel ? `${multiplierLabel} XP match` : ""}
      </Text>
      <Text as="span">
        Entering table in{" "}
        <Box as="b" fontFamily="BebasNeueRegular" fontSize="1.2rem" color="brand.parchment">
          {Math.max(0, secondsLeft)}
        </Box>
      </Text>
    </Flex>
  </Box>
);
