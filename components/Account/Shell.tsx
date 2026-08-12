/**
 * The page frame every account-shaped page shares (issues #573, #590):
 * the navbar over a single narrow column on the site's highlight ground.
 *
 * Lifted out of AccountPage when /stats and /leaderboard arrived — three pages
 * with the same column width and the same parchment panels should not be three
 * copies of the same Flex.
 */
import { Box, Flex } from "@chakra-ui/react";

import { Navbar } from "@/components/Navbar";
import { PageSeo, SeoProps } from "@/components/Helmet/Head";

/** One parchment card. The unit every section on these pages is built from. */
export const Panel = (props: React.ComponentProps<typeof Box>) => (
  <Box
    bg="brand.parchment"
    borderRadius="0.75rem"
    p="1.1rem"
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    {...props}
  />
);

export const AccountShell = ({
  seo,
  maxW = "52rem",
  children,
}: {
  seo: SeoProps;
  /** Column width. The leaderboard's table wants a little more room. */
  maxW?: string;
  children: React.ReactNode;
}) => (
  <Flex flexDir="column" bg="brand.highlight" minH="100svh">
    <PageSeo {...seo} />
    <Box color="brand.secondary">
      <Navbar />
    </Box>
    <Box
      flex="1"
      color="brand.secondary"
      w="100%"
      maxW={maxW}
      mx="auto"
      px={{ base: "0.9rem", md: "1.25rem" }}
      py="1.5rem"
    >
      {children}
    </Box>
  </Flex>
);
