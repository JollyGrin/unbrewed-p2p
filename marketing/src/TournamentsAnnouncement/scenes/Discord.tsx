import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Palette } from "../../shared/color";
import { alpha } from "../../shared/color";
import discord from "../discord.json";
import { CUE } from "../timeline";
import { clamp, Copy, EASE } from "../ui";

/**
 * Beat 7 — the bot's thread for the featured semifinal. Every word here is a
 * post the local api's bot built for that match in dry-run (`discord.json`,
 * pulled from its log by the capture script); nothing was sent to Discord.
 * Drawn in a dark chat style, without Discord's own marks.
 */

type Embed = {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string }[];
  footer?: string;
};
type Post = { content?: string; embed?: Embed; button?: string };

const BG = "#313338";
const PANEL = "#2B2D31";
const TEXT = "#DBDEE1";
const MUTED = "#949BA4";
const MENTION_BG = "rgba(88,101,242,0.3)";
const MENTION_FG = "#C9CDFB";

const hex = (n?: number) => (n === undefined ? "#E0A82E" : `#${n.toString(16).padStart(6, "0")}`);

/** **bold** and @mentions, the only markup the bot's copy uses */
const Rich: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*|@[a-z0-9_-]+)/gi).map((part, i) =>
      part.startsWith("**") ? (
        <b key={i} style={{ color: "#F2F3F5" }}>{part.slice(2, -2)}</b>
      ) : part.startsWith("@") ? (
        <span key={i} style={{ background: MENTION_BG, color: MENTION_FG, borderRadius: 4, padding: "0 4px" }}>{part}</span>
      ) : (
        <span key={i}>{part}</span>
      ),
    )}
  </>
);

const Message: React.FC<{ post: Post; at: number; palette: Palette; time: string }> = ({ post, at, palette, time }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - at, fps, config: { damping: 200 }, durationInFrames: 16 });
  if (frame < at) return null;
  const e = post.embed;
  return (
    <div style={{ display: "flex", gap: 22, opacity: pop, transform: `translateY(${(1 - pop) * 24}px)` }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", flex: "0 0 auto", background: palette.base, border: `3px solid ${palette.accent}`, color: palette.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'LeagueGothic', sans-serif", fontSize: 40 }}>
        U
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: palette.accent, fontWeight: 600, fontSize: 30 }}>unbrewed</span>
          <span style={{ background: "#5865F2", color: "#fff", fontSize: 18, fontWeight: 700, borderRadius: 4, padding: "1px 6px" }}>APP</span>
          <span style={{ color: MUTED, fontSize: 22 }}>{time}</span>
        </div>
        {post.content ? <div style={{ color: TEXT, fontSize: 30, lineHeight: 1.35 }}><Rich text={post.content} /></div> : null}
        {e ? (
          <div style={{ background: PANEL, borderLeft: `6px solid ${hex(e.color)}`, borderRadius: 6, padding: "16px 22px", maxWidth: 1180, display: "flex", flexDirection: "column", gap: 8 }}>
            {e.title ? <div style={{ color: "#F2F3F5", fontWeight: 700, fontSize: 30 }}><Rich text={e.title} /></div> : null}
            {e.description ? <div style={{ color: TEXT, fontSize: 27, lineHeight: 1.35 }}><Rich text={e.description} /></div> : null}
            {e.fields?.length ? (
              <div style={{ display: "flex", gap: 40, marginTop: 4 }}>
                {e.fields.map((f) => (
                  <div key={f.name}>
                    <div style={{ color: MUTED, fontSize: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{f.name}</div>
                    <div style={{ color: TEXT, fontSize: 26 }}><Rich text={f.value} /></div>
                  </div>
                ))}
              </div>
            ) : null}
            {e.footer ? <div style={{ color: MUTED, fontSize: 21 }}>{e.footer}</div> : null}
          </div>
        ) : null}
        {post.button ? (
          <div style={{ alignSelf: "flex-start", marginTop: 4, background: "#4E5058", color: "#F2F3F5", fontSize: 24, fontWeight: 600, borderRadius: 6, padding: "8px 18px" }}>{post.button} ↗</div>
        ) : null}
      </div>
    </div>
  );
};

export const Discord: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 14], [0, 1], { ...clamp, easing: EASE });
  const checked = frame >= CUE.discordCheck;
  const tick = interpolate(frame, [CUE.discordCheck, CUE.discordCheck + 8], [1.6, 1], clamp);
  const posts = discord.posts as Post[];
  const times = ["Today at 7:42 PM", "Today at 7:42 PM", "Today at 8:15 PM"];
  // the thread scrolls up as the third post arrives
  const scroll = interpolate(frame, [CUE.discordPosts[2] - 4, CUE.discordPosts[2] + 14], [0, -210], { ...clamp, easing: EASE });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          width: 1500,
          height: 760,
          marginTop: -120,
          background: BG,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: `0 30px 80px ${alpha("#000000", 0.6)}`,
          fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Arial, sans-serif",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 50}px) scale(${0.96 + 0.04 * enter})`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ height: 86, flex: "0 0 auto", display: "flex", alignItems: "center", gap: 18, padding: "0 34px", borderBottom: "2px solid #1F2023", color: "#F2F3F5", fontSize: 32, fontWeight: 600 }}>
          <span style={{ color: MUTED, fontSize: 34 }}>🧵</span>
          <span style={{ display: "inline-block", transform: `scale(${checked ? tick : 1})`, color: checked ? "#3BA55C" : palette.accent, width: 34, textAlign: "center" }}>{checked ? "✔" : "▶"}</span>
          <span>{discord.thread}</span>
          <span style={{ marginLeft: "auto", color: MUTED, fontSize: 24, fontWeight: 400 }}># matchups</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: "34px 40px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 34, transform: `translateY(${scroll}px)` }}>
            {posts.map((post, i) => (
              <Message key={i} post={post} at={CUE.discordPosts[i] ?? 9999} palette={palette} time={times[i] ?? times[0]} />
            ))}
          </div>
        </div>
      </div>
      <Copy palette={palette} at={CUE.discordLine} eyebrow="Discord bot" headline="Your Discord keeps up." note="A thread per match. A ping when it's your turn." />
    </AbsoluteFill>
  );
};

