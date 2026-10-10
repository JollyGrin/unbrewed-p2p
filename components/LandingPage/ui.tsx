import { Box, BoxProps, Text } from "@chakra-ui/react";

/** A full-width landing section: an `id` to link to and an h2 that labels it. */
export const Section = ({
  id,
  children,
  inner,
  ...rest
}: { id: string; inner?: BoxProps } & BoxProps) => (
  <Box
    as="section"
    id={id}
    aria-labelledby={`${id}-heading`}
    py={{ base: "3.5rem", md: "4.5rem" }}
    scrollMarginTop="4rem"
    {...rest}
  >
    <Box maxW="70rem" mx="auto" px="1rem" {...inner}>
      {children}
    </Box>
  </Box>
);

/**
 * Gold ink for small text on parchment. brand.accentDeep is only 2.2–2.7:1 on
 * the light bands; this darker gold clears AA (5.3:1 on brand.highlight).
 */
export const GOLD_INK = "#7A5212";

export const Eyebrow = ({ children, color = GOLD_INK }: { children: React.ReactNode; color?: string }) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontSize="0.75rem"
    fontWeight={700}
    letterSpacing="0.14em"
    textTransform="uppercase"
    color={color}
  >
    {children}
  </Text>
);

export const H2 = ({ id, children, ...rest }: { id: string; children: React.ReactNode } & BoxProps) => (
  <Box
    as="h2"
    id={`${id}-heading`}
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize={{ base: "1.75rem", md: "2.4rem" }}
    lineHeight="1.1"
    letterSpacing="-0.01em"
    mt="0.35rem"
    sx={{ textWrap: "balance" }}
    {...rest}
  >
    {children}
  </Box>
);

export const Chip = ({ children, ...rest }: { children: React.ReactNode } & BoxProps) => (
  <Box
    as="span"
    fontSize="0.78rem"
    fontWeight={600}
    px="0.55rem"
    py="0.2rem"
    borderRadius="full"
    border="1px solid"
    borderColor="rgba(72,40,79,.25)"
    whiteSpace="nowrap"
    {...rest}
  >
    {children}
  </Box>
);
