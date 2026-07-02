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
import Link from "next/link";
import { IconCards } from "../Icons/IconCards";
import { IconCardDraw } from "../Icons/IconCardDraw";
import { IconMap } from "../Icons/IconMap";
import { IconLogo } from "../Icons/IconLogo";

const STEPS = [
  {
    number: "1",
    Icon: IconCards,
    title: "Design or find a deck",
    text: "Use Unmatched.cards (by Jon G) to build your own deck — or grab one someone else has already made.",
    button: {
      text: "Browse decks on Unmatched.Cards",
      href: "https://unmatched.cards/decks",
    },
  },
  {
    number: "2",
    Icon: IconCardDraw,
    title: "Load up your bag",
    text: "Copy the deck code and add the deck(s) you want to play with into your bag.",
    button: {
      text: "Open your bag",
      href: "/bag",
    },
  },
  {
    number: "3",
    Icon: IconMap,
    title: "Pick a map",
    text: "Choose a custom map to battle on. Browse the community or bring your own — all you need is an image URL.",
    button: {
      text: "Find maps on r/Unmatched",
      href: "https://www.reddit.com/r/Unmatched/search/?q=custom+map&type=link&cId=abc80961-6c74-4572-9733-5a250b2586e5&iId=d9eb7d0d-a5a9-420d-ae4b-e14c1417699a",
    },
  },
  {
    number: "4",
    Icon: IconLogo,
    title: "Create or join a game",
    text: "Start a lobby and share its name with a friend so you can both jump into the same game.",
    button: {
      text: "Connect to a game",
      href: "/connect",
    },
  },
];

export const LandingPage = () => {
  return (
    <Flex direction="column" minH="100svh">
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
            fontFamily="SpaceGrotesk"
            fontSize="2.25rem"
            fontWeight={700}
            lineHeight="1.1"
            color="brand.secondary"
          >
            Four steps to your first game
          </Text>
          <Text mt="0.5rem" maxW="46rem" color="brand.secondary" opacity={0.85}>
            Play homebrewed Unmatched variants online. All you need to bring is a
            deck and a board — follow along below and you&apos;ll be dueling in a
            few minutes.
          </Text>

          <SimpleGrid mt="1.75rem" columns={{ base: 1, md: 2 }} spacing="1rem">
            {STEPS.map((step, i) => (
              <SlideFade key={step.number} in offsetY="20px" delay={i * 0.06}>
                <StepCard {...step} />
              </SlideFade>
            ))}
          </SimpleGrid>

          <Box
            mt="2.5rem"
            bg="brand.primary"
            borderRadius="0.75rem"
            p="1.5rem"
            boxShadow="card"
          >
            <Text
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

const StepCard = (props: {
  number: string;
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
          <props.Icon fontSize="2rem" color="brand.primary" />
          <Text
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
          as={Link}
          href={props.button.href}
        >
          {props.button.text}
        </Button>
      )}
    </Flex>
  );
};

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
