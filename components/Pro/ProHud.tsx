/**
 * Pro player HUD — floating frosted plates over the board, built from the
 * SAME styled pieces the sandbox header uses (header.styles.tsx) so the two
 * modes feel like one app. Read-only by design: every number comes from the
 * server view; there are no adjust buttons because the referee owns the state.
 */
import { useState } from "react";
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Tag,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { LinkIcon } from "@chakra-ui/icons";
import { TbSword, TbBow, TbCards, TbGrave2, TbWand, TbWandOff } from "react-icons/tb";
import { GiFootprint, GiHearts } from "react-icons/gi";
import { IoMdHand, IoMdVolumeHigh, IoMdVolumeOff } from "react-icons/io";
import {
  ChipCluster,
  HeroName,
  HudOverlay,
  MoveChip,
  Pip,
  PipFooter,
  PlayerName,
  PlayerTitleBar,
  StatContainer,
  StatLine,
  StatsPanel,
} from "@/components/Game/Header/header.styles";
import { DeckImportHeroType } from "@/components/DeckPool/deck-import.type";
import { CardInstanceId, PlayerView, ViewFighter } from "@/lib/pro/protocol";
import { ResolveCard, ResolveHero } from "@/lib/pro/useProCardArt";
import { CardFace } from "./ProHand";
import { ProConnectionStatus } from "@/lib/pro/useProSocket";

// ---------------------------------------------------------------------------
// Discard viewer (public info for both seats)
// ---------------------------------------------------------------------------

const DiscardModal = ({
  title,
  cards,
  resolveCard,
  labelFor,
  isOpen,
  onClose,
}: {
  title: string;
  cards: CardInstanceId[];
  resolveCard: ResolveCard;
  labelFor: (instance: CardInstanceId) => string;
  isOpen: boolean;
  onClose: () => void;
}) => (
  <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered>
    <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
    <ModalContent bg="brand.surface" color="brand.parchment">
      <ModalHeader fontFamily="BebasNeueRegular" letterSpacing="0.04em">
        {title}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody pb="1.5rem">
        {cards.length === 0 ? (
          <Text opacity={0.6}>empty</Text>
        ) : (
          <Flex gap="0.6rem" flexWrap="wrap">
            {cards.map((c, i) => (
              <Box key={`${c}-${i}`} w="8rem" sx={{ aspectRatio: "63 / 88" }}>
                <CardFace card={resolveCard(c)} fallback={labelFor(c)} />
              </Box>
            ))}
          </Flex>
        )}
      </ModalBody>
    </ModalContent>
  </Modal>
);

// ---------------------------------------------------------------------------
// One seat plate
// ---------------------------------------------------------------------------

