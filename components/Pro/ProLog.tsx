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
import { CloseIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, DownloadIcon } from "@chakra-ui/icons";
import { TbBug } from "react-icons/tb";
import styled from "@emotion/styled";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { colors, fonts } from "@/styles/style";
import { ProLogEntry, ProLogActionGroup, groupLog, logEntriesToCsv } from "@/lib/pro/gameLog";
import { CardInstanceId } from "@/lib/pro/protocol";
import { ResolveCard } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";

export type { ProLogEntry };

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

/**
 * Mobile (issue #708): the same panel as a bottom sheet the match strip's log
 * button opens, instead of a square permanently parked over the hand. It sits
 * one rung above the decision sheet in the z ladder — the same rung the
 * floating panel holds on desktop, relative to the dock.
 */
const SheetPanel = styled(Box)`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 146;
  max-height: 68svh;
  display: flex;
  flex-direction: column;
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  border-top: 1px solid rgba(72, 40, 79, 0.25);
  border-top-left-radius: 0.9rem;
  border-top-right-radius: 0.9rem;
  box-shadow: 0 -10px 28px rgba(20, 8, 24, 0.45);
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom, 0px);
`;

/** Scrim behind the mobile log sheet — tapping it closes. */
const SheetScrim = styled(Box)`
  position: fixed;
  inset: 0;
  z-index: 145;
  background: rgba(12, 4, 16, 0.5);
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

/** Turn divider — a small uppercase header the turn's action groups hang under. */
const TurnHeader = styled(Flex)`
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  user-select: none;
  padding: 0.2rem 0.1rem;
  margin-top: 0.15rem;
  color: ${colors.brand.secondary};

  :hover {
    opacity: 0.8;
  }
`;

/** One player action's lines, bordered + indented so an attack's reveal, damage
 *  and discard lines read as a single block. Neutral (no-action) batches get a
 *  lighter, label-less treatment. */
const ActionBlock = styled(Box)<{ neutral?: boolean }>`
  margin: 0.15rem 0 0.15rem 0.35rem;
  padding: 0.1rem 0 0.1rem 0.45rem;
  border-left: 2px solid
    ${(p) => (p.neutral ? "rgba(72, 40, 79, 0.14)" : "rgba(72, 40, 79, 0.35)")};
