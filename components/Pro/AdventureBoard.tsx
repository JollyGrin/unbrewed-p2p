import {
  ADVENTURE_BOARD_MAX_HEIGHT,
  ADVENTURE_BOARD_TOP,
  ADVENTURE_BOARD_WIDTH,
  ADVENTURE_BAND_TOP,
  ADVENTURE_BAND_TOP_PHONE,
  ADVENTURE_COLUMN_MAX_HEIGHT_PHONE,
  ADVENTURE_COLUMN_TOP_PHONE,
  DOCK_RIGHT,
  DOCK_WIDTH,
} from "./dockLayout";
import { Box, Button, Flex, Popover, PopoverContent, PopoverTrigger, Portal, Text } from "@chakra-ui/react";
import { TbHourglass } from "react-icons/tb";
import { useEffect, useState } from "react";
import { AdventureBriefingModal, RulebookButton, RulesButton } from "./AdventureBriefing";
import { EngineFaultBanner } from "./EngineFaultBanner";
import type { ViewFighter } from "@/lib/pro/protocol";
import { ProDiscardsSheet } from "./ProDiscardsSheet";
import { RevealedHandPanel } from "./RevealedHandPanel";
import { formatFaceCard } from "@/lib/pro/useProCardArt";
import { cardLabel } from "@/lib/pro/actionDock";
import { useAdventureAnalytics } from "@/lib/pro/useAdventureAnalytics";
import { adventureCardArt } from "@/lib/pro/adventureCardArt";
import { useEnemyTurn } from "@/lib/pro/useEnemyTurn";
import { enemyTurnArrow, enemyTurnSummary } from "@/lib/pro/enemyTurn";
import { useBreakoutMoment } from "@/lib/pro/useBreakoutMoment";
import { BreakoutMomentOverlay } from "./BreakoutMoment";
import { objectNounOf, type ObjectNoun } from "@/lib/pro/scenarioObjects";
import type { FormatOverlayProps } from "./FormatOverlay";
import { ENEMY_LOOK, type EnemyRole } from "@/lib/pro/enemyLook";
import { EnemyRoleBadge } from "./EnemyToken";
import type { EnemyTurnState } from "@/lib/pro/enemyTurn";
import { TEAM_GUIDANCE, teamChoosingTitle } from "@/lib/pro/adventureCopy";
import {
  adventureBoardModel,
  enemyCombatModel,
  firstLineOf,
  teamDecisionModel,
} from "@/lib/pro/adventureBoard";
import { useEndOfRoundWalk } from "@/lib/pro/useEndOfRoundWalk";
import type {
  AdventureBoardModel,
  EnemyCombatSide,
  EnemyDial,
  InitiativeRowEntry,
  TeamDecisionModel,
  ThreatModel,
} from "@/lib/pro/adventureBoard";

const LBL = {
  fontFamily: "SpaceGrotesk",
  fontSize: "0.58rem",
  letterSpacing: "0.16em",
  opacity: 0.75,
} as const;
// Purple glass, the same family as the seat plates and the Actions dock.
const PANEL = {
  bg: "rgba(20,8,24,0.72)",
  color: "white",
  border: "1px solid rgba(231,204,152,0.14)",
  borderRadius: "md",
  px: "0.6rem",
  py: "0.4rem",
  backdropFilter: "blur(4px)",
  // #1145: the column is align="flex-end" and clipped, so a panel wider than the column
  // overflowed to its LEFT, out of reach. Panels never exceed the column; rows wrap.
  minW: 0,
  maxW: "100%",
} as const;

const DRAWER_KEY = "pro:adventure-drawer";
// md breakpoint (48em); jsdom has no matchMedia.
const desktopNow = () => typeof window.matchMedia === "function" && window.matchMedia("(min-width: 48em)").matches;
const GOLD = "#E0A82E";
/** The look of an initiative entry's enemy: its role from the wire, a minion when unnamed. */
const entryLook = (e: InitiativeRowEntry) => ENEMY_LOOK[e.fighter?.enemy?.role ?? "MINION"];

/** A card face from the CDN; renders nothing when the id has no uploaded art. Faces are not
 *  63:88, so `contain` — never stretch. */
const CardFace = ({ cardId, h, testid }: { cardId: string | null | undefined; h: string; testid: string }) => {
  const src = adventureCardArt(cardId);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      data-testid={testid}
      loading="lazy"
      style={{ height: h, width: "auto", maxWidth: "100%", objectFit: "contain", flexShrink: 0 }}
    />
  );
};

/** The gold ring: the card taking its turn, or the END OF ROUND box resolving (#1149). */
const hot = (e: InitiativeRowEntry) => e.state === "now" || e.resolving;

/** A revealed row card has a face worth opening: CDN art, or printed text (engine #819). */
const hasFace = (e: InitiativeRowEntry) =>
  e.state !== "down" && (!!adventureCardArt(e.artKey) || e.move != null || !!e.rightNow || !!e.endOfRound);

const PrintedBox = ({ label, text, testid }: { label: string; text: string; testid: string }) => (
  <Box data-testid={testid} border="1px solid" borderColor="whiteAlpha.400" borderRadius="sm" px="0.4rem" py="0.3rem">
    <Text {...LBL} color={GOLD} opacity={1}>
      {label}
    </Text>
    <Text fontSize="0.72rem" lineHeight="1.25" whiteSpace="pre-line">
      {text}
    </Text>
  </Box>
);

/**
 * A row card read the way a player reads the physical card (#1149): the real face from the CDN
 * when one is uploaded (`contain` — initiative faces are ~0.62 w:h), else a text card in the
 * same shape from the printed fields: title, MOVE, RIGHT NOW, END OF ROUND.
 */
