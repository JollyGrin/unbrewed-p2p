/**
 * /account — the signed-in player's own page (issue #573).
 *
 * Three surfaces stacked in one column: who you are, (a stats block, #574), and
 * your game history. Guests get a sign-in prompt in place of all of it rather
 * than a redirect: the site is statically exported, so there is no server to
 * bounce anyone, and a visible prompt is the same flow the navbar chip offers.
 *
 * The chip's #459 rule — render NOTHING when the accounts API is unreachable —
 * is deliberately relaxed here, and only here. The chip is incidental chrome on
 * pages that have their own job; /account is a page the user asked for by name,
 * and a blank one reads as broken. So an unreachable API gets one calm sentence
 * instead of an empty document. No new call is made for a guest either way.
 *
 * Since #590 the body of the page IS `ProfileView` — the same component
 * `/stats?u=` renders for anybody else — with the owner-only extras layered on
 * top: a wearable badge case (the `owner` flag), the Discord perks card as a
 * child, and sign-out in the header. That is the whole design rule of the
 * feature: /account is a superset of a public profile, never a parallel one.
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import NextLink from "next/link";
import { useState } from "react";

import { AccountDiscord } from "@/components/Account/AccountDiscord";
import { ProfileView } from "@/components/Account/ProfileView";
import { AccountShell, Panel } from "@/components/Account/Shell";
import { signInUrl, signOut, useAccount } from "@/lib/account/useAccount";
import { useAccountStats } from "@/lib/account/useAccountStats";
import { useBadges } from "@/lib/account/useBadges";
import { useGameHistory } from "@/lib/account/useGameHistory";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <AccountShell
    seo={{
      path: "/account",
      title: "Your account | Unbrewed",
      description:
        "Your Unbrewed account: Discord profile and the history of your finished Pro games.",
      noindex: true,
    }}
  >
    {children}
  </AccountShell>
);

const GhostButton = (props: React.ComponentProps<typeof Button>) => (
  <Button
    size="sm"
    variant="outline"
    flexShrink={0}
    borderColor="brand.secondary"
    color="brand.secondary"
    fontFamily="ArchivoNarrow"
    fontWeight={400}
    _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
    {...props}
  />
);

/**
 * The owner-only end of the profile header: the way to your cosmetic
 * collection (#614), the way to the public board, and the way out. Stacked
 * rather than inline so a narrow screen doesn't squeeze the username to
 * nothing.
 */
const OwnerActions = () => {
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Flex direction="column" align="stretch" gap="0.4rem" flexShrink={0}>
      <GhostButton as={NextLink} href="/collection">
        Collection
      </GhostButton>
      <GhostButton as={NextLink} href="/leaderboard">
        Leaderboard
      </GhostButton>
      <GhostButton
        isLoading={signingOut}
        loadingText="Signing out…"
        onClick={() => {
          setSigningOut(true);
          // signOut() never rejects; it refetches /me and pushes the result to
          // every consumer, so this page falls back to the prompt on its own.
          signOut().finally(() => setSigningOut(false));
        }}
      >
        Sign out
      </GhostButton>
    </Flex>
  );
};

const SignInPrompt = () => (
  <Panel maxW="30rem">
    <Text as="h1" fontFamily="LeagueGothic" fontSize="2rem" lineHeight="1.05">
      Your account
    </Text>
    <Text fontSize="0.9rem" opacity={0.8} my="0.6rem">
      Sign in with Discord to see the history of your finished Pro games. Nothing
      else about Unbrewed changes — decks, maps and sandbox tables keep working
      signed out.
    </Text>
    <Button
      as="a"
      // A real navigation, not next/link: a cross-origin OAuth handoff the API
      // has to be able to set its cookie on.
      href={signInUrl("/account")}
      size="sm"
      leftIcon={<FaDiscord />}
      bg="#5865F2"
      color="white"
      _hover={{ bg: "#4752C4" }}
    >
      Sign in with Discord
    </Button>
    {/* The board is public, so it is worth offering even to someone who
        isn't going to sign in. */}
    <Box mt="0.9rem">
      <Text
        as={NextLink}
        href="/leaderboard"
        fontSize="0.85rem"
        textDecoration="underline"
        _hover={{ opacity: 0.8 }}
      >
        See the leaderboard
      </Text>
    </Box>
  </Panel>
);

export const AccountPage = () => {
  const { status, account } = useAccount();
  // One `GET /me/stats` for the page: the header's level bar and the record
  // block below read the same payload. All three hooks stay quiet for a guest —
  // they fire nothing until the `/me` probe says signed-in — so the page still
  // costs a signed-out visitor exactly one request.
  const statsView = useAccountStats();
  const badges = useBadges();
  const history = useGameHistory();

  if (status === "loading") {
    return (
      <Shell>
        <Text fontSize="0.9rem" opacity={0.7}>
          Loading your account…
        </Text>
      </Shell>
    );
  }

  if (status === "offline") {
    return (
      <Shell>
        <Panel maxW="30rem">
          <Text as="h1" fontFamily="LeagueGothic" fontSize="2rem" lineHeight="1.05">
            Your account
          </Text>
          <Text fontSize="0.9rem" opacity={0.8} mt="0.5rem">
            Accounts are unavailable right now. Everything else on Unbrewed works
            as usual — try again later.
          </Text>
        </Panel>
      </Shell>
    );
  }

  if (status === "guest" || !account) {
    return (
      <Shell>
        <SignInPrompt />
      </Shell>
    );
  }

  return (
    <Shell>
      <ProfileView
        owner
        username={account.username}
        avatarUrl={account.avatarUrl}
        subtitle="Signed in with Discord"
        badges={badges}
        stats={statsView}
        history={history}
        headerAction={<OwnerActions />}
      >
        <AccountDiscord />
      </ProfileView>
    </Shell>
  );
};
