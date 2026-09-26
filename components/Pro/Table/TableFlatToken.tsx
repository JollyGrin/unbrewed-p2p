/**
 * A round cardboard token lying FLAT on its space, a few layers thick — the
 * deck's own piece, the same circle the flat board draws. It goes into a
 * TableStandeeAnchor's `ground` slot, whose origin is the space's centre.
 *
 * WHY FLAT. Pieces used to stand upright as billboarded discs or portrait
 * cut-outs. A disc touches the board in a single point, so it read as a
 * balloon hovering over its space; once heroes became miniatures standing on
 * their bases, the owner saw those pieces as "not standing on their spaces"
 * (2026-09-23) and asked for the author's own pieces wherever there is no
 * miniature. A token lying on the space is what a cardboard token is, and it
 * cannot sit anywhere but on its space: it IS the base — the size and centre
 * of the base disc a miniature stands on. Badges stand up above it in the
 * anchor's (otherwise empty) billboard: see TOKEN_BADGE_PLATE_HEIGHT.
 *
 * Used by sidekicks, heroes without a miniature, and a LARGE fighter's tail.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { FighterTokenPortrait } from "@/components/Pro/FighterTokenPortrait";

/** The token's thickness as a fraction of its diameter — about a 2mm board
 *  on a 25mm token. It is drawn as a stack of layers, one px apart. */
export const TOKEN_THICKNESS = 0.08;
/** The token's side, seen between its layers: the board's own dark ink. */
const TOKEN_EDGE_FILL = "#1b0f1f";
/** The rim: the owner's colour, like the base disc under a miniature. */
const TOKEN_RIM_PX = 2;

/**
 * Height of the empty upright plate that carries a flat token's badges, as a
 * fraction of the token's diameter: it puts the HP heart just above the rim.
 */
export const TOKEN_BADGE_PLATE_HEIGHT = 0.6;

const targetPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2.5px rgba(224,168,46,0.95); }
  50% { box-shadow: 0 0 0 2.5px rgba(224,168,46,0.45); }
`;

export interface TableFlatTokenProps {
  /** Diameter, px — the anchor's base disc size (`standeeBaseDiameterPx`). */
  sizePx: number;
  /** Owner's colour for the rim. */
  rim: string;
  /** The space it lies on — tags the bottom layer for the visual probe. */
  spaceId?: string | null;
  /** The face shows this portrait (or the name's initials)... */
  name?: string;
  artUrl?: string | null;
  /** ...or, when set, is a plain disc of this colour (a LARGE fighter's tail). */
  fill?: string;
  selected?: boolean;
  targetable?: boolean;
  friendly?: boolean;
  /** Data attributes for the face, e.g. `data-fighter-id`. */
  faceAttrs?: Record<string, string>;
}

export const TableFlatToken = ({
  sizePx,
  rim,
  spaceId,
  name = "",
  artUrl,
  fill,
  selected = false,
  targetable = false,
  friendly = false,
  faceAttrs,
}: TableFlatTokenProps) => {
  const layers = Math.max(1, Math.round(sizePx * TOKEN_THICKNESS));
  const disc = (z: number) => `translate(-50%, -50%) translateZ(${z}px)`;
  const ring = { width: `${sizePx}px`, height: `${sizePx}px`, border: `${TOKEN_RIM_PX}px solid`, borderColor: rim };

  return (
    <Box position="absolute" left={0} top={0} style={{ transformStyle: "preserve-3d" }}>
      {/* The side: identical discs from the board up. The bottom one lies
          exactly on the board, concentric with the space, and is the piece's
          base for the visual probe. */}
      {Array.from({ length: layers }, (_, i) => (
        <Box
          key={i}
          position="absolute"
          borderRadius="50%"
          bg={TOKEN_EDGE_FILL}
          boxShadow={i === 0 ? "0 2px 5px rgba(0,0,0,0.7)" : undefined}
          style={{ ...ring, transform: disc(i) }}
          data-fighter-base={i === 0 ? "" : undefined}
          data-space-id={i === 0 ? spaceId ?? undefined : undefined}
        />
      ))}
      <Box
        position="absolute"
        borderRadius="50%"
        pointerEvents="auto"
        bg={fill}
        boxShadow={selected ? "0 0 0 3px #fff" : friendly ? "0 0 0 2px #39B7A8" : undefined}
        animation={targetable && !selected ? `${targetPulse} 1.4s ease-in-out infinite` : undefined}
        sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
        style={{ ...ring, overflow: "hidden", transform: disc(layers) }}
        {...faceAttrs}
      >
        {!fill && <FighterTokenPortrait name={name} artUrl={artUrl} size={`${sizePx - 2 * TOKEN_RIM_PX}px`} />}
      </Box>
    </Box>
  );
};
