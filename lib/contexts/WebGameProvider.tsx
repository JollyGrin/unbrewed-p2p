import {
  useEffect,
  useState,
  createContext,
  PropsWithChildren,
  FC,
  useContext,
} from "react";
import {
  PlayerState,
  GameState,
  WebsocketMessage,
} from "../gamesocket/message";
import { initializeWebsocket } from "../gamesocket/socket";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { PoolType } from "@/components/DeckPool/PoolFns";
import { useLocalServerStorage } from "../hooks";

interface WebGameProviderValue {
  gameState: WebsocketMessage | undefined;
  gamePositions: WebsocketMessage | undefined;
  setPlayerState: () => ({ pool }: { pool: PoolType }) => void;
  setPlayerPosition: () => (props: any) => void;
}

export const WebGameContext = createContext<WebGameProviderValue | undefined>(
  undefined
);

export const WebGameProvider: FC<PropsWithChildren> = ({ children }) => {
  const router = useRouter();
  const slug = router.query;

  const { activeServer, defaultServer } = useLocalServerStorage();

  // gameState is updated from the websocket return.
  const [gameState, setGameState] = useState<string>();
  const [gamePositions, setGamePositions] = useState<string>();
  const [setPlayerState, setPlayerStatefn] = useState<
    () => (ps: PlayerState) => void
  >(() => () => {});

  const [setPlayerPosition, setPlayerPositionFn] = useState<
    () => (pos: number[]) => void
  >(() => () => {});

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

    // This serverURL should come from somewhere else.
    // const serverURL = new URL("http://localhost:1111");
    const serverURL = new URL(activeServer);
    const { updateMyPlayerState, updateMyPlayerPosition } = initializeWebsocket(
      {
        name: slug.name.toString(),
        gid: slug.gid.toString(),
        connectURL: serverURL,
        onGameState: (state: string) => {
          setGameState(state);
        },
      }
    );

    setPlayerStatefn(() => () => updateMyPlayerState);
    setPlayerPositionFn(() => () => updateMyPlayerPosition);
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
