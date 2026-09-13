/**
 * Edge probes for the client-owned self blob (issue #496, lib/sandbox/ownBlob.ts):
 * the cases where the `rev` gate on my own echo could wrongly reject a
 * legitimate change, or where the held pre-replay send could misbehave. Same
 * harness as lib/contexts/WebGameProvider.test.tsx (socket / router / hooks
 * mocked, frames driven by hand).
 */
import { act, render } from "@testing-library/react";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { ConnectionStatus, WebsocketProps } from "@/lib/gamesocket/socket";

const ME = "alice";
const OPP = "bob";

let socket: WebsocketProps;
const sendState = jest.fn<void, [PlayerState]>();
const sendPosition = jest.fn<void, [unknown]>();

jest.mock("../../lib/gamesocket/socket", () => ({
  initializeWebsocket: (props: WebsocketProps) => {
    socket = props;
    return {
      updateMyPlayerState: (s: PlayerState) => sendState(s),
      updateMyPlayerPosition: (b: unknown) => sendPosition(b),
      close: () => {},
    };
  },
}));
jest.mock("next/router", () => {
  const router = { isReady: true, query: { name: "alice", gid: "room" }, replace: jest.fn() };
  return { useRouter: () => router };
});
jest.mock("../../lib/hooks", () => ({
  useLocalServerStorage: () => ({ activeServer: "http://localhost:1111" }),
}));

const card = (title: string) =>
  ({ title, quantity: 1, boost: 1 }) as unknown as DeckImportCardType;
const [ACE, BOLT, CURE, DUSK] = ["Ace", "Bolt", "Cure", "Dusk"].map(card);
const poolWith = (hand: DeckImportCardType[], deck: DeckImportCardType[] = []) =>
  ({ hand, deck, discard: [], commit: { main: null, reveal: false, boost: null } }) as unknown as PoolType;
const titles = (cards: DeckImportCardType[] | undefined) => (cards ?? []).map((c) => c.title);

let ctx: ReturnType<typeof useWebGame>;
const Probe = () => {
  ctx = useWebGame();
  return null;
};
const mount = () => render(<WebGameProvider><Probe /></WebGameProvider>);
const deliverState = (players: Record<string, PlayerState>) =>
  act(() => {
    socket.onGameState(JSON.stringify({ msgtype: "gamestate", content: { gid: "room", players, last_updated: "" } }));
  });
const setStatus = (s: ConnectionStatus) => act(() => socket.onStatus?.(s));
const myPool = () => (ctx.gameState?.content as GameState).players[ME].pool as PoolType;
const lastSent = () => sendState.mock.calls.at(-1)?.[0];
const play0 = () =>
  act(() => {
    const pool = myPool();
    pool.hand.splice(0, 1);
    ctx.setPlayerState()({ pool });
    ctx.logAction("Placed a card face-down on the table");
  });

beforeEach(() => {
  sendState.mockClear();
  sendPosition.mockClear();
});

describe("rejoin / reload: rev seeds from the replay, never restarts at 0", () => {
  it("continues from the replayed rev and ignores its own older echoes", () => {
    mount();
    setStatus("open");
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]), rev: 57 } as PlayerState });
    play0();
    expect(sendState.mock.calls.map(([s]) => s.rev)).toEqual([58, 59]);
    // echoes of my pre-play blob (rev 57) and of the play itself (58, 59)
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]), rev: 57 } as PlayerState, [OPP]: { pool: poolWith([DUSK]) } });
    expect(titles(myPool().hand)).toEqual(["Bolt"]);
    deliverState({ [ME]: { pool: poolWith([BOLT]), rev: 59 } as PlayerState });
    expect(titles(myPool().hand)).toEqual(["Bolt"]);
  });
});

describe("remote changes that must get through the gate", () => {
  it("another player's committed reset (#499) still wipes me", () => {
    mount();
    setStatus("open");
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]) }, [OPP]: { pool: poolWith([DUSK]) } });
    sendState.mockClear();
    // bob committed epoch 1 (his blob advertises it); I have a pool → wipe
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]) }, [OPP]: { pool: poolWith([DUSK]), resetEpoch: 1 } as PlayerState });
    const sent = lastSent();
    expect(sent?.resetEpoch).toBe(1);
    // no starred deck in jsdom → the rebuilt pool is undefined; the point is
    // that the wipe was applied and broadcast, not blocked by the rev gate
    expect(titles(sent?.pool?.hand)).toEqual([]);
    expect(ctx.resetStatus.epoch).toBe(1);
  });

  it("a card handed to me lands in my committed hand and is acked", () => {
    mount();
    setStatus("open");
    deliverState({ [ME]: { pool: poolWith([ACE]) }, [OPP]: { pool: poolWith([DUSK]) } });
    sendState.mockClear();
    deliverState({
      [ME]: { pool: poolWith([ACE]) },
      [OPP]: {
        pool: poolWith([DUSK]),
        pendingTransfers: [{ id: "bob#give1", from: OPP, to: ME, card: CURE, zone: "hand", createdAt: 1 }],
      } as PlayerState,
    });
    expect(titles(myPool().hand)).toEqual(["Ace", "Cure"]);
    expect(titles(lastSent()?.pool?.hand)).toEqual(["Ace", "Cure"]);
    expect(lastSent()?.appliedTransfers).toEqual(["bob#give1"]);
    // my own stale echo (pre-transfer) must not undo it
    deliverState({ [ME]: { pool: poolWith([ACE]) }, [OPP]: { pool: poolWith([DUSK]) } });
    expect(titles(myPool().hand)).toEqual(["Ace", "Cure"]);
  });

  it("a second tab under my name: its newer write is adopted, mine continues after it", () => {
    mount();
    setStatus("open");
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]), rev: 10 } as PlayerState });
    // other tab drew (rev 11)
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT, CURE]), rev: 11 } as PlayerState });
    expect(titles(myPool().hand)).toEqual(["Ace", "Bolt", "Cure"]);
    play0();
    expect(lastSent()?.rev).toBe(13);
    expect(titles(lastSent()?.pool?.hand)).toEqual(["Bolt", "Cure"]);
  });
});

describe("held pre-replay send", () => {
  it("fresh joiner whose hand-init fires before the replay: the held pool goes out first", () => {
    mount();
    setStatus("open");
    act(() => ctx.setPlayerState()({ pool: poolWith([ACE]) })); // the 500ms auto-init
    act(() => ctx.logAction("Drew a card")); // a later pool-less hold keeps it
    expect(sendState).not.toHaveBeenCalled();
    deliverState({ [ME]: {} }); // relay's placeholder for a new player
    // The replay has no pool, so the held one is the first (and only) update.
    expect(sendState).toHaveBeenCalledTimes(1);
    expect(lastSent()?.rev).toBe(1);
    expect(titles(lastSent()?.pool?.hand)).toEqual(["Ace"]);
    expect(titles(myPool().hand)).toEqual(["Ace"]);
  });

  it("rejoiner whose hand-init fires before the replay: the replayed pool wins", () => {
    mount();
    setStatus("open");
    act(() => ctx.setPlayerState()({ pool: poolWith([CURE]) })); // would clobber
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]), rev: 4 } as PlayerState });
    expect(titles(lastSent()?.pool?.hand)).toEqual(["Ace", "Bolt"]);
    expect(lastSent()?.rev).toBe(5);
  });
});
