import { useState } from "react";
import {
  Box,
  Button,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { FaDiscord } from "react-icons/fa";
import { signInUrl, signOut, useAccount } from "@/lib/account/useAccount";

/**
 * The optional Discord account affordance (issue #459) — a sign-in pill when
 * signed out, an avatar + username menu when signed in.
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
