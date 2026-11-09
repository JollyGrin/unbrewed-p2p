import { Box, Flex } from "@chakra-ui/react";
import { FC } from "react";

/**
 * The 18 Material "500" swatches react-color's CirclePicker shipped as its
 * default palette. Lowercase, so a stored pick compares as-is.
 */
export const CIRCLE_COLORS = [
  "#f44336",
  "#e91e63",
  "#9c27b0",
  "#673ab7",
  "#3f51b5",
  "#2196f3",
  "#03a9f4",
  "#00bcd4",
  "#009688",
  "#4caf50",
  "#8bc34a",
  "#cddc39",
  "#ffeb3b",
  "#ffc107",
  "#ff9800",
  "#ff5722",
  "#795548",
  "#607d8b",
];

const SIZE = 28;
const SPACING = 14;

/**
 * A row of colour circles, drop-in for react-color's CirclePicker with its
 * default sizes: 28px discs on a 14px grid, 252px wide (six per row). The
 * picked disc hollows to a 3px ring; a hovered one grows 1.2x; a
 * keyboard-focused one glows in its own colour.
 */
export const ColorCircles: FC<{
  color: string;
  onChange: (hex: string) => void;
  colors?: string[];
}> = ({ color, onChange, colors = CIRCLE_COLORS }) => {
  const picked = color.toLowerCase();
  return (
    <Flex
      role="group"
      aria-label="Player color"
      w={`${6 * (SIZE + SPACING)}px`}
      wrap="wrap"
      mr={`-${SPACING}px`}
      mb={`-${SPACING}px`}
    >
      {colors.map((c) => {
        const active = picked === c.toLowerCase();
        const fill = `inset 0 0 0 ${active ? 3 : SIZE / 2 + 1}px ${c}`;
        return (
          <Box
            key={c}
            w={`${SIZE}px`}
            h={`${SIZE}px`}
            mr={`${SPACING}px`}
            mb={`${SPACING}px`}
            transform="scale(1)"
            transition="100ms transform ease"
            _hover={{ transform: "scale(1.2)" }}
          >
            <Box
              as="button"
              type="button"
              title={c}
              aria-label={c}
              aria-pressed={active}
              onClick={() => onChange(c)}
              display="block"
              w="100%"
              h="100%"
              p={0}
              border="none"
              borderRadius="50%"
              bg="transparent"
              cursor="pointer"
              outline="none"
              boxShadow={fill}
              transition="100ms box-shadow ease"
              _focusVisible={{ boxShadow: `${fill}, 0 0 5px ${c}` }}
            />
          </Box>
        );
      })}
    </Flex>
  );
};
