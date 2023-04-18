import { DateString, HexColorString, ValidUrlString } from "@/lib/generic.type";

export type DeckImportType = {
  bgg_link: string | null;
  created_on: DateString;
  deck_first_published_on: DateString;
  deck_data: DeckImportDataType;
  deck_published: boolean;
  family_id: string;
  id: string;
  liked: boolean;
  likes: Number;
  name: string;
  note: string;
  published: boolean;
  published_on: DateString;
  tags: string[];
  updated_on: DateString;
  user: string;
  version_id: string;
  version_name: string;
  versions: DeckImportVersionType[];
};

export type DeckImportDataType = {
  appearance: DeckImportAppearanceType;
  cards: DeckImportCardType[];
  extraCharacters: [];
  hero: DeckImportHeroType;
  sidekick: DeckImportSidekickType;
  name: string;
  ruleCards: DeckImportRuleCardType[];
};

export type DeckImportAppearanceType = {
  borderColour: HexColorString;
  cardbackUrl: string;
  highlightColour: HexColorString;
  isPNP: boolean;
  patternName: string;
};

export type DeckImportCardType = {
  afterText: string | null;
  basicText: string | null;
  boost: number;
  characterName: string;
  duringText: string | null;
  imageUrl: ValidUrlString;
  immediateText: string | null;
  quantity: number;
  title: string;
  type: string;
  value: number | null;
};

export type DeckImportHeroType = {
  hp: number;
  isRanged: boolean;
  move: number;
  name: string;
  specialAbility: string;
  quote?: string;
};

export type DeckImportSidekickType = Omit<
  DeckImportHeroType,
  "hp" | "specialAbility" | "move"
> & {
  hp: number | null;
  quantity: number | null;
};

export type DeckImportRuleCardType = {
  content: string;
  title: string;
};

export type DeckImportVersionType = {
  created_on: DateString;
  id: string;
  name: string;
  published: boolean;
  updated_on: DateString;
  version_name: string;
};