const SeatPlate = ({
  label,
  hero,
  heroFighter,
  sidekicks,
  isLocal,
  isActive,
  hand,
  deckCount,
  discard,
  labelFor,
  resolveCard,
}: {
  label: string;
  hero: DeckImportHeroType | null;
  heroFighter: ViewFighter | undefined;
  sidekicks: ViewFighter[];
  isLocal: boolean;
  isActive: boolean;
  /** own hand instances, or a count for the opponent */
  hand: CardInstanceId[] | number;
  deckCount: number;
  discard: CardInstanceId[];
  labelFor: (instance: CardInstanceId) => string;
  resolveCard: ResolveCard;
}) => {
  const [discardOpen, setDiscardOpen] = useState(false);
  const handCount = typeof hand === "number" ? hand : hand.length;
  const heroName = heroFighter?.name ?? hero?.name ?? "";
  const ranged = heroFighter ? heroFighter.reach === "RANGED" : hero?.isRanged;

  return (
    <>
      <DiscardModal
        title={`${heroName} — discard pile`}
        cards={discard}
        resolveCard={resolveCard}
        labelFor={labelFor}
        isOpen={discardOpen}
        onClose={() => setDiscardOpen(false)}
      />
      <StatContainer isLocal={isLocal}>
        <PlayerTitleBar>
          <Box minW={0}>
            <Tooltip
              hasArrow
              placement="bottom-start"
              bg="brand.surfaceDim"
              color="brand.parchment"
              label={
                hero?.specialAbility ? (
                  <Box maxW="18rem" p="0.25rem" whiteSpace="pre-wrap" fontSize="0.78rem">
                    <Text fontWeight="bold" mb="0.25rem" color="brand.accent">
                      {heroName}
                    </Text>
                    {hero.specialAbility.trim()}
                    {sidekicks.map((s) => (
                      <Text key={s.id} mt="0.4rem" opacity={s.defeated ? 0.6 : 1}>
                        <Text as="span" fontWeight="bold" color="brand.accent">
                          Sidekick:
                        </Text>{" "}
                        {s.name} — {s.hp}/{s.maxHp} HP,{" "}
                        {s.reach === "RANGED" ? "ranged" : "melee"}
                        {s.defeated ? " (defeated)" : ""}
                      </Text>
                    ))}
                  </Box>
                ) : (
                  "hero rules loading…"
                )
              }
            >
              <PlayerName>{label}</PlayerName>
            </Tooltip>
            {heroName && <HeroName>{heroName}</HeroName>}
          </Box>
          {isActive && (
            <Tag size="sm" bg="brand.accent" color="brand.surfaceDim" flexShrink={0}>
              TURN
            </Tag>
          )}
        </PlayerTitleBar>
        <StatsPanel>
          <StatLine>
            <GiHearts color="#C0392B" size="16px" />
            <Text fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {heroFighter ? `${heroFighter.hp}/${heroFighter.maxHp}` : "–"}
            </Text>
            {ranged ? <TbBow size="15px" /> : <TbSword size="15px" />}
          </StatLine>
          <MoveChip>
            <GiFootprint size="13px" />
            <Text fontSize="0.8rem" fontWeight="bold">
              {hero?.move ?? "–"}
            </Text>
          </MoveChip>
        </StatsPanel>
        {sidekicks.map((s) => (
          <Flex
            key={s.id}
            alignItems="center"
            gap="0.35rem"
            px="0.85rem"
            py="0.2rem"
            bg="rgba(44, 24, 49, 0.35)"
            opacity={s.defeated ? 0.45 : 1}
          >
            <Text
              fontSize="0.68rem"
              fontFamily="SpaceGrotesk"
              letterSpacing="0.04em"
              noOfLines={1}
              textDecoration={s.defeated ? "line-through" : undefined}
            >
              {s.name}
            </Text>
            <GiHearts color="#C0392B" size="11px" />
            <Text
              fontSize="0.72rem"
              fontWeight="bold"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {s.hp}/{s.maxHp}
            </Text>
            {s.reach === "RANGED" ? <TbBow size="11px" /> : <TbSword size="11px" />}
          </Flex>
        ))}
        <PipFooter>
          <Pip>
            <IoMdHand size="12px" />
            {handCount}
          </Pip>
          <Pip>
            <TbCards size="13px" />
            {deckCount}
          </Pip>
          <Tooltip label="View discard pile" hasArrow>
            <Pip clickable onClick={() => setDiscardOpen(true)}>
              <TbGrave2 size="13px" />
              {discard.length}
            </Pip>
          </Tooltip>
        </PipFooter>
      </StatContainer>
    </>
  );
};

// ---------------------------------------------------------------------------
// Top-right chips (mirrors the sandbox invite/connection cluster)
// ---------------------------------------------------------------------------

const STATUS_DISPLAY: Record<ProConnectionStatus, { color: string; label: string }> = {
  open: { color: "#2F9E68", label: "Connected" },
  connecting: { color: "#E7CC98", label: "Connecting…" },
  reconnecting: { color: "#E7CC98", label: "Reconnecting…" },
  closed: { color: "#FF6347", label: "Disconnected — reconnecting" },
  idle: { color: "#FF6347", label: "No server" },
};

