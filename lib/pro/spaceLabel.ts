/**
 * Display form of a board space id. Map data spells ids lowercase ("a1"); every
 * surface that names a space to a human prints it uppercase ("A1"). Extracted
 * from the replay scrubber (unbrewed-p2p#747) so the dock labels and the logs
 * share the one convention instead of each growing its own.
 */
export const spaceLabel = (space: string): string => space.toUpperCase();
