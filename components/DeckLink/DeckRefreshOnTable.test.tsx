import { act, render } from "@testing-library/react";
import { useEffect } from "react";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { PositionBlob } from "@/components/Positions/position.type";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { DeckRefresh } from "@/lib/deckRefresh";
import { initPool, initPositionBlob } from "@/lib/sandbox/initGame";
import { DeckRefreshOnTable } from "./DeckRefreshOnTable";

jest.mock("next/router", () => ({ useRouter: () => ({ query: { name: "offline" } }) }));

const deck = (version: string, suffix: string, id = "labs-char_x"): DeckImportType =>
  ({
    id,
    family_id: id,
    version_id: version,
    name: "Marouine",
    note: "",
    user: "Labs",
    savedTokens: [{ imageUrl: `https://labs/hero-${suffix}.png`, size: 130 }],
    deck_data: {
      name: "Marouine",
      appearance: {},
      hero: { name: "Marouine", hp: 15, move: 2, isRanged: false, specialAbility: "" },
      sidekick: { name: "", hp: null, isRanged: false, quantity: 0, quote: "" },
      cards: [
        { title: "Point Blank", quantity: 3, imageUrl: `https://labs/pb-${suffix}.png`, cardImage: { url: `https://labs/pb-${suffix}.png` } },
        { title: "Marouine", quantity: 1, isCharacterCard: true, imageUrl: `https://labs/hero-${suffix}.png`, cardImage: { url: `https://labs/hero-${suffix}.png` } },
      ],
    },
  }) as any;

const A = deck("4", "a");
const B = deck("5", "b");

/** Deals `seedFrom` and seeds its board, like HandContainer and GameShell, then reports the table. */
const Table = ({ seedFrom, onTable }: { seedFrom: DeckImportType; onTable: (t: { pool?: PoolType; blob?: PositionBlob }) => void }) => {
  const { gameState, gamePositions, setPlayerState, setPlayerPosition } = useWebGame();
  useEffect(() => {
    setPlayerState()({ pool: initPool(seedFrom) });
    setPlayerPosition.current(initPositionBlob(seedFrom, "offline"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  onTable({
    pool: (gameState?.content as any)?.players?.offline?.pool,
    blob: (gamePositions?.content as any)?.offline,
  });
  return null;
};

const setup = (seedFrom: DeckImportType) => {
  let table: { pool?: PoolType; blob?: PositionBlob } = {};
  const view = (refresh?: DeckRefresh) => (
    <OfflineGameProvider>
      <Table seedFrom={seedFrom} onTable={(t) => (table = t)} />
      <DeckRefreshOnTable refresh={refresh} />
    </OfflineGameProvider>
  );
  const utils = render(view());
  return { table: () => table, refresh: (r: DeckRefresh) => act(() => utils.rerender(view(r))) };
};

it("re-faces the dealt cards and the placed hero-card token without moving or adding one", () => {
  const { table, refresh } = setup(A);
  const before = table();
  const [heroToken] = before.blob!.tokens;
  expect(heroToken.imageUrl).toBe("https://labs/hero-a.png");

  refresh({ from: A, to: B });

  const after = table();
  expect(after.blob!.tokens).toEqual([{ ...heroToken, imageUrl: "https://labs/hero-b.png" }]);
  expect(after.pool!.hand).toHaveLength(before.pool!.hand.length);
  expect(after.pool!.deck).toHaveLength(before.pool!.deck!.length);
  for (const c of [...after.pool!.hand, ...after.pool!.deck!]) {
    expect(c.imageUrl).toBe("https://labs/pb-b.png");
  }
});

it("leaves a table alone once it has switched to another deck", () => {
  const other = deck("1", "a", "some-other-deck");
  const { table, refresh } = setup(other);
  const before = table();

  refresh({ from: A, to: B });

  expect(table().pool).toBe(before.pool);
  expect(table().blob).toBe(before.blob);
});
