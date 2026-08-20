/**
 * The account half of the Bag UI (#644).
 *
 * #566 put cloud copies on a separate shelf: you saved a deck up, and loaded it
 * back down, and the Decks tab never knew. That shelf is gone. Decks and Maps
 * now render the account's items alongside the device's, so the only things
 * left that are specific to the account are:
 *
 * - a small marker saying which of the two an item lives in;
 * - the share link, which only exists for an item with a server-side row;
 * - the one-press "Move my bag to my account", on Backup & Share.
 *
 * Everything here renders nothing at all when the accounts API is unreachable,
 * which is the standing #459 rule: a build pointed at a dead API must look
 * exactly like the site does today.
 */
import {
  Box,
  Button,
  Flex,
  HStack,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { FaCloud, FaDiscord, FaLink, FaMobileAlt } from "react-icons/fa";

import {
  BagKind,
  cloudFailureMessage,
  shareUrl,
} from "@/lib/account/bagCloud";
import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { BagSource } from "@/lib/bag/bagStore";
import { migrateLocalBagToAccount, MigrationReport } from "@/lib/bag/migrate";
import { useLocalBagRemainder } from "@/lib/bag/useBag";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";

/**
 * "in your account" vs "on this device". Deliberately tiny: for the vast
 * majority of users every item is in the same place, and the marker is there to
 * answer "will this survive me clearing my browser", not to be decoration.
 */
export const BagSourceChip = ({ source }: { source: BagSource }) => {
  const account = useAccount();
  // A guest has nothing to distinguish — every item is on the device — so the
  // marker would be noise. It appears only once there are two places to be.
  if (account.status !== "signed-in") return null;

  return (
    <Tooltip
      hasArrow
      label={
        source === "cloud"
          ? "In your account — available on any browser you sign in to"
          : "On this device only — move it to your account to keep it safe"
      }
    >
      <Flex
        aria-label={source === "cloud" ? "In your account" : "On this device"}
        align="center"
        color={source === "cloud" ? "brand.accent" : "inherit"}
        opacity={source === "cloud" ? 0.9 : 0.45}
      >
        {source === "cloud" ? (
          <FaCloud size="0.65rem" />
        ) : (
          <FaMobileAlt size="0.65rem" />
        )}
      </Flex>
    </Tooltip>
  );
};

/** Copy a share link for an item that has an account row. */
export const ShareItemButton = ({
  kind,
  cloudId,
  size = "sm",
}: {
  kind: BagKind;
  cloudId?: string;
  size?: string;
}) => {
  const [, copy] = useCopyToClipboard();
  if (!cloudId) return null;

  return (
    <Tooltip label="Copy a link that hands this to a friend" hasArrow>
      <Button
        size={size}
        variant="outline"
        color="brand.primary"
        borderColor="rgba(255,255,255,0.25)"
        _hover={{ bg: "rgba(255,255,255,0.08)" }}
        leftIcon={<FaLink />}
        onClick={() => {
          copy(shareUrl(kind, cloudId));
          toast.success("Share link copied");
        }}
      >
        Share link
      </Button>
    </Tooltip>
  );
};

/** The same action as a card-corner chip, for the map grid. */
export const ShareItemCorner = ({
  kind,
  cloudId,
}: {
  kind: BagKind;
  cloudId?: string;
}) => {
  const [, copy] = useCopyToClipboard();
  if (!cloudId) return null;

  return (
    <Tooltip label="Copy a link that hands this map to a friend" hasArrow>
      <Flex
        aria-label="Copy share link"
        bg="rgba(20, 8, 24, 0.6)"
        borderRadius="100%"
        p="0.35rem"
        color="#FAEBD7"
        cursor="pointer"
        _hover={{ bg: "brand.secondary" }}
        onClick={(e) => {
          // The card itself selects the map for the next game.
          e.stopPropagation();
          copy(shareUrl(kind, cloudId));
          toast.success("Share link copied");
        }}
      >
        <FaLink size="0.6rem" />
      </Flex>
    </Tooltip>
  );
};

const Panel = (props: React.ComponentProps<typeof Box>) => (
  <Box
    bg="brand.parchment"
    borderRadius="0.75rem"
    p="1rem"
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    h="fit-content"
    maxW="34rem"
    {...props}
  />
);

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <HStack spacing="0.4rem" mb="0.3rem">
    <FaCloud opacity={0.7} />
    <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.1rem">
      {children}
    </Text>
  </HStack>
);

