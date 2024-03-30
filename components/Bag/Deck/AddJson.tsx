import {
  Box,
  Flex,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Textarea,
  HStack,
  Button,
  FormLabel,
  Input,
} from "@chakra-ui/react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalDeckStorage } from "@/lib/hooks";
import { useRouter } from "next/router";
import axios from "axios";
import { jsonCheck } from "@/lib/hooks/helpers";
import { useJsonCheck } from "@/lib/hooks/useJsonCheck";

export const AddJson = () => {
  return (
    <Flex
      direction="column"
      bg="brand.highlight"
      color="brand.secondary"
      p="0.5rem"
      borderRadius="0.25rem"
    >
      <Text fontWeight={700}>Load a Deck from a JSON</Text>
      <Text>
        Don&apos;t have a deck uploaded to Unmatched? You can import the raw
        JSON
      </Text>
      <Options />
    </Flex>
  );
};

const Options = () => {
  const { reload } = useRouter();
  const { pushDeck } = useLocalDeckStorage();

  const [json, setJson] = useState<string>("");
  const [url, setUrl] = useState<string>();
  const { data: isJsonValid } = useJsonCheck(json);

  const { data: urlData } = useQuery(
    ["urlData"],
    async () => await axios.get(url ?? ""),
    {
      enabled: !!url,
    },
  );

  return (
    <Accordion>
      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box as="span" flex="1" textAlign="left">
              Input via Text
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          <HStack>
            <Box w="50%">
              <StatusText isValid={isJsonValid ?? false} text="is JSON?" />
              <FormLabel fontSize="0.75rem">
                Heads up! This won&apos;t check the JSON contents, just if
                it&apos;s a valid json
              </FormLabel>

              {isJsonValid && (
                <Button
                  mt="0.5rem"
                  onClick={() => {
                    pushDeck(JSON.parse(json));
                    reload();
                  }}
                >
                  Add Deck
                </Button>
              )}
            </Box>
            <Textarea
              fontSize="0.5rem"
              bg="white"
              onChange={(e) => setJson(e.target.value)}
              value={json}
            />
          </HStack>
        </AccordionPanel>
      </AccordionItem>

      <AccordionItem>
        <h2>
          <AccordionButton>
            <Box as="span" flex="1" textAlign="left">
              Input via URL
            </Box>
            <AccordionIcon />
          </AccordionButton>
        </h2>
        <AccordionPanel pb={4}>
          {urlData?.data && (
            <Button
              my="0.5rem"
              onClick={() => {
                pushDeck(urlData?.data);
                reload();
              }}
            >
              Add Deck
            </Button>
          )}
          <HStack alignItems="start">
            <Input
              minW="10rem"
              bg="white"
              maxW="12rem"
              onChange={(e) => setUrl(e.target.value)}
              value={url}
            />
            <code style={{ fontSize: "0.5rem" }}>
              {JSON.stringify(urlData?.data)}
            </code>
          </HStack>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

const StatusText = (props: { text: string; isValid: boolean }) => {
  return (
    <HStack>
      <Box
        bg={props.isValid ? "green" : "red"}
        boxSize="1rem"
        borderRadius="100%"
      />
      <Text>{props.text}</Text>
    </HStack>
  );
};
