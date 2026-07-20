import {
  Box,
  Button,
  Circle,
  Flex,
  HStack,
  SimpleGrid,
  SlideFade,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Hero } from "./Hero";
import { FindMatch } from "@/components/Discord";
import Link from "next/link";
import { IconCards } from "../Icons/IconCards";
import { IconCardDraw } from "../Icons/IconCardDraw";
import { IconMap } from "../Icons/IconMap";
import { IconLogo } from "../Icons/IconLogo";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  SITE_URL,
} from "@/components/Helmet/Head";

const QUICK_START = [
  {
    number: "1",
    Icon: IconCardDraw,
    title: "Grab a starter deck",
    text: "Open your bag and pick a starter or popular deck — one click and it's ready to play.",
    button: {
      text: "Open your bag",
      href: "/bag",
    },
  },
  {
    number: "2",
    Icon: IconLogo,
    title: "Name a lobby",
    text: "Head to Connect, type any lobby name, and you're in. No account, no download.",
    button: {
      text: "Connect to a game",
      href: "/connect",
    },
  },
  {
    number: "3",
    Icon: IconCards,
    title: "Send the invite link",
    text: "Copy the invite link from the lobby and send it to a friend — it drops them straight into your game, deck and all.",
  },
];

const FEATURES = [
  {
    Icon: IconCards,
    title: "Design your own decks",
    text: "Build a homebrew deck on Unmatched.cards (by Jon G), then paste its code into your bag.",
    button: {
      text: "Browse decks on Unmatched.Cards",
      href: "https://unmatched.cards/decks",
    },
  },
  {
    Icon: IconCardDraw,
    title: "Import from anywhere",
    text: "Decks published on the-unmatched.club, Tabletop Simulator exports, raw JSON, or a list of card image URLs — they all load into your bag.",
    button: {
      text: "Add your decks",
      href: "/bag",
    },
  },
  {
    Icon: IconMap,
    title: "Any image is a map",
    text: "Unbrewed ships with a set of maps, and you can swap in your own mid-game — all you need is an image URL.",
    button: {
      text: "Find maps on r/Unmatched",
      href: "https://www.reddit.com/r/Unmatched/search/?q=custom+map&type=link&cId=abc80961-6c74-4572-9733-5a250b2586e5&iId=d9eb7d0d-a5a9-420d-ae4b-e14c1417699a",
    },
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "Is Unbrewed free?",
    a: "Yes. Unbrewed is completely free and open-source. There are no accounts, subscriptions, or paywalls — you play straight from your web browser.",
  },
  {
    q: "What is the fastest way to start playing?",
    a: "Load a starter deck from your bag, open a lobby on the Connect page, and copy the invite link. Whoever clicks it lands in your game with the deck already imported.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. Unbrewed requires no sign-up or login. Load your decks, share a lobby name with a friend, and start playing.",
  },
  {
    q: "Can I play official Unmatched decks?",
    a: "Unbrewed is built for homebrew and fan-made decks. It is an unofficial hobby project and is not affiliated with or endorsed by Restoration Games, the publisher of Unmatched.",
  },
  {
    q: "How do I import a deck from unmatched.cards?",
    a: "Open your bag, paste the deck's unmatched.cards code or URL, and it loads instantly. You can also paste raw deck JSON, or a URL that downloads JSON.",
  },
  {
    q: "Can I import decks from the-unmatched.club?",
    a: "Yes. Unbrewed imports decks published on the-unmatched.club, including image-only decks, directly from their URL.",
  },
  {
    q: "Does Unbrewed support Tabletop Simulator (TTS) decks?",
    a: "Yes. You can import Unmatched decks exported from Tabletop Simulator, so collections you already built for TTS work in the browser.",
  },
  {
    q: "How is this different from Tabletop Simulator?",
    a: "Unbrewed runs entirely in your web browser with nothing to install and no cost. Both players just open a shared lobby — no game client, no Steam account, and no purchase required.",
  },
  {
    q: "Can I use my own map?",
    a: "Yes. Any image URL can become a battle map. Browse community maps on r/Unmatched or drop in your own.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "Unbrewed",
      url: `${SITE_URL}/`,
      applicationCategory: "GameApplication",
      operatingSystem: "Web browser",
      browserRequirements: "Requires a modern web browser with JavaScript.",
      description: DEFAULT_DESCRIPTION,
      image: `${SITE_URL}${DEFAULT_IMAGE}`,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      author: {
        "@type": "Person",
        name: "JollyGrin",
        url: "https://github.com/JollyGrin",
      },
      about: { "@type": "Game", name: "Unmatched" },
    },
    {
      "@type": "HowTo",
      name: "How to play Unmatched fan decks online in your browser",
      description:
        "Start your first online Unmatched game with Unbrewed in under a minute.",
      step: QUICK_START.map((step, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: step.title,
        text: step.text,
        url: `${SITE_URL}/#get-started`,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: { "@type": "Answer", text: faq.a },
      })),
    },
  ],
};

