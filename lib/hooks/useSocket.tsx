import {
  useEffect,
  useState,
  createContext,
  PropsWithChildren,
  FC,
  useContext,
} from "react";
import { PlayerState, GameState } from "../gamesocket/message";
import { initializeWebsocket } from "../gamesocket/socket";

interface WebGameProviderValue {}

export const WebGameContext = createContext<WebGameProviderValue | undefined>(
  undefined
);

export const WebGameProvider: FC<PropsWithChildren> = ({ children }) => {
  // Get slugs
  // Init websocket
  return (
    <WebGameContext.Provider value={}>{{ children }}</WebGameContext.Provider>
  );
};

export const useWebGame = (): WebGameProviderValue => {
  const context = useContext(WebGameContext);

  if (!context) {
    throw new Error("useWebGame should be used inside of <WebGameProvider />");
  }

  return context;
};

export const useGameState = (name: string, gid: string) => {
  // gameState is updated from the websocket return.
  const [gameState, setGameState] = useState<GameState>();

  // This useState can probaly be removed? It is the local
  // interpretation of the playerState.
  const [_, setLocalPlayerState] = useState<PlayerState>();
  const { updateMyPlayerState } = initializeWebsocket({
    name,
    gid,
    // TODO: Handle this connect url.
    connectURL: new URL("http://localhost:1111"),
    onGameState: (state: GameState) => {
      setGameState(state);
    },
  });

  const setPlayerState = (ps: PlayerState): void => {
    updateMyPlayerState(ps);
    setLocalPlayerState(ps);
  };

  return { gameState, setPlayerState };
};
