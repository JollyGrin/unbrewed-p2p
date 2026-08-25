/**
 * The replays browser (#122) — the whole of /pro/replays except the beta-flag
 * gate, which stays in the page (pages/pro/replays.tsx). Extracted so the
 * upload + share-link flow (#567) is unit-testable, matching the thin-page /
 * tested-component split ProLanding already uses.
 *
 * The heavy lifting (rules) lives on the server: this stores bundles locally,
 * POSTs them to /replay for validation + expansion, and renders the scrubber.
 * Cloud upload is strictly additive on top of that — see lib/pro/replayCloud.ts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Box,
  Button,
  Flex,
  Grid,
  Heading,
  Icon,
  Progress,
  Tag,
  Text,
  Textarea,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { TbStar, TbStarFilled, TbDownload, TbShare2, TbTrash, TbPlayerPlay, TbUpload, TbFileImport, TbCloudUpload, TbLink } from "react-icons/tb";
import { useAccount } from "@/lib/account/useAccount";
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
  replayLabel,
} from "@/lib/pro/replayShare";
import {
  CLOUD_REPLAY_CAP,
  CloudReplaySummary,
  deleteCloudReplay,
  fetchSharedReplay,
  listCloudReplays,
  shareReplayPath,
  shareReplayUrl,
} from "@/lib/pro/replayCloud";
import { classifyReplayId } from "@/lib/pro/replayIds";
import { expansionFromFrames, readFrames, type BundleWithFrames } from "@/lib/pro/replayFrames";
import { copyLink, shareReplayLink } from "@/lib/pro/replayShareLink";
import { ReplayScrubber } from "@/components/Pro/ReplayScrubber";
import { replayCosmetics } from "@/lib/pro/seatCosmetics";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
const SAMPLE_URL = "/pro/replays/sample-kong-mirror.json";

const BTN = { size: "sm" as const, bg: "whiteAlpha.200", color: "brand.parchment", _hover: { bg: "whiteAlpha.400" } };
const BTN_GOLD = { ...BTN, bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accentDeep" } };

const heroName = (heroId: string) =>
  heroId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
const fmtDate = (ts: number) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
const fmtIsoDate = (iso: string) => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "—" : fmtDate(ms);
};

// ---------------------------------------------------------------------------

/**
 * What a recipient sees when they open someone else's `?open=<id>` link (#698).
 *
 * That link is a localStorage deep-link, not a share link: the bundle only
 * exists in the browser that played or imported the match. Before this the miss
 * was a silent no-op and the visitor got a blank page, so say plainly what went
 * wrong and what to ask the sender for.
 */
