/** Share-step text: the event link and the "Copy Discord post" body (#1216). */
import { describeTournamentRule } from "./matchup";
import { mapTitle } from "./options";
import { hasTop2Final } from "./roundRobin";
import type { Tournament } from "./types";

export const WINDOW_LABEL: Record<number, string> = {
  24: "24h",
  48: "48h",
  72: "72h",
  168: "1 week",
};

export const tournamentPath = (slug: string): string =>
  `/tournaments?t=${encodeURIComponent(slug)}`;

export const tournamentUrl = (slug: string, origin = "https://unbrewed.xyz"): string =>
  `${origin}${tournamentPath(slug)}`;

const FORMAT_LABEL: Record<Tournament["format"], string> = {
  single_elim: "single elimination",
  round_robin: "round robin",
};

export const formatLabel = (t: Pick<Tournament, "format">): string =>
  FORMAT_LABEL[t.format] ?? t.format;

export const formatWhen = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/**
 * Escape Discord Markdown in a user-supplied string so a hostile name like
 * `[x](https://phish)` posts as plain text, not a masked link or a mention.
 * Backslash-escapes `\ * _ ~ \` | > [ ] ( )`, a leading `#` / `-` / `>`, and
 * defuses `@` (everyone/here/user mentions) with a zero-width space.
 */
export const escapeDiscord = (raw: string): string =>
  raw
    .replace(/[\\*_~`|>\[\]()]/g, "\\$&")
    .replace(/^(\s*)([#-])/gm, "$1\\$2")
    .replace(/@/g, "@\u200b");

export const discordPost = (t: Tournament, origin?: string): string =>
  [
    `**${escapeDiscord(t.name)}** · ${t.size} seats · ${formatLabel(t)} · one game per match${hasTop2Final(t) ? ", then the top 2 play a final" : ""}`,
    `${escapeDiscord(describeTournamentRule(t, mapTitle))}.`,
    t.signupClosesAt
      ? `Signup closes **${formatWhen(t.signupClosesAt)}**. Each match gets ${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`}; we'll ping you on Discord when yours opens.`
      : `Each match gets ${WINDOW_LABEL[t.matchWindowHours] ?? `${t.matchWindowHours}h`}.`,
    `Join: ${tournamentUrl(t.slug, origin)}`,
  ].join("\n");
