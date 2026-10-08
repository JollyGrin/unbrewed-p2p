/** Shared frame + small parts for the tournaments pages (mockup v2 look). */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import { Navbar } from "@/components/Navbar";
import { PageSeo } from "@/components/Helmet/Head";
import {
  BAND_MUTED,
  GOLD,
  INK,
  INK_DEEP,
  INK_MUTED,
  PAGE_BG,
  PARCHMENT,
  RULE,
} from "@/components/Stats/tokens";

/** The dark band behind closed-match banners and the bracket legend. */
export const SURFACE = "#3A2140";
/** Tomato: dots, rings and live accents; too light for text on parchment. */
export const DANGER = "#FF6347";
/** The darker live red for text and white-on-red fills (≈4.9:1 under white, UX S12). */
export const DANGER_INK = "#B83A26";
/** Error text and destructive actions on parchment, and the "live" chip under white text. */
export const ERROR_RED = "#B3261E";

/** An error line, announced when it appears. */
export const ErrorText = (props: React.ComponentProps<typeof Text>) => (
  <Text role="alert" color={ERROR_RED} fontSize="13px" {...props} />
);

export const Page = ({
  title,
  path,
  eyebrow,
  heading,
  lede,
  action,
  wide = false,
  children,
}: {
  title: string;
  path: string;
  eyebrow?: React.ReactNode;
  heading: React.ReactNode;
  lede?: React.ReactNode;
  action?: React.ReactNode;
  /** The bracket page: room for a 16-player tree plus the champion. */
  wide?: boolean;
  children: React.ReactNode;
}) => (
  <Flex flexDir="column" bg={PAGE_BG} minH="100svh" color={INK}>
    <PageSeo
      path={path}
      title={`${title} | Unbrewed`}
      description="Async tournaments for Unbrewed Pro: brackets and round robins, played on your own time."
      noindex
    />
    <Box color="brand.secondary">
      <Navbar />
    </Box>
    <Box bg={INK_DEEP} color={PARCHMENT} px={{ base: "16px", md: "32px" }} py={{ base: "28px", md: "44px" }}>
      <Flex maxW={wide ? "90rem" : "64rem"} mx="auto" gap="20px" minW={0} justify="space-between" align="flex-end" flexWrap="wrap">
        <Box maxW="40rem" minW={0}>
          {eyebrow && (
            <Text fontFamily="ArchivoNarrow" textTransform="uppercase" letterSpacing="0.08em" fontSize="12px" color={BAND_MUTED} mb="6px">
              {eyebrow}
            </Text>
          )}
          <Text as="h1" fontFamily="LeagueGothic" fontSize={{ base: "44px", md: "68px" }} lineHeight="0.98" overflowWrap="anywhere" wordBreak="break-word">
            {heading}
          </Text>
          {lede && (
            <Text as="div" mt="10px" fontSize="15px" color={BAND_MUTED}>
              {lede}
            </Text>
          )}
        </Box>
        {action}
      </Flex>
    </Box>
    <Box flex="1" w="100%" maxW={wide ? "90rem" : "64rem"} mx="auto" px={{ base: "16px", md: "32px" }} py={{ base: "20px", md: "32px" }}>
      {children}
    </Box>
  </Flex>
);

export const Card = (props: React.ComponentProps<typeof Box>) => (
  <Box bg={PARCHMENT} border={RULE} borderRadius="12px" boxShadow="0 2px 8px rgba(20,8,24,0.18)" {...props} />
);

export const Chip = ({
  tone = "plain",
  onDark = false,
  children,
}: {
  /** On the dark card/band header: parchment text on a light wash. */
  onDark?: boolean;
  tone?: "plain" | "live" | "soon" | "done" | "gold";
  children: React.ReactNode;
}) => {
  const bg = { plain: "rgba(72,40,79,0.1)", live: ERROR_RED, soon: "rgba(224,168,46,0.3)", done: "rgba(72,40,79,0.18)", gold: GOLD }[tone];
  const dark = onDark && tone !== "live" && tone !== "gold";
  return (
    <Text as="span" bg={dark ? "rgba(250,235,215,0.16)" : bg} color={tone === "live" ? "white" : tone === "gold" ? INK_DEEP : dark ? PARCHMENT : INK} fontSize="12px" fontWeight={600} px="9px" py="2px" borderRadius="999px" whiteSpace="nowrap">
      {children}
    </Text>
  );
};

type BtnProps = React.ComponentProps<typeof Box> & { variant?: "gold" | "ink" | "ghost" | "discord"; href?: string };
export const Btn = ({ variant = "ink", href, ...rest }: BtnProps) => {
  const look = {
    gold: { bg: GOLD, color: INK_DEEP },
    ink: { bg: INK, color: PARCHMENT },
    ghost: { bg: "transparent", color: INK, border: `1px solid ${INK_MUTED}` },
    discord: { bg: "#5865F2", color: "white" },
  }[variant];
  return (
    <Box
      as={href ? NextLink : "button"}
      {...(href ? { href } : { type: "button" })}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap="8px"
      minH="44px"
      px="20px"
      borderRadius="10px"
      fontWeight={700}
      fontSize="15px"
      cursor="pointer"
      _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
      _hover={{ filter: "brightness(1.06)" }}
      {...look}
      {...rest}
    />
  );
};

export const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card p="20px" maxW="32rem">
    <Text as="h2" fontFamily="LeagueGothic" fontSize="2rem" lineHeight="1.05">{title}</Text>
    <Text fontSize="0.95rem" opacity={0.8} mt="6px">{children}</Text>
  </Card>
);
