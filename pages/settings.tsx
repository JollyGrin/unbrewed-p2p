import { useLocalServerStorage } from "@/lib/hooks";
import { Box, Button, Flex, Input, Tag, Text } from "@chakra-ui/react";
import { useRef, useState } from "react";

const SettingsPage: React.FC = () => {
  const [serverInput, setServerInput] = useState<string>("");
  const InputRef = useRef();
  const { activeServer, serverList, setActiveServer } = useLocalServerStorage();
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
      {serverList?.map((server) => (
        <Button
          bg={"antiquewhite"}
          key={server}
          onClick={() => setActiveServer(server)}
        >
          <Text overflowX={"hidden"}>{server}</Text>
        </Button>
      ))}
    </Flex>
  );
};

export default SettingsPage;
