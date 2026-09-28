import { FormEvent, useMemo, useState } from "react";
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Link,
  ListItem,
  OrderedList,
  Text,
  UnorderedList,
  Wrap,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckCards } from "@/components/Bag/Deck/DeckCards";
import {
  LABS_ERROR_MESSAGES,
  LabsImport,
  LabsImportError,
  LabsLoadedSet,
  buildLabsImport,
  defaultLabsCharacter,
  fetchLabsSet,
  listLabsHeroes,
} from "@/lib/labs";

const LABS_URL = "https://www.unmatchedlabs.com";

/**
 * Paste an Unmatched Labs set or character link, preview the mapped deck, then
 * save it to the bag. Fetches only when the player presses Import. Rendered
 * bare inside AddDeckHub's focused view, like CodePanel.
 */
export const LabsPanel = ({
  pushDeck,
  setStar,
  onAdded,
  onOpenImages,
}: {
  pushDeck: (deck: DeckImportType) => Promise<boolean>;
  setStar: (id: string) => void;
  onAdded?: (deckId: string) => void;
  /** switch the hub to the card-image import (the TTS-export fallback) */
  onOpenImages?: () => void;
}) => {
  const [link, setLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState<LabsLoadedSet>();
  const [characterId, setCharacterId] = useState<string>();

  const heroes = useMemo(
    () => (loaded ? listLabsHeroes(loaded.row.document.set) : []),
    [loaded],
  );
  const built = useMemo((): LabsImport | { error: string } | undefined => {
    if (!loaded || !characterId) return undefined;
    try {
      return buildLabsImport(loaded, characterId);
    } catch (err) {
      return { error: messageOf(err) };
    }
  }, [loaded, characterId]);
  const result = built && "deck" in built ? built : undefined;
  const shownError = error ?? (built && "error" in built ? built.error : undefined);

  const reset = () => {
    setLoaded(undefined);
    setCharacterId(undefined);
    setError(undefined);
  };

  const fetchSet = async (e?: FormEvent) => {
    e?.preventDefault();
    reset();
    setIsLoading(true);
    try {
      const next = await fetchLabsSet(link);
      setLoaded(next);
      setCharacterId(defaultLabsCharacter(next));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setIsLoading(false);
    }
  };

  const save = async () => {
    if (!result) return;
    const { deck } = result;
    if (!(await pushDeck(deck))) return; // blocked author or storage full — already toasted
    setStar(deck.id);
    toast.success(`${deck.name} saved & ready to play`);
    reset();
    setLink("");
    onAdded?.(deck.id);
  };

  return (
    <Flex direction="column" color="brand.secondary">
      <Text fontSize="0.9rem" opacity={0.85} mb="0.75rem">
        Open a set on{" "}
        <Link href={LABS_URL} isExternal textDecoration="underline">
          Unmatched Labs
        </Link>
        , copy its share link — or the link to one character — and paste it
        here. Only published sets can be imported.
      </Text>

      <form onSubmit={fetchSet}>
        <Text as="label" htmlFor="labs-link" fontWeight={700} fontSize="0.85rem">
          Unmatched Labs link
        </Text>
        <HStack my="0.4rem" maxW="560px">
          <Input
            id="labs-link"
            bg="white"
            placeholder="https://www.unmatchedlabs.com/shared/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <Button
            type="submit"
            bg="brand.secondary"
            color="brand.parchment"
            _hover={{ opacity: 0.9 }}
            isLoading={isLoading}
            loadingText="Fetching"
            isDisabled={!link.trim()}
            flexShrink={0}
          >
            Import
          </Button>
        </HStack>
      </form>

      {isLoading && (
        <Text fontSize="0.85rem" opacity={0.7} mt="0.25rem">
          Fetching from Unmatched Labs…
        </Text>
      )}

      {shownError && (
        <Box
          role="alert"
          mt="0.5rem"
          p="0.75rem"
          borderRadius="0.5rem"
          bg="red.50"
          border="1px solid"
          borderColor="red.300"
          color="red.800"
          fontSize="0.9rem"
          maxW="560px"
        >
          {shownError}
        </Box>
      )}

      {loaded && heroes.length > 1 && (
        <Box mt="0.75rem">
          <Text fontSize="0.9rem" mb="0.4rem">
            <b>{loaded.row.name}</b> has {heroes.length} heroes —{" "}
            {characterId ? "showing" : "pick one to import"}:
          </Text>
          <Wrap spacing="0.4rem">
            {heroes.map((hero) => (
              <Button
                key={hero.id}
                size="sm"
                variant={hero.id === characterId ? "solid" : "outline"}
                colorScheme="purple"
                onClick={() => setCharacterId(hero.id)}
              >
                {hero.name}
              </Button>
            ))}
          </Wrap>
        </Box>
      )}

      {result && (
        <Box mt="0.75rem">
          {result.unsupported.length > 0 && (
            <UnsupportedWarning result={result} onOpenImages={onOpenImages} />
          )}
          <Text fontSize="0.85rem" opacity={0.8} mb="0.4rem">
            From “{result.setName}”{result.author ? ` by ${result.author}` : ""}
          </Text>
          <HStack mb="0.5rem">
            <Button
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              onClick={save}
            >
              ★ {result.unsupported.length ? "Save anyway" : "Save & use"} “
              {result.deck.name}”
            </Button>
            <Button variant="ghost" onClick={reset}>
              Clear
            </Button>
          </HStack>
          <DeckCards decks={[result.deck]} selectedDeckId={result.deck.id} />
        </Box>
      )}

      {!result && (
        <Box mt="1.25rem" fontSize="0.85rem" opacity={0.85} maxW="620px">
          <Text fontWeight={700} mb="0.25rem">
            Deck uses custom symbols or card styles?
          </Text>
          <Text mb="0.25rem">
            Our card template draws standard cards only. For anything else,
            bring the deck in as full card art instead:
          </Text>
          <TtsSteps onOpenImages={onOpenImages} />
        </Box>
      )}
    </Flex>
  );
};

const messageOf = (err: unknown) =>
  err instanceof LabsImportError ? err.message : LABS_ERROR_MESSAGES.network;

/** The Labs TTS-export → card-image import path, for decks our template can't draw. */
const TtsSteps = ({ onOpenImages }: { onOpenImages?: () => void }) => (
  <OrderedList spacing="0.2rem" ml="1.25rem">
    <ListItem>
      On Unmatched Labs, open the set and choose{" "}
      <b>Export Tabletop Simulator object</b>, with <b>Host assets online</b>{" "}
      checked.
    </ListItem>
    <ListItem>Save the file it gives you (or copy its JSON).</ListItem>
    <ListItem>
      Upload or paste it in{" "}
      {onOpenImages ? (
        <Link as="button" textDecoration="underline" fontWeight={700} onClick={onOpenImages}>
          Import from The Unmatched Club
        </Link>
      ) : (
        <b>Import from The Unmatched Club</b>
      )}{" "}
      — that option takes any deck as card images, not just the Club&apos;s.
    </ListItem>
  </OrderedList>
);

const UnsupportedWarning = ({
  result,
  onOpenImages,
}: {
  result: LabsImport;
  onOpenImages?: () => void;
}) => (
  <Box
    role="alert"
    mb="0.75rem"
    p="0.85rem"
    borderRadius="0.5rem"
    bg="orange.50"
    border="2px solid"
    borderColor="orange.400"
    color="gray.800"
    fontSize="0.9rem"
    maxW="680px"
  >
    <Text fontWeight={700} fontSize="1rem" mb="0.3rem">
      ⚠ This deck won&apos;t look right with our card template
    </Text>
    <Text mb="0.3rem">
      {result.deck.name} uses Unmatched Labs features we can&apos;t draw:
    </Text>
    <UnorderedList ml="1.25rem" mb="0.5rem" spacing="0.1rem">
      {result.unsupported.map((feature) => (
        <ListItem key={feature.id}>
          {feature.label}
          {feature.cards.length > 0 && (
            <Text as="span" opacity={0.75}>
              {" "}
              — {feature.cards.join(", ")}
            </Text>
          )}
        </ListItem>
      ))}
    </UnorderedList>
    <Text fontWeight={700} mb="0.2rem">
      To play it with its real card art:
    </Text>
    <TtsSteps onOpenImages={onOpenImages} />
    {onOpenImages && (
      <Button size="sm" mt="0.6rem" colorScheme="orange" onClick={onOpenImages}>
        Open the card-image import
      </Button>
    )}
  </Box>
);
