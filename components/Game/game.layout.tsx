import { Grid } from "@chakra-ui/react";
import { ReactNode } from "react";

type GameBoardLayoutType = {
  children: ReactNode;
};

/**
 * Two bands: player HUD on top, board filling the rest.
 * The hand and pile controls float over the board as fixed overlays.
 */
export const GameLayout = ({ children }: GameBoardLayoutType) => {
  return (
    <Grid
      h="100svh"
      templateRows="auto minmax(0, 1fr)"
      overflow="hidden"
      bg="radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)"
    >
      {children}
    </Grid>
  );
};
