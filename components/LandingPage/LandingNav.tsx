import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
} from "@chakra-ui/react";
import Link from "next/link";
import { FaBars, FaChevronDown, FaDiscord, FaTimes } from "react-icons/fa";
import { IconLogo } from "@/components/Icons/IconLogo";
import { ChangelogNavLink } from "@/components/Navbar";
import { AccountChip } from "@/components/Account/AccountChip";
import { DISCORD_URL, TABLES } from "./content";

const NAV_LINKS = [
  { label: "Decks", href: "/bag" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Leaderboard", href: "/leaderboard" },
];

const linkStyle = {
  fontFamily: "SpaceGrotesk",
  fontWeight: 600,
  fontSize: "0.9rem",
  px: "0.65rem",
  py: "0.5rem",
  borderRadius: "0.5rem",
  color: "brand.primary",
  _hover: { bg: "whiteAlpha.100" },
} as const;

/**
 * The landing page's own sticky nav: wordmark, a "Play" menu listing all four
 * tables, Decks, Tournaments, Leaderboard, What's new, Discord and the account
 * chip. Below `lg` the links fold into a disclosure panel behind a menu button.
 */
export const LandingNav = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex={40}
      bg="rgba(72,40,79,.94)"
      backdropFilter="blur(10px)"
      color="brand.primary"
      borderBottom="1px solid rgba(241,224,193,.12)"
    >
      <Flex maxW="70rem" mx="auto" px="1rem" h="3.75rem" align="center" gap="1rem">
        <Flex as={Link} href="/" align="center" gap="0.6rem" aria-label="Unbrewed home">
          <IconLogo fontSize="1.6rem" />
          <Text fontFamily="SpaceGrotesk" fontWeight={700} letterSpacing="0.02em">
            unbrewed
          </Text>
        </Flex>

        <HStack as="nav" aria-label="Primary" spacing="0.15rem" display={{ base: "none", lg: "flex" }}>
          <Menu>
            <MenuButton as={Button} variant="unstyled" display="inline-flex" {...linkStyle} rightIcon={<FaChevronDown size="0.6rem" />}>
              Play
            </MenuButton>
            <MenuList bg="brand.parchment" color="brand.surfaceDim" borderColor="rgba(72,40,79,.18)" p="0.4rem" minW="20rem">
              {TABLES.map((table) => (
                <MenuItem
                  key={table.id}
                  as={Link}
                  href={table.href}
                  display="block"
                  borderRadius="0.5rem"
                  bg="transparent"
                  _hover={{ bg: "brand.highlight" }}
                  _focus={{ bg: "brand.highlight" }}
                >
                  <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.95rem">
                    {table.name}
                  </Text>
                  <Text fontSize="0.8rem" opacity={0.8}>
                    {table.best}
                  </Text>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
          {NAV_LINKS.map((link) => (
            <Box as={Link} key={link.href} href={link.href} {...linkStyle}>
              {link.label}
            </Box>
          ))}
        </HStack>

        <HStack ml="auto" spacing="0.75rem">
          <ChangelogNavLink />
          <Box as={Link} href={DISCORD_URL} aria-label="Discord" display="inline-flex" p="0.4rem" borderRadius="0.5rem" _hover={{ bg: "whiteAlpha.100" }}>
            <FaDiscord size="1.25rem" />
          </Box>
          <AccountChip />
          <IconButton
            display={{ base: "inline-flex", lg: "none" }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-nav"
            icon={mobileOpen ? <FaTimes /> : <FaBars />}
            variant="ghost"
            color="brand.primary"
            _hover={{ bg: "whiteAlpha.100" }}
            onClick={() => setMobileOpen((o) => !o)}
          />
        </HStack>
      </Flex>

      <Box
        as="nav"
        id="landing-mobile-nav"
        aria-label="Mobile"
        hidden={!mobileOpen}
        display={{ lg: "none" }}
        px="1rem"
        pb="1rem"
        borderTop="1px solid rgba(241,224,193,.12)"
      >
        <Text mt="0.75rem" fontSize="0.72rem" letterSpacing="0.12em" textTransform="uppercase" color="brand.accent" fontWeight={700}>
          Play
        </Text>
        <Box display="grid" gridTemplateColumns="1fr 1fr" gap="0.25rem" mt="0.25rem">
          {TABLES.map((table) => (
            <Box as={Link} key={table.id} href={table.href} {...linkStyle} onClick={() => setMobileOpen(false)}>
              {table.name}
            </Box>
          ))}
        </Box>
        <Box display="grid" gridTemplateColumns="1fr 1fr" gap="0.25rem" mt="0.5rem">
          {NAV_LINKS.map((link) => (
            <Box as={Link} key={link.href} href={link.href} {...linkStyle} onClick={() => setMobileOpen(false)}>
              {link.label}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
