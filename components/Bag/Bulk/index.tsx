import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { MapData, useLocalDeckStorage, useLocalMapStorage } from "@/lib/hooks";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { useGenericImport } from "@/lib/hooks/useGenericImport";
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Input,
  Tag,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useRouter } from "next/router";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { useDebounce } from "use-debounce";
import { FaDownload, FaFileImport, FaLink, FaRegCopy } from "react-icons/fa";

type BulkBundle = { decks: DeckImportType[]; maps: MapData[] };

/**
 * Accept a full backup bundle ({decks, maps}), a bare array of decks,
 * or a single deck object — people share all three shapes.
 */
const normalizeBundle = (parsed: unknown): BulkBundle | undefined => {
  if (!parsed || typeof parsed !== "object") return undefined;
  if (Array.isArray(parsed)) {
    const decks = parsed.filter((d) => d?.deck_data && d?.id);
    return decks.length ? { decks, maps: [] } : undefined;
  }
  const obj = parsed as Record<string, any>;
  if (obj.deck_data && obj.id) {
    return { decks: [obj as DeckImportType], maps: [] };
  }
  const decks = Array.isArray(obj.decks)
    ? obj.decks.filter((d: any) => d?.deck_data && d?.id)
    : [];
  const maps = Array.isArray(obj.maps)
    ? obj.maps.filter((m: any) => typeof m?.imgUrl === "string")
    : [];
  if (!decks.length && !maps.length) return undefined;
  return { decks, maps };
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const BagBulkContainer = () => {
  const { decks, star, importDecks } = useLocalDeckStorage();
  const { data: maps, importMaps } = useLocalMapStorage();

  return (
    <Box h="100%" p="1rem" maxW="1100px" mx="auto">
      <Text
        fontFamily="BebasNeueRegular"
        fontSize="1.75rem"
        letterSpacing="0.04em"
        color="brand.secondary"
      >
        Backup &amp; Share
      </Text>
      <Text maxW="46rem" fontSize="0.9rem" mb="1rem" opacity={0.85}>
        Everything lives in your browser — nothing is stored on a server. Save
        a backup file to keep your decks and maps safe, move them to another
        device, share them with a friend, or play again years from now even if
        the original deck links go offline.
      </Text>
      <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap="1rem">
        <ExportPanel decks={decks} maps={maps} star={star} />
        <ImportPanel {...{ importDecks, importMaps, decks, maps }} />
      </Grid>
    </Box>
  );
};

const Panel = (props: React.ComponentProps<typeof Box>) => (
  <Box
    bg="brand.parchment"
    borderRadius="0.75rem"
    p="1rem"
    boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
    h="fit-content"
    {...props}
  />
);

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize="1.1rem"
    mb="0.5rem"
  >
    {children}
  </Text>
);

