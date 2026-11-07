import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, Flex, Input, Link, Text } from "@chakra-ui/react";
import { FaFileImport, FaLink } from "react-icons/fa";
import { BagDeckView } from "@/lib/bag/useBag";
import { PasteDetection, detectDeckPaste } from "@/lib/bag/detectPaste";
import { PopularDecks } from "@/components/Bag/PopularDecks";
import { AddImageDeck } from "@/components/Bag/ImageDeck";
import { StarterDeckContainer } from "@/components/Bag/StarterDecks";
import { AddJson } from "@/components/Bag/Deck/AddJson";
import { ClubPanel } from "./ClubPanel";
import { CodePanel } from "./CodePanel";
import { FoundLine } from "./FoundLine";
import { LabsPanel } from "./LabsPanel";

type Browse = "popular" | "starters" | "images";

const siteLink = (href: string, label: string) => (
  <Link href={href} isExternal textDecoration="underline" fontWeight={700}>
    {label}
  </Link>
);

/**
 * The universal paste bar (#1538): one input for a link, a code, deck JSON
 * or a dropped `.json` file. `detectDeckPaste` says what it is, and the
 * matching panel opens underneath with it filled in — no method to choose.
 * Popular and Starter decks are text links that open inline.
 */
export const AddDeckHub = ({
  pushDeck,
  setStar,
  star,
  deckIds,
  onDeckAdded,
  inputRef,
}: {
  pushDeck: BagDeckView["pushDeck"];
  setStar: (id: string) => void;
  star?: string;
  deckIds?: string[];
  /** a deck landed in the bag (it is starred, so it is Up next) */
  onDeckAdded?: (deckId: string) => void;
  /** lets "+ Add another" focus the bar */
  inputRef?: RefObject<HTMLInputElement>;
}) => {
  const [text, setText] = useState("");
  const [browse, setBrowse] = useState<Browse>();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  const detected: PasteDetection = useMemo(() => detectDeckPaste(text), [text]);

  const added = (id: string) => {
    setText("");
    onDeckAdded?.(id);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setBrowse(undefined);
    setText(await file.text());
  };
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    await readFile(e.target.files?.[0]);
    e.target.value = "";
  };
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    await readFile(e.dataTransfer.files?.[0]);
  };

  const toggle = (next: Browse) => setBrowse((prev) => (prev === next ? undefined : next));

  return (
    <Box maxW="920px" mx="auto" color="brand.secondary">
      <Text
        as="h2"
        fontFamily="BebasNeueRegular"
        fontSize={{ base: "2rem", md: "2.5rem" }}
        letterSpacing="0.03em"
        lineHeight={1}
      >
        Got a deck?{" "}
        <Text as="span" color="brand.accentDeep">
          Paste it in.
        </Text>
      </Text>
      <Text fontSize="0.9rem" opacity={0.75} mt="0.3rem" mb="0.8rem">
        Links from unmatched.cards, Unmatched Labs or the-unmatched.club. Files
        too. You&apos;ll be at a table one click later.
      </Text>

      <form
        onSubmit={(e: FormEvent) => e.preventDefault()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <Flex
          align="center"
          gap="0.6rem"
          bg="white"
          border="2px solid"
          borderColor={dragging ? "brand.accent" : "brand.secondary"}
          borderStyle={dragging ? "dashed" : "solid"}
          borderRadius="0.75rem"
          boxShadow="0 2px 0 #48284F"
          px="0.85rem"
          h="3.25rem"
        >
          <Box opacity={0.7} flexShrink={0}>
            <FaLink />
          </Box>
          <Input
            ref={ref}
            aria-label="Paste a deck link, code or JSON"
            placeholder="Paste a deck link, code or JSON"
            variant="unstyled"
            fontFamily="ArchivoNarrow"
            fontSize="1.05rem"
            value={text}
            onChange={(e) => {
              setBrowse(undefined);
              setText(e.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {text && (
            <Button
              size="xs"
              variant="ghost"
              flexShrink={0}
              aria-label="Clear"
              onClick={() => setText("")}
            >
              ✕
            </Button>
          )}
          <Button
            as="label"
            size="sm"
            variant="ghost"
            flexShrink={0}
            cursor="pointer"
            leftIcon={<FaFileImport />}
            display={{ base: "none", sm: "inline-flex" }}
          >
            File
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={onFile}
              data-testid="paste-file"
            />
          </Button>
        </Flex>
      </form>

      <Flex
        mt="0.5rem"
        fontSize="0.82rem"
        opacity={0.85}
        gap="0.35rem"
        flexWrap="wrap"
        align="center"
      >
        <TextLink active={browse === "popular"} onClick={() => toggle("popular")}>
          Browse popular decks
        </TextLink>
        <span>·</span>
        <TextLink active={browse === "starters"} onClick={() => toggle("starters")}>
          Starter decks
        </TextLink>
        <span>·</span>
        <TextLink onClick={() => fileRef.current?.click()}>Drop a file</TextLink>
      </Flex>

      {browse && (
        <Box
          mt="0.75rem"
          bg="brand.parchment"
          borderRadius="0.75rem"
          p={{ base: "0.85rem", md: "1rem" }}
          border="1px solid rgba(72, 40, 79, 0.18)"
        >
          {browse === "popular" && (
            <PopularDecks deckIds={deckIds} pushDeck={pushDeck} setStar={setStar} star={star} />
          )}
          {browse === "starters" && (
            <StarterDeckContainer deckIds={deckIds} pushDeck={pushDeck} />
          )}
          {browse === "images" && <AddImageDeck onAdded={added} />}
        </Box>
      )}

      <Box mt={detected.kind === "empty" ? 0 : "0.25rem"}>
        {detected.kind === "labs" && (
          <LabsPanel
            key={detected.link}
            link={detected.link}
            pushDeck={pushDeck}
            setStar={setStar}
            onAdded={added}
            onOpenImages={() => setBrowse("images")}
          />
        )}
        {detected.kind === "code" && (
          <CodePanel code={detected.code} pushDeck={pushDeck} setStar={setStar} onAdded={added} />
        )}
        {detected.kind === "bundle" && (
          <AddJson key={detected.text} bundle={detected.bundle} onAdded={added} />
        )}
        {detected.kind === "tts" && (
          <>
            <FoundLine>
              Tabletop Simulator export · {detected.cardCount} unique cards
              {detected.name ? ` · ${detected.name}` : ""}
            </FoundLine>
            <Box mt="0.75rem">
              <AddImageDeck key={detected.text} initialTts={detected.text} onAdded={added} />
            </Box>
          </>
        )}
        {detected.kind === "club" && (
          <ClubPanel id={detected.id} pushDeck={pushDeck} setStar={setStar} onAdded={added} />
        )}
        {detected.kind === "unknown" && (
          <FoundLine tone="problem">
            Not a deck we recognise.{" "}
            {detected.looksLikeJson
              ? "That JSON isn't a deck, a backup or a Tabletop Simulator export. "
              : ""}
            Paste a link from {siteLink("https://unmatched.cards/decks", "unmatched.cards")},{" "}
            {siteLink("https://www.unmatchedlabs.com", "Unmatched Labs")} or{" "}
            {siteLink("https://the-unmatched.club", "the-unmatched.club")}.
          </FoundLine>
        )}
      </Box>
    </Box>
  );
};

const TextLink = ({
  children,
  onClick,
  active,
}: {
  children: string;
  onClick: () => void;
  active?: boolean;
}) => (
  <Button
    variant="link"
    size="sm"
    fontSize="0.82rem"
    fontWeight={active ? 700 : 600}
    color="brand.secondary"
    textDecoration="underline"
    textUnderlineOffset="3px"
    onClick={onClick}
  >
    {children}
  </Button>
);