export const InitiativeCardFace = ({ e }: { e: InitiativeRowEntry }) => {
  const src = adventureCardArt(e.artKey);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={e.card.title ?? e.label}
        data-testid={`adv-init-face-${e.card.id}`}
        style={{ height: "min(22rem, 70vh)", width: "auto", maxWidth: "90vw", objectFit: "contain", display: "block" }}
      />
    );
  }
  return (
    <Flex
      data-testid={`adv-init-face-${e.card.id}`}
      direction="column"
      gap="0.35rem"
      w="12rem"
      maxW="90vw"
      minH="19.4rem"
      p="0.6rem"
      bg="rgba(20,8,24,0.96)"
      color="white"
      border="1px solid"
      borderColor={e.who === "enemy" ? entryLook(e).ring : "rgba(231,204,152,0.4)"}
      borderStyle={e.who === "enemy" ? entryLook(e).ringStyle : "solid"}
      borderRadius="md"
    >
      <Text fontFamily="LeagueGothic" fontSize="1.25rem" letterSpacing="0.06em" lineHeight="1.05">
        {(e.card.title ?? e.name ?? e.label).toUpperCase()}
      </Text>
      {e.name && e.card.title && e.name !== e.card.title && (
        <Text {...LBL}>{e.name.toUpperCase()}</Text>
      )}
      {e.move != null && (
        <Text data-testid={`adv-init-face-move-${e.card.id}`} fontFamily="LeagueGothic" fontSize="1rem" letterSpacing="0.08em">
          MOVE {e.move}
        </Text>
      )}
      {e.rightNow && <PrintedBox label="RIGHT NOW" text={e.rightNow} testid={`adv-init-face-rn-${e.card.id}`} />}
      {e.endOfRound && <PrintedBox label="END OF ROUND" text={e.endOfRound} testid={`adv-init-face-eor-${e.card.id}`} />}
    </Flex>
  );
};

/** Hover (desktop) or tap (touch) a revealed row card to read its face (#1149). */
const WithCardFace = ({ e, children }: { e: InitiativeRowEntry; children: JSX.Element }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover isOpen={open} onClose={() => setOpen(false)} placement="left-start" isLazy gutter={6}>
      <PopoverTrigger>
        <Box
          as="button"
          type="button"
          cursor="pointer"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={() => setOpen((o) => !o)}
        >
          {children}
        </Box>
      </PopoverTrigger>
      <Portal>
        {/* rootProps: the popper wrapper otherwise sits at z 10, under the seat plates (as ProHud). */}
        <PopoverContent rootProps={{ zIndex: "popover" }} w="auto" bg="transparent" border="none" boxShadow="dark-lg">
          <InitiativeCardFace e={e} />
        </PopoverContent>
      </Portal>
    </Popover>
  );
};

/** The row chip's END OF ROUND marker: the icon and the box's first line, so the pile-up reads
 *  without hovering (#1149). */
const EndOfRoundMarker = ({ e }: { e: InitiativeRowEntry }) => (
  <Flex
    data-testid={`adv-init-eor-${e.card.id}`}
    align="center"
    gap="0.1rem"
    maxW="3.4rem"
    color={e.resolving ? GOLD : "whiteAlpha.800"}
    fontSize="0.5rem"
    lineHeight="1.1"
  >
    <Box as={TbHourglass} flexShrink={0} boxSize="0.6rem" />
    <Text noOfLines={1} wordBreak="break-all">
      {firstLineOf(e.endOfRound!)}
    </Text>
  </Flex>
);

/** AT ROUND END (#1155): the row's END OF ROUND boxes in the order they will resolve. */
const AtRoundEnd = ({ model }: { model: AdventureBoardModel }) => (
  <Flex data-testid="adv-at-round-end" direction="column" gap="0.15rem" {...PANEL}>
    <Text {...LBL}>AT ROUND END</Text>
    {model.atRoundEnd.map((b, i) => (
      <Text
        key={b.id}
        data-testid={`adv-at-round-end-${b.id}`}
        data-resolving={b.resolving ? "true" : undefined}
        fontSize="0.65rem"
        lineHeight="1.2"
        color={b.resolving ? GOLD : "whiteAlpha.900"}
        fontWeight={b.resolving ? "bold" : "normal"}
      >
        {i + 1}. {b.title}: {b.text}
      </Text>
    ))}
  </Flex>
);

const Portrait = ({ e, src }: { e: InitiativeRowEntry; src: string | null }) => {
  const enemy = e.who === "enemy";
  // #1181: two letters ("Darth Vader" → DV) so sibling chips with the same first word differ.
  const initial = (e.name ?? e.label)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <Flex
      w="2rem"
      h="2rem"
      borderRadius="full"
      overflow="hidden"
      align="center"
      justify="center"
      flexShrink={0}
      bg={enemy ? entryLook(e).plate : "whiteAlpha.300"}
      border="2px"
      borderStyle={enemy ? entryLook(e).ringStyle : "solid"}
      borderColor={hot(e) ? GOLD : enemy ? entryLook(e).ring : "whiteAlpha.400"}
      boxShadow={hot(e) ? `0 0 8px 1px ${GOLD}` : "none"}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Text fontFamily="LeagueGothic" fontSize="0.9rem" color={enemy ? entryLook(e).ink : "white"}>
          {initial}
        </Text>
      )}
    </Flex>
  );
};

/** Tooltip for a strip chip: the full name plus the card's own title, so two cards of one
 *  fighter ("Darth Vader — Force Choke" / "Darth Vader — Saber Throw") never read alike. */
export const initiativeChipTip = (e: InitiativeRowEntry): string => {
  if (!e.name) return e.label;
  return e.card.title && e.card.title !== e.name ? `${e.name} — ${e.card.title}` : e.name;
};

