import { Grid } from "@chakra-ui/react";
import { ReactNode } from "react";

type GameBoardLayoutType = {
  children: ReactNode;
};

/**
 * The board fills the whole viewport; the player HUD, hand, and pile controls
 * all float over it as fixed overlays (no siloed bands).
 */
export const GameLayout = ({ children }: GameBoardLayoutType) => {
  return (
    <Grid
      h="100svh"
      templateRows="minmax(0, 1fr)"
      overflow="hidden"
      bg="radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)"
    >
      {children}
    </Grid>
  );
};
