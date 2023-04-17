import { Box, Button, Text } from "@chakra-ui/react";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaBeer, FaAddressBook } from "react-icons/fa";

const P2PContainer = () => {
  const router = useRouter();
  const slug = (router.query.slug as string[]) || [];

  const [bool, setBool] = useState(false);
  return (
    <Box>
      <Text>{slug.join("/")}</Text>
      <Button onClick={() => setBool(!bool)}>Bool</Button>
      {bool ? <FaBeer /> : <FaAddressBook />}
    </Box>
  );
};

export default P2PContainer;
