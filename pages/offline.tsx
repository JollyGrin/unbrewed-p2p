import { HandContainer } from "@/components/Game";
import { useLocalDeckStorage } from "@/lib/hooks";
import { Box } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { ModalType } from "./game";
import { PoolType, newPool } from "@/components/DeckPool/PoolFns";
import { GameState, WebsocketMessage } from "@/lib/gamesocket/message";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { useRouter } from "next/router";

const initGamestate: GameState = {
  last_updated: "foobar",
  gid: "offline",
  players: {
    offline: { pool: undefined },
  },
};
const init: WebsocketMessage = {
  error: "",
  msgtype: "offline",
  content: initGamestate,
};

const Offline = () => {
  const { push, query } = useRouter();
  const { star, decks } = useLocalDeckStorage();
  const deck = decks?.find((deck) => deck.id === star);
  const newDeck = useMemo(() => (deck ? newPool(deck) : undefined), [deck]);

  const [gameState, setGameState] = useState<WebsocketMessage>(init);

  const [modalType, setModalType] = useState<ModalType>();

  function setPlayerState() {
    console.log("1");
    return (props: { pool: PoolType }) => {
      console.log("2");
      setGameState((prev) => ({
        ...prev,
        content: {
          ...prev.content,
          players: {
            offline: { pool: props.pool },
          },
        } as GameState,
      }));
    };
  }

  useEffect(() => {
    if (query.name) return;
    push({ query: { name: "offline" } });
  }, []);

  useEffect(() => {
    if (!newDeck) return;
    setPlayerState()({ pool: newDeck });
  }, [newDeck]);

  return (
    <Box h="100vh" bg="brand.primary">
      <HandContainer
        setModal={setModalType}
        setPlayerState={setPlayerState}
        gameState={gameState}
      />
    </Box>
  );
};

export default Offline;
