import { PlayerId } from "./protocol";

export interface DruidFormTokenBadge {
  icon: string;
  label: string;
  title: string;
  bg: string;
  color: string;
}

const FORM_FLAGS = {
  human: "DRUID_FORM_HUMAN",
  bear: "DRUID_FORM_BEAR",
  moonkin: "DRUID_FORM_MOONKIN",
} as const;

export function druidFormTokenBadge(
  heroId: string | undefined,
  flags: Record<string, boolean> | undefined
): DruidFormTokenBadge | null {
  if (heroId !== "malfurion-stormrage") return null;
  if (flags?.[FORM_FLAGS.bear]) {
    return { icon: "🐾", label: "Bear", title: "Bear Form", bg: "#5A351C", color: "#FFF1D6" };
  }
  if (flags?.[FORM_FLAGS.moonkin]) {
    return { icon: "☾", label: "Moonkin", title: "Moonkin Form", bg: "#244D7A", color: "#EAF4FF" };
  }
  // Malfurion starts in Human Form. If an older/intermediate snapshot omits form
  // flags, prefer the useful default over no badge so the token still answers
  // "what form am I in?" at a glance.
  return { icon: "✦", label: "Human", title: "Human Form", bg: "#2E6B48", color: "#ECFFF4" };
}

export function druidFormBadgesByOwner(players: Array<{ id: PlayerId; heroId: string; flags?: Record<string, boolean> }>):
  Partial<Record<PlayerId, DruidFormTokenBadge>> {
  return Object.fromEntries(
    players
      .map((p) => [p.id, druidFormTokenBadge(p.heroId, p.flags)] as const)
      .filter((entry): entry is readonly [PlayerId, DruidFormTokenBadge] => !!entry[1])
  );
}