const MissingLocalReplay = ({ id, onDismiss }: { id: string; onDismiss: () => void }) => (
  <Box
    role="status"
    bg="rgba(60,16,20,0.55)"
    border="1px solid"
    borderColor="#E06A5E"
    borderRadius="0.6rem"
    p="1rem"
  >
    <Flex justify="space-between" align="flex-start" gap="0.75rem" flexWrap="wrap">
      <Box flex="1" minW="14rem">
        <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.04em">
          That replay isn&apos;t saved in this browser
        </Text>
        <Text fontSize="0.85rem" opacity={0.9} mt="0.3rem">
          Replays are stored on the device that played the match, so a{" "}
          <Text as="span" fontFamily="monospace">?open={id}</Text> link only opens for the player
          whose browser holds it — it can&apos;t be shared.
        </Text>
        <Text fontSize="0.85rem" opacity={0.9} mt="0.3rem">
          Ask whoever sent it for a <b>share link</b> (a <Text as="span" fontFamily="monospace">/share/replay/…</Text>{" "}
          URL, which works for anyone) or for the exported <b>.json</b> file — you can drop that
          into the import box below.
        </Text>
      </Box>
      <Button {...BTN} onClick={onDismiss} flexShrink={0}>Dismiss</Button>
    </Flex>
  </Box>
);

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
  uploading,
  canUpload,
  onOpen,
  onStar,
  onExport,
  onShare,
  onUpload,
  onDelete,
}: {
  entry: ReplayIndexEntry;
  busy: boolean;
  uploading: boolean;
  /** Signed in with a reachable API — the only case that offers cloud upload. */
  canUpload: boolean;
  onOpen: () => void;
  onStar: () => void;
  onExport: () => void;
  onShare: () => void;
  onUpload: () => void;
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
      <Tooltip label="Watch it here — this copy lives in this browser only" hasArrow>
        <Button {...BTN_GOLD} onClick={onOpen} isLoading={busy} leftIcon={<TbPlayerPlay />}>Open</Button>
      </Tooltip>
      <Tooltip label="Download .json" hasArrow><Button {...BTN} onClick={onExport} px="0.5rem"><TbDownload /></Button></Tooltip>
      <Tooltip label="Copy compact code / share" hasArrow><Button {...BTN} onClick={onShare} px="0.5rem"><TbShare2 /></Button></Tooltip>
      {canUpload && (
        <Tooltip label="Copy share link — uploads a copy first, then anyone with the link can watch" hasArrow>
          <Button {...BTN} onClick={onUpload} isLoading={uploading} px="0.5rem" aria-label={`Copy share link for ${heroName(entry.heroes[0])} vs ${heroName(entry.heroes[1])}`}>
            <TbCloudUpload />
          </Button>
        </Tooltip>
      )}
      <Tooltip label="Delete" hasArrow><Button {...BTN} onClick={onDelete} px="0.5rem" _hover={{ bg: "red.600" }}><TbTrash /></Button></Tooltip>
    </Flex>
  </Flex>
);

// ---------------------------------------------------------------------------

/**
 * "My cloud replays" (#567) — the signed-in user's uploaded copies, each one a
 * share link anyone can open. Rendered only when the accounts API answered; a
 * dead API leaves this page exactly as it is without accounts.
 */
const CloudReplays = ({
  replays,
  busyId,
  onOpen,
  onCopy,
  onDelete,
}: {
  replays: CloudReplaySummary[];
  busyId: string | null;
  onOpen: (row: CloudReplaySummary) => void;
  onCopy: (row: CloudReplaySummary) => void;
  onDelete: (row: CloudReplaySummary) => void;
}) => (
  <Box bg="rgba(20,8,24,0.5)" border="1px solid" borderColor="whiteAlpha.200" borderRadius="0.6rem" p="1rem">
    <Flex justify="space-between" align="center" mb="0.6rem" gap="0.5rem" flexWrap="wrap">
      <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.04em">My cloud replays</Text>
      <Text fontSize="0.75rem" opacity={0.7} sx={{ fontVariantNumeric: "tabular-nums" }}>
        {replays.length}/{CLOUD_REPLAY_CAP}
      </Text>
    </Flex>

    {replays.length === 0 ? (
      <Text fontSize="0.8rem" opacity={0.65}>
        Nothing uploaded yet — hit the cloud button on a saved replay to get a link you can paste anywhere.
      </Text>
    ) : (
      <Grid gap="0.4rem">
        {replays.map((row) => (
          <Flex key={row.id} align="center" gap="0.75rem" p="0.5rem 0.75rem" bg="rgba(0,0,0,0.25)" borderRadius="0.4rem">
            <Box flex="1" minW={0}>
              <Text fontSize="0.9rem" noOfLines={1}>{row.title || "Untitled replay"}</Text>
              <Flex gap="0.4rem" fontSize="0.7rem" opacity={0.7}>
                <Text>{fmtIsoDate(row.createdAt)}</Text>
                <Text>·</Text>
                <Text>{fmtBytes(row.bytes)}</Text>
              </Flex>
            </Box>
            <Flex gap="0.25rem" flexShrink={0}>
              <Button {...BTN_GOLD} onClick={() => onOpen(row)} isLoading={busyId === row.id} leftIcon={<TbPlayerPlay />}>Open</Button>
              <Tooltip label="Copy share link" hasArrow>
                <Button {...BTN} onClick={() => onCopy(row)} px="0.5rem" aria-label={`Copy share link for ${row.title || "untitled replay"}`}><TbLink /></Button>
              </Tooltip>
              <Tooltip label="Delete from the cloud" hasArrow>
                <Button {...BTN} onClick={() => onDelete(row)} px="0.5rem" _hover={{ bg: "red.600" }} aria-label={`Delete ${row.title || "untitled replay"} from the cloud`}><TbTrash /></Button>
              </Tooltip>
            </Flex>
          </Flex>
        ))}
      </Grid>
    )}
  </Box>
);

