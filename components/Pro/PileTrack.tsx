/**
 * A quest track on a seat plate (issue #1623 — POMNI's Adventure deck).
 *
 * Three pieces, all fed by the one `PileTrackView` (lib/pro/pileTracks.ts):
 *
 *  - `PileTrackRow`    the row on the plate / in the mobile seat sheet: which goal
 *                      is active and what it asks for, five pips for the whole
 *                      track, and the rewards held. Public, so it is on BOTH seats'
 *                      plates — the opponent has to be able to read what she is
 *                      working toward and what she already has.
 *  - `PileTrackModal`  every card of the track, face-up side upright, with both
 *                      sides' text. Opened by the row.
 *  - `PileTrackTag`    the compact reading for places with no room for a row (the
 *                      collapsed plate's title bar, the phone's corner chip).
 *
 * Text is rendered as text, never only as card art: the faces are landscape cards
 * with small print, and a phone has no hover.
 */
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";
import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import type { CardInstanceId } from "@/lib/pro/protocol";
import {
  PileTrackStep,
  PileTrackStepState,
  PileTrackView,
  trackGoalSubtitle,
  trackRewardText,
} from "@/lib/pro/pileTracks";

type Resolve = (instance: CardInstanceId) => DeckImportCardType | null;
type LabelFor = (instance: CardInstanceId) => string;

/** The deck's own circus blue and gold (also the ADV_DONE token badge). */
const TRACK_BLUE = "#2B3A8C";
const TRACK_GOLD = "#FFE58A";

const STATE_WORDS: Record<PileTrackStepState, string> = {
  active: "active",
  upcoming: "in the deck",
  held: "completed — reward held",
  spent: "completed — reward used, removed from the game",
  unknown: "",
};

const faceText = (resolve: Resolve, instance: CardInstanceId | null): string => {
  if (!instance) return "";
  const card = resolve(instance);
  if (!card) return "";
  return [card.basicText, card.immediateText, card.duringText, card.afterText]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ");
};

/** The face's printed title. The snapshot's own (resolveCard) is the bare title;
 *  `labelFor` is the fallback while art loads, and it decorates ("… (scheme)"). */
const faceTitle = (resolve: Resolve, labelFor: LabelFor, instance: CardInstanceId | null): string =>
  instance ? resolve(instance)?.title ?? labelFor(instance).replace(/\s*\([^)]*\)\s*$/, "") : "";

/** Short compact reading: "ADV 2 · ★1" / "ADV – · ★3"; `tight` is the phone corner
 *  chip's "A2★1", where the sidekick hearts need the room. */
export const pileTrackTagText = (track: PileTrackView, tight = false): string => {
  const n = track.active ? track.active.n : "–";
  if (tight) return `${track.def.goalWord[0].toUpperCase()}${n}★${track.completed}`;
  return `${track.def.goalWord.slice(0, 3).toUpperCase()} ${n} · ★${track.completed}`;
};

/** The same reading in words, for a title / aria-label. */
export const pileTrackSpoken = (track: PileTrackView): string => {
  const { goalWord, rewardWord } = track.def;
  const active = track.active
    ? `${goalWord} ${track.active.n} active`
    : track.next
      ? `no active ${goalWord}, ${goalWord} ${track.next.n} is next`
      : `no ${goalWord} left`;
  const held = track.held.length
    ? `${rewardWord}s held: ${track.held.map((s) => s.n).join(", ")}`
    : `no ${rewardWord.toLowerCase()}s held`;
  return `${active}; ${track.completed} completed; ${held}`;
};

export const PileTrackTag = ({ track }: { track: PileTrackView }) => (
  <Box
    as="span"
    data-testid="pile-track-tag"
    title={pileTrackSpoken(track)}
    aria-label={pileTrackSpoken(track)}
    display="inline-flex"
    alignItems="center"
    flexShrink={0}
    px="0.4rem"
    py="0.1rem"
    borderRadius="0.375rem"
    fontSize="0.65rem"
    fontWeight={700}
    lineHeight={1.4}
    letterSpacing="0.05em"
    whiteSpace="nowrap"
    bg={TRACK_BLUE}
    color={TRACK_GOLD}
  >
    {pileTrackTagText(track)}
  </Box>
);

