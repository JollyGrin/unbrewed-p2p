import { Box, Button, Flex, HStack, SlideFade, Text } from "@chakra-ui/react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { posterUrl } from "@/lib/changelog/media";
import { useChangelogSeen } from "@/lib/changelog/useChangelogSeen";
import { useUpdateDialogOpen } from "@/lib/changelog/updateDialogOpen";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** Formats a "yyyy-mm-dd" entry date without going through Date/timezone parsing. */
const formatEntryDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

/**
 * Latest-update card between the disclaimer and "Getting started"
 * (unbrewed-p2p-984, Main.dc.html). Shows the newest unseen entry only;
 * renders nothing (no gap) once nothing is unseen.
 */
export const ChangelogUpdateCard = () => {
  const { unseen, markAllSeen } = useChangelogSeen();
  const reducedMotion = !!useReducedMotion();
  const dialogOpen = useUpdateDialogOpen();

  // The update dialog covers the same news; never show both at once.
  if (unseen.length === 0 || dialogOpen) return null;

  const entry = unseen[0];
  const thumb = entry.video ? posterUrl(entry.video.slug) : null;
  const primaryAction = entry.video
    ? { label: "Watch", href: `/changelog#${entry.id}` }
    : entry.cta
      ? { label: entry.cta.label, href: entry.cta.href }
      : null;

  return (
    <SlideFade
      in
      offsetY="20px"
      transition={reducedMotion ? { enter: { duration: 0 } } : undefined}
    >
      <Box
        position="relative"
        mb="2rem"
        bg="brand.secondary"
        color="brand.primary"
        borderRadius="0.75rem"
        p="1.25rem"
        boxShadow="card"
      >
        <Flex
          direction={{ base: "column", md: "row" }}
          gap="1.5rem"
          align="stretch"
          pr="2.75rem"
        >
          {thumb && (
            <Box
              w={{ base: "100%", md: "288px" }}
              h={{ base: "180px", md: "162px" }}
              flexShrink={0}
              borderRadius="0.5rem"
              overflow="hidden"
              bg="brand.surfaceDim"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a build-time asset */}
              <img
                src={thumb}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </Box>
          )}

          <Flex direction="column" gap="0.5rem" justify="center" flexGrow={1} minW={0}>
            <HStack spacing="0.625rem">
              <Box
                as="span"
                bg="brand.accent"
                color="brand.secondary"
                fontFamily="ArchivoNarrow"
                fontSize="0.7rem"
                fontWeight="bold"
                letterSpacing="0.12em"
                textTransform="uppercase"
                px="0.56rem"
                py="0.19rem"
                borderRadius="full"
              >
                New
              </Box>
              <Text
                fontFamily="ArchivoNarrow"
                fontSize="0.8rem"
                textTransform="uppercase"
                letterSpacing="0.08em"
                opacity={0.75}
              >
                {formatEntryDate(entry.date)}
              </Text>
            </HStack>

            <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1.625rem" lineHeight="1.15">
              {entry.title}
            </Text>
            <Text fontSize="0.95rem" lineHeight="1.5" opacity={0.85}>
              {entry.summary}
            </Text>

            <HStack spacing="1.25rem" mt="0.25rem" flexWrap="wrap">
              {primaryAction && (
                <Button
                  as={Link}
                  href={primaryAction.href}
                  bg="brand.primary"
                  color="brand.secondary"
                  _hover={{ bg: "brand.highlight" }}
                >
                  {primaryAction.label}
                </Button>
              )}
              <Button
                as={Link}
                href="/changelog"
                variant="link"
                color="brand.primary"
                fontWeight={400}
                fontSize="0.9rem"
              >
                See all updates
              </Button>
            </HStack>
          </Flex>
        </Flex>

        <Button
          onClick={markAllSeen}
          aria-label="Dismiss update"
          position="absolute"
          top="0.75rem"
          right="0.75rem"
          variant="unstyled"
          minW="2.75rem"
          w="2.75rem"
          h="2.75rem"
          display="flex"
          alignItems="center"
          justifyContent="center"
          color="brand.primary"
          _hover={{ opacity: 0.75 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </Button>
      </Box>
    </SlideFade>
  );
};
