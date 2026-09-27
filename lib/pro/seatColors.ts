/**
 * Constants every Pro board view draws with, so the flat board (ProBoard),
 * the tabletop board (TableBoard) and the tabletop HUD (tableHud) can't drift
 * apart. Before #877 each kept its own copy of these.
 */

/**
 * Seat colours: the ring on a fighter's token, the base of its figure, the
 * rim of its HUD plate.
 */
export const SEAT_COLOR: Record<string, string> = {
  p1: "#E0A82E", // gold
  p2: "#3B8BEB", // blue
  p3: "#2F9E68", // green
  p4: "#C0449E", // magenta
};

/** A space's diameter, as a fraction of the board's width, when the map sets none. */
export const DEFAULT_SPACE_DIAMETER = 0.021;