const PIP_LOOK: Record<PileTrackStepState, { bg: string; color: string; ring: string }> = {
  held: { bg: TRACK_GOLD, color: "#2C1831", ring: TRACK_GOLD },
  active: { bg: TRACK_BLUE, color: "#FFFFFF", ring: TRACK_GOLD },
  upcoming: { bg: "transparent", color: "rgba(250,235,215,0.75)", ring: "rgba(250,235,215,0.45)" },
  spent: { bg: "rgba(250,235,215,0.14)", color: "rgba(250,235,215,0.55)", ring: "rgba(250,235,215,0.2)" },
  unknown: { bg: "transparent", color: "rgba(250,235,215,0.4)", ring: "rgba(250,235,215,0.2)" },
};

/** The whole track in five dots: gold = reward held, ringed blue = active,
 *  hollow = still in the deck, struck through = reward used up. */
const TrackPips = ({ track }: { track: PileTrackView }) => (
  <Flex gap="0.2rem" flexShrink={0} data-testid="pile-track-pips">
    {track.steps.map((s) => {
      const look = PIP_LOOK[s.state];
      return (
        <Flex
          key={s.n}
          data-testid={`pile-track-pip-${s.n}`}
          data-state={s.state}
          title={`${track.def.goalWord} ${s.n}: ${STATE_WORDS[s.state]}`}
          alignItems="center"
          justifyContent="center"
          boxSize="1.05rem"
          borderRadius="50%"
          fontSize="0.6rem"
          fontWeight={700}
          lineHeight={1}
          bg={look.bg}
          color={look.color}
          boxShadow={`inset 0 0 0 ${s.state === "active" ? 2 : 1}px ${look.ring}`}
          textDecoration={s.state === "spent" ? "line-through" : undefined}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {s.n}
        </Flex>
      );
    })}
  </Flex>
);

