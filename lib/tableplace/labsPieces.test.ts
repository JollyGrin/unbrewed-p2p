import { describe, expect, it } from "@jest/globals";
import brigade from "@/lib/labs/fixtures/set-by-slug.dumbass-brigade.json";
import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import pink from "@/lib/labs/fixtures/set-by-slug.pink-panther.json";
import brigadeSave from "@/lib/labs/fixtures/tts-save.dumbass-brigade.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import pinkSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import { buildLabsImport, parseLabsTtsSave } from "@/lib/labs";
import type { LabsSetRow } from "@/lib/labs";
import { labsComponentTokens } from "@/lib/labs/components";
import { composeTable } from "./composeTable";
import { deckToPlayerPack, type PlayerPiece } from "./deckToPack";

const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const PINK_ID = "char_dc1ed800-ebe2-4eeb-9487-97e15a7ac956";
const NIGHT_STAR_ID = "char_ab6975bf-5c5a-461a-8d54-76252f2acc59";

const LUCY = (lucy as unknown as LabsSetRow[])[0];
const labsDeck = (row: unknown, save: unknown, id: string) =>
  buildLabsImport(
    {
      row: (row as LabsSetRow[])[0],
      ttsModels: parseLabsTtsSave(save),
    },
    id,
  ).deck;
const lucyDeck = () => labsDeck(lucy, lucySave, LUCY_ID);
const pinkDeck = () => labsDeck(pink, pinkSave, PINK_ID);

// the real Labs resolver answer on /table: nothing
const noFaces = () => null;
const summary = (pieces: PlayerPiece[]) =>
  pieces.map(({ role, piece, value }) => ({
    role,
    kind: piece.kind,
    name: piece.name,
    image: !!piece.imageUrl,
    ...(piece.states ? { states: piece.states.length } : {}),
    ...(piece.maxValue !== undefined ? { max: piece.maxValue } : {}),
    ...(value !== undefined ? { value } : {}),
  }));
const sheetOf = (ref: string) => JSON.parse(ref.replace(/^sheet:/, ""));

