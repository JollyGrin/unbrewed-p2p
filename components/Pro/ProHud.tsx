/**
 * Pro player HUD — floating frosted plates over the board, built from the
 * SAME styled pieces the sandbox header uses (header.styles.tsx) so the two
 * modes feel like one app. Read-only by design: every number comes from the
 * server view; there are no adjust buttons because the referee owns the state.
 */
import { useEffect, useRef, useState } from "react";
import { animate, motion, useDragControls, useMotionValue } from "framer-motion";
import {
  Box,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Switch,
  Tag,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import { LinkIcon } from "@chakra-ui/icons";
import {
  TbSword,
  TbBow,
  TbCards,
  TbGrave2,
  TbWand,
  TbWandOff,
  TbChevronUp,
  TbChevronDown,
  TbArrowBackUp,
  TbFlask,
  TbBug,
} from "react-icons/tb";
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
import { PlateLayout, PlateSeat, useHudPlates } from "@/lib/pro/useHudPlates";
import { CardFace } from "./ProHand";
import { ProConnectionStatus } from "@/lib/pro/useProSocket";
import { FLAGS, useFlags } from "@/lib/flags";

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

/** Tiny ghost icon button for the plate's collapse / reset controls. Its
 *  pointerdown is swallowed so it never starts a plate drag. */
const CtrlBtn = ({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Flex
    as="button"
    type="button"
    aria-label={title}
    title={title}
    onPointerDown={(e) => e.stopPropagation()}
    onDoubleClick={(e) => e.stopPropagation()}
    onClick={onClick}
    alignItems="center"
    justifyContent="center"
    w="1.15rem"
    h="1.15rem"
    borderRadius="0.35rem"
    color="rgba(231, 204, 152, 0.72)"
    _hover={{ bg: "rgba(231, 204, 152, 0.16)", color: "brand.primary" }}
    transition="background 0.15s ease, color 0.15s ease"
  >
    {children}
  </Flex>
);

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
  layout,
  hydrated,
  onUpdate,
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
  layout: PlateLayout;
  hydrated: boolean;
  onUpdate: (partial: Partial<PlateLayout>) => void;
}) => {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const handCount = typeof hand === "number" ? hand : hand.length;
  const heroName = heroFighter?.name ?? hero?.name ?? "";
  const ranged = heroFighter ? heroFighter.reach === "RANGED" : hero?.isRanged;
  const heroHp = heroFighter ? `${heroFighter.hp}/${heroFighter.maxHp}` : "–";
  const collapsed = layout.collapsed;
  const moved = layout.x !== 0 || layout.y !== 0;

  // Drag transform lives on this WRAPPER (motion values), never on
  // StatContainer, whose own `transform` is reserved for the :hover lift.
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const initRef = useRef(false);
  useEffect(() => {
    // apply the stored offset exactly once, after localStorage hydrates
    if (hydrated && !initRef.current) {
      initRef.current = true;
      x.set(layout.x);
      y.set(layout.y);
    }
  }, [hydrated, layout.x, layout.y, x, y]);

  const persistPos = () => onUpdate({ x: x.get(), y: y.get() });
  const resetPos = () => {
    const spring = { type: "spring" as const, stiffness: 500, damping: 40 };
    animate(x, 0, spring);
    animate(y, 0, spring);
    onUpdate({ x: 0, y: 0 });
  };
  const toggleCollapse = () => onUpdate({ collapsed: !collapsed });

  // ----- reusable pieces (shared by the live plate and the hover-peek) -----
  const renderNameBlock = (withAbility: boolean) => (
    <Box minW={0}>
      {withAbility ? (
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
      ) : (
        <PlayerName>{label}</PlayerName>
      )}
      {heroName && <HeroName>{heroName}</HeroName>}
    </Box>
  );

  const turnTag = isActive ? (
    <Tag size="sm" bg="brand.accent" color="brand.surfaceDim" flexShrink={0}>
      TURN
    </Tag>
  ) : null;

  const controls = hovered ? (
    <Flex alignItems="center" gap="0.15rem" flexShrink={0}>
      {moved && (
        <CtrlBtn title="Reset position" onClick={resetPos}>
          <TbArrowBackUp size="0.8rem" />
        </CtrlBtn>
      )}
      <CtrlBtn title={collapsed ? "Expand plate" : "Collapse plate"} onClick={toggleCollapse}>
        {collapsed ? <TbChevronDown size="0.8rem" /> : <TbChevronUp size="0.8rem" />}
      </CtrlBtn>
    </Flex>
  ) : null;

  const statsPanel = (
    <StatsPanel>
      <StatLine>
        <GiHearts color="#C0392B" size="16px" />
        <Text fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {heroHp}
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
  );

  const sidekickRows = sidekicks.map((s) => (
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
      <Text fontSize="0.72rem" fontWeight="bold" sx={{ fontVariantNumeric: "tabular-nums" }}>
        {s.hp}/{s.maxHp}
      </Text>
      {s.reach === "RANGED" ? <TbBow size="11px" /> : <TbSword size="11px" />}
    </Flex>
  ));

  const pipFooter = (
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
  );

  // The full plate body — reused as the hover-peek label for a collapsed plate
  // (static: no drag handle, no controls, plain name so tooltips don't nest).
  const peekPlate = (
    <StatContainer isLocal={isLocal} sx={{ cursor: "default" }}>
      <PlayerTitleBar>
        {renderNameBlock(false)}
        {turnTag}
      </PlayerTitleBar>
      {statsPanel}
      {sidekickRows}
      {pipFooter}
    </StatContainer>
  );

  // shared drag/handle props for the live plate's title bar
  const titleBarDrag = {
    onPointerDown: (e: React.PointerEvent) => dragControls.start(e),
    onDoubleClick: resetPos,
    sx: { cursor: "grab", touchAction: "none" as const },
  };

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
      <motion.div
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        style={{ x, y, position: "relative", width: "15rem", zIndex: dragging ? 200 : 1 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={() => {
          setDragging(false);
          persistPos();
        }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
      >
        {collapsed ? (
          <Tooltip
            hasArrow={false}
            placement="bottom-start"
            openDelay={0}
            bg="transparent"
            boxShadow="none"
            p={0}
            maxW="none"
            label={peekPlate}
          >
            <StatContainer isLocal={isLocal}>
              <PlayerTitleBar {...titleBarDrag}>
                {renderNameBlock(true)}
                <Flex alignItems="center" gap="0.4rem" flexShrink={0}>
                  <Flex alignItems="center" gap="0.25rem" color="brand.parchment">
                    <GiHearts color="#C0392B" size="14px" />
                    <Text
                      fontWeight="bold"
                      fontSize="0.9rem"
                      sx={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {heroHp}
                    </Text>
                  </Flex>
                  {turnTag}
                  {controls}
                </Flex>
              </PlayerTitleBar>
            </StatContainer>
          </Tooltip>
        ) : (
          <StatContainer isLocal={isLocal}>
            <PlayerTitleBar {...titleBarDrag}>
              {renderNameBlock(true)}
              <Flex alignItems="center" gap="0.3rem" flexShrink={0}>
                {turnTag}
                {controls}
              </Flex>
            </PlayerTitleBar>
            {statsPanel}
            {sidekickRows}
            {pipFooter}
          </StatContainer>
        )}
      </motion.div>
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
// Beta-features discovery chip + menu (drives lib/flags registry)
// ---------------------------------------------------------------------------

const BetaFeaturesChip = () => {
  const [open, setOpen] = useState(false);
  const flags = useFlags();
  const anyOn = flags.some((f) => f.on);

  return (
    <>
      <Tooltip label="Beta features" hasArrow>
        <Flex
          {...chipStyles}
          as="button"
          cursor="pointer"
          _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
          color="brand.highlight"
          opacity={anyOn ? 1 : 0.55}
          onClick={() => setOpen(true)}
          aria-label="Beta features"
        >
          <TbFlask size="0.85rem" />
        </Flex>
      </Tooltip>
      <Modal isOpen={open} onClose={() => setOpen(false)} size="md" isCentered>
        <ModalOverlay bg="rgba(20, 8, 24, 0.7)" />
        <ModalContent bg="brand.surface" color="brand.parchment">
          <ModalHeader
            fontFamily="BebasNeueRegular"
            letterSpacing="0.04em"
            display="flex"
            alignItems="center"
            gap="0.5rem"
          >
            <TbFlask /> Beta features
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="1.5rem">
            <Text opacity={0.65} fontSize="0.82rem" mb="1rem">
              Experimental features — opt in per browser. They stick until you
              turn them off.
            </Text>
            <Flex direction="column" gap="0.9rem">
              {flags.map((f) => (
                <Flex key={f.name} alignItems="center" gap="1rem">
                  <Box flex="1" minW={0}>
                    <Text fontWeight="bold" fontSize="0.9rem">
                      {FLAGS[f.name].label}
                    </Text>
                    <Text opacity={0.6} fontSize="0.78rem">
                      {FLAGS[f.name].desc}
                    </Text>
                  </Box>
                  <Switch
                    isChecked={f.on}
                    onChange={f.toggle}
                    colorScheme="purple"
                    aria-label={`Toggle ${FLAGS[f.name].label}`}
                  />
                </Flex>
              ))}
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

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
  /** opens the ReportBugDialog (issue #125/#138) — chip hidden when omitted */
  onReportBug?: () => void;
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
  onReportBug,
}: ProHudProps) => {
  const heroOf = (player: PlayerView["you"]) =>
    view.fighters.find((f) => f.owner === player && f.kind === "HERO");
  const sidekicksOf = (player: PlayerView["you"]) =>
    view.fighters.filter((f) => f.owner === player && f.kind === "SIDEKICK");
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.connecting;
  const opponent = view.opponent;

  const { plates, hydrated, update } = useHudPlates();
  const seatUpdate = (seat: PlateSeat) => (partial: Partial<PlateLayout>) =>
    update(seat, partial);

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
          layout={plates.you}
          hydrated={hydrated}
          onUpdate={seatUpdate("you")}
        />
        {opponent && (
          <SeatPlate
            label="Opponent"
            hero={resolveHero(opponent.heroId)}
            heroFighter={heroOf(opponent.id)}
            sidekicks={sidekicksOf(opponent.id)}
            isLocal={false}
            isActive={view.activePlayer === opponent.id}
            hand={opponent.handCount}
            deckCount={opponent.deckCount}
            discard={opponent.discard}
            labelFor={labelFor}
            resolveCard={resolveCard}
            layout={plates.opponent}
            hydrated={hydrated}
            onUpdate={seatUpdate("opponent")}
          />
        )}
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
        <BetaFeaturesChip />
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
        {onReportBug && (
          <Tooltip
            label="Pro is in beta — you may hit bugs. Click to report one with your game context attached."
            hasArrow
            placement="bottom-end"
          >
            <Flex
              {...chipStyles}
              as="button"
              cursor="pointer"
              _hover={{ bg: "rgba(20, 8, 24, 0.85)" }}
              color="brand.highlight"
              onClick={onReportBug}
              aria-label="Report a bug"
            >
              <TbBug size="0.85rem" />
              <Text fontSize="0.65rem" fontFamily="SpaceGrotesk" whiteSpace="nowrap">
                Report bug
              </Text>
              <Tag
                size="sm"
                bg="whiteAlpha.400"
                color="brand.highlight"
                fontSize="0.55rem"
                fontWeight="bold"
                letterSpacing="0.04em"
                px="0.3rem"
              >
                BETA
              </Tag>
            </Flex>
          </Tooltip>
        )}
      </ChipCluster>
    </>
  );
};
