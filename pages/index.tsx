import { Button, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";

const Homepage = () => {
  return (
    <Flex flexDir={"column"}>
      <Text fontWeight={700}>Unbrewed P2P</Text>
      <Text>
        Creating a pure p2p version of unbrewed so that it doesn't rely on a
        specific server
      </Text>
      <Link href="/card">
        <Button>Card</Button>
      </Link>

      <Link href="/game">
        <Button>Game</Button>
      </Link>

      <Link href="/board">
        <Button>Board</Button>
      </Link>
    </Flex>
  );
};

export default Homepage;
