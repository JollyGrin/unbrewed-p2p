import { Box, Button, Spinner, Text, Textarea } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";
import { FaBeer, FaAddressBook } from "react-icons/fa";
import axios from "axios";

const P2PContainer = () => {
  const router = useRouter();
  const slug = router.query;

  const { data, isLoading } = useQuery(["myData"], async () => {
    try {
      const result = await axios.get(
        "https://booth.innkeeper.link/api/booths/future"
      );
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
      {isLoading && <Spinner />}
      {data && <Text>{JSON.stringify(data.data)}</Text>}
      <Box pt={3}>
        <Textarea />
      </Box>
    </Box>
  );
};

export default P2PContainer;
