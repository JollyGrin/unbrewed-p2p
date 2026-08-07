/**
 * Cloud bag UI (issue #566) — the shelf of saved items and the "Save to cloud"
 * button, for both decks and maps.
 *
 * Sync is explicit and dumb on purpose: one button uploads one item, one button
 * downloads it back, and nothing merges behind the user's back. The local bag
 * stays the source of truth for play; the cloud is a shelf you put copies on.
 *
 * Every state that isn't "signed in against a reachable API" renders either
 * nothing or one quiet line — a guest's Bag must look exactly like it does
 * today, and so must everyone's when the API is down.
 */
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { FaCloud, FaCloudDownloadAlt, FaDiscord, FaLink } from "react-icons/fa";

import {
  BAG_ITEM_CAP,
  BagKind,
  cloudFailureMessage,
  formatBytes,
  formatStamp,
  shareUrl,
} from "@/lib/account/bagCloud";
import { signInUrl } from "@/lib/account/useAccount";
import { useCloudBag } from "@/lib/account/useCloudBag";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";

/**
 * The one-press upload, shared by the deck action bar and the map shelf.
 * `ready` is false for a guest and for an unreachable API, and both callers
 * render nothing at all in that case.
 */
const useCloudSave = (kind: BagKind, name: string, data: unknown) => {
  const { status, save, isFull, items } = useCloudBag(kind);
  const [saving, setSaving] = useState(false);
  const alreadyThere = items.some((item) => item.name === name);

  return {
    ready: status === "ready",
    saving,
    alreadyThere,
    /** A full bag still accepts an overwrite of something already up there. */
    blocked: isFull && !alreadyThere,
    count: items.length,
    run: async () => {
      setSaving(true);
      const result = await save(name, data);
      setSaving(false);
      if (!result.ok) {
        toast.error(cloudFailureMessage(result.reason));
        return;
      }
      toast.success(
        result.value.replaced
          ? `Updated ${name} in your cloud bag`
          : `Saved ${name} to your cloud bag`,
      );
    },
  };
};

const saveTooltip = (state: {
  blocked: boolean;
  alreadyThere: boolean;
  count: number;
}): string =>
  state.blocked
    ? `Cloud bag full (${state.count}/${BAG_ITEM_CAP}) — delete one first`
    : state.alreadyThere
      ? "Update the copy in your cloud bag"
      : "Keep a copy in your account, and get a share link";

/**
 * Upload one deck or map. Rendered only for a signed-in user against a live
 * API — for everyone else the surrounding action bar is untouched, exactly as
 * it is on the site today.
 */
export const SaveToCloudButton = ({
  kind,
  name,
  data,
  size = "sm",
}: {
  kind: BagKind;
  /** Cloud item name; re-saving under the same name overwrites in place. */
  name: string;
  /** Serialized as-is. The deck object, or the map object. */
  data: unknown;
  size?: string;
}) => {
  const state = useCloudSave(kind, name, data);
  if (!state.ready) return null;

  return (
    <Tooltip label={saveTooltip(state)} hasArrow>
      <Button
        size={size}
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        leftIcon={<FaCloud />}
        isDisabled={state.blocked}
        isLoading={state.saving}
        onClick={state.run}
      >
        {state.alreadyThere ? "Update in cloud" : "Save to cloud"}
      </Button>
    </Tooltip>
  );
};

/**
 * The same action as a card-corner chip, for the map shelf — it sits beside the
 * remove button on a custom map and matches its footprint.
 */
