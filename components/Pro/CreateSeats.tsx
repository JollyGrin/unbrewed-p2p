import { Button, Flex, Grid, Text } from "@chakra-ui/react";
import { BotDifficulty, PlayerId } from "@/lib/pro/protocol";
import { ProFormatId, teamComposition } from "@/lib/pro/multiplayerPlaytest";

/** Who fills a create-screen seat: a human (via the room link) or a server bot. */
export type SlotOccupant = "human" | BotDifficulty;
export type BotSlotPlan = Partial<Record<PlayerId, SlotOccupant>>;

const BOT_SLOT_CHOICES: Array<{ id: BotDifficulty; label: string }> = [
  { id: "easy", label: "Easy bot" },
  { id: "medium", label: "Medium bot" },
  { id: "hard", label: "Hard bot" },
];

const botSlotChoicesForFormat = (format: ProFormatId): Array<{ id: BotDifficulty; label: string }> =>
  format === "team-2v2" ? BOT_SLOT_CHOICES : BOT_SLOT_CHOICES.filter((choice) => choice.id === "easy");

const isBotSlotOccupant = (occupant: SlotOccupant): occupant is BotDifficulty => occupant !== "human";

// Local mirrors of the create-flow button styles (kept in sync with pages/pro/game.tsx).
const BTN = {
  size: "sm" as const,
  bg: "whiteAlpha.200",
  color: "brand.parchment",
  _hover: { bg: "whiteAlpha.400" },
  _active: { bg: "whiteAlpha.500" },
};
const BTN_GOLD = {
  ...BTN,
  bg: "brand.accent",
  color: "brand.surfaceDim",
  _hover: { bg: "brand.accentDeep" },
  _active: { bg: "brand.accentDeep" },
};

/** Reused from the in-game ALLY treatment (#201) and the waiting-room team
 *  preview (#195) so the creator's team reads the same teal everywhere. */
const ALLY_ACCENT = "#39B7A8";

// Flat, un-teamed seat lists for formats with no fixed pairing (ffa-3). The
// creator is always P1; these are the OTHER seats they can pre-fill with bots.
// team-2v2 is deliberately absent — its seats are grouped by team from the
// authoritative `teamComposition` (A={p1,p3} vs B={p2,p4}), NOT laid out flat,
// so a creator can see their teammate's slot before assigning a bot (#228).
const SLOT_LABELS: Partial<Record<ProFormatId, Array<{ player: PlayerId; label: string }>>> = {
  "ffa-3": [
    { player: "p2", label: "P2" },
    { player: "p3", label: "P3" },
  ],
};

/**
 * The seats a creator can pre-fill with a bot for a format — every seat except
 * their own (P1). Single source of truth for both the panel below and the
 * format-change pruning in game.tsx, so the two never disagree about which bot
 * slots survive a format switch.
 */
export function assignableSeats(format: ProFormatId): PlayerId[] {
  const comp = teamComposition(format);
  if (comp) return comp.flatMap((t) => t.seats).filter((s) => s !== "p1");
  return (SLOT_LABELS[format] ?? []).map((slot) => slot.player);
}

/**
 * Create-screen seats panel. Non-duel only; renders nothing for duel.
 *
 * team-2v2 groups the four seats into their two FIXED teams — Team A = P1 (You)
 * + P3 (your teammate) vs Team B = P2 + P4 (opponents) — because the runtime
 * seating is INTERLEAVED (A1,B1,A2,B2 → p1..p4 split A={p1,p3}, B={p2,p4}). A
 * flat P1/P2 // P3/P4 grid reads as adjacent pairs and traps creators into
 * arming a bot OPPONENT when they wanted a bot TEAMMATE (#228). ffa-3 keeps the
 * original flat layout (no teams to show).
 */