const JsonLd = () => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
  />
);

export const LandingPage = () => {
  return (
    <Flex direction="column" minH="100svh">
      <JsonLd />
      <Hero />
      <Disclaimer />
      <Box bg="brand.highlight" flexGrow="1" p="2.5rem 1.5rem">
        <Box maxW="880px" m="0 auto" id="get-started" scrollMarginTop="1rem">
          <Text
            fontFamily="ArchivoNarrow"
            letterSpacing="0.12em"
            textTransform="uppercase"
            fontSize="0.8rem"
            color="brand.secondary"
            opacity={0.6}
          >
            Getting started
          </Text>
          <Text
            as="h2"
            fontFamily="SpaceGrotesk"
            fontSize="2.25rem"
            fontWeight={700}
            lineHeight="1.1"
            color="brand.secondary"
          >
            Playing in under a minute
          </Text>
          <Text mt="0.5rem" maxW="46rem" color="brand.secondary" opacity={0.85}>
            Unbrewed is a free, open-source simulator for playing Unmatched fan
            decks online. It runs entirely in your browser — no account, no
            download, no setup. Grab a starter deck, open a lobby, and send a
            friend the invite link. When you want more, it imports decks from
            Unmatched.cards, the-unmatched.club, Tabletop Simulator and beyond.
          </Text>

          <SimpleGrid mt="1.75rem" columns={{ base: 1, md: 3 }} spacing="1rem">
            {QUICK_START.map((step, i) => (
              <SlideFade key={step.number} in offsetY="20px" delay={i * 0.06}>
                <StepCard {...step} />
              </SlideFade>
            ))}
          </SimpleGrid>

          <Features />

          <FindMatch />

          <Faq />

          <Box
            mt="2.5rem"
            bg="brand.primary"
            borderRadius="0.75rem"
            p="1.5rem"
            boxShadow="card"
          >
            <Text
              as="h2"
              fontFamily="SpaceGrotesk"
              fontSize="1.5rem"
              fontWeight={700}
              color="brand.secondary"
            >
              Found a bug or have an idea?
            </Text>
            <Text mt="0.35rem" color="brand.secondary" opacity={0.85}>
              Unbrewed is an open-source hobby project made by JollyGrin. Feature
              requests and bug reports are always welcome over on GitHub.
            </Text>
            <Text mt="0.25rem" color="brand.secondary" opacity={0.4} fontSize="0.85rem">
              *Requires a GitHub account (free to create)
            </Text>
            <HStack mt="1rem" flexWrap="wrap">
              <Button
                as={Link}
                bg="brand.secondary"
                color="brand.primary"
                _hover={{ bg: "brand.surfaceDim", transform: "translateY(-2px)" }}
                transition="all 0.2s ease"
                href={"https://github.com/JollyGrin/unbrewed-p2p/issues/new"}
              >
                Create a ticket
              </Button>
              <Button
                as={Link}
                variant="outline"
                color="brand.secondary"
                borderColor="brand.secondary"
                _hover={{ bg: "brand.secondary", color: "brand.primary" }}
                href="https://discord.gg/qPxHFjwkNN"
              >
                Join the Discord
              </Button>
            </HStack>
          </Box>
        </Box>
      </Box>
    </Flex>
  );
};

