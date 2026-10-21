import axios from "axios";
import { useLocalServerStorage } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { RefObject, useState } from "react";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { useDisclosure } from "@chakra-ui/react";

interface Props {
  gidRef: RefObject<HTMLInputElement>;
  nameRef: RefObject<HTMLInputElement>;
  /** Map picked on /connect; appended to the /game push only when set. */
  mapUrl?: string;
}

export function useCreateLobby({ gidRef, nameRef, mapUrl }: Props) {
  const router = useRouter();
  const { activeServer } = useLocalServerStorage();
  const serverURL = new URL(activeServer);

  // the useQuery loading props not working on repeat visits
  const [loading, setLoading] = useState<boolean>(false);

  const disclosure = useDisclosure();

  const { refetch } = useQuery(
    ["create-lobby"],
    async () => {
      if (!gidRef?.current?.value) return;
      const createLobbyURL = new URL(
        `/lobby/${gidRef.current.value}`,
        serverURL,
      );
      try {
        const result = await axios.get(createLobbyURL.toString());
        return result.data;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
    {
      // We manually call refetch.
      enabled: false,
      refetchOnWindowFocus: false,
      onSuccess: () => {
        // If the lobby was created, we can move to the game state and
        // connect to the websocket.
        if (!nameRef?.current || !gidRef?.current) return;
        router.push(
          "/game?name=" +
            nameRef.current.value +
            "&gid=" +
            gidRef.current.value +
            (mapUrl ? "&mapUrl=" + encodeURIComponent(mapUrl) : ""),
        );
        // The game page owns the "connected" toast (it fires on the real
        // socket open); the button spinner just ends when we navigate away.
        setLoading(false);
      },
      onError: () => {
        // if there's an error connecting, prompt the Gameserver Settings modal so they can input a new server url
        setLoading(false);
        disclosure.onOpen();
        toast.error(`Failed to connect to GameServer: \n ${activeServer}`);
      },
    },
  );

  return {
    refetch,
    loading,
    setLoading,
    disclosure,
  };
}
