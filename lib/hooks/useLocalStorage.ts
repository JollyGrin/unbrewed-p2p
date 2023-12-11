import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckImportDataType } from "@/components/DeckPool/deck-import.type";
import { useEffect, useState } from "react";

export const LS_KEY = {
  DECKS: "DECKS",
  STAR_DECK: "STAR_DECK_ID",
  SERVER_ACTIVE: "SERVER_ACTIVE",
  SERVER_LIST: "SERVER_LIST",
};

export const useLocalServerStorage = () => {
  const defaultServer = "http://localhost:1111";
  const [activeServer, setActiveServer] = useState<string>(defaultServer);
  const [serverList, setServerList] = useState<string[]>([]);

  useEffect(() => {
    const localActiveServer: string | null = localStorage.getItem(
      LS_KEY.SERVER_ACTIVE
    );
    const localServerList: string | null = localStorage.getItem(
      LS_KEY.SERVER_LIST
    );
    if (localActiveServer) {
      setActiveServer(localActiveServer);
    }
    if (localServerList) {
      setServerList(JSON.parse(localServerList));
    } else {
      setServerList([defaultServer]);
    }
  }, []);

  const setActive = (server: string) => {
    const urlRegexPattern = new RegExp(
      "^https?:\\/\\/[a-z0-9-]+(\\.[a-z0-9-]+)+([/?].*)?$",
      "i"
    );
    const isUrl = urlRegexPattern.test(server);
    if (!isUrl && server !== "http://localhost:1111") {
      alert("Not a valid url");
      return;
    }

    localStorage.setItem(LS_KEY.SERVER_ACTIVE, server);
    if (!serverList.includes(server)) {
      localStorage.setItem(
        LS_KEY.SERVER_LIST,
        JSON.stringify([...serverList, server])
      );
    }

    setActiveServer(server);
  };

  const setList = (servers: string[]) => {
    localStorage.setItem(LS_KEY.SERVER_LIST, JSON.stringify(servers));
    setServerList(servers);
  };

  return {
    activeServer,
    getLocalActiveServer: () => activeServer,
    defaultServer,
    serverList,
    setActiveServer: setActive,
    setServerList: setList,
  };
};

export const useLocalDeckStorage = () => {
  const [decks, setDecks] = useState<DeckImportType[]>();
  const [deckKb, setDeckKb] = useState<number>(0);
  const [totalKbLeft, setTotalKbLeft] = useState<number>(0);
  const [star, setStar] = useState<string>("");

  useEffect(() => {
    const localDecks: string | null = localStorage.getItem(LS_KEY.DECKS);
    if (localDecks) {
      setDecks(JSON.parse(localDecks));
    }

    var _lsTotal = 0,
      _xLen,
      _x;
    for (_x in localStorage) {
      if (!localStorage.hasOwnProperty(_x)) {
        continue;
      }
      _xLen = (localStorage[_x].length + _x.length) * 2;
      _lsTotal += _xLen;
      if (_x === LS_KEY.DECKS) {
        const kb = +(_xLen / 1024).toFixed(2);
        setDeckKb(kb);
      }
    }
    console.log("Total = " + (_lsTotal / 1024).toFixed(2) + " KB");
    setTotalKbLeft(+(_lsTotal / 1024).toFixed(2));
  }, []);

  useEffect(() => {
    const localStar = localStorage.getItem(LS_KEY.STAR_DECK);
    if (star) {
      if (star !== localStar) {
        localStorage.setItem(LS_KEY.STAR_DECK, star);
      }
    } else if (!star && localStar) {
      setStar(localStar);
    }
  }, [star]);

  const pushDeck = (data: DeckImportType) => {
    let newArray;
    if (decks) {
      newArray = [...decks, data];
    } else {
      newArray = [data];
    }
    setDecks(newArray);
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify(newArray));
  };

  const removeDeckbyId = (id: string) => {
    const newArray = decks?.filter((deck) => deck.id !== id);
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify(newArray));
    setDecks(newArray);
  };

  return {
    decks,
    deckKb,
    totalKbLeft,
    star,
    starredDeck: decks?.find((deck) => deck.id === star),
    setStar,
    pushDeck,
    removeDeckbyId,
  };
};