// ---------------------------------------------------------------------------

export const ReplaysBrowser = () => {
  const toast = useToast();
  const [entries, setEntries] = useState<ReplayIndexEntry[]>([]);
  const [meter, setMeter] = useState<StorageMeter>({ usedBytes: 0, budgetBytes: 0, ratio: 0, nearFull: false });
  const [expansion, setExpansion] = useState<ReplayExpansion | null>(null);
  // The cosmetics blobs frozen into the OPEN bundle (#615). Held beside the
  // expansion because the server's /replay expansion does not echo them — they
  // are render-only, so they never left the bundle.
  const [replayCosmeticBlobs, setReplayCosmeticBlobs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- cloud replays (#567) -------------------------------------------------
  // Signed-in only, and only while the API answers: every failure path below
  // leaves the page behaving exactly as it does with no accounts backend.
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  const [cloud, setCloud] = useState<CloudReplaySummary[] | null>(null);
  const [cloudBusyId, setCloudBusyId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const refreshCloud = useCallback(async () => {
    const res = await listCloudReplays();
    // An unreachable/unhappy API hides the section rather than showing an error.
    setCloud(res.ok ? res.replays : null);
  }, []);

  useEffect(() => {
    if (signedIn) void refreshCloud();
    else setCloud(null);
  }, [signedIn, refreshCloud]);

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

  /**
   * Validate a bundle via the server /replay, and (optionally) save it.
   *
   * A bundle that arrived from the cloud may carry the frames frozen in at
   * upload time (#701); those are played as-is, the same shortcut the public
   * share landing takes, so an uploaded replay keeps opening after an engine
   * release the raw bundle can no longer be verified against. `saveReplay`
   * strips them on the way into localStorage.
   */
  const openBundle = useCallback(
    async (bundle: BundleWithFrames, opts: { save?: boolean; id?: string } = {}) => {
      const frames = readFrames(bundle);
      let expanded: ReplayExpansion;
      if (frames) {
        expanded = expansionFromFrames(frames);
      } else {
        setBusyId(opts.id ?? "sample");
        const res = await fetchReplayExpansion(bundle);
        setBusyId(null);
        if (!res.ok) {
          toast({
            title: res.code === "VERSION_MISMATCH" ? "That replay is too old to replay" : "Couldn't load replay",
            description: res.message,
            status: "error",
            duration: 6000,
          });
          return false;
        }
        expanded = res.expansion;
      }
      if (opts.save) {
        const saved = saveReplay(bundle);
        if (!saved.ok) toast({ description: saved.error ?? "save failed", status: "warning" });
        refresh();
      }
      setReplayCosmeticBlobs(replayCosmetics(bundle));
      setExpansion(expanded);
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

  // Deep-link: /pro/replays?open=<id> auto-opens that saved replay once (issue
  // #240 — the "View your replay" link on the win/defeat screen lands here).
  //
  // The id namespaces are disjoint (lib/pro/replayIds.ts), so a uuid here is a
  // CLOUD share id someone pasted into the wrong URL: hand it to the public
  // landing that can actually fetch it rather than missing in localStorage. A
  // genuine local miss says so out loud (#698) instead of leaving the visitor
  // on an empty list, and a hit strips the param so copying the address bar
  // can't propagate a browser-only link.
  const router = useRouter();
  const autoOpenedRef = useRef(false);
  const [openMissId, setOpenMissId] = useState<string | null>(null);

  const dropOpenParam = useCallback(() => {
    const { open: _open, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  }, [router]);

  useEffect(() => {
    if (!router.isReady || autoOpenedRef.current) return;
    const raw = router.query.open;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (!id) return;
    autoOpenedRef.current = true;

    if (classifyReplayId(id) === "cloud") {
      void router.replace(shareReplayPath(id));
      return;
    }

    const bundle = loadReplay(id);
    if (!bundle) {
      setOpenMissId(id);
      return;
    }
    void openBundle(bundle, { id }).then((opened) => {
      if (opened) dropOpenParam();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.open, openBundle, dropOpenParam]);

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

  // --- cloud handlers (#567) ------------------------------------------------

  /** Upload a locally-saved replay and put its share link on the clipboard. */
  const onUpload = useCallback(
    async (entry: ReplayIndexEntry) => {
      const bundle = loadReplay(entry.id);
      if (!bundle) {
        toast({ description: "That replay's data is missing — nothing to upload.", status: "warning" });
        return;
      }
      setUploadingId(entry.id);
      const res = await shareReplayLink(bundle, replayLabel(bundle));
      setUploadingId(null);
      if (!res.ok) {
        toast({ title: res.title, description: res.description, status: res.status, duration: 7000 });
        return;
      }
      toast({ title: res.title, description: res.description, status: "success", duration: 7000 });
      void refreshCloud();
    },
    [toast, refreshCloud],
  );

  /** Open a cloud replay through the same public endpoint a recipient uses. */
  const onOpenCloud = useCallback(
    async (row: CloudReplaySummary) => {
      setCloudBusyId(row.id);
      const res = await fetchSharedReplay(row.id);
      setCloudBusyId(null);
      if (!res.ok) {
        toast({ title: "Couldn't load replay", description: res.message, status: "error", duration: 6000 });
        return;
      }
      await openBundle(res.replay.bundle);
    },
    [openBundle, toast],
  );

  const onCopyCloud = useCallback(
    (row: CloudReplaySummary) => {
      const url = shareReplayUrl(row.id);
      copyLink(url);
      toast({ title: "Share link copied", description: url, status: "success", duration: 6000 });
    },
    [toast],
  );

  const onDeleteCloud = useCallback(
    async (row: CloudReplaySummary) => {
      setCloudBusyId(row.id);
      const res = await deleteCloudReplay(row.id);
      setCloudBusyId(null);
      if (!res.ok) {
        toast({ title: "Couldn't delete that replay", description: res.message, status: "error", duration: 6000 });
        return;
      }
      toast({ description: "Removed from your cloud — the share link no longer works.", status: "info" });
      void refreshCloud();
    },
    [toast, refreshCloud],
  );

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
    return (
      <ReplayScrubber
        expansion={expansion}
        cosmetics={replayCosmeticBlobs}
        onExit={() => { setExpansion(null); refresh(); }}
      />
    );
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

        {/* a shared ?open= link that this browser can't resolve (#698) */}
        {openMissId && <MissingLocalReplay id={openMissId} onDismiss={() => setOpenMissId(null)} />}

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

        {/* cloud replays — signed-in + reachable API only (#567) */}
        {signedIn && cloud && (
          <CloudReplays
            replays={cloud}
            busyId={cloudBusyId}
            onOpen={onOpenCloud}
            onCopy={onCopyCloud}
            onDelete={onDeleteCloud}
          />
        )}

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
                uploading={uploadingId === entry.id}
                canUpload={signedIn && cloud !== null}
                onOpen={() => onOpenSaved(entry)}
                onStar={() => { toggleStar(entry.id); refresh(); }}
                onExport={() => onExport(entry)}
                onShare={() => onShare(entry)}
                onUpload={() => onUpload(entry)}
                onDelete={() => { deleteReplay(entry.id); refresh(); }}
              />
            ))}
          </Grid>
        )}
      </Flex>
    </Box>
  );
};

