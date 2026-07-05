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
import { FighterId, ProMapDef, ProMapSpace, SpaceId, ViewFighter, ViewToken } from "@/lib/pro/protocol";
import { BoardFxItem } from "@/lib/pro/useGameFx";

const DEFAULT_DIAMETER = 0.021;

const highlightPulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 2px #e0a82e, 0 0 12px 2px rgba(224,168,46,0.8); }
  50% { box-shadow: 0 0 0 3px #e0a82e, 0 0 22px 6px rgba(224,168,46,0.5); }
`;

// transient board effects (damage numbers etc.) — pop in, drift up, fade out
const fxFloat = keyframes`
  0%   { transform: translate(-50%, -40%) scale(0.7); opacity: 0; }
  12%  { transform: translate(-50%, -60%) scale(1.25); opacity: 1; }
  30%  { transform: translate(-50%, -75%) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -220%) scale(0.95); opacity: 0; }
`;
const fxRing = keyframes`
  0%   { transform: translate(-50%, -50%) scale(0.35); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
`;

const FX_COLOR: Record<BoardFxItem["kind"], string> = {
  damage: "#FF5C5C",
  heal: "#58D68D",
  blocked: "#B8C4CE",
  defeat: "#E0A82E",
};

export interface ProBoardProps {
  map: ProMapDef;
  fighters: ViewFighter[];
  /** Neutral board tokens (totems) — non-interactive sprites, public to both players */
  tokens?: ViewToken[];
  /** Spaces the current player can act on right now (move targets, placements…) */
  highlightedSpaces?: SpaceId[];
  /** Fighters the current player can act on right now (attack targets, movable…) */
  highlightedFighters?: FighterId[];
  selectedFighter?: FighterId | null;
  /** transient effect overlays (floating damage numbers…) — keyed, caller-expired */
  fx?: BoardFxItem[];
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

/** Token initials: leading "The " is noise ("The Mandalorian"/"The Child"/
 * "Thrall" all rendered as TH), so strip it and take three letters. */
const tokenInitials = (name: string) =>
  name.replace(/^the\s+/i, "").slice(0, 3).toUpperCase();

export const ProBoard = ({
  map,
  fighters,
  tokens = [],
  highlightedSpaces = [],
  highlightedFighters = [],
  selectedFighter = null,
  fx = [],
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

  // v6 two-space (LARGE) fighters: `space` is the head, `tailSpace` the second
  // body space. The head renders through the normal per-space pass below;
  // these get an extra tail token + a stretch-band so the pair reads as ONE
  // fighter. Occupancy is exclusive server-side, so a tail never stacks.
  const spaceById = new Map(map.spaces.map((s) => [s.id, s]));
  const twoSpaceFighters = fightersOnBoard.filter((f) => f.tailSpace);

  // One fighter token (head or tail segment). Clicking EITHER segment acts on
  // the fighter; target/selection styling lights both. Only the head carries
  // the HP badge so the pair still shows a single HP readout.
  const fighterToken = (f: ViewFighter, s: ProMapSpace, nudge: number, segment: "head" | "tail") => {
    const color = PLAYER_COLOR[f.owner] ?? "#999";
    const isSelected = f.id === selectedFighter;
    const isTarget = highlightFighterSet.has(f.id);
    const clickable = isTarget && !!onFighterClick;
    return (
      <Flex
        key={segment === "head" ? f.id : `${f.id}-tail`}
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
          fontSize="min(1.1vw, 0.68rem)"
          fontWeight="bold"
          letterSpacing="-0.02em"
          color={f.kind === "HERO" ? "brand.surfaceDim" : "brand.parchment"}
          lineHeight={1}
        >
          {tokenInitials(f.name)}
        </Text>
        {segment === "head" && (
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
        )}
      </Flex>
    );
  };

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

      {/* neutral board tokens (totems) — below fighters, never clickable */}
      {map.spaces
        .filter((s) => tokens.some((t) => t.space === s.id))
        .flatMap((s) =>
          tokens
            .filter((t) => t.space === s.id)
            .map((t) => (
              <Box
                key={t.id}
                position="absolute"
                left={`${s.x * 100}%`}
                top={`${s.y * 100}%`}
                transform="translate(-50%, -50%) rotate(45deg)"
                w={`${diameter * 0.55}%`}
                sx={{ aspectRatio: "1", pointerEvents: "none" }}
                bg="brand.surfaceDim"
                border={`2px solid ${PLAYER_COLOR[t.owner] ?? "#999"}`}
                borderRadius="20%"
                boxShadow="0 1px 4px rgba(0,0,0,0.5)"
                zIndex={2}
                title={`Totem (${t.owner})`}
              />
            ))
        )}

      {/* two-space fighter bands — the "string" tying head and tail together.
          viewBox 0-100 with preserveAspectRatio="none" maps the normalized
          space coords straight onto the stretched image. */}
      {twoSpaceFighters.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {twoSpaceFighters.flatMap((f) => {
            const head = spaceById.get(f.space as SpaceId);
            const tail = spaceById.get(f.tailSpace as SpaceId);
            if (!head || !tail) return [];
            const color = PLAYER_COLOR[f.owner] ?? "#999";
            // white outer + colored inner stroke, echoing the hero token look
            return [
              <line
                key={`${f.id}-band-outline`}
                x1={head.x * 100}
                y1={head.y * 100}
                x2={tail.x * 100}
                y2={tail.y * 100}
                stroke="#fff"
                strokeWidth={diameter * 0.52}
                strokeLinecap="round"
                opacity={0.9}
              />,
              <line
                key={`${f.id}-band`}
                x1={head.x * 100}
                y1={head.y * 100}
                x2={tail.x * 100}
                y2={tail.y * 100}
                stroke={color}
                strokeWidth={diameter * 0.36}
                strokeLinecap="round"
              />,
            ];
          })}
        </svg>
      )}

      {/* fighter tokens (heads; stack co-located tokens with a slight diagonal offset) */}
      {map.spaces
        .filter((s) => bySpace.has(s.id))
        .flatMap((s) =>
          (bySpace.get(s.id) as ViewFighter[]).map((f, i, all) =>
            fighterToken(f, s, (i - (all.length - 1) / 2) * 0.35, "head")
          )
        )}

      {/* tail tokens of two-space fighters — same interactions as the head */}
      {twoSpaceFighters.flatMap((f) => {
        const tail = spaceById.get(f.tailSpace as SpaceId);
        return tail ? [fighterToken(f, tail, 0, "tail")] : [];
      })}

      {/* transient effects — impact ring + floating label, above everything */}
      {fx.flatMap((item) => {
        const s = map.spaces.find((sp) => sp.id === item.space);
        if (!s) return [];
        const color = FX_COLOR[item.kind];
        return [
          <Box
            key={`${item.key}-ring`}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            w={`${diameter * 1.5}%`}
            sx={{ aspectRatio: "1", pointerEvents: "none" }}
            border={`3px solid ${color}`}
            borderRadius="50%"
            animation={`${fxRing} 0.7s ease-out both`}
            zIndex={5}
          />,
          <Text
            key={item.key}
            position="absolute"
            left={`${s.x * 100}%`}
            top={`${s.y * 100}%`}
            fontFamily="BebasNeueRegular"
            fontSize={item.kind === "damage" || item.kind === "heal" ? "min(3vw, 1.6rem)" : "min(2.2vw, 1.1rem)"}
            fontWeight="bold"
            letterSpacing="0.04em"
            color={color}
            textShadow="0 1px 2px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.6)"
            animation={`${fxFloat} 1.5s ease-out both`}
            sx={{ pointerEvents: "none" }}
            zIndex={6}
            whiteSpace="nowrap"
          >
            {item.label}
          </Text>,
        ];
      })}
      </Box>
    </Box>
  );
};
