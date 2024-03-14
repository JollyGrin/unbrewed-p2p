import { Box, Button, Flex, Grid, HStack, Text } from "@chakra-ui/react";
import { Hero } from "./Hero";
import Link from "next/link";
import { IconCards } from "../Icons/IconCards";
import { IconCardDraw } from "../Icons/IconCardDraw";
import { IconMap } from "../Icons/IconMap";
import { IconLogo } from "../Icons/IconLogo";

export const LandingPage = () => {
  return (
    <Flex direction="column" minH="100svh">
      <Hero />
      <Disclaimer />
      <Box bg="brand.highlight" flexGrow="1" p="1rem 3rem">
        <Box maxW="800px" m="0 auto">
          <Text fontFamily="SpaceGrotesk" fontSize="2rem" fontWeight={700}>
            How to Play
          </Text>
          <Text>
            Play homebrewed Unmatched variants online! To get started you’ll
            need a deck and a board.
          </Text>
          <Flex mt="1rem" flexWrap="wrap" gap="0.5rem">
            <InfoBox
              number="1"
              Icon={IconCards}
              text={
                "Use Unmatched.cards (by Jon G) to design a deck or choose one designed by someone else!"
              }
              button={{
                text: "Unmatched.Cards (by Jon G)",
                href: "https://unmatched.cards/decks",
              }}
            />

            <InfoBox
              number="2"
              Icon={IconCardDraw}
              text={
                "Take the deck code and load your bag with your deck(s) that you wish to play with"
              }
              button={{
                text: "Your Bag",
                href: "/bag",
              }}
            />

            <InfoBox
              number="3"
              Icon={IconMap}
              text={
                "Find a custom map that you wish to play on. Browse your favorite communities or make your own. You'll just need a picture URL."
              }
              button={{
                text: "r/Unmatched search",
                href: "https://www.reddit.com/r/Unmatched/search/?q=custom+map&type=link&cId=abc80961-6c74-4572-9733-5a250b2586e5&iId=d9eb7d0d-a5a9-420d-ae4b-e14c1417699a",
              }}
            />

            <InfoBox
              number="4"
              Icon={IconLogo}
              text={
                "Create or join an existing game. Share the lobby name with a friend to join the same game!"
              }
              button={{
                text: "Connect to Game",
                href: "/connect",
              }}
            />
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
};

const InfoBox = (props: {
  number: string;
  Icon: any;
  text: string;
  button?: { text: string; href: string };
}) => {
  return (
    <Flex
      direction="column"
      bg="brand.primary"
      p="1rem"
      maxW="390px"
      borderRadius="0.75rem"
      justifyContent="space-between"
      position="relative"
    >
      <Grid
        position="absolute"
        top="0"
        left="0.5rem"
        bg="brand.secondary"
        color="brand.primary"
        p="0.1rem 0.5rem"
        borderBottomRadius="0.5rem"
      >
        {props.number}
      </Grid>
      <HStack mt="0.25rem">
        <props.Icon fontSize="2rem" color="brand.secondary" />
        <Text color="brand.secondary">{props.text}</Text>
      </HStack>
      {props.button && (
        <Button
          mt="1rem"
          bg="brand.highlight"
          color="brand.secondary"
          as={Link}
          href={props.button?.href}
        >
          {props.button?.text}
        </Button>
      )}
    </Flex>
  );
};

const Disclaimer = () => (
  <HStack
    bg="brand.primary"
    color="brand.secondary"
    p="0.25rem"
    justifyContent="center"
    fontSize="0.75rem"
  >
    <Text opacity="0.75">
      Unbrewed is not owned by or associated with{" "}
      <Link href="https://restorationgames.com/unmatched/">
        <span style={{ fontWeight: "bold" }}>Restoration Games, LLC</span>
      </Link>
      <br />
      This is a free & opensource hobby project to playtest homebrew decks
    </Text>
  </HStack>
);
