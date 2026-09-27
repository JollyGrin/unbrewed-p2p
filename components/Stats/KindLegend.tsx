/** The three opponent-kind swatches (human / hard-expert / casual). */
import { Box } from "@chakra-ui/react";

import { OPPONENT_KINDS, OpponentKind } from "@/lib/stats/types";

import { KIND_COLOR, KIND_LABEL } from "./tokens";

export const KindSwatch = ({ kind }: { kind: OpponentKind }) => (
  <Box as="span" w="10px" h="10px" borderRadius="2px" bg={KIND_COLOR[kind]} flexShrink={0} display="inline-block" />
);

export const KindLegend = ({ labels = KIND_LABEL }: { labels?: Record<OpponentKind, string> }) => (
  <Box display="flex" gap="14px" flexWrap="wrap" fontSize="13px">
    {OPPONENT_KINDS.map((kind) => (
      <Box key={kind} display="flex" gap="6px" alignItems="center">
        <KindSwatch kind={kind} />
        {labels[kind]}
      </Box>
    ))}
  </Box>
);
