import { Box, Button, Spinner, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaBeer, FaAddressBook } from "react-icons/fa";
import axios from "axios";

const P2PContainer = () => {
  const router = useRouter();
  const slug = router.query;

  const [bool, setBool] = useState(false);

  const { data, isLoading } = useQuery(["myData"], async () => {
    try {
      const result = await axios.get("	https://get.geojs.io/v1/ip/country.json");
      console.log({ result });
      return result;
    } catch (err) {
      console.error(err);
    }
  });

  console.log({ data });
  return (
    <Box>
      <Text>{JSON.stringify(slug)}</Text>
      <Button onClick={() => setBool(!bool)}>Bool</Button>
      {bool ? <FaBeer /> : <FaAddressBook />}
      {isLoading && <Spinner />}
      {data && <Text>{JSON.stringify(data.data)}</Text>}
    </Box>
  );
};

export default P2PContainer;