describe("Labs pieces on the real payloads", () => {
  it("Lucy & Piper: dial-faced HP counters, three two-sided tokens, nothing else", () => {
    const r = deckToPlayerPack(lucyDeck(), { faces: noFaces });
    expect(r.notes).toEqual([]);
    expect(summary(r.pieces)).toEqual([
      {
        role: "hp",
        kind: "counter",
        name: "Lucy",
        image: true,
        max: 12,
        value: 12,
      },
      // Labs figures with a 3D model are never imported: the fighters stay discs
      { role: "fighter", kind: "token", name: "Lucy", image: false },
      {
        role: "hp",
        kind: "counter",
        name: "Piper",
        image: true,
        max: 10,
        value: 10,
      },
      { role: "fighter", kind: "token", name: "Piper", image: false },
      {
        role: "token",
        kind: "token",
        name: "frisbee token",
        image: true,
        states: 2,
      },
      {
        role: "token",
        kind: "token",
        name: "ball token",
        image: true,
        states: 2,
      },
      {
        role: "token",
        kind: "token",
        name: "wubba token",
        image: true,
        states: 2,
      },
    ]);
  });

  it("a counter shows the dial face: the first cell of the dial sheet", () => {
    const deck = lucyDeck();
    const r = deckToPlayerPack(deck, { faces: noFaces });
    const dial = deck.savedTokens!.find((t) => t.label === "Lucy")!;
    const hp = r.pieces.find((p) => p.role === "hp")!;
    expect(sheetOf(hp.piece.imageUrl!)).toEqual({
      url: dial.imageUrl,
      ...dial.sheet,
    });
  });

  it("a two-sided piece carries its back as the second state", () => {
    const r = deckToPlayerPack(lucyDeck(), { faces: noFaces });
    const frisbee = r.pieces.find((p) => p.piece.name === "frisbee token")!;
    const [front, back] = frisbee.piece.states!.map((s) => sheetOf(s.face));
    expect(front).toMatchObject({ cols: 2, rows: 1, index: 0 });
    expect(back).toEqual({ ...front, index: 1 });
    expect(frisbee.piece.imageUrl).toBe(frisbee.piece.states![0].face);
  });

  it("Pink Panther: dial-faced counters and the Labs figure / token art on the fighters", () => {
    const deck = pinkDeck();
    const r = deckToPlayerPack(deck, { faces: noFaces });
    expect(summary(r.pieces)).toEqual([
      {
        role: "hp",
        kind: "counter",
        name: "Pink Panther",
        image: true,
        max: 14,
        value: 14,
      },
      { role: "fighter", kind: "token", name: "Pink Panther", image: true },
      {
        role: "hp",
        kind: "counter",
        name: "Inspector clouseau",
        image: true,
        max: 6,
        value: 6,
      },
      {
        role: "fighter",
        kind: "token",
        name: "Inspector clouseau",
        image: true,
      },
    ]);
    const art = (name: string) =>
      sheetOf(
        r.pieces.find((p) => p.role === "fighter" && p.piece.name === name)!
          .piece.imageUrl!,
      ).url;
    const byFighter = new Map(
      deck.labsComponents!.map((c) => [c.fighter, c.url]),
    );
    expect(art("Pink Panther")).toBe(byFighter.get("hero"));
    expect(art("Inspector clouseau")).toBe(byFighter.get("sidekick"));
  });

  it("The Night Star: three labelled two-sided pieces", () => {
    const deck = labsDeck(brigade, brigadeSave, NIGHT_STAR_ID);
    const r = deckToPlayerPack(deck, { faces: noFaces });
    const tokens = r.pieces.filter((p) => p.role === "token");
    expect(tokens.map((p) => [p.piece.name, p.piece.states?.length])).toEqual([
      ["Thirst for Combat", 2],
      ["Thrill of Adventure", 2],
      ["Scent of Open Seas", 2],
    ]);
  });

  it("a free dial is one counter with the dial face, its value and its max", () => {
    // Piper's dial, imported without Piper as a second fighter, is a free dial
    const set = LUCY.document.set;
    const hero = set.characters.find((c) => c.id === LUCY_ID)!;
    const free = labsComponentTokens(set, hero, parseLabsTtsSave(lucySave));
    const deck = lucyDeck();
    deck.savedTokens = free.tokens;
    deck.labsComponents = free.record;
    deck.deck_data.extraCharacters = [];
    const piper = free.tokens.find((t) => t.label === "Piper")!;
    expect(piper.counter).toEqual({ value: 10, min: 0, max: 10 });

    const r = deckToPlayerPack(deck, { faces: noFaces });
    const piperPieces = r.pieces.filter((p) =>
      p.piece.name.startsWith("Piper"),
    );
    expect(summary(piperPieces)).toEqual([
      {
        role: "token",
        kind: "counter",
        name: "Piper",
        image: true,
        max: 10,
        value: 10,
      },
    ]);
    expect(r.notes).toEqual([]);
  });

  it("notes a free dial whose range does not start at 0", () => {
    const deck = lucyDeck();
    const piper = deck.savedTokens!.find((t) => t.label === "Piper")!;
    piper.counter = { value: 5, min: 2, max: 10 };
    const r = deckToPlayerPack(deck, { faces: noFaces });
    expect(
      r.pieces.find((p) => p.role === "token" && p.piece.name === "Piper"),
    ).toMatchObject({
      piece: { kind: "counter", maxValue: 10 },
      value: 5,
    });
    expect(r.notes).toEqual([
      "Piper: table.place counters start at 0, not at the dial's 2",
    ]);
  });

  it("a plain detached counter on a piece is still a token plus a counter", () => {
    const deck = lucyDeck();
    deck.savedTokens!.find((t) => t.label === "ball token")!.counter = {
      value: 3,
    };
    const r = deckToPlayerPack(deck, { faces: noFaces });
    expect(
      summary(r.pieces.filter((p) => p.piece.name.startsWith("ball token"))),
    ).toEqual([
      {
        role: "token",
        kind: "token",
        name: "ball token",
        image: true,
        states: 2,
      },
      {
        role: "token-counter",
        kind: "counter",
        name: "ball token counter",
        image: false,
        max: 99,
        value: 3,
      },
    ]);
  });

  it("composes Lucy vs Pink Panther with every piece placed", () => {
    const { body, skipped } = composeTable({
      seats: [lucyDeck(), pinkDeck()],
      map: {
        imageUrl: "https://example.test/map.png",
        width: 1600,
        height: 1200,
      },
      faces: noFaces,
      mapDef: null,
    });
    expect(skipped).toEqual([]);
    const names = body!.packs
      .slice(0, 2)
      .map((p) => p.pieces!.map((x) => x.name));
    expect(names[0]).toEqual([
      "Lucy",
      "Piper",
      "Lucy",
      "Piper",
      "frisbee token",
      "ball token",
      "wubba token",
    ]);
    expect(names[1]).toEqual([
      "Pink Panther",
      "Inspector clouseau",
      "Pink Panther",
      "Inspector clouseau",
    ]);
  });
});
