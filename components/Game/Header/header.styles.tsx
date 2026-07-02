import { colors, fonts } from "@/styles/style";
import { Box, Flex } from "@chakra-ui/react";
import styled from "@emotion/styled";

export const PlayerTitleBar = styled(Flex)`
  background-color: ${colors.brand.secondary};
  color: ${colors.brand.primary};
  font-weight: 700;
  font-family: ${fonts.SpaceGrotesk};
  letter-spacing: 0.02em;

  width: 100%;
  height: min-content;
  border-radius: 0.6rem 0.6rem 0 0;

  padding: 0.2rem 0.75rem;

  justify-content: space-between;
`;

export const MoveStatContainer = styled(Flex)`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: normal;
  background-color: ${colors.brand.highlight};
  border-radius: 0.4rem;
  padding: 0.3rem 0;
  margin: 0.15rem;
`;

export const StatContainer = styled(Box, {
  shouldForwardProp: (prop) => prop !== "isLocal",
})<{ isLocal?: boolean }>`
  user-select: none;
  background-color: ${colors.brand.parchment};
  border-radius: 0.65rem;
  border: 2px solid
    ${({ isLocal }) => (isLocal ? colors.brand.primary : "transparent")};
  box-shadow: 0 3px 10px rgba(20, 8, 24, 0.35);
  min-width: 20rem;
  height: 100%;
  width: min-content;
`;