export const CreateSeats = ({
  selectedFormat,
  botSlotPlan,
  onChangeBotSlot,
}: {
  selectedFormat: ProFormatId;
  botSlotPlan: BotSlotPlan;
  onChangeBotSlot: (player: PlayerId, occupant: SlotOccupant) => void;
}) => {
  const comp = teamComposition(selectedFormat);
  // The creator always holds P1, so their team is whichever contains p1.
  const youSeat: PlayerId = "p1";

  // Shared seat card. P1 (You) is fixed; the rest toggle Human / Easy bot.
  const seatCard = (player: PlayerId, role: string, teamAccent: boolean) => {
    const editable = player !== youSeat;
    const occupant = botSlotPlan[player] ?? "human";
    return (
      <Flex
        key={player}
        data-testid={`seat-card-${player}`}
        direction="column"
        align="center"
        gap="0.35rem"
        border="2px solid"
        borderColor={
          editable
            ? isBotSlotOccupant(occupant)
              ? "brand.accent"
              : "whiteAlpha.200"
            : teamAccent
              ? ALLY_ACCENT
              : "brand.accent"
        }
        borderRadius="0.55rem"
        bg="rgba(20, 8, 24, 0.55)"
        p="0.55rem"
      >
        <Text fontFamily="BebasNeueRegular" fontSize="1rem">
          {player.toUpperCase()}
        </Text>
        <Text fontSize="0.7rem" opacity={0.75}>
          {role}
        </Text>
        {editable && (
          <Flex gap="0.35rem" flexWrap="wrap" justify="center">
            <Button
              {...(occupant === "human" ? BTN_GOLD : BTN)}
              size="xs"
              onClick={() => onChangeBotSlot(player, "human")}
            >
              Human
            </Button>
            {botSlotChoicesForFormat(selectedFormat).map((choice) => (
              <Button
                key={choice.id}
                {...(occupant === choice.id ? BTN_GOLD : BTN)}
                size="xs"
                onClick={() => onChangeBotSlot(player, choice.id)}
              >
                {choice.label}
              </Button>
            ))}
          </Flex>
        )}
      </Flex>
    );
  };

  if (comp) {
    const myTeam = comp.find((t) => t.seats.includes(youSeat));
    const ordered = myTeam ? [myTeam, ...comp.filter((t) => t !== myTeam)] : comp;
    return (
      <Flex direction="column" alignItems="center" gap="0.55rem" maxW="34rem" w="100%">
        <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
          Seats
        </Text>
        <Grid w="100%" templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="0.5rem">
          {ordered.map((t) => {
            const isMine = t === myTeam;
            return (
              <Flex
                key={t.team}
                data-testid={`team-box-${t.team}`}
                direction="column"
                gap="0.4rem"
                border="2px solid"
                borderColor={isMine ? ALLY_ACCENT : "whiteAlpha.200"}
                borderRadius="0.6rem"
                bg="rgba(20, 8, 24, 0.35)"
                p="0.5rem"
              >
                <Flex direction="column" align="center" gap="0.05rem">
                  <Text
                    fontFamily="BebasNeueRegular"
                    fontSize="0.95rem"
                    letterSpacing="0.06em"
                    color={isMine ? ALLY_ACCENT : "brand.parchment"}
                  >
                    Team {t.team}
                  </Text>
                  <Text fontSize="0.65rem" opacity={0.7}>
                    {isMine ? "You + your teammate" : "Opponents"}
                  </Text>
                </Flex>
                {t.seats.map((seat) =>
                  seatCard(
                    seat,
                    seat === youSeat ? "You" : isMine ? "your teammate" : "opponent",
                    isMine,
                  ),
                )}
              </Flex>
            );
          })}
        </Grid>
        <Text fontSize="0.7rem" opacity={0.6} textAlign="center">
          Bot slots are filled by the server. Human slots join with the room link.
        </Text>
      </Flex>
    );
  }

  const slotLabels = SLOT_LABELS[selectedFormat] ?? [];
  if (slotLabels.length === 0) return null;
  return (
    <Flex direction="column" alignItems="center" gap="0.55rem" maxW="34rem" w="100%">
      <Text fontFamily="BebasNeueRegular" fontSize="1.1rem" letterSpacing="0.08em" opacity={0.75}>
        Seats
      </Text>
      <Grid w="100%" templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap="0.5rem">
        <Flex
          direction="column"
          align="center"
          gap="0.25rem"
          border="2px solid"
          borderColor="brand.accent"
          borderRadius="0.55rem"
          bg="rgba(20, 8, 24, 0.55)"
          p="0.55rem"
        >
          <Text fontFamily="BebasNeueRegular" fontSize="1rem">
            P1
          </Text>
          <Text fontSize="0.7rem" opacity={0.75}>
            You
          </Text>
        </Flex>
        {slotLabels.map((slot) => {
          const occupant = botSlotPlan[slot.player] ?? "human";
          return (
            <Flex
              key={slot.player}
              direction="column"
              align="center"
              gap="0.35rem"
              border="2px solid"
              borderColor={occupant === "easy" ? "brand.accent" : "whiteAlpha.200"}
              borderRadius="0.55rem"
              bg="rgba(20, 8, 24, 0.55)"
              p="0.55rem"
            >
              <Text fontFamily="BebasNeueRegular" fontSize="1rem">
                {slot.label}
              </Text>
              <Flex gap="0.35rem" flexWrap="wrap" justify="center">
                <Button
                  {...(occupant === "human" ? BTN_GOLD : BTN)}
                  size="xs"
                  onClick={() => onChangeBotSlot(slot.player, "human")}
                >
                  Human
                </Button>
                {botSlotChoicesForFormat(selectedFormat).map((choice) => (
                  <Button
                    key={choice.id}
                    {...(occupant === choice.id ? BTN_GOLD : BTN)}
                    size="xs"
                    onClick={() => onChangeBotSlot(slot.player, choice.id)}
                  >
                    {choice.label}
                  </Button>
                ))}
              </Flex>
            </Flex>
          );
        })}
      </Grid>
      <Text fontSize="0.7rem" opacity={0.6} textAlign="center">
        Bot slots are filled by the server. Human slots join with the room link.
      </Text>
    </Flex>
  );
};
