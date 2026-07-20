import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  Grid,
  HStack,
  IconButton,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { DeleteIcon, LockIcon, UnlockIcon } from "@chakra-ui/icons";
import { FC, ReactNode, useMemo, useState } from "react";
//@ts-ignore
import { CirclePicker } from "react-color";
import { ImageFace } from "@/components/CardFactory/Card";
import { toast } from "react-hot-toast";
import {
  GameIconSet,
  iconLabel,
  searchIcons,
  useGameIcons,
} from "@/lib/icons/gameIcons";
import {
  BoardToken,
  DEFAULT_TOKEN_SIZE,
  TokenCounter,
} from "./position.type";

/** Current HUD health values, for labeling the linked-counter options. */
export type LinkedHp = {
  hero?: number | null;
  sidekick?: number | null;
};

const OVERLAY_DEFAULT_WIDTH = 400;

const SIZE_CHOICES = [
  { label: "Small", value: 48 },
  { label: "Medium", value: 72 },
  { label: "Large", value: 108 },
  { label: "Huge", value: 160 },
];

/**
 * The token menu: pick your player color (tints every token you own), manage
 * everything you have on the board, and add icons / discs / images / overlays.
 *
 * Also serves the /bag deck editor as a loadout picker (`offBoard`), where the
 * same tokens are being edited off the table — see EditSavedTokens.
 */
