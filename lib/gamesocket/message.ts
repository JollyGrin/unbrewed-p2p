import { PoolType } from "@/components/DeckPool/PoolFns";
import { PositionType } from "@/components/Positions/position.type";

export interface WebsocketMessage {
  msgtype: string;
  // The content depends on the msgtype.
  content?: GameState | PositionState;
  error: string;
}

export interface GameState {
  // gid is the Game ID
  gid: string;
  players: Record<string, PlayerState>;
  // TODO: Parse this
  last_updated: string;
}

// A single entry in a player's action feed. Carries no player name — the name
// is the key of the PlayerState it rides on. `at` is a wall-clock stamp used
// only for cross-player ordering in the feed; `seq` is a per-player monotonic
// counter that disambiguates same-millisecond entries.
export interface ActionLogEntry {
  seq: number;
  at: number;
  text: string;
}

// PlayerState can be w/e json payload the game wants to send.
// The golang backend just passes this to all clients.
export interface PlayerState {
  pool?: PoolType;
  // Shared map, carried on every player blob so any player can change it and
  // the rest of the room converges on it. mapUpdatedAt is a logical clock
  // (see WebGameProvider): higher value wins, name breaks ties. mapUrl === ""
  // means the map was explicitly cleared.
  mapUrl?: string;
  mapUpdatedAt?: number;
  // Recent actions this player took, so opponents can see otherwise-hidden
  // deck moves (scry, mill, shuffle…). A bounded ring buffer stamped onto
  // every outgoing blob (see WebGameProvider.stampLog), so it survives normal
  // pool updates and reaches late joiners.
  actionLog?: ActionLogEntry[];
  // Latest dice roll from this player, stamped onto every outgoing blob so it
  // survives pool updates and reaches late joiners. Deduped by id on inbound.
  lastRoll?: DiceRoll;
}

// A single dice roll event. Carried on the player blob like the map/actionLog,
// but treated as an event (played once) rather than convergent state: clients
// dedupe by `id` and render the newest by `at`. Every client renders the same
// predetermined `values`, so all screens land on the same faces.
export interface DiceRoll {
  id: string; // unique per roll (crypto.randomUUID()); used for dedupe
  by: string; // player name who rolled (slug.name)
  notation: string; // base notation, e.g. "2d20"
  values: number[]; // per-die results, e.g. [15, 3]
  total: number; // sum of values + modifier
  at: number; // Date.now(); newest-wins ordering + late-join seeding
}

export type PositionState = Record<string, PositionType>;

export const pingMessage = {
  msgtype: "ping",
};
export const pongMessage = {
  msgtype: "pong",
};
