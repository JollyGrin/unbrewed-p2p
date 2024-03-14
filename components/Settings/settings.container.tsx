import { useLocalServerStorage } from "@/lib/hooks";
import { Flex, Text, Tag, Button, Input, Divider } from "@chakra-ui/react";
import Link from "next/link";
import { useState } from "react";

export const SettingsContainer = ({
  activeServer,
  serverList,
  setActiveServer,
}: {
  activeServer: string;
  serverList: string[];
  setActiveServer: (server: string) => void;
}) => {
  const [serverInput, setServerInput] = useState<string>("");
  // const { activeServer, serverList, setActiveServer } = useLocalServerStorage();
  return (
    <Flex flexDir="column" p={4} gap={3} maxW={"700px"}>
      <Flex fontSize={"1.5rem"} gap={3}>
        <Text>Your active server:</Text>
        <Tag>{activeServer}</Tag>
      </Flex>
      <Input
        placeholder={activeServer}
        onChange={(e) => {
          setServerInput(e.target.value);
        }}
      />
      <Button onClick={() => setActiveServer(serverInput)}>
        Change Active Server
      </Button>
      <Text mt={3}>Previous Servers...</Text>
      {serverList?.map((server) => (
        <Button
          bg={"antiquewhite"}
          key={server}
          onClick={() => setActiveServer(server)}
        >
          <Text overflowX={"hidden"}>{server}</Text>
        </Button>
      ))}
      <Divider />
      <Text>Wish to run your own server?</Text>
      <Text>
        If our default server is not working, you can run it yourself:
      </Text>
      <Text
        color="blue"
        textDecor="underline"
        as={Link}
        href="http://github.com/jollygrin/unbrewed-p2p/"
      >
        Checkout our Github
      </Text>
    </Flex>
  );
};
