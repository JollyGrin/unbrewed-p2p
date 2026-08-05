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
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import { useState } from "react";

import { Navbar } from "@/components/Navbar";
import { PageSeo } from "@/components/Helmet/Head";
import { AccountGames } from "@/components/Account/AccountGames";
import { signInUrl, signOut, useAccount } from "@/lib/account/useAccount";

const Panel = (props: React.ComponentProps<typeof Box>) => (
  <Box
    bg="brand.parchment"
    borderRadius="0.75rem"
    p="1.1rem"
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    {...props}
  />
);

const Shell = ({ children }: { children: React.ReactNode }) => (
  <Flex flexDir="column" bg="brand.highlight" minH="100svh">
    <PageSeo
      path="/account"
      title="Your account | Unbrewed"
      description="Your Unbrewed account: Discord profile and the history of your finished Pro games."
      noindex
    />
    <Box color="brand.secondary">
      <Navbar />
    </Box>
    <Box
      flex="1"
      color="brand.secondary"
      w="100%"
      maxW="52rem"
      mx="auto"
      px={{ base: "0.9rem", md: "1.25rem" }}
      py="1.5rem"
    >
      {children}
    </Box>
  </Flex>
);

const ProfileHeader = ({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) => {
  const [signingOut, setSigningOut] = useState(false);
  // A stale avatar hash 404s on the Discord CDN. At chip size that is a shrug;
  // at 3rem a broken-image glyph is the loudest thing on the page, so fall
  // through to the same placeholder an avatar-less account gets.
  const [avatarBroken, setAvatarBroken] = useState(false);

  return (
    <Panel
      as="header"
      display="flex"
      alignItems="center"
      gap="0.9rem"
      mb="1rem"
    >
      {avatarUrl && !avatarBroken ? (
        // Plain <img>, not next/image: the site is statically exported, so
        // there is no optimizer and the Discord CDN host would need config.
        <Box
          as="img"
          data-testid="account-avatar"
          src={avatarUrl}
          alt=""
          onError={() => setAvatarBroken(true)}
          boxSize="3rem"
          borderRadius="full"
          objectFit="cover"
          flexShrink={0}
        />
      ) : (
        <Box
          boxSize="3rem"
          borderRadius="full"
          bg="rgba(72, 40, 79, 0.15)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <FaDiscord size="1.5rem" />
        </Box>
      )}

      <Box flex="1" minW={0}>
        <Text
          as="h1"
          fontFamily="LeagueGothic"
          fontSize="2rem"
          lineHeight="1.05"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {username}
        </Text>
        <Text fontSize="0.8rem" opacity={0.65}>
          Signed in with Discord
        </Text>
      </Box>

      <Button
        size="sm"
        variant="outline"
        flexShrink={0}
        borderColor="brand.secondary"
        color="brand.secondary"
        fontFamily="ArchivoNarrow"
        fontWeight={400}
        isLoading={signingOut}
        loadingText="Signing out…"
        _hover={{ bg: "rgba(72, 40, 79, 0.1)" }}
        onClick={() => {
          setSigningOut(true);
          // signOut() never rejects; it refetches /me and pushes the result to
          // every consumer, so this page falls back to the prompt on its own.
          signOut().finally(() => setSigningOut(false));
        }}
      >
        Sign out
      </Button>
    </Panel>
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
  </Panel>
);

export const AccountPage = () => {
  const { status, account } = useAccount();

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
      <ProfileHeader
        username={account.username}
        avatarUrl={account.avatarUrl}
      />
      {/*
        Stats (win rates per hero, GET /me/stats) slot in here as a sibling
        Panel between the header and the history — issue #574. Deliberately
        not implemented in this ticket, and no call is made for it.
      */}
      <AccountGames />
    </Shell>
  );
};