export const PileTrackRow = ({
  track,
  resolveCard,
  labelFor,
  variant,
  onOpen,
}: {
  track: PileTrackView;
  resolveCard: Resolve;
  labelFor: LabelFor;
  /** "plate" clamps the goal text and shows held rewards as chips; "sheet" (the
   *  phone's seat drawer) spells everything out. */
  variant: "plate" | "sheet";
  /** opens the full track; omitted where nothing can open (the hover-peek) */
  onOpen?: () => void;
}) => {
  const { goalWord, rewardWord } = track.def;
  const active = track.active;
  const goalText = active ? faceText(resolveCard, active.goal) : "";
  const subtitle = trackGoalSubtitle(faceTitle(resolveCard, labelFor, active?.goal ?? null));
  const headline = active
    ? `${goalWord} ${active.n}`
    : track.next
      ? `${goalWord} ${track.next.n} is next`
      : `${goalWord}s done`;
  const idleText = active
    ? ""
    : track.next
      ? `No active ${goalWord}: it is placed at the start of the turn.`
      : `No ${goalWord} left in the deck.`;
  const sheet = variant === "sheet";
  return (
    <Flex
      data-testid="pile-track-row"
      direction="column"
      gap="0.2rem"
      px="0.85rem"
      py="0.35rem"
      textAlign="left"
      w="100%"
      color="brand.parchment"
      bg="rgba(43, 58, 140, 0.34)"
      borderTop="1px solid rgba(255, 229, 138, 0.25)"
      {...(onOpen
        ? {
            as: "button",
            type: "button",
            cursor: "pointer",
            "aria-label": `${pileTrackSpoken(track)} — view every ${goalWord} and ${rewardWord}`,
            // The plate is draggable: the press that opens the track must not pick it up.
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
            onClick: onOpen,
            _hover: { bg: "rgba(43, 58, 140, 0.5)" },
          }
        : {})}
    >
      <Flex alignItems="center" justifyContent="space-between" gap="0.4rem">
        <Text
          fontSize="0.66rem"
          fontWeight="bold"
          letterSpacing="0.08em"
          textTransform="uppercase"
          color={TRACK_GOLD}
          lineHeight={1.25}
          data-testid="pile-track-headline"
        >
          {headline}
        </Text>
        <TrackPips track={track} />
      </Flex>
      {subtitle && (
        <Text fontSize="0.66rem" fontFamily="SpaceGrotesk" opacity={0.8} noOfLines={sheet ? undefined : 1}>
          {subtitle}
        </Text>
      )}
      <Text
        fontSize={sheet ? "0.8rem" : "0.7rem"}
        fontFamily="SpaceGrotesk"
        lineHeight={1.3}
        noOfLines={sheet ? undefined : 3}
        data-testid="pile-track-goal"
      >
        {goalText || idleText}
      </Text>
      {track.held.length > 0 &&
        (sheet ? (
          <Box data-testid="pile-track-held">
            {track.held.map((s) => (
              <Text key={s.n} fontSize="0.78rem" fontFamily="SpaceGrotesk" lineHeight={1.3} mt="0.25rem">
                <Text as="span" fontWeight="bold" color={TRACK_GOLD}>
                  {`${rewardWord} ${s.n}: `}
                </Text>
                {trackRewardText(faceText(resolveCard, s.reward))}
              </Text>
            ))}
          </Box>
        ) : (
          <Flex alignItems="center" gap="0.25rem" flexWrap="wrap" data-testid="pile-track-held">
            <Text fontSize="0.58rem" fontWeight="bold" letterSpacing="0.08em" opacity={0.75}>
              {`${rewardWord.toUpperCase()}S`}
            </Text>
            {track.held.map((s) => (
              <Box
                key={s.n}
                as="span"
                title={`${rewardWord} ${s.n}: ${trackRewardText(faceText(resolveCard, s.reward))}`}
                px="0.3rem"
                borderRadius="0.3rem"
                fontSize="0.62rem"
                fontWeight={700}
                lineHeight={1.5}
                bg={TRACK_GOLD}
                color="#2C1831"
              >
                {`${rewardWord[0]}${s.n}`}
              </Box>
            ))}
          </Flex>
        ))}
    </Flex>
  );
};

/**
 * One face, upright. The author's files are landscape cards turned a quarter turn
 * into a portrait frame, so the image is turned back: its box is sized as the
 * landscape frame's transpose and rotated about the centre.
 */
const TrackFace = ({ url, alt, landscape }: { url: string; alt: string; landscape: boolean }) =>
  landscape ? (
    <Box
      position="relative"
      w="100%"
      overflow="hidden"
      borderRadius="0.5rem"
      sx={{ aspectRatio: "88 / 63" }}
      data-testid="pile-track-face"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: `${(63 / 88) * 100}%`,
          height: `${(88 / 63) * 100}%`,
          maxWidth: "none",
          transform: "translate(-50%, -50%) rotate(-90deg)",
        }}
      />
    </Box>
  ) : (
    <Box w="100%" overflow="hidden" borderRadius="0.5rem" sx={{ aspectRatio: "63 / 88" }} data-testid="pile-track-face">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Box>
  );

const STATE_TAG: Record<PileTrackStepState, { text: string; bg: string; color: string }> = {
  active: { text: "ACTIVE", bg: TRACK_BLUE, color: "#FFFFFF" },
  upcoming: { text: "IN THE DECK", bg: "rgba(250,235,215,0.14)", color: "rgba(250,235,215,0.85)" },
  held: { text: "COMPLETED · REWARD HELD", bg: TRACK_GOLD, color: "#2C1831" },
  spent: { text: "REWARD USED · REMOVED FROM THE GAME", bg: "rgba(192,57,43,0.55)", color: "#FFFFFF" },
  unknown: { text: "", bg: "transparent", color: "inherit" },
};

