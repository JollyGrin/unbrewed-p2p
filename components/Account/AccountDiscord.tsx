/**
 * "Discord server perks" on /account (issue #578) — link, sync, unlink for
 * Discord Linked Roles.
 *
 * The whole card is opt-in plumbing for one thing: letting the API push a
 * player's level and win counts onto their Discord profile so the server's
 * admins can hang roles like @Veteran off them. So the copy leads with what
 * the player gets and states exactly what leaves the site, and the card as a
 * whole disappears — no heading, no placeholder, no error — on any deploy
 * where the feature isn't configured (`useDiscordLink` folds 503, 401 and an
 * unreachable API into one `hidden` state).
 *
 * Failures after the card is up are quiet toasts, never inline error text: the
 * rate limit in particular is a normal thing to hit by double-clicking, and it
 * should read as "already done" rather than as something broken.
 */
import { Box, Button, Flex, Text, useToast } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";

import { discordLinkUrl, syncedAgoLabel } from "@/lib/account/discordLink";
import { useDiscordLink } from "@/lib/account/useDiscordLink";

const LinkButton = ({ children }: { children: React.ReactNode }) => (
  <Button
    as="a"
    // A real navigation, not next/link and not fetch: a cross-origin OAuth
    // handoff the API has to set its state cookie on, which redirects back
    // here when Discord is done.
    href={discordLinkUrl("/account")}
    data-testid="discord-link-button"
    size="sm"
    leftIcon={<FaDiscord />}
    bg="#5865F2"
    color="white"
    _hover={{ bg: "#4752C4" }}
  >
    {children}
  </Button>
);

const GhostButton = (props: React.ComponentProps<typeof Button>) => (
  <Button
    size="sm"
    variant="outline"
    borderColor="brand.secondary"
    color="brand.secondary"
    fontFamily="ArchivoNarrow"
    fontWeight={400}
    _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
    {...props}
  />
);

export const AccountDiscord = () => {
  const { state, status, busy, sync, unlink } = useDiscordLink();
  const toast = useToast();

  // `loading` renders nothing for the same reason `hidden` does: on most
  // deploys this card never appears, and flashing a heading that then vanishes
  // is worse than it arriving a beat late.
  if (state === "loading" || state === "hidden") return null;

  const quiet = (title: string) =>
    toast({
      title,
      status: "info",
      duration: 3500,
      isClosable: true,
      position: "bottom",
    });

  const onSync = async () => {
    const failure = await sync();
    if (!failure) {
      quiet("Synced with Discord.");
      return;
    }
    quiet(
      failure === "rate_limited"
        ? "Already synced a moment ago — try again in a minute."
        : "Couldn't sync with Discord right now.",
    );
  };

  const onUnlink = async () => {
    const failure = await unlink();
    quiet(
      failure
        ? "Couldn't unlink right now."
        : "Discord perks unlinked. Roles drop on Discord's next check.",
    );
  };

  const syncedAgo = syncedAgoLabel(status?.lastPushAt ?? null);

  return (
    <Box
      as="section"
      aria-labelledby="account-discord-heading"
      data-testid="account-discord"
      bg="brand.parchment"
      borderRadius="0.75rem"
      p="1.1rem"
      boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
      mb="1rem"
    >
      <Text
        id="account-discord-heading"
        as="h2"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.15rem"
        mb="0.2rem"
      >
        Discord server perks
      </Text>

      {state === "linked" ? (
        <>
          <Text fontSize="0.85rem" opacity={0.75} mb="0.7rem">
            Linked. Your level and win counts are shared with Discord so the
            server can hand out roles like @Veteran.
            {syncedAgo ? ` Last synced ${syncedAgo}.` : " Not synced yet."}
          </Text>
          <Flex gap="0.5rem" flexWrap="wrap">
            <GhostButton
              data-testid="discord-sync-button"
              isLoading={busy}
              loadingText="Syncing…"
              onClick={() => {
                void onSync();
              }}
            >
              Sync now
            </GhostButton>
            <GhostButton
              data-testid="discord-unlink-button"
              isDisabled={busy}
              variant="ghost"
              opacity={0.75}
              onClick={() => {
                void onUnlink();
              }}
            >
              Unlink
            </GhostButton>
          </Flex>
        </>
      ) : null}

      {state === "stale" ? (
        <>
          <Text fontSize="0.85rem" opacity={0.75} mb="0.7rem">
            Discord no longer accepts our link — usually because the app was
            removed from your Discord account. Re-link to get your roles back.
          </Text>
          <LinkButton>Re-link Discord</LinkButton>
        </>
      ) : null}

      {state === "unlinked" ? (
        <>
          <Text fontSize="0.85rem" opacity={0.75} mb="0.7rem">
            Link your account to unlock roles like @Veteran in the Unbrewed
            Discord. We share only your level and win counts — nothing else, and
            you can unlink at any time.
          </Text>
          <LinkButton>Link Discord</LinkButton>
        </>
      ) : null}
    </Box>
  );
};