const ExportPanel = ({
  decks,
  maps,
  star,
}: {
  decks?: DeckImportType[];
  maps: MapData[];
  star?: string;
}) => {
  const [, copy] = useCopyToClipboard();
  const bundle = { decks: decks ?? [], maps };

  const download = () => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `unbrewed-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  return (
    <Panel>
      <PanelTitle>Export your bag</PanelTitle>
      <HStack mb="0.75rem">
        <Tag bg="brand.secondary" color="brand.primary">
          {decks?.length ?? 0} decks
        </Tag>
        <Tag bg="brand.secondary" color="brand.primary">
          {maps.length} maps
        </Tag>
      </HStack>
      <Flex gap="0.5rem" flexWrap="wrap">
        <Button leftIcon={<FaDownload />} bg="gold" onClick={download}>
          Download backup file
        </Button>
        <Button
          leftIcon={<FaRegCopy />}
          onClick={() => {
            copy(JSON.stringify(bundle));
            toast.success("Backup JSON copied to clipboard");
          }}
        >
          Copy JSON
        </Button>
      </Flex>
      {star && (
        <Text fontSize="0.75rem" mt="0.75rem" opacity={0.7}>
          Includes your starred deck and everything else in the bag.
        </Text>
      )}
    </Panel>
  );
};

const ImportPanel = ({
  importDecks,
  importMaps,
  decks,
  maps,
}: {
  importDecks: (d: DeckImportType[]) => number;
  importMaps: (m: MapData[]) => number;
  decks?: DeckImportType[];
  maps: MapData[];
}) => {
  const { query } = useRouter();
  const [, copy] = useCopyToClipboard();
  const [rawText, setRawText] = useState<string>("");
  const [urlInput, setUrlInput] = useState<string>("");
  const [url] = useDebounce(urlInput, 400);
  const { data: urlData } = useGenericImport(url || undefined);

  // ?url= share-import deep link (kept from the old bulk page)
  useEffect(() => {
    if (query?.url) setUrlInput(query.url as string);
  }, [query?.url]);

  useEffect(() => {
    if (urlData?.data) setRawText(JSON.stringify(urlData.data));
  }, [urlData?.data]);

  const bundle = useMemo(
    () => (rawText ? normalizeBundle(parseJson(rawText)) : undefined),
    [rawText],
  );

  const existingDeckIds = new Set((decks ?? []).map((deck) => deck.id));
  const existingMapUrls = new Set(maps.map((map) => map.imgUrl));
  const newDecks =
    bundle?.decks.filter((deck) => !existingDeckIds.has(deck.id)) ?? [];
  const newMaps =
    bundle?.maps.filter((map) => !existingMapUrls.has(map.imgUrl)) ?? [];

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRawText(await file.text());
  };

  const runImport = () => {
    const addedDecks = importDecks(newDecks);
    const addedMaps = importMaps(newMaps);
    toast.success(`Imported ${addedDecks} decks and ${addedMaps} maps`);
    setRawText("");
    setUrlInput("");
  };

  return (
    <Panel>
      <PanelTitle>Import</PanelTitle>
      <Flex direction="column" gap="0.6rem">
        <Button
          as="label"
          leftIcon={<FaFileImport />}
          cursor="pointer"
          w="fit-content"
        >
          Choose backup file…
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onFile}
          />
        </Button>
        <HStack>
          <FaLink opacity={0.6} />
          <Input
            bg="white"
            size="sm"
            placeholder="…or a URL that returns backup JSON"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
        </HStack>
        <Textarea
          bg="white"
          fontSize="0.65rem"
          h="70px"
          placeholder="…or paste backup JSON here"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />

        {rawText && !bundle && (
          <Text color="brand.danger" fontSize="0.85rem">
            That doesn&apos;t look like Unbrewed backup JSON (expected decks
            and/or maps).
          </Text>
        )}

        {bundle && (
          <Box>
            <Text fontSize="0.85rem" fontWeight={700} mb="0.25rem">
              Found in this backup:
            </Text>
            <Flex flexWrap="wrap" gap="0.25rem" maxH="8rem" overflowY="auto">
              {bundle.decks.map((deck) => (
                <Tag
                  key={deck.id}
                  size="sm"
                  bg={existingDeckIds.has(deck.id) ? "gray.300" : "brand.secondary"}
                  color={existingDeckIds.has(deck.id) ? "gray.600" : "brand.primary"}
                >
                  {deck.name}
                  {existingDeckIds.has(deck.id) && " (in bag)"}
                </Tag>
              ))}
              {bundle.maps.map((map) => (
                <Tag
                  key={map.imgUrl}
                  size="sm"
                  bg={existingMapUrls.has(map.imgUrl) ? "gray.300" : "brand.positive"}
                  color={existingMapUrls.has(map.imgUrl) ? "gray.600" : "white"}
                >
                  🗺 {map.meta?.title ?? "map"}
                  {existingMapUrls.has(map.imgUrl) && " (in bag)"}
                </Tag>
              ))}
            </Flex>
            <HStack mt="0.6rem">
              <Button
                bg="gold"
                size="sm"
                isDisabled={newDecks.length + newMaps.length === 0}
                onClick={runImport}
              >
                Import {newDecks.length + newMaps.length} new item
                {newDecks.length + newMaps.length === 1 ? "" : "s"}
              </Button>
              {url && (
                <Button
                  size="sm"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/bag?tab=2&url=${encodeURIComponent(url)}`;
                    copy(shareUrl);
                    toast.success("Share link copied");
                  }}
                >
                  Copy share link
                </Button>
              )}
            </HStack>
          </Box>
        )}
      </Flex>
    </Panel>
  );
};
