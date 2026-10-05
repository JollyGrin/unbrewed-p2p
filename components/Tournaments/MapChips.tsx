import { Box, Flex } from "@chakra-ui/react";

import { proMapOptions } from "@/lib/tournaments/options";
import type { MapRef } from "@/lib/tournaments/types";

export const MapChips = ({
  value,
  onPick,
  label,
}: {
  value: MapRef | null;
  onPick: (m: MapRef) => void;
  label: string;
}) => (
  <Flex gap="6px" flexWrap="wrap" role="radiogroup" aria-label={label}>
    {proMapOptions().map((m) => {
      const sel = value?.id === m.ref.id;
      return (
        <Box as="button" type="button" key={m.ref.id} role="radio" aria-checked={sel} onClick={() => onPick(m.ref)} px="12px" minH="36px" borderRadius="999px" fontSize="13px" fontWeight={600} bg={sel ? "#E0A82E" : "rgba(72,40,79,0.08)"} color="#2C1831">
          {m.title}
        </Box>
      );
    })}
  </Flex>
);