const countLabel = (decks: number, maps: number) =>
  [
    decks ? `${decks} deck${decks === 1 ? "" : "s"}` : "",
    maps ? `${maps} map${maps === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

/**
 * The Backup & Share tab's account block, and the ONE place that decides
 * whether any account UI exists on it:
 *
 * - probe in flight, or API unreachable → nothing at all;
 * - signed out → a single "sign in" line;
 * - signed in with items still on the device → the move;
 * - signed in with an empty device bag → one reassuring line.
 */
export const AccountBagPanel = () => {
  const account = useAccount();
  const router = useRouter();
  const local = useLocalBagRemainder();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<MigrationReport>();

  if (account.status === "loading" || account.status === "offline") return null;

  if (account.status === "guest") {
    return (
      <Box mt="1.25rem">
        <Panel>
          <PanelTitle>Your bag, on every device</PanelTitle>
          <Text fontSize="0.85rem" opacity={0.8} mb="0.6rem">
            Sign in and your decks and maps live in your account instead of this
            browser: no 5 MB limit, nothing lost when you clear your history,
            and the same bag on your phone. Your bag keeps working either way.
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
            Sign in with Discord
          </Button>
        </Panel>
      </Box>
    );
  }

  const run = async () => {
    setRunning(true);
    const result = await migrateLocalBagToAccount();
    setRunning(false);
    setReport(result);
    if (result.blocked) {
      toast.error(cloudFailureMessage("offline"));
      return;
    }
    if (result.moved > 0) {
      toast.success(
        `Moved ${result.moved} item${result.moved === 1 ? "" : "s"} to your account`,
      );
    }
    if (result.kept.length > 0) {
      toast.error(
        `${result.kept.length} item${result.kept.length === 1 ? "" : "s"} stayed on this device`,
      );
    }
  };

  return (
    <Box mt="1.25rem">
      <Panel>
        <PanelTitle>Your account is your bag</PanelTitle>
        {local.total === 0 ? (
          <Text fontSize="0.85rem" opacity={0.8}>
            Everything in your bag is saved to your account. Add a deck or a map
            on any browser you sign in to and it will be here too.
          </Text>
        ) : (
          <>
            <Text fontSize="0.85rem" opacity={0.85} mb="0.6rem">
              {countLabel(local.decks, local.maps)} are still stored in this
              browser only — they&apos;d be lost if you cleared it, and they
              count against its 5 MB limit. Move them to your account and
              they&apos;ll follow you everywhere.
            </Text>
            <Button
              size="sm"
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              leftIcon={<FaCloud />}
              isLoading={running}
              loadingText="Moving…"
              onClick={run}
            >
              Move my bag to my account
            </Button>
            <Text fontSize="0.7rem" opacity={0.6} mt="0.6rem">
              Nothing is deleted from this browser until your account confirms
              it has a copy. Safe to run again if something is left behind.
            </Text>
          </>
        )}

        {report && !report.blocked && report.items.length > 0 && (
          <Box mt="0.9rem">
            <Text fontSize="0.8rem" fontWeight={700} mb="0.3rem">
              Results
            </Text>
            <Flex direction="column" gap="0.2rem" maxH="14rem" overflowY="auto">
              {report.items.map((item) => (
                <HStack
                  key={`${item.kind}:${item.id}`}
                  spacing="0.4rem"
                  fontSize="0.78rem"
                >
                  <Text as="span">{item.ok ? "✅" : "⚠️"}</Text>
                  <Text as="span" noOfLines={1} flexShrink={0} maxW="14rem">
                    {item.name}
                  </Text>
                  <Text as="span" opacity={0.7} noOfLines={1}>
                    {item.ok
                      ? "moved to your account"
                      : cloudFailureMessage(item.reason ?? "offline")}
                  </Text>
                </HStack>
              ))}
            </Flex>
          </Box>
        )}
      </Panel>
    </Box>
  );
};
