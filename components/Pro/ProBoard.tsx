/**
 * Pro board renderer — pure presentation, zero rules logic.
 *
 * Draws the map image, one hit-circle per space (normalized 0–1 coords,
 * sized by meta.spaceDiameter as a fraction of image width — same convention
 * as the dev map editor), fighter tokens, and gold highlights on whatever
 * spaces the caller says are currently actionable (which the server derives
 * from legalActions — the board never computes legality itself).
 */
import { Box, Flex, Text, keyframes } from "@chakra-ui/react";
import { FighterId, ProMapDef, SpaceId, ViewFighter } from "@/lib/pro/protocol";

const DEFAULT_DIAMETER = 0.021;

const highlightPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #e0a82e, 0 0 12px 2px rgba(224,168,46,0.8); }
  50% { box-shadow: 0 0 0 3px #e0a82e, 0 0 22px 6px rgba(224,168,46,0.5); }
`;

export interface ProBoardProps {
  map: ProMapDef;
  fighters: ViewFighter[];
  /** Spaces the current player can act on right now (move targets, placements…) */
  highlightedSpaces?: SpaceId[];
  /** Fighters the current player can act on right now (attack targets, movable…) */
  highlightedFighters?: FighterId[];
  selectedFighter?: FighterId | null;
  onSpaceClick?: (id: SpaceId) => void;
  onFighterClick?: (id: FighterId) => void;
  /** cap the board image height (e.g. "calc(100svh - 2rem)") so the whole
   * field fits the viewport; width shrinks to keep the aspect ratio */
  imgMaxH?: string;
}

const PLAYER_COLOR: Record<string, string> = {
  p1: "#E0A82E", // gold
  p2: "#3B8BEB", // blue
};

export const ProBoard = ({
  map,
  fighters,
  highlightedSpaces = [],
  highlightedFighters = [],
  selectedFighter = null,
  onSpaceClick,
  onFighterClick,
  imgMaxH,
}: ProBoardProps) => {
  const diameter = (map.meta.spaceDiameter ?? DEFAULT_DIAMETER) * 100; // % of width
  const highlightSet = new Set(highlightedSpaces);
  const highlightFighterSet = new Set(highlightedFighters);

  const fightersOnBoard = fighters.filter((f) => f.space && !f.defeated);
  const bySpace = new Map<SpaceId, ViewFighter[]>();
  for (const f of fightersOnBoard) {
    const list = bySpace.get(f.space as SpaceId) ?? [];
    list.push(f);
    bySpace.set(f.space as SpaceId, list);
  }

  return (
    // Outer box may be stretched by a parent grid/flex row; the INNER box is
    // the positioning context: it shrink-wraps the image exactly, so the
    // %-positioned overlays stay glued to the art at any size.
    <Box maxW="100%">
      <Box position="relative" w="fit-content" maxW="100%" mx="auto" userSelect="none">
      <Box
        as="img"
        src={map.meta.imageUrl}
        alt={map.meta.title}
        maxW="100%"
        maxH={imgMaxH}
        display="block"
        draggable={false}
        borderRadius="0.5rem"
      />

      {/* space hit-circles */}
      {map.spaces.map((s) => {
        const isHighlighted = highlightSet.has(s.id);
        return (
          <Box
            key={s.id}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            transform="translate(-50%, -50%)"
            w={`${diameter}%`}
            sx={{ aspectRatio: "1" }}
            borderRadius="50%"
            border={isHighlighted ? "2px solid #E0A82E" : "1px solid rgba(255,255,255,0.15)"}
            bg={isHighlighted ? "rgba(224,168,46,0.45)" : "transparent"}
            animation={isHighlighted ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
            cursor={isHighlighted && onSpaceClick ? "pointer" : "default"}
            onClick={isHighlighted && onSpaceClick ? () => onSpaceClick(s.id) : undefined}
            zIndex={isHighlighted ? 3 : 1}
          />
        );
      })}

      {/* fighter tokens */}
      {map.spaces
        .filter((s) => bySpace.has(s.id))
        .flatMap((s) =>
          (bySpace.get(s.id) as ViewFighter[]).map((f, i, all) => {
            const color = PLAYER_COLOR[f.owner] ?? "#999";
            const isSelected = f.id === selectedFighter;
            const isTarget = highlightFighterSet.has(f.id);
            const clickable = isTarget && !!onFighterClick;
            // stack co-located tokens with a slight diagonal offset
            const nudge = (i - (all.length - 1) / 2) * 0.35;
            return (
              <Flex
                key={f.id}
                position="absolute"
                left={`calc(${s.x * 100}% + ${nudge}rem)`}
                top={`calc(${s.y * 100}% + ${nudge}rem)`}
                transform="translate(-50%, -50%)"
                w={`${diameter * 0.82}%`}
                sx={{ aspectRatio: "1" }}
                borderRadius="50%"
                bg={f.kind === "HERO" ? color : "brand.surfaceDim"}
                border={`2px solid ${f.kind === "HERO" ? "#fff" : color}`}
                opacity={f.kind === "HERO" ? 1 : 0.92}
                boxShadow={
                  isSelected
                    ? "0 0 0 3px #fff, 0 2px 8px rgba(0,0,0,0.6)"
                    : "0 2px 6px rgba(0,0,0,0.5)"
                }
                animation={isTarget ? `${highlightPulse} 1.4s ease-in-out infinite` : undefined}
                cursor={clickable ? "pointer" : "default"}
                onClick={clickable ? () => onFighterClick(f.id) : undefined}
                alignItems="center"
                justifyContent="center"
                zIndex={4}
                title={`${f.name} — ${f.hp}/${f.maxHp} HP`}
              >
                <Text
                  fontSize="min(1.4vw, 0.85rem)"
                  fontWeight="bold"
                  color={f.kind === "HERO" ? "brand.surfaceDim" : "brand.parchment"}
                  lineHeight={1}
                >
                  {f.name.slice(0, 2).toUpperCase()}
                </Text>
                <Flex
                  position="absolute"
                  bottom="-18%"
                  right="-18%"
                  bg="brand.surfaceDim"
                  color="brand.parchment"
                  border={`1.5px solid ${color}`}
                  borderRadius="999px"
                  px="0.3em"
                  fontSize="min(1.1vw, 0.7rem)"
                  fontWeight="bold"
                  lineHeight="1.4"
                >
                  {f.hp}
                </Flex>
              </Flex>
            );
          })
        )}
      </Box>
    </Box>
  );
};
