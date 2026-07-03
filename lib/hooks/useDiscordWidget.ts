import { useQuery } from "@tanstack/react-query";
import axios from "axios";

/** Unbrewed's Discord guild. The widget endpoint is public (no auth). */
const GUILD_ID = "699681535745458307";
const WIDGET_URL = `https://discord.com/api/guilds/${GUILD_ID}/widget.json`;

/** Used when the live widget invite can't be read (widget off, rate-limited). */
export const DISCORD_FALLBACK_INVITE = "https://discord.gg/qPxHFjwkNN";

export interface DiscordMember {
  id: string;
  username: string;
  status: "online" | "idle" | "dnd";
  avatar_url: string;
  game?: { name: string };
}

export interface DiscordWidget {
  id: string;
  name: string;
  /** Invite to the widget's configured channel — the #battles channel. */
  instant_invite: string | null;
  /** Count of members currently online-ish (online/idle/dnd). */
  presence_count: number;
  members: DiscordMember[];
}

/**
 * Live snapshot of the Discord server: how many people are around and who,
 * plus the invite that drops them into the battles channel. Polls gently so
 * the count stays fresh without hammering Discord. Never throws into the UI —
 * consumers fall back to a "hop in the Discord" prompt when this is empty.
 */
export const useDiscordWidget = () =>
  useQuery(
    ["discord-widget"],
    async () => {
      const { data } = await axios.get<DiscordWidget>(WIDGET_URL);
      return data;
    },
    {
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      retry: 1,
    },
  );