export const TokenLibraryModal: FC<{
  isOpen: boolean;
  onClose: () => void;
  color: string;
  onColorChange: (hex: string) => void;
  tokens: BoardToken[];
  linkedHp: LinkedHp;
  onAdd: (token: Omit<BoardToken, "id" | "x" | "y">) => void;
  onPatch: (id: string, patch: Partial<BoardToken>) => void;
  onDelete: (id: string) => void;
  /** Header text; defaults to the in-game wording. */
  title?: string;
  /** Blurb under the header — used to explain the deck-loadout context. */
  intro?: ReactNode;
  /** Action row pinned below the list (e.g. "save these to my deck"). */
  footer?: ReactNode;
  /**
   * Editing a loadout with no board behind it: relabels the list and lets
   * image pieces be resized here, since there is nothing to click on a table.
   */
  offBoard?: boolean;
}> = ({
  isOpen,
  onClose,
  color,
  onColorChange,
  tokens,
  linkedHp,
  onAdd,
  onPatch,
  onDelete,
  title = "Your Board Tokens",
  intro,
  footer,
  offBoard = false,
}) => {
  const icons = useGameIcons();
  const [query, setQuery] = useState("");
  const [asCutout, setAsCutout] = useState(false);

  const [imageUrl, setImageUrl] = useState("");
  const [asOverlay, setAsOverlay] = useState(false);

  const results = useMemo(
    () => (icons ? searchIcons(icons, query, 96) : []),
    [icons, query],
  );

  const addIcon = (name: string) => {
    onAdd({ icon: name, size: DEFAULT_TOKEN_SIZE, cutout: asCutout });
    toast.success(`Added ${iconLabel(name)} token`);
  };

  const addDisc = () => {
    onAdd({ size: DEFAULT_TOKEN_SIZE });
    toast.success("Added disc token");
  };

  const addImage = () => {
    const url = imageUrl.trim();
    if (!url) return;

    const finish = (w: number, h: number) => {
      onAdd(
        asOverlay
          ? { imageUrl: url, overlay: true, size: w, h }
          : { imageUrl: url, size: DEFAULT_TOKEN_SIZE, h: DEFAULT_TOKEN_SIZE },
      );
      toast.success(
        asOverlay ? "Overlay added — lock it once placed" : "Image piece added",
      );
      setImageUrl("");
    };

    if (!asOverlay) {
      finish(DEFAULT_TOKEN_SIZE, DEFAULT_TOKEN_SIZE);
      return;
    }

    // Overlays keep the image's aspect ratio; probe it before placing.
    const probe = new window.Image();
    probe.onload = () => {
      const ratio = probe.naturalHeight / (probe.naturalWidth || 1);
      finish(OVERLAY_DEFAULT_WIDTH, Math.round(OVERLAY_DEFAULT_WIDTH * ratio));
    };
    probe.onerror = () => finish(OVERLAY_DEFAULT_WIDTH, OVERLAY_DEFAULT_WIDTH);
    probe.src = url;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay bg="rgba(20, 8, 24, 0.55)" backdropFilter="blur(8px)" />
      <ModalContent
        bg="brand.parchment"
        color="brand.surfaceDim"
        borderRadius="1rem"
        border="1px solid rgba(72, 40, 79, 0.35)"
      >
        <ModalHeader
          fontFamily="BebasNeueRegular"
          fontSize="1.5rem"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color="brand.secondary"
          pb="0.25rem"
        >
          {title}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb="1.25rem">
          {intro && (
            <Text fontSize="0.85rem" opacity={0.75} mb="0.9rem">
              {intro}
            </Text>
          )}
          <SectionLabel>Your color — tints all of your tokens</SectionLabel>
          <Box mt="0.4rem">
            <CirclePicker
              color={color}
              onChangeComplete={({ hex }: { hex: string }) =>
                onColorChange(hex)
              }
            />
          </Box>

          <Divider my="0.9rem" borderColor="rgba(72, 40, 79, 0.3)" />

          <SectionLabel>{offBoard ? "Saved tokens" : "On the board"}</SectionLabel>
          <Flex direction="column" gap="0.4rem" mt="0.5rem">
            {tokens.length === 0 && (
              <Text fontSize="0.85rem" opacity={0.7}>
                Nothing yet — add something below.
              </Text>
            )}
            {tokens.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                color={color}
                icons={icons}
                linkedHp={linkedHp}
                offBoard={offBoard}
                onPatch={(patch) => onPatch(t.id, patch)}
                onDelete={() => onDelete(t.id)}
              />
            ))}
          </Flex>

          {footer && <Box mt="0.75rem">{footer}</Box>}

          <Divider my="0.9rem" borderColor="rgba(72, 40, 79, 0.3)" />

          <SectionLabel>
            Add icon token — {icons ? "4,000+ icons, search away" : "loading…"}
          </SectionLabel>
          <HStack mt="0.5rem" align="center">
            <Input
              placeholder="search icons… (sword, dragon, potion, trap)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              bg="rgba(255,255,255,0.5)"
            />
            <Button size="sm" flexShrink={0} onClick={addDisc}>
              Add plain disc
            </Button>
          </HStack>
          <Checkbox
            mt="0.4rem"
            isChecked={asCutout}
            onChange={(e) => setAsCutout(e.target.checked)}
          >
            <Text fontSize="0.85rem">
              Cutout style — a color disc with the icon punched out of it
            </Text>
          </Checkbox>
          <Box
            mt="0.5rem"
            maxH="12rem"
            overflowY="auto"
            borderRadius="0.5rem"
            border="1px solid rgba(72, 40, 79, 0.2)"
            p="0.4rem"
          >
            {!icons ? (
              <Flex justify="center" py="2rem">
                <Spinner />
              </Flex>
            ) : results.length === 0 ? (
              <Text fontSize="0.85rem" opacity={0.7} p="0.5rem">
                No icons match “{query}”
              </Text>
            ) : (
              <Grid
                templateColumns="repeat(auto-fill, minmax(2.6rem, 1fr))"
                gap="0.2rem"
              >
                {results.map((name) => {
                  const Icon = icons[name];
                  return (
                    <Tooltip key={name} label={iconLabel(name)} openDelay={300}>
                      <Flex
                        as="button"
                        aria-label={iconLabel(name)}
                        onClick={() => addIcon(name)}
                        align="center"
                        justify="center"
                        h="2.6rem"
                        borderRadius={asCutout ? "100%" : "0.4rem"}
                        color={asCutout ? "brand.parchment" : color}
                        bg={asCutout ? color : "transparent"}
                        transition="background 0.1s, color 0.1s"
                        _hover={{ outline: "2px solid rgba(72, 40, 79, 0.4)" }}
                      >
                        <Icon size="1.7rem" />
                      </Flex>
                    </Tooltip>
                  );
                })}
              </Grid>
            )}
          </Box>

          <Divider my="0.9rem" borderColor="rgba(72, 40, 79, 0.3)" />

          <SectionLabel>Image (.png / .jpg url)</SectionLabel>
          <HStack mt="0.5rem">
            {imageUrl && <Image src={imageUrl} alt="preview" maxH="3rem" />}
            <Input
              placeholder="https://…/minimap.png"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              bg="rgba(255,255,255,0.5)"
            />
            <Button onClick={addImage} isDisabled={!imageUrl.trim()}>
              Add
            </Button>
          </HStack>
          <Checkbox
            mt="0.5rem"
            isChecked={asOverlay}
            onChange={(e) => setAsOverlay(e.target.checked)}
          >
            <Text fontSize="0.85rem">
              Table overlay — sits beneath all tokens; lock it in place after
              positioning (mini-maps, zones, teleport pads)
            </Text>
          </Checkbox>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

