/**
 * The mobile HUD on /pro/game (issue #708, direction B) — two HP chips in the
 * board's top corners and the overflow menu that replaces the desktop chip
 * cluster, plus the seat sheet either chip opens.
 *
 * Direction B gives the BOARD the whole viewport, so the HUD's job here is to
 * take as little of it as possible: your hero's name + HP top-left with a turn
 * dot, the opponent's name + hero HP + sidekick HPs top-right, and nothing
 * else standing on the map. Everything a desktop nameplate carries — the hero
 * ability text, counters and flags, the hand/deck/discard pips that open the
 * pile modals, the sidekick lines, the move clock — is one tap away in the
 * seat sheet, which renders the very SAME `SeatPlate` the desktop plate does
 * (`variant="sheet"`), with the hover-only tooltip laid out inline.
 *
 * z ladder: the chips sit where ProHud's HudOverlay/ChipCluster sit (150/151),
 * so the relative order desktop has — dock 140, log 145/146, hud 150, hand 160,
 * callouts 200+, card preview 2000 — is unchanged.
 */
import { RefObject, useState } from "react";
import {
  Box,
  Flex,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Portal,
  Text,
} from "@chakra-ui/react";
import { LinkIcon } from "@chakra-ui/icons";
import {
  TbBug,
  TbDotsVertical,
  TbEyeOff,
  TbHourglass,
  TbSparkles,
  TbWand,
  TbWandOff,
} from "react-icons/tb";
import { IoMdVolumeHigh, IoMdVolumeOff } from "react-icons/io";
import toast from "react-hot-toast";
import { InGameAccountChip } from "@/components/Account/AccountChip";
import { useHudPlates, DEFAULT_PLATE_LAYOUT } from "@/lib/pro/useHudPlates";
import { deriveTeams } from "@/lib/pro/teams";
import { seatNameplate } from "@/lib/pro/playerIdentity";
import { showLiveTurnChrome } from "@/lib/pro/turnChrome";
import { RAIL_WIDTH_CSS, TAP_TARGET, chipSeatName } from "@/lib/pro/mobileLayout";
import type { PlayerId, ViewPlayer } from "@/lib/pro/protocol";
import type { ProLayoutMode } from "@/lib/pro/useProLayout";
import { MoveTimerBar, ProHudProps, SeatPlate, hudSeats } from "@/components/Pro/ProHud";

export const MOBILE_CHIPS_TEST_ID = "pro-mobile-chips";

const STATUS_COLOR: Record<string, string> = {
  open: "#2F9E68",
  connecting: "#E7CC98",
  reconnecting: "#E7CC98",
  closed: "#FF6347",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Connected",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  closed: "Disconnected — reconnecting",
};

/** How many sidekick HPs a corner chip spells out before it summarises. */
const SIDEKICKS_ON_CHIP = 2;

/** Shared look for the small dark mobile buttons (log, overflow). */
export const MOBILE_BTN = {
  type: "button" as const,
  alignItems: "center",
  justifyContent: "center",
  gap: "0.35rem",
  minH: TAP_TARGET,
  minW: TAP_TARGET,
  px: "0.7rem",
  flexShrink: 0,
  borderRadius: "0.75rem",
  color: "brand.parchment",
  bg: "rgba(44, 24, 49, 0.88)",
  border: "1px solid rgba(250, 235, 215, 0.3)",
  fontSize: "0.75rem",
  _active: { bg: "rgba(20, 8, 24, 0.95)" },
};

/**
 * One seat's corner chip. Your own is the parchment one with the gold rim and a
 * turn dot; the opponent's is the dark one carrying its sidekick HPs too.
 */
