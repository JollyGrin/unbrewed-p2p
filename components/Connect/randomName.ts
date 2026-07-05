const ADJECTIVES = [
  "Silent",
  "Brave",
  "Clever",
  "Swift",
  "Fierce",
  "Mighty",
  "Bold",
  "Quiet",
  "Sneaky",
  "Lucky",
  "Gentle",
  "Wild",
  "Sharp",
  "Grim",
  "Jolly",
  "Nimble",
  "Proud",
  "Rusty",
  "Shiny",
  "Cosmic",
];

const NOUNS = [
  "Fox",
  "Wolf",
  "Falcon",
  "Tiger",
  "Otter",
  "Raven",
  "Panther",
  "Shark",
  "Eagle",
  "Badger",
  "Lynx",
  "Cobra",
  "Griffin",
  "Phoenix",
  "Dragon",
  "Hawk",
  "Bear",
  "Puma",
  "Viper",
  "Comet",
];

const ADVERBS = [
  "Boldly",
  "Quickly",
  "Quietly",
  "Fiercely",
  "Wildly",
  "Bravely",
  "Cleverly",
  "Swiftly",
  "Gently",
  "Sneakily",
  "Proudly",
  "Nimbly",
  "Grimly",
  "Jollily",
  "Rustily",
  "Shinily",
];

const VERBS = [
  "Dashing",
  "Roaring",
  "Lurking",
  "Soaring",
  "Prowling",
  "Charging",
  "Drifting",
  "Blazing",
  "Vaulting",
  "Sprinting",
  "Diving",
  "Gliding",
  "Striking",
  "Rushing",
  "Storming",
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Generates a readable "Adjective-Noun" or "Adverb-Verb" name, e.g. "Silent-Fox". */
export function generateRandomName(): string {
  if (Math.random() < 0.5) {
    return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
  }
  return `${pick(ADVERBS)}-${pick(VERBS)}`;
}