/** One manageable token: preview, size choice, style toggles, counter, delete. */
const TokenRow: FC<{
  token: BoardToken;
  color: string;
  icons: GameIconSet | null;
  linkedHp: LinkedHp;
  offBoard?: boolean;
  onPatch: (patch: Partial<BoardToken>) => void;
  onDelete: () => void;
}> = ({ token, color, icons, linkedHp, offBoard, onPatch, onDelete }) => {
  const isImage = Boolean(token.imageUrl);
  const Icon = token.icon ? icons?.[token.icon] : undefined;
  const size = token.size ?? DEFAULT_TOKEN_SIZE;
  // Overlays are sized by aspect-ratio probe and positioned on the table, so
  // they stay board-only; everything else is resizable wherever it is edited.
  const canResize = !isImage || (Boolean(offBoard) && !token.overlay);

  const label = token.icon
    ? iconLabel(token.icon)
    : isImage
      ? token.overlay
        ? "map overlay"
        : "image piece"
      : "disc";

  const sizeOptions = SIZE_CHOICES.some((c) => c.value === size)
    ? SIZE_CHOICES
    : [{ label: `Custom (${size})`, value: size }, ...SIZE_CHOICES];

  return (
    <Box
      p="0.3rem 0.5rem"
      borderRadius="0.5rem"
      border="1px solid rgba(72, 40, 79, 0.2)"
      bg="rgba(255,255,255,0.35)"
    >
    <Grid
      templateColumns="2.4rem 1fr auto auto"
      alignItems="center"
      gap="0.6rem"
    >
      {isImage ? (
        token.sheet ? (
          // Sheet-cropped pieces (hero/rule cards from a TTS import) would
          // preview as the whole ~70-face sprite sheet through <Image>.
          <Box boxSize="2.2rem">
            <ImageFace
              image={{ url: token.imageUrl!, ...token.sheet }}
              title={label}
            />
          </Box>
        ) : (
          <Image
            src={token.imageUrl}
            alt={label}
            boxSize="2.2rem"
            objectFit="contain"
          />
        )
      ) : (
        <Flex
          align="center"
          justify="center"
          boxSize="2.2rem"
          borderRadius="100%"
          bg={token.icon && !token.cutout ? "transparent" : color}
          color={token.cutout ? "brand.parchment" : color}
        >
          {Icon && <Icon size="1.6rem" />}
        </Flex>
      )}

      <Text fontWeight={700} fontSize="0.85rem" noOfLines={1}>
        {label}
      </Text>

      {isImage && !canResize ? (
        <Text fontSize="0.7rem" opacity={0.6}>
          {offBoard
            ? "sized and locked in game"
            : `click it on the board to resize${token.overlay ? " / lock" : ""}`}
        </Text>
      ) : (
        <HStack gap="0.4rem">
          <Select
            size="xs"
            w="6.5rem"
            value={size}
            bg="rgba(255,255,255,0.5)"
            onChange={(e) => {
              const next = Number(e.target.value);
              // Height tracks width at the piece's current aspect — square for
              // ordinary images, 63:88 for a seeded hero/rule card.
              const aspect = (token.h ?? size) / size;
              onPatch(
                isImage
                  ? { size: next, h: Math.round(next * aspect) }
                  : { size: next },
              );
            }}
          >
            {sizeOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          {token.icon && (
            <Tooltip
              label={
                token.cutout
                  ? "Switch to plain icon"
                  : "Switch to cutout disc (icon punched out)"
              }
            >
              <Button
                size="xs"
                variant={token.cutout ? "solid" : "outline"}
                onClick={() => onPatch({ cutout: !token.cutout })}
              >
                Cutout
              </Button>
            </Tooltip>
          )}
        </HStack>
      )}

      <HStack gap="0.2rem">
        {token.overlay && (
          <Tooltip label={token.locked ? "Unlock" : "Lock in place"}>
            <IconButton
              aria-label={token.locked ? "Unlock overlay" : "Lock overlay"}
              icon={token.locked ? <UnlockIcon /> : <LockIcon />}
              size="xs"
              variant="ghost"
              onClick={() => onPatch({ locked: !token.locked })}
            />
          </Tooltip>
        )}
        <IconButton
          aria-label={`Delete ${label}`}
          icon={<DeleteIcon />}
          size="xs"
          variant="ghost"
          colorScheme="red"
          onClick={onDelete}
        />
      </HStack>
    </Grid>
    {!token.overlay && (
      <CounterControls
        counter={token.counter}
        linkedHp={linkedHp}
        onChange={(counter) => onPatch({ counter })}
      />
    )}
    </Box>
  );
};

/**
 * Health-counter controls for one token: off, a detached manual number, or
 * live-linked to the hero/sidekick HP shown in the HUD.
 */
const CounterControls: FC<{
  counter?: TokenCounter;
  linkedHp: LinkedHp;
  onChange: (counter: TokenCounter | undefined) => void;
}> = ({ counter, linkedHp, onChange }) => {
  const mode = counter ? counter.link ?? "manual" : "off";

  const fmtHp = (hp?: number | null) => (hp == null ? "no deck yet" : `now ${hp}`);

  return (
    <HStack mt="0.35rem" gap="0.5rem" flexWrap="wrap">
      <Text fontSize="0.7rem" fontWeight={700} opacity={0.65} flexShrink={0}>
        HEALTH COUNTER
      </Text>
      <Select
        size="xs"
        w="11.5rem"
        value={mode}
        bg="rgba(255,255,255,0.5)"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "off") onChange(undefined);
          else if (v === "manual")
            onChange({ value: counter?.value ?? 5 });
          else onChange({ link: v as "hero" | "sidekick" });
        }}
      >
        <option value="off">Off</option>
        <option value="manual">Own number (detached)</option>
        <option value="hero">Linked: Hero HP ({fmtHp(linkedHp.hero)})</option>
        <option value="sidekick">
          Linked: Sidekick HP ({fmtHp(linkedHp.sidekick)})
        </option>
      </Select>
      {mode === "manual" && (
        <HStack gap="0.2rem">
          <Button
            size="xs"
            onClick={() =>
              onChange({ value: (counter?.value ?? 0) - 1 })
            }
          >
            −
          </Button>
          <Text fontSize="0.85rem" fontWeight={700} minW="1.6rem" textAlign="center">
            {counter?.value ?? 0}
          </Text>
          <Button
            size="xs"
            onClick={() =>
              onChange({ value: (counter?.value ?? 0) + 1 })
            }
          >
            +
          </Button>
        </HStack>
      )}
      {mode === "hero" || mode === "sidekick" ? (
        <Text fontSize="0.7rem" opacity={0.6}>
          follows the HUD — adjust it there or on the badge
        </Text>
      ) : null}
    </HStack>
  );
};

const SectionLabel = (props: React.ComponentProps<typeof Text>) => (
  <Text
    fontFamily="SpaceGrotesk"
    fontWeight={700}
    fontSize="0.8rem"
    textTransform="uppercase"
    letterSpacing="0.06em"
    opacity={0.75}
    {...props}
  />
);
