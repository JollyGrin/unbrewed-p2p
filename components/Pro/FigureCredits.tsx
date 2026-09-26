/**
 * The credit for a hero's miniature (unbrewed-p2p-903) — model, creator,
 * licence (linked to its deed), a link to the source and, for any licence
 * but CC0, a notice that the renders modify the model — plus the figurine itself for hero-view
 * surfaces. One component for every place it appears (the hero preview on
 * /pro and /pro/game, and the in-game seat info), so the credit can never
 * drift between them. CC-BY makes showing it a licence obligation, which is
 * why the data comes from the figure manifest (lib/pro/figures) and never
 * from text in a component: an open-set figure without it is never shown.
 */
import { Box, Flex, Image, Link, Text } from "@chakra-ui/react";
import type { Figure, FigureCredit } from "@/lib/pro/figures";

export const FigureCredits = ({ credit, compact = false }: { credit: FigureCredit; compact?: boolean }) => (
  <Box data-testid="figure-credits" fontSize={compact ? "0.68rem" : "0.75rem"} lineHeight="1.35">
    <Text fontWeight="bold" color="brand.accent" textTransform="uppercase" letterSpacing="0.06em" fontSize="0.62rem">
      Miniature credits
    </Text>
    <Text>
      <Text as="span" fontWeight="bold">
        {credit.modelName}
      </Text>{" "}
      by {credit.creator}
    </Text>
    <Text opacity={0.85}>
      Licence:{" "}
      {credit.licenseUrl ? (
        <Link href={credit.licenseUrl} isExternal textDecoration="underline" color="brand.highlight">
          {credit.license}
        </Link>
      ) : (
        credit.license
      )}{" "}
      ·{" "}
      <Link href={credit.sourceUrl} isExternal textDecoration="underline" color="brand.highlight">
        Source
      </Link>
    </Text>
    {/* CC BY / BY-SA ask that changes be indicated: the renders light,
        recolour and flatten the model. Public-domain models need no notice. */}
    {credit.modified && (
      <Text opacity={0.7} fontStyle="italic" data-testid="figure-modified-notice">
        Rendered and recoloured for Unbrewed.
      </Text>
    )}
  </Box>
);

/** A hero's figurine render with its credit beside it — nothing at all for a
 *  hero without a figure. */
export const HeroFigurine = ({ figure, heroName }: { figure: Figure | null; heroName: string }) => {
  if (!figure) return null;
  return (
    <Flex
      data-testid="hero-figurine"
      align="center"
      gap="0.75rem"
      p="0.5rem"
      borderRadius="md"
      bg="rgba(0,0,0,0.25)"
      border="1px solid"
      borderColor="whiteAlpha.200"
    >
      <Image
        src={figure.url}
        alt={`${heroName} miniature`}
        h={{ base: "6.5rem", md: "8rem" }}
        w="auto"
        objectFit="contain"
        flexShrink={0}
        draggable={false}
      />
      {figure.credit && <FigureCredits credit={figure.credit} />}
    </Flex>
  );
};
