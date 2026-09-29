import { useEffect, useMemo, useState } from "react";
import { Box, Flex } from "@chakra-ui/react";

import { Navbar } from "@/components/Navbar";
import { PageSeo } from "@/components/Helmet/Head";
import { getChangelogEntries } from "@/lib/changelog/entries";
import { useChangelogSeen } from "@/lib/changelog/useChangelogSeen";
import type { ChangelogEntry } from "@/lib/changelog/types";

import { ChangelogCard } from "./ChangelogCard";
import { ChangelogFilters, ChangelogFilter } from "./ChangelogFilters";
import { formatChangelogDate } from "./formatChangelogDate";

const PAGE_SIZE = 10;
/** Long enough that a visitor who arrived to see "what's new" has actually
 * seen the pills before they're cleared; short enough not to linger if they
 * navigate away first (the unmount cleanup marks seen immediately then). */
const MARK_SEEN_DELAY_MS = 2500;

const EMPTY_STATE_LABEL: Record<ChangelogFilter, string> = {
  all: "updates",
  deck: "deck updates",
  feature: "feature updates",
  fix: "fixes",
};

type ChangelogGroup = { date: string; entries: ChangelogEntry[] };

/** Entries are already sorted newest-first, so same-date entries are always
 * adjacent — a single pass is enough to bucket them. */
const groupByDate = (entries: ChangelogEntry[]): ChangelogGroup[] => {
  const groups: ChangelogGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) {
      last.entries.push(entry);
    } else {
      groups.push({ date: entry.date, entries: [entry] });
    }
  }
  return groups;
};

export const ChangelogPage = () => {
  const entries = getChangelogEntries();
  const { unseen, markAllSeen } = useChangelogSeen();
  const [filter, setFilter] = useState<ChangelogFilter>("all");
  const [showAll, setShowAll] = useState(false);

  // Switching filters starts collapsed again — "10 newest" should mean the
  // 10 newest *of the current filter*, not whatever was left expanded.
  useEffect(() => {
    setShowAll(false);
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(markAllSeen, MARK_SEEN_DELAY_MS);
    return () => {
      clearTimeout(timer);
      markAllSeen();
    };
  }, [markAllSeen]);

  const unseenIds = useMemo(() => new Set(unseen.map((entry) => entry.id)), [unseen]);

  const filtered = useMemo(
    () => (filter === "all" ? entries : entries.filter((entry) => entry.tags.includes(filter))),
    [entries, filter],
  );

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const hasMore = filtered.length > visible.length;
  const groups = useMemo(() => groupByDate(visible), [visible]);

  return (
    <Box bg="brand.highlight" minH="100svh">
      <PageSeo
        path="/changelog"
        title="Changelog — What's New on Unbrewed | Unbrewed"
        description="New decks, new ways to play and the fixes that matter at the table."
      />

      <Box bg="brand.secondary" color="brand.primary">
        <Navbar />
        <Flex justify="center" px={{ base: "16px", md: "40px" }} pt={{ base: "24px", md: "36px" }} pb={{ base: "28px", md: "44px" }}>
          <Flex direction="column" gap="10px" maxW="880px" w="100%">
            <Box fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" fontSize="0.85rem" opacity={0.75}>
              Changelog
            </Box>
            <Box fontFamily="SpaceGrotesk" fontWeight={700} fontSize={{ base: "32px", md: "48px" }} lineHeight="1.05">
              What&apos;s new on Unbrewed
            </Box>
            <Box fontSize="16px" lineHeight="1.5" opacity={0.85} maxW="600px">
              New decks, new ways to play and the fixes that matter at the table.
            </Box>
          </Flex>
        </Flex>
      </Box>

      <Flex justify="center" px={{ base: "16px", md: "40px" }} pt="32px" pb="48px">
        <Flex direction="column" gap="32px" maxW="880px" w="100%">
          <ChangelogFilters value={filter} onChange={setFilter} />

          {groups.length === 0 ? (
            <Box fontSize="15px" opacity={0.75}>
              No {EMPTY_STATE_LABEL[filter]} yet.
            </Box>
          ) : (
            groups.map((group) => (
              <Flex key={group.date} direction="column" gap="14px">
                <Box
                  fontFamily="SpaceGrotesk"
                  fontWeight={700}
                  fontSize="20px"
                  color="brand.secondary"
                  borderBottom="2px solid"
                  borderColor="brand.parchmentDeep"
                  pb="8px"
                >
                  {formatChangelogDate(group.date)}
                </Box>
                {group.entries.map((entry) => (
                  <ChangelogCard key={entry.id} entry={entry} isNew={unseenIds.has(entry.id)} />
                ))}
              </Flex>
            ))
          )}

          {hasMore && (
            <Flex justify="center" pt="8px">
              <Box
                as="button"
                type="button"
                onClick={() => setShowAll(true)}
                minH="48px"
                px="28px"
                border="2px solid"
                borderColor="brand.secondary"
                borderRadius="0.5rem"
                bg="transparent"
                color="brand.secondary"
                fontFamily="SpaceGrotesk"
                fontWeight={700}
                fontSize="15px"
              >
                Older updates
              </Box>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Box>
  );
};
