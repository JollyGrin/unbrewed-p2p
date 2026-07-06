/**
 * /pro/replays — save, browse, and scrub full-match God-view replays (#122).
 * Ships DARK behind the beta-features flag (`?replays`, lib/flags.ts). The
 * heavy lifting (rules) lives on the server: this page stores bundles locally,
 * POSTs them to /replay for validation + expansion, and renders the scrubber.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Icon,
  Progress,
  Spinner,
  Tag,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { TbStar, TbStarFilled, TbDownload, TbShare2, TbTrash, TbPlayerPlay, TbUpload, TbFileImport } from "react-icons/tb";
import { useFlag } from "@/lib/flags";
import { ReplayExpansion, ReplayBundle } from "@/lib/pro/protocol";
import {
  ReplayIndexEntry,
  StorageMeter,
  deleteReplay,
  listReplays,
  loadReplay,
  purgeExpired,
  RETENTION_DAYS,
  saveReplay,
  storageMeter,
  toggleStar,
} from "@/lib/pro/replayStore";
import { fetchReplayExpansion } from "@/lib/pro/replayApi";
import {
  bundleFilename,
  compactCodeInfo,
  downloadBundle,
  parseBundle,
  readFileText,
} from "@/lib/pro/replayShare";
import { ReplayScrubber } from "@/components/Pro/ReplayScrubber";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
const SAMPLE_URL = "/pro/replays/sample-kong-mirror.json";

const BTN = { size: "sm" as const, bg: "whiteAlpha.200", color: "brand.parchment", _hover: { bg: "whiteAlpha.400" } };
const BTN_GOLD = { ...BTN, bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accentDeep" } };

const heroName = (heroId: string) =>
  heroId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const fmtDate = (ts: number) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

// ---------------------------------------------------------------------------

const StorageBar = ({ meter }: { meter: StorageMeter }) => (
  <Box maxW="30rem">
    <Flex justify="space-between" fontSize="0.75rem" opacity={0.8} mb="0.2rem">
      <Text>Local storage</Text>
      <Text sx={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtBytes(meter.usedBytes)} / {fmtBytes(meter.budgetBytes)}
      </Text>
    </Flex>
    <Progress
      value={meter.ratio * 100}
      size="sm"
      borderRadius="full"
      colorScheme={meter.nearFull ? "red" : "yellow"}
      bg="whiteAlpha.200"
    />
    {meter.nearFull && (
      <Text fontSize="0.7rem" color="#E06A5E" mt="0.2rem">
        storage almost full — unstarred replays are evicted oldest-first when saving
      </Text>
    )}
  </Box>
);

const ReplayRow = ({
  entry,
  busy,
  onOpen,
  onStar,
  onExport,
  onShare,
  onDelete,
}: {
  entry: ReplayIndexEntry;
  busy: boolean;
  onOpen: () => void;
  onStar: () => void;
  onExport: () => void;
  onShare: () => void;
  onDelete: () => void;
}) => (
  <Flex
    align="center"
    gap="0.75rem"
    p="0.75rem 1rem"
    bg="rgba(20,8,24,0.5)"
    border="1px solid"
    borderColor={entry.starred ? "brand.accent" : "whiteAlpha.200"}
    borderRadius="0.6rem"
  >
    <Tooltip label={entry.starred ? "Unstar (allow auto-delete)" : "Star (pin — never auto-deleted)"} hasArrow>
      <Box as="button" onClick={onStar} color={entry.starred ? "brand.accent" : "whiteAlpha.500"} _hover={{ color: "brand.accent" }}>
        <Icon as={entry.starred ? TbStarFilled : TbStar} boxSize="1.25rem" />
      </Box>
    </Tooltip>

    <Box flex="1" minW={0}>
      <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.03em" noOfLines={1}>
        {heroName(entry.heroes[0])} <Text as="span" opacity={0.6}>vs</Text> {heroName(entry.heroes[1])}
      </Text>
      <Flex gap="0.5rem" fontSize="0.72rem" opacity={0.75} flexWrap="wrap">
        <Text>{entry.mapTitle}</Text>
        <Text>·</Text>
        <Text>{entry.turns} turns</Text>
        <Text>·</Text>
        <Text>{fmtDate(entry.endedAt || entry.savedAt)}</Text>
        <Text>·</Text>
        <Text>{fmtBytes(entry.bytes)}</Text>
      </Flex>
    </Box>

    <Tag size="sm" bg={entry.winner ? "brand.accent" : "whiteAlpha.300"} color={entry.winner ? "brand.surfaceDim" : "brand.parchment"} flexShrink={0}>
      {entry.winner ? `${heroName(entry.winner === "p1" ? entry.heroes[0] : entry.heroes[1])} won` : "unfinished"}
    </Tag>

    <Flex gap="0.25rem" flexShrink={0}>
      <Button {...BTN_GOLD} onClick={onOpen} isLoading={busy} leftIcon={<TbPlayerPlay />}>Open</Button>
      <Tooltip label="Download .json" hasArrow><Button {...BTN} onClick={onExport} px="0.5rem"><TbDownload /></Button></Tooltip>
      <Tooltip label="Copy compact code / share" hasArrow><Button {...BTN} onClick={onShare} px="0.5rem"><TbShare2 /></Button></Tooltip>
      <Tooltip label="Delete" hasArrow><Button {...BTN} onClick={onDelete} px="0.5rem" _hover={{ bg: "red.600" }}><TbTrash /></Button></Tooltip>
    </Flex>
  </Flex>
);

// ---------------------------------------------------------------------------

const ReplaysList = () => {
  const toast = useToast();
  const [entries, setEntries] = useState<ReplayIndexEntry[]>([]);
  const [meter, setMeter] = useState<StorageMeter>({ usedBytes: 0, budgetBytes: 0, ratio: 0, nearFull: false });
  const [expansion, setExpansion] = useState<ReplayExpansion | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setEntries(listReplays());
    setMeter(storageMeter());
  }, []);

  // Lazy retention sweep on mount (no background timer in a static client).
  useEffect(() => {
    const purged = purgeExpired();
    if (purged.length) {
      toast({ description: `Cleaned up ${purged.length} unstarred replay${purged.length === 1 ? "" : "s"} older than ${RETENTION_DAYS} days.`, status: "info", duration: 4000 });
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Validate a bundle via the server /replay, and (optionally) save it. */
  const openBundle = useCallback(
    async (bundle: ReplayBundle, opts: { save?: boolean; id?: string } = {}) => {
      setBusyId(opts.id ?? "sample");
      const res = await fetchReplayExpansion(bundle);
      setBusyId(null);
      if (!res.ok) {
        toast({ title: "Couldn't load replay", description: res.message, status: "error", duration: 6000 });
        return false;
      }
      if (opts.save) {
        const saved = saveReplay(bundle);
        if (!saved.ok) toast({ description: saved.error ?? "save failed", status: "warning" });
        refresh();
      }
      setExpansion(res.expansion);
      return true;
    },
    [toast, refresh],
  );

  const onOpenSaved = useCallback(
    async (entry: ReplayIndexEntry) => {
      const bundle = loadReplay(entry.id);
      if (!bundle) {
        toast({ description: "That replay's data is missing — deleting the entry.", status: "warning" });
        deleteReplay(entry.id);
        refresh();
        return;
      }
      await openBundle(bundle, { id: entry.id });
    },
    [openBundle, toast, refresh],
  );

  const doImport = useCallback(
    async (text: string) => {
      setImportError(null);
      setImporting(true);
      try {
        const bundle = parseBundle(text);
        const ok = await openBundle(bundle, { save: true });
        if (ok) {
          setImportText("");
          toast({ description: "Replay imported and saved.", status: "success" });
        }
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "invalid bundle");
      } finally {
        setImporting(false);
      }
    },
    [openBundle, toast],
  );

  const onShare = useCallback(
    (entry: ReplayIndexEntry) => {
      const bundle = loadReplay(entry.id);
      if (!bundle) return;
      const info = compactCodeInfo(bundle);
      if (info.tooLongForDiscord) {
        downloadBundle(bundle);
        toast({
          title: "Too long to paste — downloaded the file",
          description: `Compact code is ${info.length.toLocaleString()} chars (Discord caps messages at 2000). Attach ${bundleFilename(bundle)} instead.`,
          status: "info",
          duration: 7000,
        });
        return;
      }
      navigator.clipboard?.writeText(info.code);
      toast({ description: `Compact code copied (${info.length} chars) — paste it anywhere.`, status: "success" });
    },
    [toast],
  );

  const onExport = useCallback((entry: ReplayIndexEntry) => {
    const bundle = loadReplay(entry.id);
    if (bundle) downloadBundle(bundle);
  }, []);

  const loadSample = useCallback(async () => {
    setBusyId("sample");
    try {
      const res = await fetch(SAMPLE_URL);
      const bundle = (await res.json()) as ReplayBundle;
      await openBundle(bundle, { save: true, id: "sample" });
    } catch {
      toast({ description: "Couldn't load the bundled sample.", status: "error" });
    } finally {
      setBusyId(null);
    }
  }, [openBundle, toast]);

  if (expansion) {
    return <ReplayScrubber expansion={expansion} onExit={() => { setExpansion(null); refresh(); }} />;
  }

  return (
    <Box minH="100svh" bg={TABLE_BG} color="brand.parchment" px={{ base: "1rem", md: "2rem" }} py="2.5rem">
      <Flex direction="column" maxW="52rem" mx="auto" gap="1.5rem">
        <Flex justify="space-between" align="flex-end" flexWrap="wrap" gap="1rem">
          <Box>
            <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem">
              REPLAYS
            </Heading>
            <Text opacity={0.75} fontSize="0.9rem">
              Re-watch your Pro matches in full God-view — every hand, deck, and token, step by step.
            </Text>
          </Box>
          <Flex gap="0.5rem">
            <Button {...BTN} onClick={loadSample} isLoading={busyId === "sample"} leftIcon={<TbFileImport />}>
              Load sample
            </Button>
          </Flex>
        </Flex>

        <StorageBar meter={meter} />

        {/* import */}
        <Box bg="rgba(20,8,24,0.5)" border="1px solid" borderColor="whiteAlpha.200" borderRadius="0.6rem" p="1rem">
          <Flex justify="space-between" align="center" mb="0.5rem" flexWrap="wrap" gap="0.5rem">
            <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.04em">Import a shared replay</Text>
            <Flex gap="0.5rem">
              <Button {...BTN} leftIcon={<TbUpload />} onClick={() => fileRef.current?.click()}>Upload file</Button>
              <Button {...BTN_GOLD} onClick={() => doImport(importText)} isLoading={importing} isDisabled={!importText.trim()}>
                Import pasted
              </Button>
            </Flex>
          </Flex>
          <Textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); if (importError) setImportError(null); }}
            placeholder="paste a replay bundle's JSON or compact code here…"
            rows={3}
            fontFamily="monospace"
            fontSize="0.7rem"
            bg="rgba(0,0,0,0.3)"
            borderColor="whiteAlpha.200"
            _focus={{ borderColor: "brand.accent" }}
          />
          {importError && <Text color="#E06A5E" fontSize="0.72rem" mt="0.3rem">{importError}</Text>}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await readFileText(file);
                await doImport(text);
              } catch (err) {
                setImportError(err instanceof Error ? err.message : "could not read file");
              } finally {
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
        </Box>

        {/* list */}
        {entries.length === 0 ? (
          <Flex direction="column" align="center" gap="0.75rem" py="3rem" opacity={0.7}>
            <Text fontSize="1rem">No saved replays yet.</Text>
            <Text fontSize="0.85rem" textAlign="center" maxW="26rem">
              Finish a Pro match and it saves here automatically, or <b>Load sample</b> to scrub a full King Kong mirror right now.
            </Text>
          </Flex>
        ) : (
          <Grid gap="0.6rem">
            {entries.map((entry) => (
              <ReplayRow
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                onOpen={() => onOpenSaved(entry)}
                onStar={() => { toggleStar(entry.id); refresh(); }}
                onExport={() => onExport(entry)}
                onShare={() => onShare(entry)}
                onDelete={() => { deleteReplay(entry.id); refresh(); }}
              />
            ))}
          </Grid>
        )}
      </Flex>
    </Box>
  );
};

// ---------------------------------------------------------------------------

const GatedNotice = ({ onEnable }: { onEnable: () => void }) => (
  <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
    <Flex direction="column" align="center" justify="center" minH="100svh" gap="1rem" px="1rem" textAlign="center">
      <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem">
        REPLAYS
      </Heading>
      <Text opacity={0.8} maxW="28rem">
        Full-match replays are a beta feature that isn&apos;t switched on yet.
      </Text>
      <Button {...BTN_GOLD} onClick={onEnable}>
        Enable beta replays
      </Button>
      <Text fontSize="0.75rem" opacity={0.5}>
        (or open this page with <code>?replays</code>)
      </Text>
    </Flex>
  </Box>
);

const ReplaysPage = () => {
  const [enabled, toggleReplays] = useFlag("replays");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <Head>
        <title>Unbrewed Pro — Replays</title>
        <meta name="robots" content="noindex" />
      </Head>
      {!mounted ? (
        <Flex minH="100svh" align="center" justify="center" bg={TABLE_BG}>
          <Spinner color="brand.accent" />
        </Flex>
      ) : enabled ? (
        <ReplaysList />
      ) : (
        <GatedNotice onEnable={toggleReplays} />
      )}
    </>
  );
};

export default ReplaysPage;
