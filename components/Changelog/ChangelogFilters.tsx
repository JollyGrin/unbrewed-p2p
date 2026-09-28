import { Box, Flex } from "@chakra-ui/react";
import type { ChangelogTag } from "@/lib/changelog/types";

export type ChangelogFilter = "all" | ChangelogTag;

export const CHANGELOG_FILTERS: { key: ChangelogFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deck", label: "Decks" },
  { key: "feature", label: "Features" },
  { key: "fix", label: "Fixes" },
];

interface ChangelogFiltersProps {
  value: ChangelogFilter;
  onChange: (filter: ChangelogFilter) => void;
}

export const ChangelogFilters = ({ value, onChange }: ChangelogFiltersProps) => (
  <Flex gap="10px" wrap="wrap">
    {CHANGELOG_FILTERS.map((option) => {
      const active = option.key === value;
      return (
        <Box
          key={option.key}
          as="button"
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.key)}
          minH="44px"
          minW="44px"
          px="18px"
          border="2px solid"
          borderColor="brand.secondary"
          borderRadius="full"
          bg={active ? "brand.secondary" : "transparent"}
          color={active ? "brand.primary" : "brand.secondary"}
          fontFamily="ArchivoNarrow"
          fontSize="14px"
          textTransform="uppercase"
          letterSpacing="0.08em"
        >
          {option.label}
        </Box>
      );
    })}
  </Flex>
);