const chipStyles = {
  alignItems: "center",
  gap: "0.3rem",
  px: "0.5rem",
  py: "0.15rem",
  borderRadius: "1rem",
  bg: "rgba(20, 8, 24, 0.55)",
} as const;

// ---------------------------------------------------------------------------

export interface ProHudProps {
  view: PlayerView;
  status: ProConnectionStatus;
  roomId: string | null;
  resolveCard: ResolveCard;
  resolveHero: ResolveHero;
  labelFor: (instance: CardInstanceId) => string;
  /** sound / visual effect toggles (useGameFx) — chips hidden when omitted */
  soundOn?: boolean;
  visualFxOn?: boolean;
  onToggleSound?: () => void;
  onToggleVisualFx?: () => void;
}

export const ProHud = ({
  view,
  status,
  roomId,
  resolveCard,
  resolveHero,
  labelFor,
  soundOn,
  visualFxOn,
  onToggleSound,
  onToggleVisualFx,
}: ProHudProps) => {
  const heroOf = (player: PlayerView["you"]) =>
    view.fighters.find((f) => f.owner === player && f.kind === "HERO");
  const sidekicksOf = (player: PlayerView["you"]) =>
    view.fighters.filter((f) => f.owner === player && f.kind === "SIDEKICK");
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting;

  return (
    <>
      <HudOverlay>
        <SeatPlate
          label="You"
          hero={resolveHero(view.self.heroId)}
          heroFighter={heroOf(view.you)}
          sidekicks={sidekicksOf(view.you)}
          isLocal
          isActive={view.activePlayer === view.you}
          hand={view.self.hand}
          deckCount={view.self.deckCount}
          discard={view.self.discard}
          labelFor={labelFor}
          resolveCard={resolveCard}
        />
        <SeatPlate
          label="Opponent"
          hero={resolveHero(view.opponent.heroId)}
          heroFighter={heroOf(view.opponent.id)}
          sidekicks={sidekicksOf(view.opponent.id)}
          isLocal={false}
          isActive={view.activePlayer === view.opponent.id}
          hand={view.opponent.handCount}
          deckCount={view.opponent.deckCount}
          discard={view.opponent.discard}
          labelFor={labelFor}
          resolveCard={resolveCard}
        />
      </HudOverlay>
      <ChipCluster>
        {onToggleSound && (
          <Tooltip label={soundOn ? "Mute sound effects" : "Unmute sound effects"} hasArrow>
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              opacity={soundOn ? 1 : 0.55}
              onClick={onToggleSound}
              aria-label={soundOn ? "Mute sound effects" : "Unmute sound effects"}
            >
              {soundOn ? <IoMdVolumeHigh size="0.85rem" /> : <IoMdVolumeOff size="0.85rem" />}
            </Flex>
          </Tooltip>
        )}
        {onToggleVisualFx && (
          <Tooltip
            label={visualFxOn ? "Hide visual effects" : "Show visual effects"}
            hasArrow
          >
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              opacity={visualFxOn ? 1 : 0.55}
              onClick={onToggleVisualFx}
              aria-label={visualFxOn ? "Hide visual effects" : "Show visual effects"}
            >
              {visualFxOn ? <TbWand size="0.85rem" /> : <TbWandOff size="0.85rem" />}
            </Flex>
          </Tooltip>
        )}
        {roomId && (
          <Tooltip label="Copy the join link for this room" hasArrow>
            <Flex
              {...chipStyles}
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/pro/game?room=${roomId}`);
                toast.success("Join link copied!");
              }}
            >
              <LinkIcon color="brand.highlight" boxSize="0.65rem" />
              <Text fontSize="0.65rem" color="brand.highlight" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
                room {roomId}
              </Text>
            </Flex>
          </Tooltip>
        )}
        <Flex {...chipStyles}>
          <Box w="0.45rem" h="0.45rem" borderRadius="50%" bg={display.color} />
          <Text fontSize="0.65rem" color="brand.highlight" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
            {display.label}
          </Text>
        </Flex>
      </ChipCluster>
    </>
  );
};
