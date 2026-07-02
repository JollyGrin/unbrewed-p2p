import { HexColorString } from "@/lib/generic.type";

export type PopularDeckMeta = {
  id: string;
  name: string;
  hero: string;
  author: string;
  likes: number;
  highlightColour: HexColorString;
  cardbackUrl?: string;
};

/**
 * Most-liked community decks on unmatched.cards.
 * Snapshot taken 2026-07-02 — refresh occasionally via
 * https://unmatched.cards/api/decks?sortBy=likes&sortDesc=true&perPage=40
 */
export const POPULAR_DECKS: PopularDeckMeta[] = [
  {
    id: "lDOM",
    name: "The Mandalorian",
    hero: "The Mandalorian",
    author: "msw7c",
    likes: 144,
    highlightColour: "#408080",
    cardbackUrl: "https://i.imgur.com/Hl5FPM6.png"
  },
  {
    id: "LmYw",
    name: "John Wick",
    hero: "john wick",
    author: "Drakmorten",
    likes: 137,
    highlightColour: "#121311",
    cardbackUrl: "https://i.ibb.co/C9MzW1w/Card-Back-Red-1-1.jpg"
  },
  {
    id: "lB-k",
    name: "The Devil",
    hero: "The Devil",
    author: "BennyBoyBl",
    likes: 126,
    highlightColour: "#831000",
    cardbackUrl: "https://i.postimg.cc/JhQqH9jS/Untitled-Artwork-15.jpg"
  },
  {
    id: "G_nr",
    name: "Schrödinger's Cat",
    hero: "Schrödinger's Cat",
    author: "Darthcauley",
    likes: 112,
    highlightColour: "#65a498",
    cardbackUrl: "https://i.imgur.com/cRqgolk.png"
  },
  {
    id: "lQz7",
    name: "Victor Frankenstein",
    hero: "victor frankenstein",
    author: "this_is_Marko",
    likes: 110,
    highlightColour: "#cac41c",
    cardbackUrl: "https://i.imgur.com/NY00l5g.png"
  },
  {
    id: "zPmA",
    name: "Death (Puss in Boots)",
    hero: "Death",
    author: "Jowee",
    likes: 96,
    highlightColour: "#860001",
    cardbackUrl: "https://i.imgur.com/NhatNHz.png"
  },
  {
    id: "l91K",
    name: "Darth Vader",
    hero: "Darth Vader",
    author: "TAYTERTOTS",
    likes: 93,
    highlightColour: "#828282",
    cardbackUrl: "https://imgur.com/oRLcls0.jpeg"
  },
  {
    id: "ddZY",
    name: "Goldhorn",
    hero: "GOLDHORN",
    author: "Lusk",
    likes: 81,
    highlightColour: "#7bcebb",
    cardbackUrl: "https://i.imgur.com/WKLfZVU.png"
  },
  {
    id: "LWNZ",
    name: "Gingerbread man",
    hero: "gingerbread man",
    author: "TAYTERTOTS",
    likes: 75,
    highlightColour: "#ab224b",
    cardbackUrl: "https://imgur.com/uiwaAGu.jpeg"
  },
  {
    id: "p1Ew",
    name: "The Flash",
    hero: "The Flash",
    author: "uplankton",
    likes: 69,
    highlightColour: "#b80000",
    cardbackUrl: "https://i.imgur.com/VXHO1vC.jpg"
  },
  {
    id: "RnYZ",
    name: "Jason Voorhees",
    hero: "Jason Voorhees",
    author: "JackNorth",
    likes: 68,
    highlightColour: "#7a0000",
    cardbackUrl: "http://cloud-3.steamusercontent.com/ugc/2000216344332403958/3EEC5D45ABD6E694B5D8B6E095DF485FA3BE08CB/"
  },
  {
    id: "J9En",
    name: "The Batman",
    hero: "The Batman",
    author: "uplankton",
    likes: 64,
    highlightColour: "#bb0707",
    cardbackUrl: "https://i.imgur.com/zTvbjVr.jpg"
  },
  {
    id: "vrKW",
    name: "Deku",
    hero: "Deku",
    author: "DreamCarver",
    likes: 63,
    highlightColour: "#67daa1",
    cardbackUrl: "https://i.imgur.com/oIgIu6J.jpg"
  },
  {
    id: "kdKM",
    name: "King Kong",
    hero: "King Kong",
    author: "Blakpantha",
    likes: 63,
    highlightColour: "#973434"
    // cardback image on imgur is dead — tile falls back to the highlight colour
  },
  {
    id: "XjyQ",
    name: "The Predator",
    hero: "The Predator",
    author: "JackNorth",
    likes: 59,
    highlightColour: "#07220b",
    cardbackUrl: "https://i.imgur.com/Ov0kDih.png"
  },
  {
    id: "L53Q",
    name: "King Solomon",
    hero: "King Solomon",
    author: "Blakpantha",
    likes: 58,
    highlightColour: "#006d8f",
    cardbackUrl: "https://i.imgur.com/pyGVkMb.png"
  },
  {
    id: "yAJ-",
    name: "Baba Yaga",
    hero: "Baba Yaga",
    author: "Idan",
    likes: 56,
    highlightColour: "#6f7a66",
    cardbackUrl: "https://imgur.com/E4lqW1b.png"
  },
  {
    id: "L6Z1",
    name: "The Rocketeer",
    hero: "Rocketeer",
    author: "Busy_Mason",
    likes: 55,
    highlightColour: "#753100",
    cardbackUrl: "https://i.ibb.co/C0JwhDz/Card-Backs-1-1.png"
  },
  {
    id: "Jr21",
    name: "Voldemort (The Wizarding World)",
    hero: "Voldemort",
    author: "AndSushi",
    likes: 53,
    highlightColour: "#0f4d1f",
    cardbackUrl: "https://i.imgur.com/66aic7o.png"
  },
  {
    id: "kW1k",
    name: "The Terminator",
    hero: "THE TERMINATOR",
    author: "Hubaris",
    likes: 53,
    highlightColour: "#051a29",
    cardbackUrl: "https://i.ibb.co/tXMx6Hg/image-2021-08-06-004421.png"
  },
  {
    id: "72Dz",
    name: "Pinocchio",
    hero: "Pinocchio",
    author: "Darthcauley",
    likes: 51,
    highlightColour: "#b73e15",
    cardbackUrl: "https://i.imgur.com/0iGmQ3K.png"
  },
  {
    id: "pkW2",
    name: "One Punch Man",
    hero: "One Punch Man",
    author: "uplankton",
    likes: 51,
    highlightColour: "#f9d834",
    cardbackUrl: "https://i.imgur.com/eiwFvLl.png"
  },
  {
    id: "RD78",
    name: "Headless Horseman",
    hero: "Headless Horseman",
    author: "Tsak",
    likes: 48,
    highlightColour: "#e26403",
    cardbackUrl: "https://i.imgur.com/NDIe8vr.png"
  },
  {
    id: "-2n5",
    name: "Sans",
    hero: "Sans",
    author: "DreamCarver",
    likes: 46,
    highlightColour: "#3657ae",
    cardbackUrl: "https://i.imgur.com/DPOixgv.png"
  },
  {
    id: "Rj5Q",
    name: "The Juggernaut",
    hero: "JUGGERNAUT",
    author: "JackNorth",
    likes: 45,
    highlightColour: "#8a0000",
    cardbackUrl: "https://i.imgur.com/wTp8apa.png"
  },
  {
    id: "-n3G",
    name: "Hannibal Lecter",
    hero: "Hannibal",
    author: "Indubitably14",
    likes: 44,
    highlightColour: "#590f09",
    cardbackUrl: "https://i.ibb.co/x1wMq0J/f951f04e0be5a4f5dbbc6c335023c142.jpg"
  },
  {
    id: "JwQ_",
    name: "Doctor Who",
    hero: "The Doctor",
    author: "Blakpantha",
    likes: 43,
    highlightColour: "#236aa4",
    cardbackUrl: "https://i.imgur.com/iudfbbC.png"
  },
  {
    id: "7Gq2",
    name: "Beowulf (The Bro Edition)",
    hero: "Beowulf",
    author: "DreamCarver",
    likes: 42,
    highlightColour: "#607874",
    cardbackUrl: "https://i.imgur.com/wsRXA6V.png"
  },
  {
    id: "6G31",
    name: "Ghostface",
    hero: "GHOSTFACE (2x)",
    author: "Hubaris",
    likes: 42,
    highlightColour: "#141414",
    cardbackUrl: "https://i.ibb.co/MpMPP8X/image-2021-11-23-142516.png"
  },
  {
    id: "pWdg",
    name: "Darth Vader",
    hero: "DARTH VADER",
    author: "JackNorth",
    likes: 41,
    highlightColour: "#121212",
    cardbackUrl: "https://i.imgur.com/xEKFZSN.png"
  }
];
