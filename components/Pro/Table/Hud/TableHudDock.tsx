/**
 * The decision half of the tabletop HUD: the banner between the plates, the
 * hexagons in the bottom-right corner, and the decision sheet along the right
 * edge while a decision needs one.
 *
 * ProDock still owns every decision — which rows are legal, what a prompt
 * asks, the tap latch — and hands this component only the finished pieces
 * (lib/pro/tableHud decides which hexagons a moment gets). That keeps one
 * source of truth for the game's decisions across the desktop dock, the
 * portrait sheet, the flat board's rail and this HUD.
 *
 * The hexagon is the official app's action button shape; it sits in the one
 * corner a tilted board never reaches (its near edge is at the bottom, but
 * the fit centres it, and the corner is table).
 */
import { ReactNode } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { RAIL_WIDTH_CSS } from "@/lib/pro/mobileLayout";
import { HUD_SHEET_TOP } from "@/lib/pro/tableHud";
import type { HexId, HexSpec, TableHudBanner, TableHudControls } from "@/lib/pro/tableHud";

/** A flat-topped hexagon with points left and right, like the reference app's. */
const HEX_CLIP = "polygon(24% 0, 76% 0, 100% 50%, 76% 100%, 24% 100%, 0 50%)";
/** Sizes of the big hexagon and the small ones beside it (w, h: a regular hexagon's ratio). */
const HEX_SIZE = { main: { w: "5.6rem", h: "4.85rem" }, minor: { w: "3.6rem", h: "3.1rem" } } as const;
/** Width of the rim an outline hexagon draws (the gap between its two layers). */
const HEX_RIM = "3px";

const hexColors = (emphasis: HexSpec["emphasis"]) =>
  emphasis === "gold"
    ? { rim: "#F2C14E", face: "linear-gradient(180deg, #F2C14E, #C98F1C)", ink: "#26142B" }
    : emphasis === "outline"
    ? { rim: "#E0A82E", face: "linear-gradient(180deg, #3A2140, #26142B)", ink: "#E0A82E" }
    : { rim: "rgba(250, 235, 215, 0.35)", face: "linear-gradient(180deg, #3A2140, #26142B)", ink: "#FAEBD7" };

const Hex = ({
  spec,
  size,
  title,
  onPress,
}: {
  spec: HexSpec;
  size: "main" | "minor";
  title?: string;
  onPress: (id: HexId) => void;
}) => {
  const colors = hexColors(spec.emphasis);
  return (
    <Box
      as="button"
      type="button"
      data-hud-hex={spec.id}
      aria-label={spec.label}
      aria-disabled={spec.disabled || undefined}
      title={title}
      onClick={() => !spec.disabled && onPress(spec.id)}
      position="relative"
      flexShrink={0}
      w={HEX_SIZE[size].w}
      h={HEX_SIZE[size].h}
      pointerEvents="auto"
      opacity={spec.disabled ? 0.45 : 1}
      cursor={spec.disabled ? "not-allowed" : "pointer"}
      // A drop shadow cannot follow a clip-path; a filter can.
      filter="drop-shadow(0 6px 10px rgba(12, 4, 16, 0.6))"
      transition="transform 0.1s ease"
      _active={spec.disabled ? undefined : { transform: "scale(0.95)" }}
    >
      <Box position="absolute" inset={0} bg={colors.rim} sx={{ clipPath: HEX_CLIP }} />
      <Box position="absolute" inset={HEX_RIM} bg={colors.face} sx={{ clipPath: HEX_CLIP }} />
      {/* Narrow side padding: the hexagon's points are empty anyway, and a
          wider pad broke MANEUVER mid-word. Words never break inside. */}
      <Flex position="absolute" inset={0} alignItems="center" justifyContent="center" px="0.4rem">
        <Text
          fontFamily="BebasNeueRegular"
          fontSize={size === "main" ? "1.1rem" : "0.95rem"}
          sx={{ overflowWrap: "normal", wordBreak: "keep-all" }}
          lineHeight={1}
          letterSpacing="0.04em"
          textAlign="center"
          textTransform="uppercase"
          color={colors.ink}
          noOfLines={2}
        >
          {spec.label}
        </Text>
      </Flex>
    </Box>
  );
};

export interface TableHudDockProps {
  banner: TableHudBanner | null;
  controls: TableHudControls;
  /** the full sentence behind a shortened primary label */
  primaryTitle?: string;
  /** the sheet's content (grab bar + dock body) while it is shown, else null */
  sheet: ReactNode | null;
  onControl: (id: HexId) => void;
}

