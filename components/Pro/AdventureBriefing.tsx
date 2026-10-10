import { Box, Button, Flex, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text } from "@chakra-ui/react";
import { useState, type ReactNode } from "react";
import { TbChevronDown } from "react-icons/tb";
import type { ScenarioBriefing, ScenarioDisplay } from "@/lib/pro/protocol";
import { scenarioFor, type AdventureSetup } from "@/lib/pro/adventureLobby";
import { useScenarios } from "@/lib/pro/adventureScenarios";
import {
  BRIEFING_TITLE,
  DIFFICULTY_NOTE,
  FORMAT_KICKER,
  ROUND_COPY,
  YOUR_TURN_COPY,
  emphasisParts,
  yourTurnText,
} from "@/lib/pro/adventureRulesCopy";

const HEAD = { fontFamily: "SpaceGrotesk", fontSize: "0.62rem", letterSpacing: "0.16em", fontWeight: "bold", color: "brand.primary" } as const;
const BIG = { fontFamily: "LeagueGothic", fontSize: "1.5rem", letterSpacing: "0.06em", lineHeight: 1.1 } as const;

/** First sentence in the lead style, the rest as the quiet footnote. */
const splitFirstSentence = (text: string): { lead: string; rest: string } => {
  const m = /^(.+?[.!?])\s+(.*)$/s.exec(text);
  return m ? { lead: m[1]!, rest: m[2]! } : { lead: text, rest: "" };
};

/** `**bold**` text. */
const Rich = ({ text }: { text: string }) => (
  <>
    {emphasisParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}
  </>
);

const Tile = ({ testId, bg, border, children }: { testId: string; bg: string; border: string; children: ReactNode }) => (
  <Flex direction="column" gap="0.4rem" p="0.8rem 0.9rem" borderRadius="12px" bg={bg} border="1px solid" borderColor={border} data-testid={testId} minW="0">
    {children}
  </Flex>
);

/**
 * The "how this adventure works" briefing (#1153) — shared by the lobby and the in-game
 * modal. Scenario tiles (win / lose / threat / special) render only when the server sent a
 * `briefing`; the enemy-behaviour tile renders the engine's `display.enemyTurn` (projected for
 * every scenario with a `display`, engine #826); the round / your-turn tiles always render, from
 * `lib/pro/adventureRulesCopy.ts`.
 */
