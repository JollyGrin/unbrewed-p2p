import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";
import { FaDiscord } from "react-icons/fa";
import {
  refreshAccount,
  signInUrl,
  signOut,
  useAccount,
} from "@/lib/account/useAccount";

/**
 * The optional Discord account affordance (issue #459) — a sign-in pill when
 * signed out, an avatar + username menu when signed in.
 *
 * That menu is also the ONLY entry point to /account (#573): a guest sees no
 * new nav affordance at all, because the whole chip is already invisible to
 * them when the API is unreachable and is a sign-in pill when it isn't.
 *
 * Deliberately renders NOTHING while the `/me` probe is in flight and when the
 * accounts API is unreachable: the site is a standalone static build first, so
 * a dead/unset API must leave every page looking exactly as it does today
 * rather than dangling a sign-in link that goes nowhere.
 *
 * Colors: the signed-in state inherits `currentColor` so the same component
 * reads correctly on the parchment navbar and on the dark /pro header, while
 * the dropdown carries its own dark surface.
 */
export const AccountChip = () => {
  const { status, account } = useAccount();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (status === "loading" || status === "offline") return null;

  if (status === "guest" || !account) {
    return (
      <Box
        as="a"
        // A plain anchor, not next/link: this is a cross-origin OAuth handoff
        // that must be a real navigation so the API can set its cookie.
        href={signInUrl(router?.asPath)}
        aria-label="Sign in with Discord"
        display="inline-flex"
        alignItems="center"
        gap="0.4rem"
        h="1.9rem"
        px="0.6rem"
        borderRadius="0.4rem"
        bg="#5865F2"
        color="#FFFFFF"
        fontFamily="ArchivoNarrow"
        fontSize="0.85rem"
        lineHeight="1"
        whiteSpace="nowrap"
        transition="all 0.25s ease-in-out"
        _hover={{ bg: "#4752C4", transform: "scale(1.06)" }}
        _active={{ transform: "scale(1.02)" }}
      >
        <FaDiscord size="1.1rem" />
        <Text as="span">Sign in</Text>
      </Box>
    );
  }

  return (
    <Menu placement="bottom-end" autoSelect={false}>
      <MenuButton
        as={Button}
        variant="unstyled"
        aria-label={`Account: ${account.username}`}
        display="inline-flex"
        alignItems="center"
        h="1.9rem"
        minW="unset"
        px="0.35rem"
        borderRadius="0.4rem"
        color="currentColor"
        transition="all 0.25s ease-in-out"
        _hover={{ transform: "scale(1.06)" }}
        _active={{ transform: "scale(1.02)" }}
      >
        <Box display="inline-flex" alignItems="center" gap="0.4rem">
          {account.avatarUrl ? (
            // Plain <img>, not next/image: the site is statically exported, so
            // there's no optimizer, and the Discord CDN host would need config.
            // Decorative (alt="") — the username sits right beside it.
            <Box
              as="img"
              data-testid="account-avatar"
              src={account.avatarUrl}
              alt=""
              boxSize="1.4rem"
              borderRadius="full"
              objectFit="cover"
            />
          ) : (
            <FaDiscord size="1.2rem" />
          )}
          <Text
            as="span"
            fontFamily="ArchivoNarrow"
            fontSize="0.85rem"
            lineHeight="1"
            maxW="8rem"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {account.username}
          </Text>
        </Box>
      </MenuButton>
      <MenuList
        bg="brand.surfaceDim"
        borderColor="brand.accent"
        color="brand.parchment"
        minW="9rem"
        py="0.25rem"
      >
        <MenuItem
          as={NextLink}
          href="/account"
          bg="transparent"
          fontFamily="ArchivoNarrow"
          fontSize="0.9rem"
          _hover={{ bg: "brand.surface" }}
          _focus={{ bg: "brand.surface" }}
        >
          Account
        </MenuItem>
        <MenuItem
          bg="transparent"
          fontFamily="ArchivoNarrow"
          fontSize="0.9rem"
          isDisabled={signingOut}
          _hover={{ bg: "brand.surface" }}
          _focus={{ bg: "brand.surface" }}
          onClick={() => {
            setSigningOut(true);
            // signOut() never rejects; it refetches /me and pushes the result
            // to every mounted chip.
            signOut().finally(() => setSigningOut(false));
          }}
        >
          Sign out
        </MenuItem>
      </MenuList>
    </Menu>
  );
};

/** Matches the surrounding ProHud chips (components/Pro/ProHud.tsx). */
const hudChipStyles = {
  alignItems: "center",
  gap: "0.3rem",
  px: "0.5rem",
  py: "0.15rem",
  borderRadius: "1rem",
  bg: "rgba(20, 8, 24, 0.55)",
  color: "brand.highlight",
} as const;

/**
 * The in-game variant, for the /pro HUD chip cluster. Same probe, same store,
 * zero extra requests — but two deliberate differences from the page chip,
 * both because a live game and its websocket are at stake:
 *
 * 1. **Signed in is display-only** (no sign-out menu). ProHud is read-only by
 *    design and there is nothing account-shaped to do mid-match; a dropdown
 *    over the board is just another mis-tap.
 * 2. **Signing in opens a new tab**, and it returns to `/pro`, never to this
 *    game URL. A same-tab OAuth hop would tear down the socket and drop the
 *    player out of a live match, and a new tab returning to `/pro/game?room=…`
 *    would open a SECOND connection to the same room. The game tab keeps
 *    playing untouched and re-probes `/me` when it regains focus — a listener
 *    that only exists after the player actually clicks sign-in, and disarms on
 *    the first focus, so a click costs exactly one extra `/me` and an idle
 *    game costs nothing. (Abandoning the Discord tab therefore doesn't leave a
 *    listener re-probing every time the player alt-tabs; clicking sign-in
 *    again re-arms it.)
 */
export const InGameAccountChip = () => {
  const { status, account } = useAccount();
  const [awaitingSignIn, setAwaitingSignIn] = useState(false);

  useEffect(() => {
    if (!awaitingSignIn) return;
    const onFocus = () => {
      setAwaitingSignIn(false);
      refreshAccount();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [awaitingSignIn]);

  if (status === "loading" || status === "offline") return null;

  if (status === "guest" || !account) {
    return (
      <Tooltip label="Opens Discord in a new tab — your game keeps running here" hasArrow>
        <Flex
          {...hudChipStyles}
          as="a"
          href={signInUrl("/pro")}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Sign in with Discord"
          cursor="pointer"
          _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
          onClick={() => setAwaitingSignIn(true)}
        >
          <FaDiscord size="0.85rem" />
          <Text fontSize="0.65rem" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
            Sign in
          </Text>
        </Flex>
      </Tooltip>
    );
  }

  return (
    <Flex {...hudChipStyles} aria-label={`Signed in as ${account.username}`}>
      {account.avatarUrl ? (
        <Box
          as="img"
          data-testid="account-avatar"
          src={account.avatarUrl}
          alt=""
          boxSize="0.85rem"
          borderRadius="full"
          objectFit="cover"
        />
      ) : (
        <FaDiscord size="0.85rem" />
      )}
      <Text
        fontSize="0.65rem"
        fontFamily="SpaceGrotesk"
        whiteSpace="nowrap"
        maxW="7rem"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {account.username}
      </Text>
    </Flex>
  );
};
