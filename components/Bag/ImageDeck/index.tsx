import { ChangeEvent, useMemo, useState } from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Checkbox,
  Flex,
  FormLabel,
  Grid,
  HStack,
  Input,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/router";
import { FaFileImport } from "react-icons/fa";
import { Card } from "@/components/CardFactory/Card";
import { useLocalDeckStorage } from "@/lib/hooks/useLocalStorage";
import {
  ParsedTtsCard,
  buildImageDeck,
  parseTtsDeck,
} from "@/lib/tts/parse-tts";

/**
 * "Bring any deck": build a deck from whole-card images. Two paths —
 * import a Tabletop Simulator export (the format the-unmatched.club
 * and unmatched.cards both produce), or paste one image URL per line.
 */
export const AddImageDeck = () => {
  return (
    <Flex
      direction="column"
      bg="brand.highlight"
      color="brand.secondary"
      p="0.5rem"
      borderRadius="0.25rem"
      mt="1rem"
    >
      <Text fontWeight={700}>Bring any deck with card images</Text>
      <Text fontSize="0.9rem">
        For decks the card generator can&apos;t express — like The Unmatched
        Club&apos;s. Import a Tabletop Simulator export, or list image URLs.
      </Text>
      <Builder />
    </Flex>
  );
};

type DeckMeta = {
  name: string;
  hp: string;
  move: string;
  isRanged: boolean;
};

