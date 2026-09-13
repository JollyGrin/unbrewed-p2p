import { AxiosError } from "axios";

import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { DEFAULT_DECK_API, EVERGREEN_DECK_IDS } from "@/lib/evergreenDecks";

import {
  irlDeckArtUrls,
  irlDeckJsonUrl,
  irlWorkerUrl,
  isOfflineError,
  workerCommit,
} from "./irlOffline";

const deck = {
  id: "lQz7",
  sourceUrl: "https://unmatched.cards/decks/lQz7",
  deck_data: {
    appearance: { cardbackUrl: "https://i.imgur.com/back.jpg" },
    cards: [
      { title: "A", imageUrl: "https://i.imgur.com/a.jpg" },
      { title: "B", imageUrl: "https://i.imgur.com/a.jpg", cardBackUrl: "/cardbacks/b.webp" },
      { title: "C", imageUrl: "", cardImage: { url: "https://ibb.co/sheet.png", cols: 10 } },
    ],
    hero: { name: "Victor", tokenImageUrl: "https://arweave.net/token" },
    extraCharacters: [{ hero: { tokenImageUrl: "https://arweave.net/monster" } }],
    ruleCards: [{ title: "Rule", text: "https://not-an-image-key.example" }],
  },
} as unknown as DeckImportType;

describe("irlDeckArtUrls", () => {
  it("collects every art URL in deck_data, once, and nothing outside it", () => {
    expect(irlDeckArtUrls(deck).sort()).toEqual(
      [
        "/cardbacks/b.webp",
        "https://arweave.net/monster",
        "https://arweave.net/token",
        "https://i.imgur.com/a.jpg",
        "https://i.imgur.com/back.jpg",
        "https://ibb.co/sheet.png",
      ].sort(),
    );
  });
});

describe("irlDeckJsonUrl", () => {
  it("points where fetchDeckById looks first", () => {
    const evergreen = [...EVERGREEN_DECK_IDS][0];
    expect(irlDeckJsonUrl(evergreen)).toBe(`/evergreen-decks/${evergreen}.json`);
    expect(irlDeckJsonUrl("lQz7")).toBe(`${DEFAULT_DECK_API}lQz7`);
  });
});

describe("worker URL", () => {
  it("carries the commit as the cache version, and a dev flag under next dev", () => {
    expect(irlWorkerUrl("e7d2692", false)).toBe("/irl-sw.js?v=e7d2692");
    expect(irlWorkerUrl("e7d2692", true)).toBe("/irl-sw.js?v=e7d2692&dev=1");
    expect(workerCommit("https://unbrewed.xyz/irl-sw.js?v=e7d2692")).toBe("e7d2692");
    expect(workerCommit("not a url")).toBeNull();
  });
});

describe("isOfflineError", () => {
  it("is a request with no answer, not a bad deck id", () => {
    const noAnswer = new AxiosError("Network Error", "ERR_NETWORK");
    const notFound = new AxiosError("404", "ERR_BAD_REQUEST", undefined, undefined, {
      status: 404,
    } as never);
    expect(isOfflineError(noAnswer)).toBe(true);
    expect(isOfflineError(notFound)).toBe(false);
    expect(isOfflineError(new Error("boom"))).toBe(false);
  });
});