const HpChip = ({
  seat,
  label,
  heroHp,
  sidekickHps,
  active,
  local,
  offline,
  onOpen,
}: {
  seat: PlayerId;
  label: string;
  heroHp: number | null;
  sidekickHps: { id: string; hp: number; defeated: boolean }[];
  active: boolean;
  local: boolean;
  offline: boolean;
  onOpen: () => void;
}) => (
  <Flex
    as="button"
    type="button"
    data-testid={`seat-chip-${seat}`}
    aria-label={`${label} — open seat details`}
    onClick={onOpen}
    alignItems="center"
    gap="0.3rem"
    minH="2.5rem"
    maxW="48%"
    px="0.7rem"
    py="0.35rem"
    borderRadius="999px"
    pointerEvents="auto"
    boxShadow="0 4px 14px rgba(12, 4, 16, 0.45)"
    {...(local
      ? {
          bg: "rgba(250, 235, 215, 0.94)",
          color: "brand.surfaceDim",
          border: "2px solid",
          borderColor: "brand.accent",
        }
      : {
          bg: "rgba(44, 24, 49, 0.85)",
          color: "brand.parchment",
          border: "1px solid rgba(250, 235, 215, 0.3)",
        })}
  >
    <Text
      fontFamily="BebasNeueRegular"
      fontSize="0.9rem"
      lineHeight={1}
      letterSpacing="0.05em"
      noOfLines={1}
      // The NAME wins the width fight: it is the one thing that identifies the
      // seat, so it takes what it needs (up to a cap) and the sidekick group
      // below absorbs the squeeze — a chip reading "GENER…" beside three
      // legible sidekick hearts has its priorities backwards.
      flexShrink={0}
      maxW="7rem"
      opacity={local ? 1 : 0.85}
    >
      {label}
    </Text>
    <Text
      fontFamily="SpaceGrotesk"
      fontWeight={700}
      fontSize="0.95rem"
      lineHeight={1}
      flexShrink={0}
      color={local ? "#C0392B" : "#FF6347"}
      sx={{ fontVariantNumeric: "tabular-nums" }}
    >
      ♥{heroHp ?? "–"}
    </Text>
    {/* A glance, not a roster: two sidekick hearts fit a corner chip, and a
        deck that fields more gets a count. Every one of them is spelled out in
        the seat sheet a tap away. */}
    <Flex alignItems="center" gap="0.3rem" minW={0} overflow="hidden">
      {sidekickHps.slice(0, SIDEKICKS_ON_CHIP).map((s) => (
        <Text
          key={s.id}
          fontFamily="SpaceGrotesk"
          fontSize="0.72rem"
          lineHeight={1}
          flexShrink={0}
          opacity={s.defeated ? 0.4 : 0.7}
          textDecoration={s.defeated ? "line-through" : undefined}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          +♥{s.hp}
        </Text>
      ))}
      {sidekickHps.length > SIDEKICKS_ON_CHIP && (
        <Text fontFamily="SpaceGrotesk" fontSize="0.72rem" lineHeight={1} flexShrink={0} opacity={0.7}>
          +{sidekickHps.length - SIDEKICKS_ON_CHIP}
        </Text>
      )}
    </Flex>
    {offline && (
      <Box boxSize="0.45rem" borderRadius="999px" bg="#FF6347" flexShrink={0} title="disconnected" />
    )}
    {active && (
      <Box
        boxSize="0.45rem"
        borderRadius="999px"
        bg="brand.accent"
        flexShrink={0}
        title="their turn"
        boxShadow="0 0 6px rgba(224,168,46,0.9)"
      />
    )}
  </Flex>
);

/**
 * The desktop chip cluster's controls, collapsed into one "⋯" menu: room link,
 * connection, sound, visual fx, opponent cosmetics, slow mode, report a bug and
 * the Discord sign-in chip.
 */