const TrackStepCard = ({
  track,
  step,
  resolveCard,
  labelFor,
}: {
  track: PileTrackView;
  step: PileTrackStep;
  resolveCard: Resolve;
  labelFor: LabelFor;
}) => {
  const { goalWord, rewardWord } = track.def;
  const subtitle = trackGoalSubtitle(faceTitle(resolveCard, labelFor, step.goal));
  const faceUrl = step.faceUp ? resolveCard(step.faceUp)?.cardImage?.url : undefined;
  const tag = STATE_TAG[step.state];
  const done = step.state === "held" || step.state === "spent";
  return (
    <Flex
      data-testid={`pile-track-step-${step.n}`}
      data-state={step.state}
      gap="0.75rem"
      direction={{ base: "column", md: "row" }}
      p="0.6rem"
      borderRadius="0.6rem"
      bg={step.state === "active" ? "rgba(43, 58, 140, 0.45)" : "rgba(20, 8, 24, 0.35)"}
      boxShadow={step.state === "active" ? `inset 0 0 0 2px ${TRACK_GOLD}` : undefined}
    >
      {faceUrl && (
        <Box w={{ base: "100%", md: "15rem" }} flexShrink={0}>
          <TrackFace
            url={faceUrl}
            alt={`${done ? rewardWord : goalWord} ${step.n}`}
            landscape={!!track.def.landscapeFaces}
          />
        </Box>
      )}
      <Box minW={0} flex={1}>
        <Flex alignItems="center" gap="0.4rem" flexWrap="wrap" mb="0.25rem">
          <Text fontFamily="BebasNeueRegular" fontSize="1.15rem" letterSpacing="0.04em" lineHeight={1.1}>
            {`${goalWord} ${step.n}`}
          </Text>
          {tag.text && (
            <Box
              as="span"
              px="0.4rem"
              borderRadius="0.3rem"
              fontSize="0.62rem"
              fontWeight={700}
              letterSpacing="0.06em"
              lineHeight={1.6}
              bg={tag.bg}
              color={tag.color}
            >
              {tag.text}
            </Box>
          )}
        </Flex>
        {subtitle && (
          <Text fontSize="0.78rem" fontFamily="SpaceGrotesk" opacity={0.75} mb="0.25rem">
            {subtitle}
          </Text>
        )}
        <Text
          fontSize="0.85rem"
          fontFamily="SpaceGrotesk"
          lineHeight={1.35}
          opacity={done ? 0.6 : 1}
          textDecoration={done ? "line-through" : undefined}
        >
          {faceText(resolveCard, step.goal)}
        </Text>
        <Text fontSize="0.85rem" fontFamily="SpaceGrotesk" lineHeight={1.35} mt="0.35rem" opacity={step.state === "spent" ? 0.6 : 1}>
          <Text as="span" fontWeight="bold" color={TRACK_GOLD}>
            {`${rewardWord} ${step.n}: `}
          </Text>
          {trackRewardText(faceText(resolveCard, step.reward))}
        </Text>
      </Box>
    </Flex>
  );
};

export const PileTrackModal = ({
  track,
  title,
  resolveCard,
  labelFor,
  isOpen,
  onClose,
}: {
  track: PileTrackView;
  title: string;
  resolveCard: Resolve;
  labelFor: LabelFor;
  isOpen: boolean;
  onClose: () => void;
}) => (
  <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
    <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
    <ModalContent bg="brand.surface" color="brand.parchment" mx="0.5rem" data-testid="pile-track-modal">
      <ModalHeader fontFamily="BebasNeueRegular" letterSpacing="0.04em" pr="3rem">
        {title}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb="1.25rem">
        <Text fontSize="0.8rem" fontFamily="SpaceGrotesk" opacity={0.8} mb="0.75rem">
          {`${track.completed} completed. ${track.def.goalWord}s are placed in order, one at a time, at the start of the turn; a completed card flips to its ${track.def.rewardWord.toLowerCase()}.`}
        </Text>
        <Flex direction="column" gap="0.6rem">
          {track.steps.map((s) => (
            <TrackStepCard key={s.n} track={track} step={s} resolveCard={resolveCard} labelFor={labelFor} />
          ))}
        </Flex>
      </ModalBody>
    </ModalContent>
  </Modal>
);
