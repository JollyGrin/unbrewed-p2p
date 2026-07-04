/**
 * Pro activity feed — same parchment panel language as the sandbox ActionLog
 * (components/Game/ActionLog), docked bottom-left so it stays clear of the
 * HUD plates, the right control dock, and the hand fan.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ProLogLine } from "@/lib/pro/gameLog";

export interface ProLogEntry extends ProLogLine {
  key: string;
}

const Panel = styled(Box)`
  position: fixed;
  left: 0.75rem;
  bottom: 1rem;
  z-index: 145;
  width: 230px;
  max-width: calc(100vw - 2rem);
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  border: 1px solid rgba(72, 40, 79, 0.25);
  border-radius: 0.75rem;
  box-shadow: 0 6px 18px rgba(20, 8, 24, 0.35);
  overflow: hidden;
  opacity: 0.94;
`;

const Header = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(72, 40, 79, 0.18);

  :hover {
    background-color: ${colors.brand.highlight};
  }
`;

const WHO_COLOR: Record<ProLogEntry["who"], string> = {
  you: colors.brand.secondary,
  opp: "#8a4b5e",
  game: colors.brand.surfaceDim,
};

/** Newest first; caller owns the entry list. */
export const ProLog = ({ entries }: { entries: ProLogEntry[] }) => {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [entries.length, open]);

  return (
    <Panel>
      <Header onClick={() => setOpen((o) => !o)}>
        <Text
          fontFamily={fonts.SpaceGrotesk}
          fontWeight={700}
          fontSize="0.72rem"
          letterSpacing="0.08em"
          textTransform="uppercase"
        >
          Activity
        </Text>
        {open ? <ChevronUpIcon boxSize="1rem" /> : <ChevronDownIcon boxSize="1rem" />}
      </Header>
      {open && (
        <Box ref={scrollRef} maxH="11rem" overflowY="auto" px="0.75rem" py="0.4rem">
          {entries.length === 0 ? (
            <Text fontSize="0.72rem" opacity={0.55} py="0.25rem">
              No actions yet
            </Text>
          ) : (
            entries.map((e) => (
              <Flex key={e.key} gap="0.4rem" py="0.14rem" align="baseline">
                <Text
                  fontFamily={fonts.SpaceGrotesk}
                  fontSize="0.72rem"
                  lineHeight="1.25"
                  color={WHO_COLOR[e.who]}
                  fontWeight={e.who === "game" ? 700 : 400}
                >
                  {e.text}
                </Text>
              </Flex>
            ))
          )}
        </Box>
      )}
    </Panel>
  );
};
