import { HandContainer, ModalContainer } from "@/components/Game";
import { useLocalDeckStorage } from "@/lib/hooks";
import {
  Box,
  Button,
  Divider,
  HStack,
  Input,
  Text,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { ModalType } from "./game";
import { PoolType, newPool } from "@/components/DeckPool/PoolFns";
import { GameState, WebsocketMessage } from "@/lib/gamesocket/message";
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
  const players = gameState?.content?.players as Record<
    string,
    { pool?: PoolType }
  >;
  const playerState = players?.["offline"]?.pool;

  const [modalType, setModalType] = useState<ModalType>(false);
  const disclosure = useDisclosure();

  function setPlayerState() {
    return (props: { pool: PoolType }) => {
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

  useEffect(() => {
    if (modalType) {
      disclosure.onOpen();
    } else {
      disclosure.onClose();
    }
  }, [modalType, disclosure]);

  return (
    <>
      <ModalContainer
        {...disclosure}
        modalType={modalType}
        setModalType={setModalType}
        setPlayerState={setPlayerState}
        gameState={gameState}
      />
      <Box h="100vh" bg="brand.primary">
        <HandContainer
          setModal={setModalType}
          setPlayerState={setPlayerState}
          gameState={gameState}
        />
        <Box p="0.5rem">
          <HStack gap="0.5rem">
            <Text>{playerState?.hero?.name}</Text>
            <Text>hp:{playerState?.hero?.hp}</Text>
            <Text>move:{playerState?.hero?.move}</Text>
            <Text>{playerState?.hero?.isRanged ? "Ranged" : "Melee"}</Text>
          </HStack>
          <HStack gap="0.5rem">
            <Text>{playerState?.sidekick?.name}</Text>
            <Text>hp:{playerState?.sidekick?.hp}</Text>
            <Text>quantity:{playerState?.sidekick?.quantity}</Text>
            <Text>{playerState?.sidekick?.isRanged ? "Ranged" : "Melee"}</Text>
          </HStack>
          <Text>{playerState?.hero?.specialAbility}</Text>
          <Text>{playerState?.sidekick?.quote}</Text>
          <Divider my="1rem" />
          <HpButton state={playerState?.hero?.hp ?? 0} />
          <HpButton state={playerState?.sidekick?.hp ?? 0} />
          <HpButton state={0} />
          <HpButton state={0} />
          <HpButton state={0} />
        </Box>
      </Box>
    </>
  );
};

const HpButton = (props: { state?: number }) => {
  const [hp, setHp] = useState(props?.state ?? 0);
  return (
    <HStack my="0.25rem">
      <Button onClick={() => setHp((prev) => prev - 1)}>-</Button>
      <Input maxW="5rem" isDisabled value={hp} />
      <Button onClick={() => setHp((prev) => prev + 1)}>+</Button>
    </HStack>
  );
};

export default Offline;