export const SaveToCloudCorner = ({
  kind,
  name,
  data,
}: {
  kind: BagKind;
  name: string;
  data: unknown;
}) => {
  const state = useCloudSave(kind, name, data);
  if (!state.ready) return null;

  return (
    <Tooltip label={saveTooltip(state)} hasArrow>
      <Flex
        aria-label={state.alreadyThere ? "Update in cloud" : "Save to cloud"}
        bg="rgba(20, 8, 24, 0.6)"
        borderRadius="100%"
        p="0.35rem"
        color={state.alreadyThere ? "brand.accent" : "#FAEBD7"}
        cursor={state.blocked ? "not-allowed" : "pointer"}
        opacity={state.blocked || state.saving ? 0.5 : 1}
        _hover={{ bg: state.blocked ? undefined : "brand.secondary" }}
        onClick={(e) => {
          // The card itself selects the map for the next game.
          e.stopPropagation();
          if (state.blocked || state.saving) return;
          state.run();
        }}
      >
        <FaCloud size="0.6rem" />
      </Flex>
    </Tooltip>
  );
};

/**
 * A stable, human cloud name for a map. Maps have no id of their own — `imgUrl`
 * is their identity — so fall back to the image's filename rather than letting
 * every untitled map collide on one name (same name = overwrite).
 */