export const ProMobileMenu = ({
  status,
  roomId,
  soundOn,
  visualFxOn,
  onToggleSound,
  onToggleVisualFx,
  opponentCosmeticsHidden,
  onToggleOpponentCosmetics,
  slowModeOn,
  onToggleSlowMode,
  onReportBug,
  placement = "top-end",
}: Pick<
  ProHudProps,
  | "status"
  | "roomId"
  | "soundOn"
  | "visualFxOn"
  | "onToggleSound"
  | "onToggleVisualFx"
  | "opponentCosmeticsHidden"
  | "onToggleOpponentCosmetics"
  | "slowModeOn"
  | "onToggleSlowMode"
  | "onReportBug"
> & { placement?: "top-end" | "bottom-end" }) => {
  const item = {
    bg: "brand.surfaceDim",
    color: "brand.parchment",
    _hover: { bg: "whiteAlpha.200" },
    _focus: { bg: "whiteAlpha.200" },
    minH: TAP_TARGET,
  };
  return (
    <Menu placement={placement} isLazy>
      <MenuButton as={Flex} {...MOBILE_BTN} aria-label="Game menu" display="inline-flex">
        <TbDotsVertical size="1.1rem" />
      </MenuButton>
      <Portal>
        <MenuList
          bg="brand.surfaceDim"
          borderColor="whiteAlpha.300"
          color="brand.parchment"
          zIndex={210}
          minW="15rem"
        >
          <Flex alignItems="center" gap="0.4rem" px="0.8rem" py="0.4rem">
            <Box
              w="0.45rem"
              h="0.45rem"
              borderRadius="50%"
              bg={STATUS_COLOR[status] ?? STATUS_COLOR.connecting}
            />
            <Text fontSize="0.7rem" fontFamily="SpaceGrotesk">
              {STATUS_LABEL[status] ?? STATUS_LABEL.connecting}
            </Text>
          </Flex>
          {roomId && (
            <MenuItem
              {...item}
              icon={<LinkIcon boxSize="0.7rem" />}
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/pro/game?room=${roomId}`);
                toast.success("Join link copied!");
              }}
            >
              Copy join link — room {roomId}
            </MenuItem>
          )}
          <MenuDivider borderColor="whiteAlpha.200" />
          {onToggleSound && (
            <MenuItem
              {...item}
              icon={soundOn ? <IoMdVolumeHigh /> : <IoMdVolumeOff />}
              onClick={onToggleSound}
            >
              Sound — {soundOn ? "on" : "off"}
            </MenuItem>
          )}
          {onToggleVisualFx && (
            <MenuItem
              {...item}
              icon={visualFxOn ? <TbWand /> : <TbWandOff />}
              onClick={onToggleVisualFx}
            >
              Visual effects — {visualFxOn ? "on" : "off"}
            </MenuItem>
          )}
          {onToggleOpponentCosmetics && (
            <MenuItem
              {...item}
              icon={opponentCosmeticsHidden ? <TbEyeOff /> : <TbSparkles />}
              onClick={onToggleOpponentCosmetics}
            >
              Opponent cosmetics — {opponentCosmeticsHidden ? "hidden" : "shown"}
            </MenuItem>
          )}
          {onToggleSlowMode && (
            <MenuItem {...item} icon={<TbHourglass />} onClick={onToggleSlowMode}>
              Slow mode — {slowModeOn ? "on" : "off"}
            </MenuItem>
          )}
          {onReportBug && (
            <>
              <MenuDivider borderColor="whiteAlpha.200" />
              <MenuItem {...item} icon={<TbBug />} onClick={onReportBug}>
                Report a bug
              </MenuItem>
            </>
          )}
          <MenuDivider borderColor="whiteAlpha.200" />
          <Flex px="0.8rem" py="0.4rem">
            {/* No dropdown here (#712): this chip is already INSIDE a MenuList,
                and a menu nested in a menu is a focus-management trap. The
                mobile surface keeps the plain identity chip. */}
            <InGameAccountChip withMenu={false} />
          </Flex>
        </MenuList>
      </Portal>
    </Menu>
  );
};

export interface ProMobileHudProps extends ProHudProps {
  layoutMode: ProLayoutMode;
  /** measured by the page so the board fit can clear the chips */
  chipsRef?: RefObject<HTMLDivElement>;
}

export const ProMobileHud = ({
  view,
  seatPresence,
  turnTimer,
  turnTimerSeconds,
  resolveCard,
  resolveHero,
  resolveRuleCards,
  labelFor,
  layoutMode,
  chipsRef,
}: ProMobileHudProps) => {
  const [openSeat, setOpenSeat] = useState<PlayerId | null>(null);
  const { plates, hydrated, update } = useHudPlates();

  const seats = hudSeats(view);
  const teams = deriveTeams(seats, view.you);
  const multiplayer = seats.length > 2;
  const heroOf = (player: PlayerId) =>
    view.fighters.find((f) => f.owner === player && f.kind === "HERO");
  const sidekicksOf = (player: PlayerId) =>
    view.fighters.filter((f) => f.owner === player && f.kind === "SIDEKICK");
  const seatLabel = (seat: ViewPlayer) => seatNameplate(seat, seats.length);
  const nameOfPlayer = (id: PlayerId) => {
    const seat = seats.find((s) => s.id === id);
    return seat ? seatLabel(seat) : id;
  };
  const presenceOf = (seat: ViewPlayer) => (multiplayer ? seatPresence?.[seat.id] : undefined);
  const timerOf = (seat: ViewPlayer) =>
    turnTimer && turnTimer.player === seat.id && turnTimer.deadline != null && turnTimerSeconds
      ? { deadline: turnTimer.deadline, totalSeconds: turnTimerSeconds }
      : undefined;

  // The one running clock, if any — a single hairline bar under the chips
  // rather than one per plate, since only one seat is ever on the clock.
  const runningTimer = seats.map(timerOf).find(Boolean) ?? null;
  const sheetSeat = openSeat ? seats.find((s) => s.id === openSeat) ?? null : null;

  // Your chip leads (top-left, parchment); everyone else trails to the right.
  const ordered = [...seats].sort((a, b) => Number(b.you) - Number(a.you));

  return (
    <>
      <Box
        ref={chipsRef}
        data-testid={MOBILE_CHIPS_TEST_ID}
        position="fixed"
        top={0}
        left={0}
        // In landscape the chips belong to the BOARD, so they stop where the
        // decision rail starts rather than sliding underneath it.
        right={layoutMode === "rail" ? RAIL_WIDTH_CSS : 0}
        zIndex={150}
        pointerEvents="none"
        sx={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: layoutMode === "rail" ? 0 : "env(safe-area-inset-right, 0px)",
        }}
      >
        <Flex alignItems="flex-start" justifyContent="space-between" gap="0.4rem" px="0.6rem" pt="0.6rem">
          {ordered.map((seat) => {
            const hero = heroOf(seat.id);
            return (
              <HpChip
                key={seat.id}
                seat={seat.id}
                label={chipSeatName(hero?.name, seatLabel(seat))}
                heroHp={hero ? hero.hp : null}
                sidekickHps={sidekicksOf(seat.id).map((s) => ({
                  id: s.id,
                  hp: s.hp,
                  defeated: s.defeated,
                }))}
                active={showLiveTurnChrome(view) && view.activePlayer === seat.id}
                local={seat.you}
                offline={!!presenceOf(seat)}
                onOpen={() => setOpenSeat(seat.id)}
              />
            );
          })}
        </Flex>
        {runningTimer && (
          <Box mt="0.4rem" pointerEvents="none">
            <MoveTimerBar
              deadline={runningTimer.deadline}
              totalSeconds={runningTimer.totalSeconds}
            />
          </Box>
        )}
      </Box>

      {/* Seat sheet. Hand-rolled (scrim + fixed panel) like the log and hand
          drawers rather than a Chakra Drawer: the page already stacks several
          fixed layers, and a focus-locked modal here would fight the board's
          own pointer handling. */}
      {sheetSeat && (
        <>
          <Box
            position="fixed"
            inset={0}
            zIndex={165}
            bg="rgba(12, 4, 16, 0.55)"
            onClick={() => setOpenSeat(null)}
          />
          <Box
            position="fixed"
            left={0}
            right={0}
            bottom={0}
            zIndex={166}
            maxH="80svh"
            overflowY="auto"
            borderTopRadius="1.1rem"
            borderTop="2px solid"
            borderColor="brand.accent"
            bg="linear-gradient(180deg, rgba(58, 33, 64, 0.98), rgba(38, 20, 43, 0.99))"
            sx={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <Flex
              as="button"
              type="button"
              aria-label="Close seat details"
              onClick={() => setOpenSeat(null)}
              w="100%"
              minH={TAP_TARGET}
              alignItems="center"
              justifyContent="space-between"
              px="0.85rem"
              color="rgba(231, 204, 152, 0.72)"
            >
              <Text fontSize="0.68rem" letterSpacing="0.08em" textTransform="uppercase" fontWeight={700}>
                Seat details
              </Text>
              <Text fontSize="0.75rem">Close</Text>
            </Flex>
            <SeatPlate
              variant="sheet"
              seatId={sheetSeat.id}
              label={seatLabel(sheetSeat)}
              hero={resolveHero(sheetSeat.heroId)}
              ruleCards={resolveRuleCards?.(sheetSeat.heroId) ?? []}
              heroId={sheetSeat.heroId}
              heroFighter={heroOf(sheetSeat.id)}
              sidekicks={sidekicksOf(sheetSeat.id)}
              flags={sheetSeat.flags}
              counters={sheetSeat.counters}
              piles={sheetSeat.piles}
              nameOfPlayer={nameOfPlayer}
              wonCombat={sheetSeat.wonCombatThisTurn}
              isLocal={sheetSeat.you}
              isActive={showLiveTurnChrome(view) && view.activePlayer === sheetSeat.id}
              isAlly={teams.relationOf(sheetSeat.id) === "ally"}
              presence={presenceOf(sheetSeat)}
              timer={timerOf(sheetSeat)}
              badge={sheetSeat.badge}
              hand={sheetSeat.you ? sheetSeat.hand ?? view.self.hand : sheetSeat.handCount}
              deckCount={sheetSeat.deckCount}
              discard={sheetSeat.discard}
              ongoingScheme={sheetSeat.ongoingScheme ?? null}
              labelFor={labelFor}
              resolveCard={resolveCard}
              layout={plates[sheetSeat.id] ?? DEFAULT_PLATE_LAYOUT}
              hydrated={hydrated}
              onUpdate={(partial) => update(sheetSeat.id, partial)}
            />
          </Box>
        </>
      )}
    </>
  );
};