const Features = () => (
  <Box mt="2.5rem" as="section" aria-labelledby="features-heading">
    <Text
      as="h2"
      id="features-heading"
      fontFamily="SpaceGrotesk"
      fontSize="1.75rem"
      fontWeight={700}
      color="brand.secondary"
    >
      Bring your own everything
    </Text>
    <Text mt="0.35rem" maxW="46rem" color="brand.secondary" opacity={0.85}>
      Starter decks get you playing today — but Unbrewed is built for the decks
      and maps you make yourself.
    </Text>
    <SimpleGrid mt="1.25rem" columns={{ base: 1, md: 3 }} spacing="1rem">
      {FEATURES.map((feature, i) => (
        <SlideFade key={feature.title} in offsetY="20px" delay={i * 0.06}>
          <StepCard {...feature} />
        </SlideFade>
      ))}
    </SimpleGrid>
  </Box>
);

const StepCard = (props: {
  number?: string;
  Icon: any;
  title: string;
  text: string;
  button?: { text: string; href: string };
}) => {
  return (
    <Flex
      direction="column"
      h="100%"
      bg="brand.secondary"
      p="1.25rem"
      borderRadius="0.75rem"
      justifyContent="space-between"
      position="relative"
      boxShadow="card"
      transition="all 0.2s ease"
      _hover={{ transform: "translateY(-4px)", boxShadow: "cardHover" }}
    >
      <Box>
        <HStack align="center" spacing="0.75rem" mb="0.75rem">
          {props.number && (
            <Circle
              size="2.5rem"
              bg="brand.primary"
              color="brand.secondary"
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="1.1rem"
              flexShrink={0}
            >
              {props.number}
            </Circle>
          )}
          <props.Icon fontSize="2rem" color="brand.primary" />
          <Text
            as="h3"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="1.15rem"
            color="brand.primary"
          >
            {props.title}
          </Text>
        </HStack>
        <Text color="brand.primary" opacity={0.85} fontSize="0.95rem">
          {props.text}
        </Text>
      </Box>
      {props.button && (
        <Button
          mt="1.25rem"
          size="sm"
          bg="brand.highlight"
          color="brand.secondary"
          _hover={{ bg: "brand.primary" }}
          alignSelf="flex-start"
          /* long labels must wrap inside the card instead of overflowing it */
          maxW="100%"
          h="auto"
          minH="2rem"
          py="0.4rem"
          whiteSpace="normal"
          textAlign="left"
          lineHeight="1.3"
          as={Link}
          href={props.button.href}
        >
          {props.button.text}
        </Button>
      )}
    </Flex>
  );
};

const Faq = () => (
  <Box mt="2.5rem" as="section" aria-labelledby="faq-heading">
    <Text
      as="h2"
      id="faq-heading"
      fontFamily="SpaceGrotesk"
      fontSize="1.75rem"
      fontWeight={700}
      color="brand.secondary"
    >
      Frequently asked questions
    </Text>
    <VStack mt="1rem" spacing="1rem" align="stretch">
      {FAQS.map((faq) => (
        <Box
          key={faq.q}
          bg="brand.secondary"
          borderRadius="0.75rem"
          p="1.25rem"
          boxShadow="card"
        >
          <Text
            as="h3"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="1.05rem"
            color="brand.primary"
          >
            {faq.q}
          </Text>
          <Text mt="0.4rem" color="brand.primary" opacity={0.85} fontSize="0.95rem">
            {faq.a}
          </Text>
        </Box>
      ))}
    </VStack>
  </Box>
);

const Disclaimer = () => (
  <VStack
    bg="brand.primary"
    color="brand.secondary"
    p="0.35rem"
    justifyContent="center"
    fontSize="0.75rem"
    spacing={0}
  >
    <Text opacity="0.75" textAlign="center">
      Unbrewed is not owned by or associated with{" "}
      <Link href="https://restorationgames.com/unmatched/">
        <span style={{ fontWeight: "bold" }}>Restoration Games, LLC</span>
      </Link>
      <br />
      This is a free &amp; open-source hobby project to playtest homebrew decks
    </Text>
  </VStack>
);