export const cloudMapName = (map: {
  imgUrl: string;
  meta?: { title?: string };
}): string => {
  const title = map.meta?.title?.trim();
  if (title) return title;
  const tail = map.imgUrl.split(/[?#]/)[0]?.split("/").pop() ?? "";
  const decoded = (() => {
    try {
      return decodeURIComponent(tail);
    } catch {
      return tail;
    }
  })();
  const bare = decoded.replace(/\.[a-z0-9]+$/i, "");
  return bare || "Custom map";
};

/**
 * The cloud shelf for one kind. `onImport` hands the downloaded payload to the
 * bag's existing import path and returns how many items it actually added, so
 * "already in your bag" reads differently from "added".
 */
export const CloudBagShelf = ({
  kind,
  title,
  emptyHint,
  onImport,
}: {
  kind: BagKind;
  title: string;
  emptyHint: string;
  onImport: (data: unknown) => number;
}) => {
  const { status, items, cap, usedBytes, load, remove } = useCloudBag(kind);
  const [, copy] = useCopyToClipboard();
  const [busyId, setBusyId] = useState<string>();

  // Only the signed-in shelf lives here; CloudBagSection owns every other
  // state, so there is ONE place that decides whether any cloud UI exists.
  if (status !== "ready") return null;

  return (
    <Panel>
      <Flex align="baseline" justify="space-between" flexWrap="wrap" gap="0.5rem">
        <ShelfTitle>{title}</ShelfTitle>
        <Text fontFamily="monospace" fontSize="0.72rem" opacity={0.7}>
          {items.length}/{cap} · {formatBytes(usedBytes)}
        </Text>
      </Flex>

      {items.length === 0 ? (
        <Text fontSize="0.85rem" opacity={0.75} mt="0.4rem">
          {emptyHint}
        </Text>
      ) : (
        <Flex direction="column" gap="0.4rem" mt="0.6rem">
          {items.map((item) => (
            <Box
              key={item.id}
              borderRadius="0.5rem"
              bg="rgba(72, 40, 79, 0.06)"
              p="0.5rem 0.6rem"
            >
              <Flex align="baseline" justify="space-between" gap="0.5rem">
                <Text fontSize="0.88rem" fontWeight={700} noOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  fontFamily="monospace"
                  fontSize="0.68rem"
                  opacity={0.65}
                  whiteSpace="nowrap"
                >
                  {formatBytes(item.bytes)} · {formatStamp(item.updatedAt)}
                </Text>
              </Flex>
              <HStack mt="0.35rem" spacing="0.35rem" flexWrap="wrap">
                <Button
                  size="xs"
                  leftIcon={<FaCloudDownloadAlt />}
                  isLoading={busyId === item.id}
                  onClick={async () => {
                    setBusyId(item.id);
                    const result = await load(item.id);
                    setBusyId(undefined);
                    if (!result.ok) {
                      toast.error(cloudFailureMessage(result.reason));
                      return;
                    }
                    const added = onImport(result.value);
                    toast.success(
                      added > 0
                        ? `Loaded ${item.name} into your bag`
                        : `${item.name} is already in your bag`,
                    );
                  }}
                >
                  Load into bag
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  leftIcon={<FaLink />}
                  onClick={() => {
                    copy(shareUrl(kind, item.id));
                    toast.success("Share link copied");
                  }}
                >
                  Copy share link
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  color="brand.danger"
                  onClick={async () => {
                    const result = await remove(item.id);
                    if (!result.ok) {
                      toast.error(cloudFailureMessage(result.reason));
                      return;
                    }
                    toast.success(`Removed ${item.name} from the cloud`);
                  }}
                >
                  Delete from cloud
                </Button>
              </HStack>
            </Box>
          ))}
        </Flex>
      )}

      <Text fontSize="0.7rem" opacity={0.6} mt="0.7rem">
        Anyone with a share link can load that item — links are unguessable, but
        they are not private. Delete from cloud to revoke one.
      </Text>
    </Panel>
  );
};

const Panel = (props: React.ComponentProps<typeof Box>) => (
  <Box
    bg="brand.parchment"
    borderRadius="0.75rem"
    p="1rem"
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    h="fit-content"
    {...props}
  />
);

const ShelfTitle = ({ children }: { children: React.ReactNode }) => (
  <HStack spacing="0.4rem" mb="0.3rem">
    <FaCloud opacity={0.7} />
    <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.1rem">
      {children}
    </Text>
  </HStack>
);

/**
 * The whole cloud block on the Backup & Share tab, and the ONE place that
 * decides whether any of it exists:
 *
 * - probe in flight, or accounts API unreachable → nothing at all, so the tab
 *   reads exactly as it does today (the #459 standard);
 * - signed out → one "Sign in to sync" panel, not one per kind;
 * - signed in → the deck and map shelves, with the quota line.
 *
 * Both shelves hang off the same `/me` probe, so the deck status decides the
 * layout for both; the second `useCloudBag` inside each shelf shares the store
 * and adds no request.
 */
export const CloudBagSection = ({
  onImportDeck,
  onImportMap,
}: {
  onImportDeck: (data: unknown) => number;
  onImportMap: (data: unknown) => number;
}) => {
  const { status } = useCloudBag("decks");
  const router = useRouter();

  if (status === "loading" || status === "offline") return null;

  return (
    <Box mt="1.25rem">
      <Text maxW="46rem" fontSize="0.9rem" mb="1rem" opacity={0.85}>
        Signed in? Keep copies of individual decks and maps in your account (100
        each) so they survive a cleared browser, and hand one to a friend with a
        share link.
      </Text>

      {status === "guest" ? (
        <Panel maxW="30rem">
          <ShelfTitle>Cloud bag</ShelfTitle>
          <Text fontSize="0.85rem" opacity={0.8} mb="0.6rem">
            Sign in to keep copies of your decks and maps in the cloud and share
            them by link. Your bag keeps working either way.
          </Text>
          <Button
            as="a"
            // A real navigation, not next/link: this is a cross-origin OAuth
            // handoff and the API has to be able to set its cookie.
            href={signInUrl(router?.asPath)}
            size="sm"
            leftIcon={<FaDiscord />}
            bg="#5865F2"
            color="white"
            _hover={{ bg: "#4752C4" }}
          >
            Sign in to sync
          </Button>
        </Panel>
      ) : (
        <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="1rem">
          <CloudBagShelf
            kind="decks"
            title="Cloud decks"
            emptyHint="Nothing up here yet. Open the Decks tab, pick a deck, and hit “Save to cloud”."
            onImport={onImportDeck}
          />
          <CloudBagShelf
            kind="maps"
            title="Cloud maps"
            emptyHint="Nothing up here yet. Open the Maps tab and hit the cloud button on one of your own maps."
            onImport={onImportMap}
          />
        </Grid>
      )}
    </Box>
  );
};