export const AdventureBriefing = ({
  label,
  briefing,
  display,
  compact = false,
}: {
  /** scenario label; null when none is resolved yet */
  label: string | null;
  briefing?: ScenarioBriefing | null;
  /** the scenario's display copy (enemy-turn tile, enemy noun); no enemy-turn tile when absent */
  display?: ScenarioDisplay | null;
  /** tighter spacing for the modal */
  compact?: boolean;
}) => {
  const acts = display?.enemyTurn ?? null;
  const special = briefing?.special ?? [];
  const win = splitFirstSentence(briefing?.win ?? "");
  return (
    <Flex direction="column" gap={compact ? "0.6rem" : "0.8rem"} minW="0" data-testid="adventure-briefing">
      <Flex
        direction="column"
        gap="0.3rem"
        p="0.7rem 1rem"
        borderRadius="14px"
        border="1px solid rgba(231,204,152,0.25)"
        bg="linear-gradient(180deg, rgba(58,33,64,0.85), rgba(44,24,49,0.9))"
        data-testid="adventure-briefing-header"
      >
        <Text fontFamily="SpaceGrotesk" fontSize="0.62rem" letterSpacing="0.18em" fontWeight="bold" color="brand.accent">
          {FORMAT_KICKER} · 1–4 HEROES
        </Text>
        <Text fontFamily="LeagueGothic" fontSize="2.2rem" lineHeight={0.95} letterSpacing="0.03em" data-testid="adventure-briefing-label">
          {(label ?? "Adventure").toUpperCase()}
        </Text>
        {briefing?.tagline && (
          <Text fontSize="0.9rem" lineHeight={1.45} opacity={0.9} data-testid="adventure-briefing-tagline">
            {briefing.tagline}
          </Text>
        )}
      </Flex>

      {briefing && (
        <Box display="grid" gridTemplateColumns={{ base: "1fr", xl: briefing.threat ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))" }} gap="0.7rem" data-testid="adventure-briefing-scenario">
          <Tile testId="adventure-briefing-win" bg="rgba(47,158,104,0.14)" border="rgba(47,158,104,0.45)">
            <Text {...BIG} color="#7FD9A8">YOU WIN</Text>
            <Text fontSize="0.85rem" lineHeight={1.45} fontWeight={500}>{win.lead}</Text>
            {win.rest && (
              <Text fontSize="0.72rem" lineHeight={1.45} opacity={0.7}>{win.rest}</Text>
            )}
          </Tile>
          <Tile testId="adventure-briefing-lose" bg="rgba(180,60,60,0.16)" border="rgba(229,139,139,0.45)">
            <Text {...BIG} color="#F2A3A3">YOU LOSE</Text>
            <Text fontSize="0.85rem" lineHeight={1.45} fontWeight={500}>{briefing.lose}</Text>
          </Tile>
          {briefing.threat && (
            <Tile testId="adventure-briefing-threat" bg="rgba(44,24,49,0.75)" border="rgba(231,204,152,0.25)">
              <Text {...BIG} color="brand.primary">THE THREAT TRACK</Text>
              <Text fontSize="0.78rem" lineHeight={1.5} opacity={0.9}>{briefing.threat}</Text>
            </Tile>
          )}
        </Box>
      )}

      <Box display="grid" gridTemplateColumns={{ base: "1fr", xl: `repeat(${1 + (acts ? 1 : 0) + (special.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }} gap="0.7rem" data-testid="adventure-briefing-rules">
        <Tile testId="adventure-briefing-round" bg="rgba(44,24,49,0.75)" border="rgba(231,204,152,0.2)">
          <Text {...HEAD}>{ROUND_COPY.title}</Text>
          <Text fontSize="0.78rem" lineHeight={1.5} opacity={0.9}><Rich text={ROUND_COPY.text} /></Text>
        </Tile>
        {acts && (
        <Tile testId="adventure-briefing-acts" bg="rgba(44,24,49,0.75)" border="rgba(231,204,152,0.2)">
          <Text {...HEAD}>{acts.title}</Text>
          {acts.steps.map((step, i) => (
            <Flex key={i} gap="0.55rem" align="flex-start">
              <Flex w="1.3rem" h="1.3rem" borderRadius="50%" bg="#E58B8B" color="brand.surfaceDim" fontWeight="bold" fontSize="0.7rem" align="center" justify="center" flexShrink={0}>
                {i + 1}
              </Flex>
              <Text fontSize="0.78rem" lineHeight={1.4}><Rich text={step} /></Text>
            </Flex>
          ))}
          {acts.note && <Text fontSize="0.7rem" lineHeight={1.45} opacity={0.68}>{acts.note}</Text>}
        </Tile>
        )}
        {special.length > 0 && (
          <Tile testId="adventure-briefing-special" bg="rgba(44,24,49,0.75)" border="rgba(231,204,152,0.2)">
            {special.map((s, i) => (
              <Flex key={i} direction="column" gap="0.25rem">
                <Text {...HEAD}>{s.title.toUpperCase()}</Text>
                <Text fontSize="0.78rem" lineHeight={1.5} opacity={0.9}>{s.text}</Text>
              </Flex>
            ))}
          </Tile>
        )}
      </Box>

      <Flex align="baseline" gap="1rem" p="0.7rem 1.1rem" borderRadius="12px" bg="brand.parchment" color="brand.surfaceDim" data-testid="adventure-briefing-turn" flexWrap="wrap">
        <Text fontFamily="LeagueGothic" fontSize="1.6rem" letterSpacing="0.06em" lineHeight={1} flexShrink={0}>
          {YOUR_TURN_COPY.title}
        </Text>
        <Text fontSize="0.78rem" lineHeight={1.45} flex="1" minW="12rem"><Rich text={yourTurnText(display)} /></Text>
      </Flex>
    </Flex>
  );
};

/** The dashed difficulty note (unratified engine #658 wording lives in the copy module). */
export const DifficultyNote = () =>
  DIFFICULTY_NOTE ? (
    <Box p="0.6rem 0.75rem" borderRadius="10px" border="1px dashed rgba(231,204,152,0.35)" fontSize="0.74rem" lineHeight={1.5} opacity={0.85} data-testid="adventure-difficulty">
      <Text {...HEAD} mb="0.2rem">{DIFFICULTY_NOTE.title}</Text>
      {DIFFICULTY_NOTE.text}
    </Box>
  ) : null;

/** The lobby's briefing for the scenario the setup points at (default = the server's first listing). */
export const LobbyBriefing = ({ setup }: { setup: AdventureSetup }) => {
  const { scenarios } = useScenarios();
  const scenario = scenarioFor(setup, scenarios);
  const [open, setOpen] = useState(true);
  if (!scenario) return null;
  // The setup rail is pinned; the briefing yields height to the hero roster below it.
  return (
    <Flex direction="column" gap="0.4rem" flex="none" minH={0} maxH={{ lg: "78%" }} data-testid="adventure-lobby-briefing">
      <Button
        type="button"
        variant="link"
        size="xs"
        alignSelf="flex-start"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        rightIcon={<TbChevronDown style={{ transform: open ? "rotate(180deg)" : undefined }} />}
        color="brand.accent"
        fontFamily="SpaceGrotesk"
        fontWeight="normal"
        data-testid="adventure-briefing-toggle"
      >
        {open ? "Hide briefing" : "Show briefing"}
      </Button>
      {open && (
        <Box overflowY="auto" minH={0}>
          <AdventureBriefing label={scenario.label} briefing={scenario.briefing} display={scenario.display} />
        </Box>
      )}
      <DifficultyNote />
    </Flex>
  );
};

/** The in-game "How this adventure works" modal — same briefing, from `PlayerView.scenario`. */
export const AdventureBriefingModal = ({
  isOpen,
  onClose,
  label,
  briefing,
  display,
}: {
  isOpen: boolean;
  onClose: () => void;
  label: string | null;
  briefing?: ScenarioBriefing | null;
  display?: ScenarioDisplay | null;
}) => (
  <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside" isCentered>
    <ModalOverlay />
    <ModalContent bg="brand.surfaceDim" color="brand.parchment" data-testid="adventure-rules-modal" mx="0.75rem">
      <ModalHeader fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.08em" fontSize="1.4rem">
        {BRIEFING_TITLE.toUpperCase()}
      </ModalHeader>
      <ModalCloseButton data-testid="adventure-rules-close" />
      <ModalBody pb="1.2rem">
        <AdventureBriefing label={label} briefing={briefing} display={display} compact />
      </ModalBody>
    </ModalContent>
  </Modal>
);

/** The villain-board button that opens the modal. */
export const RulesButton = ({ onClick }: { onClick: () => void }) => (
  <Button
    type="button"
    size="xs"
    variant="outline"
    onClick={onClick}
    data-testid="adventure-rules-button"
    pointerEvents="auto"
    fontFamily="SpaceGrotesk"
    fontWeight="normal"
    letterSpacing="0.06em"
    color="brand.parchment"
    borderColor="whiteAlpha.300"
    bg="rgba(20,8,24,0.72)"
    _hover={{ borderColor: "brand.accent", color: "brand.accent" }}
  >
    ? {BRIEFING_TITLE}
  </Button>
);