/** 1-based ordinal for each revealed chip whose name another revealed chip shares (card id → n). */
const duplicateOrdinals = (row: InitiativeRowEntry[]): Map<string, number> => {
  const total = new Map<string, number>();
  for (const e of row) if (e.name) total.set(e.name, (total.get(e.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<string, number>();
  for (const e of row) {
    if (!e.name || (total.get(e.name) ?? 0) < 2) continue;
    const n = (seen.get(e.name) ?? 0) + 1;
    seen.set(e.name, n);
    out.set(e.card.id, n);
  }
  return out;
};

/** Round & turn strip: ROUND n, the revealed row as portrait chips (done / now / up), the
 *  face-down remainder as card backs, and the END OF ROUND state. */
export const InitiativeRow = ({
  model,
  fighterTokenArt,
}: {
  model: AdventureBoardModel;
  fighterTokenArt?: (f: ViewFighter) => string | null;
}) => {
  const eor = model.phase === "END_OF_ROUND";
  const dupOrdinals = duplicateOrdinals(model.row);
  return (
    <Flex direction="column" gap="0.3rem" data-testid="adv-initiative" data-phase={model.phase ?? undefined} {...PANEL}>
      <Flex gap="0.6rem" align="baseline" wrap="wrap">
        {model.scenarioLabel && (
          <Text {...LBL} data-testid="adv-scenario" data-scenario-id={model.scenarioId ?? undefined}>
            {model.scenarioLabel.toUpperCase()}
          </Text>
        )}
        <Text fontFamily="LeagueGothic" fontSize="1.3rem" letterSpacing="0.1em" lineHeight="1">
          ROUND{" "}
          <Text as="span" data-testid="adv-round">
            {model.round ?? "–"}
          </Text>
        </Text>
        {eor ? (
          <Text {...LBL} color={GOLD} opacity={1} data-testid="adv-phase">
            END OF ROUND{model.nowName ? ` · ${model.nowName.toUpperCase()}` : ""}
          </Text>
        ) : model.nowName ? (
          <Text {...LBL} color={GOLD} opacity={1} data-testid="adv-now">
            NOW · {model.nowName.toUpperCase()}
          </Text>
        ) : null}
      </Flex>
      <Flex
        gap="0.2rem"
        // Phone: one row that scrolls sideways with the deck pile pinned at its left (#1405).
        wrap={{ base: "nowrap", md: "wrap" }}
        overflowX={{ base: "auto", md: "visible" }}
        align="center"
        data-testid="adv-init-chips"
        sx={{ "::-webkit-scrollbar": { display: "none" } }}
      >
        {model.initiativeDeckCount != null && <DeckPile count={model.initiativeDeckCount} testid="adv-initiative-deck" />}
        {model.row.map((e) => {
          const tip = initiativeChipTip(e);
          const dupN = dupOrdinals.get(e.card.id);
          const down = e.state === "down";
          const src = e.fighter && fighterTokenArt ? fighterTokenArt(e.fighter) : null;
          const face = hasFace(e);
          const chip = (
            <Flex
              key={e.card.id}
              data-testid={`adv-init-${e.card.id}`}
              data-card-art={e.artKey}
              data-spawned={e.spawnedFighter ? "true" : undefined}
              data-current={e.current ? "true" : undefined}
              data-face-down={down ? "true" : undefined}
              data-state={e.state}
              data-resolving={e.resolving ? "true" : undefined}
              position="relative"
              direction="column"
              align="center"
              gap="0.1rem"
              opacity={e.state === "done" && !e.resolving ? 0.45 : 1}
              title={face ? undefined : tip}
              aria-label={tip}
            >
              {down ? (
                <Box
                  w="1.5rem"
                  h="2rem"
                  borderRadius="sm"
                  border="1px solid"
                  borderColor="whiteAlpha.400"
                  bg="repeating-linear-gradient(45deg, rgba(255,255,255,0.12) 0 3px, rgba(255,255,255,0.04) 3px 6px)"
                />
              ) : e.who === "enemy" && adventureCardArt(e.artKey) ? (
                <CardFace cardId={e.artKey} h="2.4rem" testid={`adv-init-art-${e.card.id}`} />
              ) : (
                <Portrait e={e} src={src} />
              )}
              {e.state === "done" && (
                <Text position="absolute" top="-0.2rem" right="-0.2rem" fontSize="0.6rem" color="green.300" lineHeight="1">
                  ✓
                </Text>
              )}
              {dupN != null && (
                <Text
                  data-testid={`adv-init-dup-${e.card.id}`}
                  position="absolute"
                  bottom="-0.15rem"
                  right="-0.15rem"
                  minW="0.9rem"
                  textAlign="center"
                  borderRadius="full"
                  bg="rgba(20,8,24,0.92)"
                  border="1px solid"
                  borderColor={e.state === "now" ? GOLD : "whiteAlpha.500"}
                  fontSize="0.55rem"
                  lineHeight="0.9rem"
                  color={e.state === "now" ? GOLD : "whiteAlpha.900"}
                >
                  {dupN}
                </Text>
              )}
              {e.endOfRound && <EndOfRoundMarker e={e} />}
            </Flex>
          );
          return face ? (
            <WithCardFace key={e.card.id} e={e}>
              {chip}
            </WithCardFace>
          ) : (
            chip
          );
        })}
        {model.stillToFlip > 0 && (
          <Text {...LBL} data-testid="adv-still-to-flip">
            {model.stillToFlip} STILL TO FLIP
          </Text>
        )}
      </Flex>
    </Flex>
  );
};

/** A face-down deck: the card back with the cards left over it (#1405). */
const DeckPile = ({
  count,
  testid,
  w = "1.5rem",
  h = "2rem",
}: {
  count: number;
  testid: string;
  w?: string;
  h?: string;
}) => (
  <Flex
    data-testid={testid}
    position="sticky"
    left={0}
    flex="none"
    w={w}
    h={h}
    align="center"
    justify="center"
    borderRadius="sm"
    border="1px solid"
    borderColor="whiteAlpha.500"
    bg="repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 3px, rgba(255,255,255,0.04) 3px 6px)"
    title={`${count} left in the deck`}
    aria-label={`${count} left in the deck`}
  >
    <Text fontWeight="bold" fontSize="0.8rem" lineHeight="1" textShadow="0 0 3px #000, 0 0 3px #000">
      {count}
    </Text>
  </Flex>
);

const Token = ({ name, size = "1.5rem", role }: { name: string; size?: string; role?: EnemyRole }) => (
  <Flex
    data-testid="adv-token"
    flex="none"
    boxSize={size}
    align="center"
    justify="center"
    borderRadius="50%"
    border={role ? `2px ${ENEMY_LOOK[role].ringStyle} ${ENEMY_LOOK[role].ring}` : "1px solid rgba(224,168,46,0.55)"}
    bg={role ? ENEMY_LOOK[role].plate : "radial-gradient(circle at 50% 30%, #3d2249 0%, #140818 80%)"}
    color={role ? ENEMY_LOOK[role].ink : undefined}
    data-enemy-role={role}
    fontSize="0.7rem"
    fontWeight="bold"
  >
    {name.slice(0, 1).toUpperCase()}
  </Flex>
);

export const VillainHeader = ({
  villain,
  objective,
}: {
  villain: EnemyDial;
  objective: string | null;
}) => {
  const pct = villain.maxHp > 0 ? Math.max(0, Math.min(1, villain.hp / villain.maxHp)) : 0;
  return (
    <Flex
      direction="column"
      gap="0.25rem"
      data-testid="adv-villain"
      data-enemy-id={villain.enemyId ?? undefined}
      {...PANEL}
    >
      <Flex gap="0.5rem" align="center">
        <Token name={villain.name} size="2.2rem" role={villain.role} />
        <Flex direction="column" minW={0} flex="1">
          <Text {...LBL} data-testid="adv-villain-line">
            <EnemyRoleBadge role={villain.role} /> · {villain.size} · MOVE {villain.move}
          </Text>
          <Text fontWeight="bold" fontSize="0.95rem" lineHeight="1.1" data-testid="adv-villain-name">
            {villain.name}
          </Text>
        </Flex>
      </Flex>
      <Box h="6px" borderRadius="3px" bg="whiteAlpha.200" overflow="hidden">
        <Box h="100%" w={`${pct * 100}%`} bg="red.400" data-testid="adv-villain-hpbar" />
      </Box>
      <Flex gap="0.6rem" align="baseline">
        <Text data-testid={`adv-enemy-hp-${villain.id}`} fontWeight="bold" fontSize="0.8rem">
          {villain.hp}/{villain.maxHp}
          <Text as="span" {...LBL}>
            {" "}
            HP
          </Text>
        </Text>
      </Flex>
      {objective && (
        <Text fontSize="0.7rem" opacity={0.85} data-testid="adv-villain-objective">
          Objective: {objective}
        </Text>
      )}
    </Flex>
  );
};

export const ThreatTrack = ({ threat }: { threat: ThreatModel }) => (
  <Flex direction="column" gap="0.2rem" data-testid="adv-threat" {...PANEL}>
    <Flex
      gap="0.25rem"
      align="center"
      wrap={{ base: "nowrap", md: "wrap" }}
      overflowX={{ base: "auto", md: "visible" }}
      sx={{ "::-webkit-scrollbar": { display: "none" } }}
    >
      <Text {...LBL} flex="none" mr="0.2rem">
        THREAT
      </Text>
      {threat.cells.map((c) => (
        <Flex
          key={c.space}
          data-testid={`adv-threat-${c.space}`}
          data-marker={c.marker ? "true" : undefined}
          flex="none"
          w="1.5rem"
          h="1.5rem"
          align="center"
          justify="center"
          borderRadius="sm"
          border="1px solid"
          borderColor={c.marker ? "yellow.200" : "whiteAlpha.300"}
          bg={c.marker ? "yellow.500" : "whiteAlpha.100"}
          color={c.marker ? "black" : undefined}
          fontWeight={c.marker ? "bold" : undefined}
          boxShadow={c.marker ? "0 0 0.5rem 0.1rem rgba(236,201,75,0.75)" : undefined}
          fontSize="0.75rem"
        >
          {c.value}
        </Flex>
      ))}
      <Flex
        data-testid="adv-threat-terminal"
        data-marker={threat.terminal.marker ? "true" : undefined}
        flex="none"
        minW="3.6rem"
        h="1.5rem"
        px="0.25rem"
        align="center"
        justify="center"
        borderRadius="sm"
        border="1px solid"
        borderColor="red.300"
        bg={threat.terminal.marker ? "red.500" : "rgba(160,40,50,0.55)"}
        boxShadow={threat.terminal.marker ? "0 0 0.5rem 0.1rem rgba(245,101,101,0.75)" : undefined}
        fontSize="0.5rem"
        fontWeight="bold"
        lineHeight="1"
        textAlign="center"
        letterSpacing="0.04em"
      >
        {threat.terminal.label ? `${threat.terminal.label.toUpperCase()}` : "BREAKOUT"}
      </Flex>
      <Text fontSize="0.7rem" flex="none" ml="0.3rem">
        level{" "}
        <Text as="span" data-testid="adv-threat-level" fontWeight="bold" fontSize="0.85rem">
          {threat.level}
        </Text>
      </Text>
      <Text flex="none" ml="0.3rem" fontSize="0.7rem" opacity={0.9} data-testid="adv-threat-steps" whiteSpace="nowrap">
        <b>
          {threat.stepsToBreakout} step{threat.stepsToBreakout === 1 ? "" : "s"}
        </b>{" "}
        to the next breakout
        {threat.overflows > 0 && (
          <Text as="span" data-testid="adv-threat-overflows">
            {" "}
            · {threat.overflows} breakout{threat.overflows === 1 ? "" : "s"} so far
          </Text>
        )}
      </Text>
    </Flex>
  </Flex>
);

export const ObjectsLost = ({
  objectives,
  win,
  noun,
}: {
  objectives: NonNullable<AdventureBoardModel["objectives"]>;
  win: AdventureBoardModel["win"];
  /** #807: the scenario's object noun (`display.objectNoun`, else generic). */
  noun: ObjectNoun;
}) => {
  const n = objectives.slots.length;
  return (
    <Flex direction="column" gap="0.3rem" data-testid="adv-objectives" {...PANEL}>
      <Flex align="baseline" justify="space-between" gap="0.4rem">
        <Text {...LBL}>{noun.plural.toUpperCase()} LOST</Text>
        <Text fontSize="0.7rem" data-testid="adv-objectives-count">
          <b>{objectives.lost}</b> of {n} · the {n}
          {ordinal(n)} ends the game
        </Text>
      </Flex>
      <Flex gap="0.2rem">
        {objectives.slots.map((o, i) => (
          <Flex
            key={o.id}
            data-testid={`adv-objective-${i + 1}`}
            data-fired={o.fired ? "true" : undefined}
            data-lose={o.lose ? "true" : undefined}
            title={o.label}
            flex="1"
            minW={0}
            h="1.9rem"
            px="0.15rem"
            align="center"
            justify="center"
            borderRadius="sm"
            border="1px solid"
            borderColor={o.fired ? "red.300" : o.lose ? "red.700" : "whiteAlpha.300"}
            bg={o.fired ? "rgba(160,40,50,0.6)" : o.lose ? "rgba(120,30,40,0.25)" : "whiteAlpha.100"}
            fontSize="0.5rem"
            fontWeight="bold"
            textAlign="center"
            lineHeight="1.05"
            overflow="hidden"
          >
            {o.fired ? o.label : o.lose ? "LOSE" : i + 1}
          </Flex>
        ))}
      </Flex>
      {win?.heroesDownSidekick && (
        <Text fontSize="0.7rem" fontWeight="bold" color="red.200" data-testid="adv-heroes-down">
          Your heroes are down — {win.heroesDownSidekick} is still standing
        </Text>
      )}
      {win && (
        <Text fontSize="0.7rem" opacity={0.9} data-testid="adv-win-line">
          To win: {win.villain} to 0
          {win.released.length > 0 && (
            <>
              {" "}
              <b>and</b>{" "}
              {win.released
                .map((r) => `${r.name} (${r.hp}/${r.maxHp})`)
                .join(", ")}{" "}
              defeated
            </>
          )}
        </Text>
      )}
    </Flex>
  );
};

const ordinal = (n: number) =>
  n % 100 >= 11 && n % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";

export const ADVENTURE_BOARD_RIGHT = `calc(${DOCK_RIGHT} + ${DOCK_WIDTH} + 0.75rem)`;

export const EnemyDials = ({
  enemies,
}: {
  enemies: AdventureBoardModel["enemies"];
}) => (
  <Flex direction="column" gap="0.3rem" data-testid="adv-enemies" {...PANEL}>
    {enemies.map((e) => (
      <Flex
        key={e.id}
        data-testid={`adv-enemy-${e.id}`}
        data-enemy-id={e.enemyId ?? undefined}
        gap="0.4rem"
        align="center"
        opacity={e.defeated ? 0.45 : 1}
      >
        <Token name={e.name} role={e.role} />
        <Flex direction="column" flex="1" minW={0}>
          <Text fontSize="0.75rem" fontWeight="bold" noOfLines={1}>
            {e.name} <EnemyRoleBadge role={e.role} />
            {e.released === true && (
              <Text
                as="span"
                {...LBL}
                ml="0.3rem"
                px="0.2rem"
                bg="rgba(160,40,50,0.45)"
                borderRadius="sm"
                data-testid={`adv-enemy-released-${e.id}`}
              >
                RELEASED
              </Text>
            )}
          </Text>
          <Text {...LBL} data-testid={`adv-enemy-meta-${e.id}`}>
            {e.size !== "NORMAL" ? `${e.size} · ` : ""}MOVE {e.move}
          </Text>
        </Flex>
        {/* slot for the intent badge (p2p #1148) */}
        <Box data-testid={`adv-enemy-intent-slot-${e.id}`} flex="none" />
        <Text
          data-testid={`adv-enemy-hp-${e.id}`}
          fontWeight="bold"
          fontSize="0.8rem"
        >
          {e.hp}/{e.maxHp}
        </Text>
      </Flex>
    ))}
  </Flex>
);

/**
 * Enemy decks + discard piles (#1405): one stack per enemy ROLE the protocol names (villain,
 * minion, …), a chip per fighter in it (decks are per fighter). Each stack shows the selected
 * fighter's face-down deck with its count and the top of its discard (last played); clicking
 * the discard opens the whole pile. Nothing here knows a scenario: roles and names come off the
 * wire, and a role with no fighters simply has no stack.
 */
export const EnemyDecks = ({
  enemies,
  onOpenPile,
}: {
  enemies: EnemyDial[];
  onOpenPile: (fighterId: string) => void;
}) => {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const roles = Array.from(new Set(enemies.map((e) => e.role)));
  if (enemies.length === 0) return null;
  return (
    <Flex direction="column" gap="0.4rem" data-testid="adv-decks" {...PANEL}>
      {roles.map((role) => {
        const group = enemies.filter((e) => e.role === role);
        const live = group.filter((e) => !e.defeated);
        const members = live.length > 0 ? live : group;
        const sel = members.find((e) => e.id === picked[role]) ?? members[0];
        const art = adventureCardArt(sel.lastPlayedId);
        return (
          <Flex key={role} direction="column" gap="0.25rem" data-testid={`adv-decks-${role}`} data-role={role}>
            <Text {...LBL}>{role} DECK{members.length > 1 ? "S" : ""}</Text>
            <Flex gap="0.5rem" align="flex-start">
              <DeckPile count={sel.deckCount} testid={`adv-deck-${sel.id}`} w="3.2rem" h="4.4rem" />
              <Box
                as="button"
                type="button"
                data-testid={`adv-discard-${sel.id}`}
                onClick={() => onOpenPile(sel.id)}
                disabled={sel.discard.length === 0}
                position="relative"
                flex="none"
                w="3.2rem"
                h="4.4rem"
                borderRadius="sm"
                border="1px solid"
                borderColor={sel.discard.length ? "whiteAlpha.500" : "whiteAlpha.200"}
                borderStyle={sel.discard.length ? "solid" : "dashed"}
                overflow="hidden"
                bg="whiteAlpha.100"
                aria-label={`${sel.name} discard: ${sel.discard.length} card${sel.discard.length === 1 ? "" : "s"}${sel.lastPlayed ? `, last played ${sel.lastPlayed}` : ""}. Open the pile`}
                title={sel.lastPlayed ? `Last played: ${sel.lastPlayed}` : "Discard is empty"}
              >
                {art ? (
                  <CardFace cardId={sel.lastPlayedId} h="100%" testid={`adv-discard-art-${sel.id}`} />
                ) : sel.lastPlayed ? (
                  <Text fontSize="0.6rem" lineHeight="1.15" p="0.2rem" textAlign="left">
                    {sel.lastPlayed}
                  </Text>
                ) : null}
                <Text
                  data-testid={`adv-discard-count-${sel.id}`}
                  position="absolute"
                  right="0.1rem"
                  bottom="0.1rem"
                  px="0.25rem"
                  borderRadius="sm"
                  bg="rgba(20,8,24,0.85)"
                  fontSize="0.7rem"
                  fontWeight="bold"
                  lineHeight="1.1"
                >
                  {sel.discard.length}
                </Text>
              </Box>
              <Flex direction="column" gap="0.15rem" minW={0} flex="1">
                <Text fontSize="0.72rem" fontWeight="bold" noOfLines={2} data-testid={`adv-deck-name-${sel.id}`}>
                  {sel.name}
                </Text>
                <Text {...LBL}>
                  <span data-testid={`adv-enemy-deck-${sel.id}`}>DECK {sel.deckCount}</span> · DISCARD {sel.discard.length}
                </Text>
                {sel.lastPlayed && (
                  <Text fontSize="0.66rem" opacity={0.85} noOfLines={2} data-testid={`adv-last-played-${sel.id}`}>
                    Last played: {sel.lastPlayed}
                  </Text>
                )}
              </Flex>
            </Flex>
            {members.length > 1 && (
              <Flex gap="0.25rem" wrap="wrap" data-testid={`adv-decks-tabs-${role}`}>
                {members.map((m) => (
                  <Box
                    as="button"
                    type="button"
                    key={m.id}
                    data-testid={`adv-decks-tab-${m.id}`}
                    aria-pressed={m.id === sel.id}
                    onClick={() => setPicked((p) => ({ ...p, [role]: m.id }))}
                    px="0.35rem"
                    py="0.1rem"
                    borderRadius="sm"
                    border="1px solid"
                    borderColor={m.id === sel.id ? GOLD : "whiteAlpha.300"}
                    bg={m.id === sel.id ? "whiteAlpha.200" : "transparent"}
                    fontSize="0.62rem"
                    maxW="100%"
                  >
                    {m.name} · {m.deckCount}
                  </Box>
                ))}
              </Flex>
            )}
          </Flex>
        );
      })}
    </Flex>
  );
};

export const TeamDecision = ({ model }: { model: TeamDecisionModel }) => (
  <Flex
    direction="column"
    gap="0.25rem"
    data-testid="adv-team-decision"
    data-you-choose={model.youChoose ? "true" : undefined}
    {...PANEL}
    borderWidth="1px"
    borderColor="yellow.300"
  >
    <Text {...LBL}>PLAYERS CHOOSE</Text>
    <Text data-testid="adv-team-decision-who" fontSize="0.8rem">
      {teamChoosingTitle(
        model.youChoose,
        model.chooser,
        model.forName,
        model.description,
      )}
    </Text>
    {model.card && (
      <Text data-testid="adv-team-decision-card" fontSize="0.75rem" fontWeight="bold">
        Playing: {model.card}
      </Text>
    )}
    {model.youChoose && (
      <Text data-testid="adv-team-decision-guidance" fontSize="0.7rem" opacity={0.8}>
        {TEAM_GUIDANCE}
      </Text>
    )}
    {!model.youChoose && model.description && (
      <Text data-testid="adv-team-decision-what" fontSize="0.75rem">
        {model.description}
      </Text>
    )}
    {model.options.length > 0 && (
      <Flex gap="0.25rem" wrap="wrap" justify="center">
        {model.options.map((o) => (
          <Box
            key={o.id}
            data-testid={`adv-team-option-${o.id}`}
            px="0.4rem"
            py="0.15rem"
            borderRadius="sm"
            bg="whiteAlpha.200"
            fontSize="0.7rem"
          >
            {o.label}
          </Box>
        ))}
      </Flex>
    )}
  </Flex>
);

export const EnemyCombat = ({ sides }: { sides: EnemyCombatSide[] }) => (
  <Flex
    direction="column"
    gap="0.2rem"
    data-testid="adv-enemy-combat"
    {...PANEL}
  >
    {sides.map((s) => (
      <Flex
        key={s.role}
        data-testid={`adv-combat-${s.role.toLowerCase()}`}
        gap="0.6rem"
        align="baseline"
      >
        <Text {...LBL}>{s.role === "ATTACK" ? "ATTACK" : "DEFENSE"}</Text>
        <Text fontSize="0.75rem" flex="1">
          {s.title}{" "}
          <Text
            as="span"
            opacity={0.7}
            data-testid={`adv-combat-owner-${s.role.toLowerCase()}`}
          >
            · {s.enemyName} ({s.enemyRole === "VILLAIN" ? "Villain" : "Minion"})
          </Text>
        </Text>
        {s.printed != null && s.printed !== s.effective && (
          <Text
            {...LBL}
            data-testid={`adv-combat-printed-${s.role.toLowerCase()}`}
          >
            PRINTED {s.printed}
          </Text>
        )}
        <Text
          data-testid={`adv-combat-value-${s.role.toLowerCase()}`}
          fontWeight="bold"
        >
          {s.effective}
        </Text>
      </Flex>
    ))}
  </Flex>
);

export const EnemyTurnCard = ({ state }: { state: EnemyTurnState }) => {
  const m = state.model;
  if (state.collapsed)
    return (
      <Text data-testid="adv-enemy-turn-summary" {...PANEL} fontSize="0.7rem" opacity={0.8}>
        {enemyTurnSummary(m)}
      </Text>
    );
  return (
    <Flex
      direction="column"
      gap="0.25rem"
      data-testid="adv-enemy-turn"
      data-outcome={m.outcome}
      {...PANEL}
      borderWidth="1px"
      borderColor="red.400"
    >
      <Flex justify="space-between" align="baseline" gap="0.5rem">
        <Text {...LBL} opacity={1} data-testid="adv-enemy-turn-title">
          {m.enemyName.toUpperCase()}&apos;S TURN
        </Text>
        {m.moveLine && (
          <Text {...LBL} data-testid="adv-enemy-turn-move">
            {m.moveLine}
          </Text>
        )}
      </Flex>
      {m.steps.map((s) => (
        <Flex
          key={s.n}
          data-testid={`adv-enemy-step-${s.n}`}
          data-lit={s.lit ? "true" : "false"}
          gap="0.4rem"
          align="baseline"
          opacity={s.lit ? 1 : 0.4}
          fontWeight={s.lit ? "bold" : "normal"}
          fontSize="0.72rem"
        >
          <Text as="span">{s.n}</Text>
          <Text as="span" flex="1">
            {s.label}
          </Text>
          <Text as="span" opacity={0.85}>
            → {s.does}
          </Text>
        </Flex>
      ))}
      <Text data-testid="adv-enemy-turn-result" fontSize="0.75rem">
        {m.consequence}
      </Text>
      {m.attack && (
        <Flex data-testid="adv-enemy-turn-attack" gap="0.5rem" align="center">
          <CardFace cardId={m.attack.cardId} h="4.5rem" testid="adv-enemy-turn-attack-art" />
          <Text {...LBL}>ATTACK</Text>
          <Text fontSize="0.75rem" flex="1">
            {m.attack.title}
            {m.attack.defender ? (
              <Text as="span" opacity={0.7}>
                {" "}
                · vs {m.attack.defender}
              </Text>
            ) : null}
          </Text>
          {m.attack.value != null && (
            <Text fontWeight="bold" data-testid="adv-enemy-turn-attack-value">
              {m.attack.value}
            </Text>
          )}
        </Flex>
      )}
    </Flex>
  );
};

export { ENGINE_FAULT_FIXTURE, EngineFaultBanner } from "./EngineFaultBanner";

/** The whole Adventure overlay cluster. Renders nothing without adventure data. */
export const AdventureBoard = ({
  view,
  events,
  engineFault,
  fighterTokenArt,
  onBoardArrow,
  revealedHand,
  bandRef,
}: FormatOverlayProps) => {
  useAdventureAnalytics(view, events);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pileFighter, setPileFighter] = useState<string | null>(null);
  // The ONE enemy-turn state (#1156): the narrator card below and the board's enemy→target arrow.
  const turn = useEnemyTurn(view, events);
  const arrow = enemyTurnArrow(turn);
  useEffect(() => {
    onBoardArrow?.(arrow);
  }, [onBoardArrow, arrow?.attacker, arrow?.target]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onBoardArrow?.(null), [onBoardArrow]);
  // null = never toggled in this browser: closed on a phone (#1310), open on desktop (#1346).
  const [stored, setStored] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DRAWER_KEY);
      if (v === "open" || v === "closed") setStored(v === "open");
    } catch {}
  }, []);
  const toggleDrawer = (current: boolean) => {
    setStored(!current);
    try {
      window.localStorage.setItem(DRAWER_KEY, current ? "closed" : "open");
    } catch {}
  };
  const breakout = useBreakoutMoment(view, events);
  const walk = useEndOfRoundWalk(view, events);
  const model = adventureBoardModel(view);
  if (!model) return null;
  // The END OF ROUND walk replays on the strip from the row it resolved (#1149).
  const walkModel = walk ? adventureBoardModel(walk.view, { resolvingId: walk.resolvingId }) : null;
  const strip = walkModel ? { ...walkModel, phase: "END_OF_ROUND" } : model;
  const faulted = engineFault != null;
  // A stopped table has no one "choosing" and no mover: clear those indicators.
  const decision = faulted ? null : teamDecisionModel(view);
  // Nor does a finished one narrate (#1182): the end screen owns GAME_OVER.
  const enemyTurn = faulted || view.winner ? null : turn;
  const combat = enemyCombatModel(view);
  const others = model.enemies.filter((e) => e !== model.villain);
  // The pile sheet is the existing discard viewer; one section per fighter of the clicked
  // fighter's role (a tab per minion), the clicked one first. Instance ids resolve to the
  // format's CDN face, same as the dials.
  const pile = pileFighter ? model.enemies.find((e) => e.id === pileFighter) : null;
  const pileSeats = pile
    ? [pile, ...model.enemies.filter((e) => e.role === pile.role && e.id !== pile.id)].map((e) => ({
        id: e.id,
        name: e.name,
        // the sheet renders play order reversed; the wire's discard is newest first
        discard: [...e.discard].reverse(),
        you: false,
      }))
    : [];
  return (
    <>
    <Flex
      data-testid="adventure-band"
      ref={bandRef}
      position="fixed"
      // Above the map, below the HUD band; clear of the column (and dock) on desktop (#1405).
      top={{ base: ADVENTURE_BAND_TOP_PHONE, md: ADVENTURE_BAND_TOP }}
      left={{ base: "0.5rem", md: "0.75rem" }}
      right={{ base: "0.5rem", md: `calc(${ADVENTURE_BOARD_RIGHT} + ${ADVENTURE_BOARD_WIDTH} + 0.75rem)` }}
      // A row: the strip + track column first, then (p2p #1456) the Keen Hearing panel beside
      // it — never over a space or the dock. Where the band is too narrow for both (a phone;
      // a desktop under ~1060px, where the band is ~376px and the track alone ~300px, p2p
      // #1462) the panel wraps onto a second row instead of squeezing the track or running
      // under the Adventure column; the page measures the band (`bandRef`) and fits the board
      // under whatever height it ends up with, so the wrapped row never covers a space.
      direction="row"
      align="flex-start"
      wrap="wrap"
      gap="0.75rem"
      zIndex={5}
      pointerEvents="none"
      sx={{
        "& > *": { pointerEvents: "auto", maxW: "100%" },
        // The panel's 22rem cap, and on a phone the wrapped panel also stops short of the
        // ADVENTURE drawer toggle, pinned at the band's right edge below the strip
        // (ADVENTURE_COLUMN_TOP_PHONE) and drawn over it.
        "& > [data-inline]": { maxW: { base: "min(22rem, calc(100% - 6.5rem))", md: "22rem" } },
      }}
    >
      <Flex direction="column" align="flex-start" gap="0.3rem" flexShrink={0} sx={{ "& > *": { maxW: "100%" } }}>
        {(strip.row.length > 0 || strip.round != null) && (
          <InitiativeRow model={strip} fighterTokenArt={fighterTokenArt} />
        )}
        {model.threat && <ThreatTrack threat={model.threat} />}
      </Flex>
      {revealedHand && (
        <RevealedHandPanel
          // a newer reveal starts expanded, whatever the last one was collapsed to
          key={`${revealedHand.revealed.owner}:${revealedHand.revealed.turn}:${revealedHand.revealed.cards.join(",")}`}
          inline
          {...revealedHand}
        />
      )}
    </Flex>
    <ProDiscardsSheet
      isOpen={pile != null}
      onClose={() => setPileFighter(null)}
      seats={pileSeats}
      resolveCard={(id) => formatFaceCard(id, view.catalog?.[id.split("#")[0]]?.title, adventureCardArt)}
      labelFor={(c) => cardLabel(view.catalog, c)}
    />
    <Flex
      data-testid="adventure-board"
      position="fixed"
      // Docked to the right edge under the chip cluster, NOT top-centre (#1114): the
      // seat plates flow left-to-right from the top-left and, with an enemy seat
      // among them, reach the middle of the screen at ~1500px. They stop 8.5rem
      // short of the right edge, and five 15rem plates end well before this column.
      // Phone: below the HUD's SETUP/phase bar, which spans the width under the plates.
      top={{ base: ADVENTURE_COLUMN_TOP_PHONE, md: ADVENTURE_BOARD_TOP }}
      // ...and to the LEFT of the fixed Actions dock (z 140, right 0.75rem, 18.5rem
      // wide, from 7.5rem down) which otherwise fully covers the dials (#1128).
      // On a phone there is no dock slot to clear (#1310): hug the screen edge instead.
      right={{ base: "0.5rem", md: ADVENTURE_BOARD_RIGHT }}
      maxW={{ base: `min(${ADVENTURE_BOARD_WIDTH}, calc(100vw - 1rem))`, md: ADVENTURE_BOARD_WIDTH }}
      // Capped to end above the hand fan (#1178) so nothing is tucked under it; the
      // static panels scroll inside, the live decision/narrator panels stay pinned.
      maxH={{ base: ADVENTURE_COLUMN_MAX_HEIGHT_PHONE, md: ADVENTURE_BOARD_MAX_HEIGHT }}
      direction="column"
      align="flex-end"
      gap="0.4rem"
      zIndex={5}
      pointerEvents="none"
    >
      {/* The static panels fold into a drawer (#1310 phone, #1346 desktop) so they never
          cover the board; the live decision/narrator panels below stay put. */}
      <Button
        data-testid="adventure-drawer-toggle"
        display="inline-flex"
        size="xs"
        variant="unstyled"
        pointerEvents="auto"
        alignSelf="flex-end"
        px="0.6rem"
        h="1.6rem"
        bg="rgba(20,8,24,0.72)"
        color="white"
        border="1px solid rgba(231,204,152,0.14)"
        borderRadius="md"
        {...LBL}
        // Responsive default: the CSS media rule picks it until the player toggles.
        aria-expanded={stored ?? undefined}
        onClick={() => toggleDrawer(stored ?? desktopNow())}
      >
        ADVENTURE{" "}
        {stored == null ? (
          <>
            <Box as="span" display={{ base: "none", md: "inline" }}>▴</Box>
            <Box as="span" display={{ base: "inline", md: "none" }}>▾</Box>
          </>
        ) : stored ? "▴" : "▾"}
      </Button>
      <Flex
        data-testid="adventure-board-scroll"
        display={stored == null ? { base: "none", md: "flex" } : stored ? "flex" : "none"}
        direction="column"
        align="flex-end"
        gap="0.4rem"
        flex="1 1 auto"
        minH={0}
        w="100%"
        overflowY="auto"
        sx={{ "& > *": { pointerEvents: "auto", flexShrink: 0 } }}
      >
      {model.enemies.length > 0 && <EnemyDecks enemies={model.enemies} onOpenPile={setPileFighter} />}
      {model.villain && (
        <VillainHeader villain={model.villain} objective={model.objective} />
      )}
      <Flex gap="0.4rem" flexWrap="wrap">
        <RulesButton onClick={() => setRulesOpen(true)} />
        <RulebookButton scenarioId={view.scenario?.id} testId="adventure-board-rulebook-button" compact />
      </Flex>
      <AdventureBriefingModal
        isOpen={rulesOpen}
        onClose={() => setRulesOpen(false)}
        label={view.scenario?.label ?? null}
        briefing={view.scenario?.briefing}
        display={view.scenario?.display}
        scenarioId={view.scenario?.id}
      />
      {strip.atRoundEnd.length > 0 && <AtRoundEnd model={strip} />}
      {model.objectives && model.objectives.slots.length > 0 && (
        <ObjectsLost objectives={model.objectives} win={model.win} noun={objectNounOf(view.scenario?.display)} />
      )}
      {others.length > 0 && <EnemyDials enemies={others} />}
      {combat && <EnemyCombat sides={combat} />}
      </Flex>
      <Flex
        data-testid="adventure-board-live"
        direction="column"
        align="flex-end"
        gap="0.4rem"
        flex="none"
        w="100%"
      >
        {faulted && <EngineFaultBanner message={engineFault} />}
        {decision && <TeamDecision model={decision} />}
        {enemyTurn && <EnemyTurnCard state={enemyTurn} />}
      </Flex>
    </Flex>
    {/* A sibling, not a child: the column above is its own stacking context (z 5). */}
    <BreakoutMomentOverlay
      moment={breakout.moment}
      compact={!!view.prompt && view.prompt.player === view.you}
      onDone={breakout.dismiss}
    />
    </>
  );
};
