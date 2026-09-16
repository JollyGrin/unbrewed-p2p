/**
 * Dock rows that choose a card (mobile step 2): boosting a move, committing an
 * attack or defense card, discarding to the hand limit. On phones these render
 * as card faces to pick from instead of "Commit Clobber (3/2)" text rows.
 */
import type { Action, CardInstanceId } from "./protocol";

type CardChoiceType = "BOOST_MOVE" | "COMMIT_ATTACK_CARD" | "COMMIT_DEFENSE_CARD" | "DISCARD_TO_LIMIT";

const TITLES: Record<CardChoiceType, string> = {
  BOOST_MOVE: "Boost your move",
  COMMIT_ATTACK_CARD: "Choose your attack card",
  COMMIT_DEFENSE_CARD: "Choose your defense card",
  DISCARD_TO_LIMIT: "Discard down to your hand limit",
};

export interface CardChoice {
  card: CardInstanceId;
  /** every legal action for this card, e.g. a face-down and a face-up commit */
  actions: Action[];
}

export interface CardChoiceGroup {
  type: CardChoiceType;
  title: string;
  cards: CardChoice[];
}

const cardOf = (action: Action): { type: CardChoiceType; card: CardInstanceId } | null =>
  action.type in TITLES && "card" in action ? { type: action.type as CardChoiceType, card: action.card } : null;

export const isCardChoice = (action: Action): boolean => cardOf(action) !== null;

export function cardChoiceGroups(actions: Action[]): CardChoiceGroup[] {
  return actions.reduce<CardChoiceGroup[]>((groups, action) => {
    const choice = cardOf(action);
    if (!choice) return groups;
    const group = groups.find((g) => g.type === choice.type);
    if (!group) return [...groups, { type: choice.type, title: TITLES[choice.type], cards: [{ card: choice.card, actions: [action] }] }];
    const existing = group.cards.find((c) => c.card === choice.card);
    const cards = existing
      ? group.cards.map((c) => (c === existing ? { ...c, actions: [...c.actions, action] } : c))
      : [...group.cards, { card: choice.card, actions: [action] }];
    return groups.map((g) => (g === group ? { ...g, cards } : g));
  }, []);
}