const Builder = () => {
  const { reload } = useRouter();
  const { pushDeck, setStar } = useLocalDeckStorage();

  const [cards, setCards] = useState<ParsedTtsCard[]>([]);
  const [cardbackUrl, setCardbackUrl] = useState<string>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [meta, setMeta] = useState<DeckMeta>({
    name: "",
    hp: "15",
    move: "2",
    isRanged: false,
  });

  const loadTtsJson = (text: string) => {
    try {
      const parsed = parseTtsDeck(JSON.parse(text));
      setWarnings(parsed.warnings);
      if (parsed.cards.length === 0) {
        toast.error(
          parsed.warnings[0] ?? "No cards found in that file",
        );
        return;
      }
      setCards(parsed.cards);
      setCardbackUrl(parsed.cardbackUrl);
      if (parsed.name) setMeta((m) => ({ ...m, name: m.name || parsed.name! }));
      toast.success(`Found ${parsed.cards.length} unique cards`);
    } catch {
      toast.error("That file isn't valid JSON");
    }
  };

  const onTtsFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadTtsJson(await file.text());
    e.target.value = "";
  };

  const totalCards = useMemo(
    () => cards.reduce((n, c) => n + c.quantity, 0),
    [cards],
  );

  const save = () => {
    if (!meta.name.trim()) {
      toast.error("Give the deck a name first");
      return;
    }
    const deck = buildImageDeck({
      name: meta.name.trim(),
      hp: parseInt(meta.hp) || 15,
      move: parseInt(meta.move) || 2,
      isRanged: meta.isRanged,
      cardbackUrl,
      cards,
    });
    pushDeck(deck);
    setStar(deck.id);
    toast.success(`${deck.name} saved & ready to play`);
    reload();
  };

  return (
    <>
      <Accordion allowToggle>
        <AccordionItem>
          <h2>
            <AccordionButton>
              <Box as="span" flex="1" textAlign="left">
                Import from Tabletop Simulator / The Unmatched Club
              </Box>
              <AccordionIcon />
            </AccordionButton>
          </h2>
          <AccordionPanel pb={4}>
            <Text fontSize="0.8rem" mb="0.5rem">
              On the-unmatched.club, export the deck for Tabletop Simulator,
              then drop the exported <code>.json</code> file here (TTS saves
              them under <code>Saves/Saved Objects</code>).
            </Text>
            <HStack alignItems="start">
              <Button
                as="label"
                size="sm"
                leftIcon={<FaFileImport />}
                cursor="pointer"
                flexShrink={0}
              >
                Choose TTS file…
                <input
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={onTtsFile}
                />
              </Button>
              <Textarea
                bg="white"
                fontSize="0.6rem"
                h="60px"
                placeholder="…or paste the TTS JSON here"
                onChange={(e) => {
                  if (e.target.value.trim()) loadTtsJson(e.target.value);
                }}
              />
            </HStack>
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <h2>
            <AccordionButton>
              <Box as="span" flex="1" textAlign="left">
                Build from image URLs
              </Box>
              <AccordionIcon />
            </AccordionButton>
          </h2>
          <AccordionPanel pb={4}>
            <Text fontSize="0.8rem" mb="0.5rem">
              One card per line: <code>image-url, quantity, title</code>{" "}
              (quantity and title optional). Use direct image links — GitHub
              or catbox.moe hold up better than imgur.
            </Text>
            <UrlListInput onCards={setCards} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {warnings.length > 0 && (
        <Box mt="0.5rem">
          {warnings.slice(0, 3).map((warning) => (
            <Text key={warning} fontSize="0.75rem" color="brand.danger">
              ⚠ {warning}
            </Text>
          ))}
        </Box>
      )}

      {cards.length > 0 && (
        <Box mt="0.75rem">
          <Text fontWeight={700} fontSize="0.9rem">
            {cards.length} unique cards ({totalCards} total)
          </Text>
          <Grid
            templateColumns="repeat(auto-fill, minmax(90px, 1fr))"
            gap="0.4rem"
            maxH="16rem"
            overflowY="auto"
            my="0.5rem"
            p="0.25rem"
            bg="rgba(72, 40, 79, 0.08)"
            borderRadius="0.4rem"
          >
            {cards.map((card, i) => (
              <Box key={i} h="120px" title={`${card.title} ×${card.quantity}`}>
                <Card
                  card={buildImageDeck({ name: "p", cards: [card] }).deck_data.cards[0]}
                />
              </Box>
            ))}
          </Grid>

          <Grid templateColumns="2fr 1fr 1fr auto" gap="0.5rem" alignItems="end">
            <Box>
              <FormLabel fontSize="0.75rem" mb="0">
                Deck name
              </FormLabel>
              <Input
                bg="white"
                size="sm"
                value={meta.name}
                onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              />
            </Box>
            <Box>
              <FormLabel fontSize="0.75rem" mb="0">
                Hero HP
              </FormLabel>
              <Input
                bg="white"
                size="sm"
                type="number"
                value={meta.hp}
                onChange={(e) => setMeta({ ...meta, hp: e.target.value })}
              />
            </Box>
            <Box>
              <FormLabel fontSize="0.75rem" mb="0">
                Move
              </FormLabel>
              <Input
                bg="white"
                size="sm"
                type="number"
                value={meta.move}
                onChange={(e) => setMeta({ ...meta, move: e.target.value })}
              />
            </Box>
            <Checkbox
              isChecked={meta.isRanged}
              onChange={(e) => setMeta({ ...meta, isRanged: e.target.checked })}
            >
              <Text fontSize="0.8rem">Ranged</Text>
            </Checkbox>
          </Grid>
          <Button mt="0.75rem" bg="gold" onClick={save}>
            ★ Save &amp; use this deck
          </Button>
        </Box>
      )}
    </>
  );
};

const UrlListInput = ({
  onCards,
}: {
  onCards: (cards: ParsedTtsCard[]) => void;
}) => {
  const [text, setText] = useState("");

  const parseLines = (value: string) => {
    setText(value);
    const cards: ParsedTtsCard[] = [];
    for (const line of value.split("\n")) {
      const [url, quantity, ...titleParts] = line.split(",").map((s) => s.trim());
      if (!url || !/^https?:\/\//i.test(url)) continue;
      cards.push({
        title: titleParts.join(", ") || `Card ${cards.length + 1}`,
        quantity: Math.max(1, parseInt(quantity ?? "1") || 1),
        image: { url },
      });
    }
    onCards(cards);
  };

  return (
    <Textarea
      bg="white"
      fontSize="0.7rem"
      h="90px"
      placeholder={`https://raw.githubusercontent.com/you/deck/main/card-1.png, 2, Quickdraw\nhttps://files.catbox.moe/abc123.png`}
      value={text}
      onChange={(e) => parseLines(e.target.value)}
    />
  );
};
