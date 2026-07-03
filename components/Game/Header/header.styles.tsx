import { colors, fonts } from "@/styles/style";
import { Box, Flex, Text } from "@chakra-ui/react";
import styled from "@emotion/styled";

/**
 * Frosted floating player plate. It sits over the board as an overlay (no
 * siloed band). The local player's plate carries a glowing gold spine + halo;
 * opponents stay quiet.
 */
export const StatContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isLocal",
})<{ isLocal?: boolean }>`
  user-select: none;
  position: relative;
  width: 15rem;
  border-radius: 0.85rem;
  overflow: hidden;
  background: linear-gradient(
    180deg,
    rgba(58, 33, 64, 0.72),
    rgba(44, 24, 49, 0.74)
  );
  -webkit-backdrop-filter: blur(9px) saturate(1.1);
  backdrop-filter: blur(9px) saturate(1.1);
  border: 1px solid
    ${({ isLocal }) =>
      isLocal ? "rgba(231, 204, 152, 0.55)" : "rgba(231, 204, 152, 0.2)"};
  box-shadow: ${({ isLocal }) =>
    isLocal
      ? "0 14px 34px rgba(12, 4, 16, 0.55), 0 0 0 1px rgba(231, 204, 152, 0.3), 0 0 22px rgba(224, 168, 46, 0.22)"
      : "0 12px 30px rgba(12, 4, 16, 0.5)"};
  transition:
    transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.1),
    box-shadow 0.18s ease;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${({ isLocal }) => (isLocal ? "4px" : "3px")};
    background: ${({ isLocal }) =>
      isLocal
        ? `linear-gradient(180deg, ${colors.brand.primary}, ${colors.brand.accent})`
        : "rgba(231, 204, 152, 0.28)"};
    box-shadow: ${({ isLocal }) =>
      isLocal ? "0 0 12px rgba(224, 168, 46, 0.7)" : "none"};
  }

  &:hover {
    transform: translateY(-3px);
  }
`;

/** Translucent purple name strip along the top of the plate. */
export const PlayerTitleBar = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.55rem 0.35rem 0.85rem;
  border-bottom: 1px solid rgba(231, 204, 152, 0.14);
`;

/** Player name in the condensed display face. */
export const PlayerName = styled(Text)`
  font-family: ${fonts.BebasNeueRegular};
  font-size: 1.4rem;
  line-height: 1;
  letter-spacing: 0.03em;
  color: ${colors.brand.primary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 9.5rem;
  cursor: default;
`;

/** Small uppercase hero name shown beneath the player name. */
export const HeroName = styled(Text)`
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(231, 204, 152, 0.55);
  margin-top: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 9.5rem;
`;

/** Ghost icon button used for the local player's map / token controls. */
export const ControlButton = styled(Box)`
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 0.45rem;
  color: rgba(231, 204, 152, 0.72);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;

  &:hover {
    background: rgba(231, 204, 152, 0.14);
    color: ${colors.brand.primary};
  }
`;

/** Parchment stat band: hero (and sidekick) HP/weapon on the left, move chip right. */
export const StatsPanel = styled(Flex)`
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.7rem 0.45rem 0.85rem;
  background: linear-gradient(
    180deg,
    rgba(250, 235, 215, 0.96),
    rgba(241, 224, 193, 0.96)
  );
  color: ${colors.brand.surfaceDim};
`;

/** A single stat line (HP + weapon) inside the parchment band. */
export const StatLine = styled(Flex)`
  align-items: center;
  gap: 0.55rem;
`;

/** The antique-gold "move" chip. */
export const MoveChip = styled(Flex)`
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
  padding: 0.25rem 0.55rem;
  border-radius: 0.55rem;
  color: ${colors.brand.surfaceDim};
  background: linear-gradient(180deg, #fff7e6, #f3e0bb);
  box-shadow:
    inset 0 0 0 1px rgba(224, 168, 46, 0.4),
    0 1px 2px rgba(0, 0, 0, 0.08);
`;

/** Muted footer row of resource counts (hand / deck / discard). */
export const PipFooter = styled(Flex)`
  align-items: center;
  gap: 0.1rem;
  padding: 0.3rem 0.7rem 0.35rem 0.8rem;
  background: rgba(44, 24, 49, 0.55);
  border-top: 1px solid rgba(231, 204, 152, 0.1);
`;

export const Pip = styled(Flex, {
  shouldForwardProp: (prop) => prop !== "clickable",
})<{ clickable?: boolean }>`
  align-items: center;
  gap: 0.28rem;
  padding: 0.1rem 0.45rem;
  border-radius: 1rem;
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.82rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgba(231, 204, 215, 0.85);
  cursor: ${({ clickable }) => (clickable ? "pointer" : "default")};
  transition:
    background 0.15s ease,
    color 0.15s ease;

  ${({ clickable }) =>
    clickable
      ? `&:hover { background: rgba(231, 204, 152, 0.16); color: ${colors.brand.primary}; }`
      : ""}
`;

/** Fixed overlay that floats the player plates over the top-left of the board. */
export const HudOverlay = styled(Flex)`
  position: fixed;
  top: 0.6rem;
  left: 0.6rem;
  right: 0.6rem;
  z-index: 150;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: flex-start;
  /* keep the top-right connection/invite chips clear on the first row */
  padding-right: 8.5rem;
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }
`;

/** Fixed top-right cluster for the invite + connection chips. */
export const ChipCluster = styled(Flex)`
  position: fixed;
  top: 0.7rem;
  right: 0.7rem;
  z-index: 151;
  align-items: center;
  gap: 0.3rem;
`;
