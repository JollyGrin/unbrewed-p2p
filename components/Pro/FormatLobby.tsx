import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";
import type { PlayerId } from "@/lib/pro/protocol";
import type { ProRoomInfo } from "@/lib/pro/useProSocket";
import { ALL_FORMATS, PRO_FORMATS } from "@/lib/pro/multiplayerPlaytest";
import { AdventureSetup, adventureSeats, defaultAdventureSetup, scenarioFor } from "@/lib/pro/adventureLobby";
import { useAdventureListed, useScenarios } from "@/lib/pro/adventureScenarios";

export interface FormatLobbySeatsProps<S = unknown> {
  setup: S;
  onChange: (next: S) => void;
  /** the creator's own seat plate (p1) */
  youSeat: ReactNode;
  /** the page's seat plate for another seat, so it stays identical to the other formats' */
  renderSeat: (seat: PlayerId) => ReactNode;
}

/**
 * A format's own lobby surfaces, keyed by format id — the same shape as `FormatOverlay`.
 * `S` is the format's setup state, held by the page and handed back to its components.
 */
interface FormatLobbyEntry<S> {
  initialSetup: () => S;
  /** the seats the creator can pre-fill with a bot at this setup (p1 is theirs) */
  seats: (setup: S) => PlayerId[];
  /** `CREATE_ROOM.humans` for this setup */
  humans: (setup: S) => number;
  /** the format names its own board: the lobby shows no stage picker */
  ownBoard: boolean;
  /** the format strip says what the format is (its `detail`) */
  showDetail: boolean;
  /** replaces the seat panel */
  Seats: ComponentType<FormatLobbySeatsProps<S>>;
  /** above the hero roster, while creating */
  Briefing?: ComponentType<{ setup: S }>;
  /** replaces the waiting room's "waiting for an opponent" line */
  WaitingRoom?: ComponentType<{ roomInfo: ProRoomInfo }>;
}

const adventure: FormatLobbyEntry<AdventureSetup> = {
  initialSetup: defaultAdventureSetup,
  seats: (setup) => adventureSeats(setup.humans),
  humans: (setup) => setup.humans,
  ownBoard: true,
  showDetail: true,
  Seats: dynamic(() => import("@/components/Pro/AdventureLobby").then((m) => m.AdventureLobby), { ssr: false }),
  Briefing: dynamic(() => import("@/components/Pro/AdventureBriefing").then((m) => m.LobbyBriefing), { ssr: false }),
  WaitingRoom: dynamic(() => import("@/components/Pro/AdventureWaitingRoom").then((m) => m.AdventureWaitingRoom), {
    ssr: false,
  }),
};

// `any`: each entry types its own setup; the page only hands a setup back to the entry it came from.
const LOBBIES: Record<string, FormatLobbyEntry<any>> = { adventure };

/** The format's lobby entry, or undefined for a format that uses the page's own lobby. */
export const formatLobby = (formatId?: string | null): FormatLobbyEntry<unknown> | undefined =>
  formatId ? LOBBIES[formatId] : undefined;

/** Every format's initial setup, for the page's per-format setup state. */
export const initialFormatSetups = (): Record<string, unknown> =>
  Object.fromEntries(Object.entries(LOBBIES).map(([id, e]) => [id, e.initialSetup()]));

/** The formats the lobby's FORMAT strip offers: Adventure only while the server lists a scenario. */
export const useLobbyFormats = () => (useAdventureListed() ? ALL_FORMATS : PRO_FORMATS);

/** The lobby summary's stage leg for a format that names its own board; null for the rest. */
export const useFormatStageName = (formatId: string, setup: unknown): string | null => {
  const { scenarios } = useScenarios();
  if (formatId !== "adventure") return null;
  return scenarioFor(setup as AdventureSetup, scenarios)?.label ?? "Adventure";
};

export const FormatLobbySeats = ({ formatId, ...props }: FormatLobbySeatsProps & { formatId: string }) => {
  const Seats = formatLobby(formatId)?.Seats;
  return Seats ? <Seats {...props} /> : null;
};

export const FormatLobbyBriefing = ({ formatId, setup }: { formatId: string; setup: unknown }) => {
  const Briefing = formatLobby(formatId)?.Briefing;
  return Briefing ? <Briefing setup={setup} /> : null;
};

/** true when the room's format brings its own waiting room. */
export const hasFormatWaitingRoom = (roomInfo: ProRoomInfo | null | undefined): boolean =>
  !!roomInfo && !!formatLobby(roomInfo.formatId)?.WaitingRoom;

export const FormatWaitingRoom = ({ roomInfo }: { roomInfo: ProRoomInfo }) => {
  const WaitingRoom = formatLobby(roomInfo.formatId)?.WaitingRoom;
  return WaitingRoom ? <WaitingRoom roomInfo={roomInfo} /> : null;
};
