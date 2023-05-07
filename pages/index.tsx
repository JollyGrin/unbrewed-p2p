import { Button, Flex, Text } from "@chakra-ui/react";
import Link from "next/link";

const Homepage = () => {
  return (
    <Flex flexDir={"column"} p={3}>
      <Text fontWeight={700}>Unbrewed P2P</Text>
      <Text>Creating a pure p2p version of unbrewed.</Text>
      <Flex flexDir={"column"} gap="10px">
        <Link href="/card">
          <Button>Card</Button>
        </Link>

        <Link href="/connect">
          <Button>Game</Button>
        </Link>

        <Link href="/board">
          <Button>Board</Button>
        </Link>

        <Link href="/bag">
          <Button>Bag</Button>
        </Link>
      </Flex>
    </Flex>
  );
};

export default Homepage;
