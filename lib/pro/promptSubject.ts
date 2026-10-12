/**
 * Prompt subject framing (#1409): a choose-target / choose-space / choose-option prompt names WHO
 * is acting and WHICH fighter it is about, from `ViewPrompt.subject` (engine #863). Scenario-
 * agnostic: roles come from the fighter's kind, never from an enemy id or scenario copy.
 */
import type { FighterId, PlayerView, ViewFighter } from "./protocol";

/** The fighter the open prompt is about, or null when the prompt carries no (known) subject. */
export const promptSubjectFighter = (view: PlayerView): ViewFighter | null => {
  const id = view.prompt?.subject;
  return (id && view.fighters.find((f) => f.id === id)) || null;
};

export const promptSubjectId = (view: PlayerView): FighterId | null =>
  promptSubjectFighter(view)?.id ?? null;

const roleWord = (f: ViewFighter): string | null =>
  f.enemy ? (f.enemy.role === "VILLAIN" ? "villain" : "minion") : f.kind === "HERO" ? "hero" : null;

const withRole = (f: ViewFighter) => {
  const r = roleWord(f);
  return r ? `${f.name} (${r})` : f.name;
};

/**
 * "<actor> — choose <what> for <subject>". `text` is the prompt's own step line (the engine
 * description, or a move budget line). Null when the prompt has no subject, so the caller keeps
 * rendering today's line untouched. The WHY (source card) is the caller's existing attribution line.
 */
export const promptSubjectLine = (view: PlayerView, text: string | null): string | null => {
  const p = view.prompt;
  const subject = promptSubjectFighter(view);
  if (!p || !subject) return null;
  const team = p.onBehalfOf === "TEAM";
  const chooser = view.players?.find((x) => x.id === p.player);
  const seatFighter =
    view.fighters.find((f) => f.owner === p.player && f.kind === "HERO") ??
    view.fighters.find((f) => f.owner === p.player);
  // A TEAM prompt is the enemy deciding (the subject); otherwise the choosing seat acts.
  const actor = team
    ? withRole(subject)
    : p.player === view.you
      ? "You"
      : (chooser?.displayName?.trim() || (seatFighter ? withRole(seatFighter) : p.player));
  const what = text?.trim();
  if (!what) return `${actor} — choose for ${subject.name}`;
  const named = promptSubjectText(view, what);
  // The enemy named as actor is already the subject of its own decision.
  const alreadyNamed = what.toLowerCase().includes(subject.name.toLowerCase());
  return team || alreadyNamed || named !== what ? `${actor} — ${named}` : `${actor} — ${what} (${subject.name})`;
};

/** `text` with the generic "the fighter" replaced by the subject's name; unchanged otherwise. */
export const promptSubjectText = (view: PlayerView, text: string): string => {
  const subject = promptSubjectFighter(view);
  return subject && /\bthe fighter\b/i.test(text) ? text.replace(/\bthe fighter\b/i, subject.name) : text;
};
