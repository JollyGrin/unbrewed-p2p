// The board's zoom behaviour lives inside useCanvas (d3). This is the handle
// other parts of the table use to move the view without a pointer: the
// keyboard shortcuts for zoom in, zoom out and recentre.

export type BoardViewControls = {
  /** Scale the view about the middle of the screen (1.25 in, 0.8 out). */
  zoomBy: (factor: number) => void;
  /** Back to the opening view: the whole map, centred. */
  fit: () => void;
};

let controls: BoardViewControls | null = null;

/** Called by useCanvas with the live controls, and null on unmount. */
export function setBoardViewControls(next: BoardViewControls | null) {
  controls = next;
}

export function getBoardViewControls(): BoardViewControls | null {
  return controls;
}