`;

/** Oldest-first CSV of the feed (entries arrive newest-first). */
const downloadCsv = (entries: ProLogEntry[]) => {
  const blob = new Blob([logEntriesToCsv(entries)], { type: "text/csv;charset=utf-8" });
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
  onReportBug,
  mobile = false,
  isOpen = false,
  onClose,
}: {
  entries: ProLogEntry[];
  /** when provided, lines that name cards preview them on hover */
  resolveCard?: ResolveCard;
  labelFor?: (instance: CardInstanceId) => string;
  /** when provided, a small bug icon in the header opens the report dialog (#87) */
  onReportBug?: () => void;
  /** render as the mobile bottom sheet the match strip opens (issue #708) */
  mobile?: boolean;
  /** mobile only: whether the sheet is showing. Ignored on desktop, where the
   *  panel floats permanently and owns its own collapse state. */
  isOpen?: boolean;
  onClose?: () => void;
}) => {
  const [open, setOpen] = useState(true);
  // Per-section collapse overrides, keyed by the section's own id rather than
  // its turn number: a rewind can put one turn in two sections, and keying by
  // turn made both share a single collapse state (and collide as React keys),
  // so clicking either header appeared to do nothing (issue #522). Default: the
  // newest section is expanded, older ones collapsed; a click flips (and
  // remembers) that section's state.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [entries.length, open, isOpen]);

  const sections = useMemo(() => groupLog(entries), [entries]);
  const latestSection = sections[0]?.id;
  const isSectionCollapsed = (id: string) => collapsedSections[id] ?? id !== latestSection;
  const toggleSection = (id: string) =>
    setCollapsedSections((cur) => ({ ...cur, [id]: !isSectionCollapsed(id) }));

  const cardPreview = (cards: CardInstanceId[]) =>
    resolveCard ? (
      <Flex gap="0.5rem" p="0.25rem">
        {cards.map((c, i) => (
          <Box key={`${c}-${i}`} w="13.5rem" sx={{ aspectRatio: "63 / 88" }}>
            <CardFace card={resolveCard(c)} fallback={labelFor?.(c) ?? c} />
          </Box>
        ))}
      </Flex>
    ) : null;

  const renderLine = (e: ProLogEntry) => {
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
            // Default Chakra tooltip maxW (320px) would clip the enlarged
            // preview once a line names more than one card — let it size to
            // its contents; popper still repositions to avoid viewport edges.
            maxW="none"
          >
            {line}
          </Tooltip>
        ) : (
          line
        )}
      </Flex>
    );
  };

  const renderGroup = (group: ProLogActionGroup, key: string | number) => (
    <ActionBlock key={key} neutral={!group.phase}>
      {group.phase && (
        <Text
          fontFamily={fonts.SpaceGrotesk}
          fontSize="0.62rem"
          fontWeight={700}
          letterSpacing="0.06em"
          textTransform="uppercase"
          color={colors.brand.secondary}
          opacity={0.75}
          mb="0.05rem"
        >
          {group.phase}
        </Text>
      )}
      {group.entries.map(renderLine)}
    </ActionBlock>
  );

  // The sheet is never collapsed-in-place: it is either open or not rendered.
  const bodyShown = mobile ? true : open;

  const feed = (
    <Box
      ref={scrollRef}
      maxH={mobile ? undefined : "11rem"}
      flex={mobile ? "1" : undefined}
      minH={mobile ? 0 : undefined}
      overflowY="auto"
      px="0.75rem"
      py="0.4rem"
    >
      {entries.length === 0 ? (
        <Text fontSize="0.72rem" opacity={0.55} py="0.25rem">
          No actions yet
        </Text>
      ) : (
        sections.map((section) => {
          const collapsed = isSectionCollapsed(section.id);
          return (
            <Box key={section.id}>
              <TurnHeader onClick={() => toggleSection(section.id)}>
                {collapsed ? (
                  <ChevronRightIcon boxSize="0.8rem" />
                ) : (
                  <ChevronDownIcon boxSize="0.8rem" />
                )}
                <Text
                  fontFamily={fonts.SpaceGrotesk}
                  fontWeight={700}
                  fontSize="0.66rem"
                  letterSpacing="0.06em"
                  textTransform="uppercase"
                >
                  {section.turn != null ? `Turn ${section.turn}` : "Log"}
                  {section.actor ? ` — ${section.actor}` : ""}
                </Text>
              </TurnHeader>
              {!collapsed &&
                section.groups.map((group, gi) => renderGroup(group, group.batchId ?? gi))}
            </Box>
          );
        })
      )}
    </Box>
  );

  const header = (
    <Header onClick={() => (mobile ? onClose?.() : setOpen((o) => !o))}>
        <Text
          fontFamily={fonts.SpaceGrotesk}
          fontWeight={700}
          fontSize="0.72rem"
          letterSpacing="0.08em"
          textTransform="uppercase"
        >
          Activity
        </Text>
        <Flex alignItems="center" gap="0.55rem">
          {onReportBug && (
            <Tooltip label="Report a bug (attaches this log + game state)" hasArrow>
              <Box
                as="button"
                type="button"
                display="flex"
                aria-label="Report a bug"
                opacity={0.7}
                _hover={{ opacity: 1, color: colors.brand.secondary }}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation(); // don't collapse the panel
                  onReportBug();
                }}
              >
                <TbBug size="0.9rem" />
              </Box>
            </Tooltip>
          )}
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
          {mobile ? (
            <CloseIcon boxSize="0.7rem" aria-label="Close activity log" />
          ) : open ? (
            <ChevronUpIcon boxSize="1rem" />
          ) : (
            <ChevronDownIcon boxSize="1rem" />
          )}
        </Flex>
      </Header>
  );

  if (mobile) {
    if (!isOpen) return null;
    return (
      <>
        <SheetScrim onClick={() => onClose?.()} />
        <SheetPanel>
          {header}
          {feed}
        </SheetPanel>
      </>
    );
  }

  return (
    <Panel>
      {header}
      {bodyShown && feed}
    </Panel>
  );
};