export const TableHudDock = ({ banner, controls, primaryTitle, sheet, onControl }: TableHudDockProps) => (
  <>
    {banner && (
      <Flex
        data-table-hud-banner=""
        position="fixed"
        top={0}
        left="50%"
        transform="translateX(-50%)"
        zIndex={150}
        // Between the plates (at most 13.5rem each) with a little air, so a
        // long hint wraps instead of running under the opponent's plate.
        w="max-content"
        maxW="min(28rem, calc(100vw - 29rem))"
        minW="10rem"
        alignItems="center"
        gap="0.5rem"
        px="1.4rem"
        pb="0.35rem"
        pointerEvents="none"
        color="brand.parchment"
        bg="linear-gradient(180deg, rgba(30, 15, 34, 0.96), rgba(44, 24, 49, 0.9))"
        borderBottom="2px solid"
        borderColor={banner.tone === "mine" ? "brand.accent" : "rgba(250, 235, 215, 0.2)"}
        // The banner hangs from the top edge with bevelled sides, like the
        // reference app's — a tab, not a floating toast. Dots beside the
        // text. At most TWO lines (#877): one line cut the instruction off
        // mid-sentence on an iPhone 14 ("Tap a gold space on the board (2…"),
        // and two lines of this size plus padding hang ~42px — inside
        // HUD_TOP_RESERVE_PX (48), the strip the board's fit keeps clear, so
        // it still sits above the far row's HP badges. Two lines of the OLD
        // 1.2 line-height at the old reserve (30px) is what once hid one.
        sx={{
          clipPath: "polygon(0 0, 100% 0, calc(100% - 0.9rem) 100%, 0.9rem 100%)",
          paddingTop: "calc(0.35rem + env(safe-area-inset-top, 0px))",
        }}
        title={banner.detail ? `${banner.title} · ${banner.detail}` : banner.title}
      >
        <Text fontSize="0.74rem" fontWeight={700} lineHeight={1.15} noOfLines={2} minW={0} textAlign="center">
          {banner.title}
        </Text>
        {(banner.pips > 0 || banner.detail) && (
          <Flex alignItems="center" gap="0.25rem" flexShrink={0}>
            {Array.from({ length: banner.pips }, (_, i) => (
              <Box key={i} data-hud-pip="" boxSize="0.45rem" borderRadius="50%" bg="brand.accent" />
            ))}
            {banner.detail && (
              <Text fontSize="0.68rem" opacity={0.8} whiteSpace="nowrap">
                {banner.detail}
              </Text>
            )}
          </Flex>
        )}
      </Flex>
    )}

    {(controls.main || controls.minor.length > 0) && (
      <Flex
        data-table-hud-hexes=""
        position="fixed"
        zIndex={160}
        alignItems="flex-end"
        gap="0.3rem"
        pointerEvents="none"
        sx={{
          right: "calc(0.6rem + env(safe-area-inset-right, 0px))",
          bottom: "calc(0.4rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {controls.minor.map((spec) => (
          <Hex key={spec.id} spec={spec} size="minor" onPress={onControl} />
        ))}
        {controls.main && (
          <Hex
            spec={controls.main}
            size="main"
            title={controls.main.id === "primary" ? primaryTitle : undefined}
            onPress={onControl}
          />
        )}
      </Flex>
    )}

    {sheet && (
      <Flex
        data-testid="table-hud-sheet"
        position="fixed"
        zIndex={160}
        w={RAIL_WIDTH_CSS}
        direction="column"
        minH={0}
        overflow="hidden"
        borderRadius="0.9rem"
        border="1.5px solid"
        borderColor="brand.accent"
        boxShadow="0 10px 30px rgba(12, 4, 16, 0.6)"
        bg="linear-gradient(180deg, rgba(58, 33, 64, 0.97), rgba(38, 20, 43, 0.98))"
        pointerEvents="auto"
        sx={{
          // Below the plates, above the bottom edge: the board stays visible to
          // its left, which is where the prompt usually asks you to tap.
          top: `calc(${HUD_SHEET_TOP} + env(safe-area-inset-top, 0px))`,
          bottom: "calc(0.5rem + env(safe-area-inset-bottom, 0px))",
          right: "calc(0.5rem + env(safe-area-inset-right, 0px))",
        }}
      >
        {sheet}
      </Flex>
    )}
  </>
);
