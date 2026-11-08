import { useState } from "react";
import { useRouter } from "next/router";
import { Box, Button, Flex, Link, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { FaCloudUploadAlt, FaDiscord } from "react-icons/fa";
import { toast } from "react-hot-toast";

import { cloudFailureMessage } from "@/lib/account/bagCloud";
import { signInLink } from "@/lib/account/signInLink";
import { migrateLocalBagToAccount } from "@/lib/bag/migrate";
import { useLocalBagRemainder } from "@/lib/bag/useBag";
import { BAG_BUDGET_BYTES, formatKb, type StorageBreakdown } from "@/lib/storage/breakdown";

/**
 * The bag's storage card (#1538 round 3, was the flat strip of #645). It
 * charges the bag for what the bag owns — decks and maps (#645). Pro replays
 * share the same physical quota but carry their own budget and eviction, so
 * they get a line in the breakdown (and a link to where you can delete them)
 * instead of filling this bar.
 *
 * The bar measures a *browser* limit, so it only means something while the
 * browser is holding bag items (#644):
 * - a guest sees it with a "Sign in with Discord" note: the account bag has
 *   no 5 MB ceiling (one 256 KB limit per item) and follows them to any device;
 * - signed in with items still on this device, it stays with "Push to cloud",
 *   the same one-press move the Backup & Share tab runs (`migrateLocalBagToAccount`);
 * - signed in with an empty device bag, there is no ceiling to warn about and
 *   the bar goes, leaving the count and "saved to your account".
 */
export const DeckStats = ({
  length,
  storage,
  isSignedIn = false,
}: {
  length: number;
  storage: StorageBreakdown;
  /** Signed-in users store their bag in the account, not on this device. */
  isSignedIn?: boolean;
}) => {
  const router = useRouter();
  const local = useLocalBagRemainder();
  const [pushing, setPushing] = useState(false);

  const totalKb = Math.round(BAG_BUDGET_BYTES / 1024);
  const usedKb = Math.min(totalKb, +(storage.bagBytes / 1024).toFixed(1));
  const pct = Math.min(100, Math.round((usedKb / totalKb) * 100));
  const showMeter = !isSignedIn || storage.bagBytes > 0;
  const localOnly = isSignedIn ? local.total : 0;

  const pushToCloud = async () => {
    setPushing(true);
    try {
      const result = await migrateLocalBagToAccount();
      if (result.blocked) {
        toast.error(cloudFailureMessage("offline"));
        return;
      }
      if (result.moved > 0) {
        toast.success(`Moved ${result.moved} item${result.moved === 1 ? "" : "s"} to your account`);
      }
      if (result.kept.length > 0) {
        toast.error(
          `${result.kept.length} item${result.kept.length === 1 ? "" : "s"} stayed on this device: ${cloudFailureMessage(result.kept[0].reason ?? "offline")}`,
        );
      }
    } finally {
      setPushing(false);
    }
  };

  return (
    <Box px={{ base: "1rem", md: "1.5rem" }} pt={{ base: "1rem", md: "1.25rem" }}>
      <Flex
        data-testid="bag-storage"
        maxW="920px"
        mx="auto"
        bg="brand.parchment"
        border="1px solid rgba(72, 40, 79, 0.18)"
        borderRadius="0.9rem"
        boxShadow="0 2px 0 rgba(72, 40, 79, 0.12)"
        p={{ base: "0.85rem", md: "1rem 1.25rem" }}
        gap={{ base: "0.85rem", md: "1.5rem" }}
        align={{ base: "stretch", md: "center" }}
        direction={{ base: "column", md: "row" }}
        color="brand.secondary"
      >
        {/* the count */}
        <Flex align="baseline" gap="0.5rem" flexShrink={0} minW={{ md: "7.5rem" }}>
          <Text
            fontFamily="BebasNeueRegular"
            fontSize={{ base: "2.4rem", md: "2.8rem" }}
            lineHeight={0.9}
            letterSpacing="0.02em"
          >
            {length > 0 ? length : 0}
          </Text>
          <Box>
            <Text fontWeight={700} fontSize="0.9rem" lineHeight={1.1}>
              {length === 1 ? "deck" : "decks"}
            </Text>
            <Text fontSize="0.75rem" opacity={0.7} lineHeight={1.1}>
              {isSignedIn && localOnly === 0 ? "in your account" : "in your bag"}
            </Text>
          </Box>
        </Flex>

        {/* the meter */}
        <Box flex="1" minW={0}>
          {showMeter ? (
            <>
              <Flex justify="space-between" align="baseline" gap="0.5rem" fontSize="0.82rem">
                <Text fontWeight={700}>This browser&apos;s storage</Text>
                <Text fontFamily="ArchivoNarrow" opacity={0.85} whiteSpace="nowrap">
                  {usedKb} KB of {Math.round(totalKb / 1024)} MB
                </Text>
              </Flex>
              <Box
                mt="0.35rem"
                h="8px"
                borderRadius="full"
                bg="rgba(72, 40, 79, 0.14)"
                overflow="hidden"
                role="progressbar"
                aria-label="Browser storage used by your bag"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <Box
                  h="100%"
                  w={`${Math.max(pct, usedKb > 0 ? 1 : 0)}%`}
                  bg={pct >= 85 ? "brand.danger" : "brand.accent"}
                  borderRadius="full"
                  transition="width 0.3s ease-out"
                />
              </Box>
              <Text mt="0.35rem" fontFamily="ArchivoNarrow" fontSize="0.8rem" opacity={0.8}>
                Decks {formatKb(storage.deckBytes)} KB · Maps {formatKb(storage.mapBytes)} KB ·{" "}
                <Link
                  as={NextLink}
                  href="/pro/replays"
                  textDecoration="underline"
                  textUnderlineOffset="2px"
                >
                  Replays
                </Link>{" "}
                {formatKb(storage.replayBytes)} KB · Other {formatKb(storage.otherBytes)} KB
              </Text>
            </>
          ) : (
            <Text fontSize="0.85rem" opacity={0.85}>
              Saved to your account: the same bag on any browser you sign in to, with no browser
              storage limit.
            </Text>
          )}
        </Box>

        {/* the way out of the browser limit */}
        {!isSignedIn && (
          <Flex
            direction="column"
            gap="0.45rem"
            flexShrink={0}
            maxW={{ md: "17rem" }}
            pt={{ base: "0.6rem", md: 0 }}
            pl={{ md: "1.25rem" }}
            borderTop={{ base: "1px solid rgba(72, 40, 79, 0.14)", md: "none" }}
            borderLeft={{ md: "1px solid rgba(72, 40, 79, 0.14)" }}
          >
            <Text fontSize="0.8rem" opacity={0.85} lineHeight={1.3}>
              Sign in and your bag moves to your account: no 5 MB browser limit, nothing lost
              when you clear your history, and the same decks on your phone.
            </Text>
            <Button
              as="a"
              // A real navigation, not next/link: this is a cross-origin OAuth
              // handoff and the API has to be able to set its cookie.
              {...signInLink(router?.asPath)}
              size="sm"
              alignSelf="flex-start"
              leftIcon={<FaDiscord />}
              bg="#5865F2"
              color="white"
              _hover={{ bg: "#4752C4" }}
            >
              Sign in with Discord
            </Button>
          </Flex>
        )}
        {isSignedIn && localOnly > 0 && (
          <Flex
            direction="column"
            gap="0.45rem"
            flexShrink={0}
            maxW={{ md: "17rem" }}
            pt={{ base: "0.6rem", md: 0 }}
            pl={{ md: "1.25rem" }}
            borderTop={{ base: "1px solid rgba(72, 40, 79, 0.14)", md: "none" }}
            borderLeft={{ md: "1px solid rgba(72, 40, 79, 0.14)" }}
          >
            <Text fontSize="0.8rem" opacity={0.85} lineHeight={1.3}>
              {countLabel(local.decks, local.maps)} still only in this browser. Push them to your
              account and they follow you everywhere; nothing leaves this browser until the account
              confirms it has a copy.
            </Text>
            <Button
              size="sm"
              alignSelf="flex-start"
              leftIcon={<FaCloudUploadAlt />}
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              isLoading={pushing}
              loadingText="Pushing…"
              onClick={() => void pushToCloud()}
            >
              Push to cloud
            </Button>
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

const countLabel = (decks: number, maps: number) =>
  [
    decks ? `${decks} deck${decks === 1 ? "" : "s"}` : "",
    maps ? `${maps} map${maps === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ") + (decks + maps === 1 ? " is" : " are");
