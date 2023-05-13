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
  // gameState: GameState | undefined;
  gameState: WebsocketMessage | undefined;
  setPlayerState: () => ({ pool }: { pool: PoolType }) => void;
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
  const [setPlayerState, setPlayerStatefn] = useState<
    () => (ps: PlayerState) => void
  >(() => () => {});

  // This should only happen once
  useEffect(() => {
    if (!router.isReady) {
      // Wait for the router to load
      // The query params are not ready at first render:
      // https://nextjs.org/docs/pages/building-your-application/rendering/automatic-static-optimization#how-it-works
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
    const { updateMyPlayerState } = initializeWebsocket({
      name: slug.name.toString(),
      gid: slug.gid.toString(),
      connectURL: serverURL,
      onGameState: (state: string) => {
        setGameState(state);
      },
    });
    setPlayerStatefn(() => () => updateMyPlayerState);
  }, [router.isReady, slug.name, slug.gid, activeServer]);

  return (
    <WebGameContext.Provider
      value={{
        gameState:
          typeof gameState === "string"
            ? (JSON.parse(gameState) as WebsocketMessage)
            : gameState,
        // Call setPlayerState to update the player state on the serverside.
        setPlayerState: setPlayerState,
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
