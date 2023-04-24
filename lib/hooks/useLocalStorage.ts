import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DeckImportDataType } from "@/components/DeckPool/deck-import.type";
import { useEffect, useState } from "react";

export const LS_KEY = {
  DECKS: "DECKS",
  STAR_DECK: "STAR_DECK_ID",
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
