import {
  useEffect,
  useState,
  createContext,
  PropsWithChildren,
  FC,
  useContext,
  useRef,
  MutableRefObject,
} from "react";
import { PlayerState, WebsocketMessage } from "../gamesocket/message";
import { initializeWebsocket } from "../gamesocket/socket";
import { useRouter } from "next/router";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { useLocalServerStorage } from "../hooks";
import { PositionType } from "@/components/Positions/position.type";

interface WebGameProviderValue {
  gameState: WebsocketMessage | undefined;
  gamePositions: WebsocketMessage | undefined;
  setPlayerState: () => ({ pool }: { pool: PoolType }) => void;
  setPlayerPosition: MutableRefObject<(props: PositionType) => void>;
}

export const WebGameContext = createContext<WebGameProviderValue | undefined>(
  undefined
);

export const WebGameProvider: FC<PropsWithChildren> = ({ children }) => {
  const router = useRouter();
  const slug = router.query;

  const { activeServer } = useLocalServerStorage();

  // gameState is updated from the websocket return.
  const [gameState, setGameState] = useState<string>();
  const [gamePositions, setGamePositions] = useState<string>();

  const [setPlayerState, setPlayerStatefn] = useState<
    () => (ps: PlayerState) => void
  >(() => () => {});

  const setPlayerPosition = useRef((_: PositionType[]) => {});

  // This should only happen once
  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!slug?.name || !slug?.gid) {
      throw new Error(
        "WebGameProvider should be used inside of a page with a 'name' and 'gid' query param."
      );
    }

    const serverURL = new URL(activeServer);
    const { updateMyPlayerState, updateMyPlayerPosition } = initializeWebsocket(
      {
        name: slug.name.toString(),
        gid: slug.gid.toString(),
        connectURL: serverURL,
        onGameState: (state: string) => {
          setGameState(state);
        },
        onGamePositions: (state: string) => {
          setGamePositions(state);
        },
      }
    );

    setPlayerStatefn(() => () => updateMyPlayerState);
    setPlayerPosition.current = updateMyPlayerPosition;
    // setPlayerPositionFn(() => () => updateMyPlayerPosition);
  }, [router.isReady, slug.name, slug.gid, activeServer]);

  return (
    <WebGameContext.Provider
      value={{
        gamePositions:
          typeof gamePositions === "string"
            ? (JSON.parse(gamePositions) as WebsocketMessage)
            : gamePositions,
        gameState:
          typeof gameState === "string"
            ? (JSON.parse(gameState) as WebsocketMessage)
            : gameState,
        // Call setPlayerState to update the player state on the serverside.
        setPlayerState: setPlayerState,
        //@ts-expect-error: this type needs to remain an array. Update this when you add more tokens
        setPlayerPosition: setPlayerPosition,
      }}
    >
      {children}
    </WebGameContext.Provider>
  );
};

export const useWebGame = (): WebGameProviderValue => {
  const context = useContext(WebGameContext);

  if (!context) {
    throw new Error("useWebGame should be used inside of <WebGameProvider />");
  }

  return context;
};
