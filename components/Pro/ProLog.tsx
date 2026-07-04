/**
 * Pro activity feed — same parchment panel language as the sandbox ActionLog
 * (components/Game/ActionLog), docked bottom-left so it stays clear of the
 * HUD plates, the right control dock, and the hand fan.
 *
 * Lines that name specific cards (reveals, discards) show the real card faces
 * on hover so rules text can be double-checked without leaving the log; the
 * header offers a CSV download of the whole feed (playtest feedback, #76).
 */
import { Box, Flex, Text, Tooltip } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon } from "@chakra-ui/icons";
import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ProLogLine } from "@/lib/pro/gameLog";
import { CardInstanceId } from "@/lib/pro/protocol";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";

export interface ProLogEntry extends ProLogLine {
  key: string;
  /** ms epoch when the line was appended (client clock; used for CSV export) */
  ts?: number;
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

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Oldest-first CSV of the feed (entries arrive newest-first). */
const downloadCsv = (entries: ProLogEntry[]) => {
  const rows = [
    "time,who,text",
    ...[...entries]
      .reverse()
      .map((e) =>
        [e.ts ? new Date(e.ts).toISOString() : "", e.who, csvCell(e.text)].join(",")
      ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unbrewed-pro-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/** Newest first; caller owns the entry list. */
export const ProLog = ({
  entries,
  resolveCard,
  labelFor,
}: {
  entries: ProLogEntry[];
  /** when provided, lines that name cards preview them on hover */
  resolveCard?: ResolveCard;
  labelFor?: (instance: CardInstanceId) => string;
}) => {
  const [open, setOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [entries.length, open]);

  const cardPreview = (cards: CardInstanceId[]) =>
    resolveCard ? (
      <Flex gap="0.5rem" p="0.25rem">
        {cards.map((c, i) => (
          <Box key={`${c}-${i}`} w="9rem" sx={{ aspectRatio: "63 / 88" }}>
            <CardFace card={resolveCard(c)} fallback={labelFor?.(c) ?? c} />
          </Box>
        ))}
      </Flex>
    ) : null;

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
        <Flex alignItems="center" gap="0.45rem">
          {entries.length > 0 && (
            <Tooltip label="Download the full log as CSV" hasArrow>
              <DownloadIcon
                boxSize="0.8rem"
                opacity={0.7}
                _hover={{ opacity: 1 }}
                onClick={(e) => {
                  e.stopPropagation(); // don't collapse the panel
                  downloadCsv(entries);
                }}
              />
            </Tooltip>
          )}
          {open ? <ChevronUpIcon boxSize="1rem" /> : <ChevronDownIcon boxSize="1rem" />}
        </Flex>
      </Header>
      {open && (
        <Box ref={scrollRef} maxH="11rem" overflowY="auto" px="0.75rem" py="0.4rem">
          {entries.length === 0 ? (
            <Text fontSize="0.72rem" opacity={0.55} py="0.25rem">
              No actions yet
            </Text>
          ) : (
            entries.map((e) => {
              const hoverable = !!resolveCard && !!e.cards?.length;
              const line = (
                <Text
                  fontFamily={fonts.SpaceGrotesk}
                  fontSize="0.72rem"
                  lineHeight="1.25"
                  color={WHO_COLOR[e.who]}
                  fontWeight={e.who === "game" ? 700 : 400}
                  textDecoration={hoverable ? "underline dotted" : undefined}
                  textUnderlineOffset="2px"
                  cursor={hoverable ? "help" : undefined}
                >
                  {e.text}
                </Text>
              );
              return (
                <Flex key={e.key} gap="0.4rem" py="0.14rem" align="baseline">
                  {hoverable ? (
                    <Tooltip
                      label={cardPreview(e.cards!)}
                      placement="right"
                      hasArrow
                      bg="brand.surfaceDim"
                      openDelay={150}
                    >
                      {line}
                    </Tooltip>
                  ) : (
                    line
                  )}
                </Flex>
              );
            })
          )}
        </Box>
      )}
    </Panel>
  );
};
