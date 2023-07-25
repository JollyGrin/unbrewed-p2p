import { colors, fonts } from "@/styles/style";
import { Box, Flex, Grid } from "@chakra-ui/react";
import styled from "@emotion/styled";

export const PlayerTitleBar = styled(Flex)`
  background-color: ${colors.purple[900]};
  color: antiquewhite;
  font-weight: 700;
  font-family: ${fonts.SpaceGrotesk};

  width: 100%;
  height: min-content;
  border-radius: 0.5rem 0.5rem 0 0;

  padding: 0.2rem 0.75rem;

  justify-content: space-between;
`;

export const PawnStatsContainer = styled(Grid)`
  grid-template-columns: 1fr 1fr 1fr;
  place-items: center;
  gap: 1rem;
`;

export const MoveStatContainer = styled(Flex)`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  line-height: normal;
  background-color: ghostwhite;
  padding: 0.3rem 0;
`;

export const StatContainer = styled(Box)`
  user-select: none;
  background-color: antiquewhite;
  border-radius: 0.5rem;
  min-width: 20rem;
  height: 100%;
  width: min-content;
`;
