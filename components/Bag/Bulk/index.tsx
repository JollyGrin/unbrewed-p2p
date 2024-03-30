import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MapData, useLocalDeckStorage, useLocalMapStorage } from "@/lib/hooks";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { useGenericImport } from "@/lib/hooks/useGenericImport";
import { useJsonCheck } from "@/lib/hooks/useJsonCheck";
import {
  Box,
  Button,
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
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { useDebounce } from "use-debounce";
const DynamicReactJson = dynamic(import("react-json-view"), { ssr: false });

export const BagBulkContainer = () => {
  const { query, push } = useRouter();
  const { decks, pushDeck, removeDeckbyId } = useLocalDeckStorage();
  const { data: maps, add: addMap } = useLocalMapStorage();

  const [rawText, setRawText] = useState<string>();
  const [_url, setUrl] = useState<string>();
  const [url] = useDebounce(_url, 300);

  const { data: dataGeneric } = useGenericImport(url);

  const urlDisclosure = useDisclosure();

  const localBulk = { decks, maps };

  useEffect(() => {
    if (query?.url) {
      urlDisclosure.onOpen();
      setUrl(query.url as string);
    }
  }, [query?.url]);

  return (
    <Box h="100%">
      <Box p="0.5rem" minH="150px">
        <Text>
          Backup your existing storage or upload decks and maps in bulk!
        </Text>
        <HStack justifyContent="space-between">
          <Box>
            <HStack>
              <Switch
                isChecked={urlDisclosure.isOpen}
                onChange={urlDisclosure.onToggle}
              />
              {urlDisclosure.isOpen ? (
                <Text my="0.5rem">Enter URL</Text>
              ) : (
                <Text my="0.5rem">Viewing Local Storage</Text>
              )}
            </HStack>
            {urlDisclosure.isOpen && (
              <HStack gap="0.5rem">
                <Input
                  isDisabled={!!query?.url as boolean}
                  maxW="200px"
                  bg="white"
                  defaultValue={query?.url as string | undefined}
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
                {!query?.url && (
                  <Button
                    fontSize="0.7rem"
                    p="0.25rem 0.5rem"
                    as={Link}
                    href={{
                      pathname: "/bag",
                      query: { tab: 2, url },
                    }}
                  >
                    Share Import
                  </Button>
                )}

                {query?.url && (
                  <Button
                    fontSize="0.7rem"
                    p="0.25rem 0.5rem"
                    onClick={() => {
                      push({
                        pathname: "/bag",
                        query: { tab: 2 },
                      });
                      setUrl(undefined);
                      urlDisclosure.onClose();
                    }}
                  >
                    Clear Import
                  </Button>
                )}
              </HStack>
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
      {!urlDisclosure.isOpen && (
        <BulkGrid
          bulk={localBulk}
          isLocal={true}
          fns={{ pushDeck, removeDeckbyId }}
        />
      )}
      {urlDisclosure.isOpen && rawText && (
        <GridTextWrapper
          text={rawText}
          fns={{ pushDeck, removeDeckbyId, addMap }}
        />
      )}
      {urlDisclosure.isOpen && dataGeneric?.data && (
        <GridTextWrapper
          text={JSON.stringify(dataGeneric?.data)}
          fns={{ pushDeck, removeDeckbyId, addMap }}
        />
      )}
    </Box>
  );
};

const GridTextWrapper = ({ text, fns }: { text: string; fns?: Fns }) => {
  const { data: isJsonValid } = useJsonCheck(text);
  if (!isJsonValid) return <Invalid />;

  const parsed = JSON.parse(text) as {
    decks?: DeckImportType[];
    maps?: MapData[];
  };
  if (!parsed?.decks && !parsed?.maps) return <Invalid />;
  return <BulkGrid bulk={parsed} fns={fns} />;
};

const Invalid = () => (
  <Box>
    <Text>Invalid Json</Text>
  </Box>
);

type Fns = {
  pushDeck: (deck: DeckImportType) => void;
  removeDeckbyId: (id: string) => void;
  addMap?: (map: MapData) => void;
};

const BulkGrid = ({
  bulk,
  isLocal,
  fns,
}: {
  fns?: Fns;
  isLocal?: boolean;
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
          <Box
            key={deck.id + deck.version_id}
            _hover={{ bg: isLocal ? "rgba(0,0,0,0.25)" : "green" }}
            onClick={() => {
              if (isLocal) {
                fns?.removeDeckbyId(deck.id);
                toast.success(`Removed ${deck.name}`);
                return;
              }
              fns?.pushDeck(deck);
              toast.success(`Imported ${deck.name}. Reload Page.`);
            }}
          >
            <Text>{deck.name}</Text>
          </Box>
        ))}
        <Divider my="0.5rem" />
        <FormLabel fontWeight={700}>Maps</FormLabel>

        {bulk?.maps?.map((map) => (
          <Box
            key={map.imgUrl}
            onClick={() => {
              if (!fns?.addMap) return;
              fns.addMap(map);
              toast.success(
                `Imported ${map.meta?.title ?? map?.imgUrl}. Reload page`,
              );
            }}
            _hover={{ bg: isLocal ? "" : "green" }}
          >
            <Text>{map?.meta?.title ?? map?.imgUrl}</Text>
          </Box>
        ))}
      </Box>
      <Box h="100%" overflowY="auto" bg="white">
        {/* @ts-ignore: weird github actions build difference */}
        <DynamicReactJson src={bulk} />
      </Box>
    </Grid>
  );
};
