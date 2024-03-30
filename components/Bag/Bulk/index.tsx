import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MapData, useLocalDeckStorage, useLocalMapStorage } from "@/lib/hooks";
import { useGenericImport } from "@/lib/hooks/useGenericImport";
import { useJsonCheck } from "@/lib/hooks/useJsonCheck";
import {
  Box,
  Divider,
  FormLabel,
  Grid,
  HStack,
  Input,
  Switch,
  Text,
  Textarea,
  useDisclosure,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useDebounce } from "use-debounce";
const DynamicReactJson = dynamic(import("react-json-view"), { ssr: false });

export const BagBulkContainer = () => {
  const { decks, pushDeck } = useLocalDeckStorage();
  const { data: maps, clear } = useLocalMapStorage();

  const [rawText, setRawText] = useState<string>();
  const [_url, setUrl] = useState<string>();
  const [url] = useDebounce(_url, 300);

  const { data: dataGeneric } = useGenericImport(url);

  const urlDisclosure = useDisclosure();

  const localBulk = { decks, maps };

  return (
    <Box h="100%">
      <Box p="0.5rem" minH="150px">
        <Text>
          Backup your existing storage or upload decks and maps in bulk!
        </Text>
        <HStack justifyContent="space-between">
          <Box>
            <HStack>
              <Switch onChange={urlDisclosure.onToggle} />
              {urlDisclosure.isOpen ? (
                <Text my="0.5rem">Enter URL</Text>
              ) : (
                <Text my="0.5rem">Viewing Local Storage</Text>
              )}
            </HStack>
            {urlDisclosure.isOpen && (
              <Input
                maxW="200px"
                bg="white"
                value={url}
                onChange={(e) => {
                  if (rawText) setRawText(undefined);
                  if (e.target.value === "") {
                    setUrl(undefined);
                    return;
                  }
                  setUrl(e.target.value);
                }}
              />
            )}
          </Box>
          {urlDisclosure.isOpen && (
            <Box>
              <Text>Or copy/paste the json</Text>
              <Textarea
                h="50px"
                fontSize="0.35rem"
                value={rawText}
                onChange={(e) => {
                  if (url) setUrl(undefined);
                  if (e.target.value === "") {
                    setRawText(undefined);
                    return;
                  }
                  setRawText(e.target.value);
                }}
              />
            </Box>
          )}
        </HStack>
      </Box>
      {!urlDisclosure.isOpen && <BulkGrid bulk={localBulk} />}
      {urlDisclosure.isOpen && rawText && <GridTextWrapper text={rawText} />}
      {urlDisclosure.isOpen && dataGeneric?.data && (
        <GridTextWrapper text={JSON.stringify(dataGeneric?.data)} />
      )}
    </Box>
  );
};

const GridTextWrapper = ({ text }: { text: string }) => {
  const { data: isJsonValid } = useJsonCheck(text);
  if (!isJsonValid) return <Invalid />;

  const parsed = JSON.parse(text) as {
    decks?: DeckImportType[];
    maps?: MapData[];
  };
  if (!parsed?.decks && !parsed?.maps) return <Invalid />;
  return <BulkGrid bulk={parsed} />;
};

const Invalid = () => (
  <Box>
    <Text>Invalid Json</Text>
  </Box>
);

const BulkGrid = ({
  bulk,
}: {
  bulk: {
    decks?: DeckImportType[];
    maps?: MapData[];
  };
}) => {
  return (
    <Grid templateColumns="3fr 7fr" h="100%" bg="brand.secondary">
      <Box h="100%" bg="white" p="0.5rem">
        <FormLabel fontWeight={700}>Decks</FormLabel>
        {bulk?.decks?.map((deck) => (
          <Box key={deck.id + deck.version_id}>
            <Text>{deck.name}</Text>
          </Box>
        ))}
        <Divider my="0.5rem" />
        <FormLabel fontWeight={700}>Maps</FormLabel>

        {bulk?.maps?.map((map) => (
          <Box key={map.imgUrl}>
            <Text>{map?.meta?.title ?? map?.imgUrl}</Text>
          </Box>
        ))}
      </Box>
      <Box h="100%" overflowY="auto" bg="white">
        <DynamicReactJson src={bulk} />
      </Box>
    </Grid>
  );
};
