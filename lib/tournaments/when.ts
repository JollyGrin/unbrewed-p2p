/**
 * The one date/time formatter of the tournaments feature (UX round 4, S2).
 * Locale-aware: the viewer's own date order and 12/24-hour clock, always in
 * their local time zone. Every tournaments surface (browse, event, match page,
 * bracket, organizer queue, /pro banner) formats through here.
 *
 *   dayText  "Tue, Oct 6"            (en-GB: "Tue 6 Oct")
 *   timeText "4:00 PM"               (en-GB: "16:00")
 *   whenText "Tue, Oct 6, 4:00 PM"   (en-GB: "Tue 6 Oct, 16:00")
 */

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "Tue, Oct 6" — weekday, day and month; "" for a missing or bad time. */
export const dayText = (iso: string | null | undefined): string => {
  const d = parse(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "";
};

/** "4:00 PM" / "16:00" — the locale's own clock; "" for a missing or bad time. */
export const timeText = (iso: string | null | undefined): string => {
  const d = parse(iso);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
};

/** "Tue, Oct 6, 4:00 PM" — the date and the time; "" for a missing or bad time. */
export const whenText = (iso: string | null | undefined): string => {
  const day = dayText(iso);
  return day ? `${day}, ${timeText(iso)}` : "";
};

/**
 * A span of time, biggest units first, zero units dropped and hours rolled into
 * days (P1/P2): "1d 2h", "25h" → "1d 1h", "3h 5m", "12m". Two units at most.
 * Under a minute reads "1m". Null once the span is over.
 */
export const spanText = (ms: number): string | null => {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.max(1, Math.floor(ms / 60_000));
  const parts: [number, string][] = [
    [Math.floor(totalMin / 1440), "d"],
    [Math.floor((totalMin % 1440) / 60), "h"],
    [totalMin % 60, "m"],
  ];
  const first = parts.findIndex(([n]) => n > 0);
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, u]) => `${n}${u}`)
    .join(" ");
};

/** Seat-hold time left in words (B2): "14 min 32 s", "11 min", "32 s"; "0 s" once up. */
export const minSecText = (ms: number): string => {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m === 0 ? `${r} s` : r === 0 ? `${m} min` : `${m} min ${r} s`;
};

/** The same for a screen reader: "14 minutes 32 seconds". */
export const minSecSpoken = (ms: number): string => {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return m === 0 ? unit(r, "second") : r === 0 ? unit(m, "minute") : `${unit(m, "minute")} ${unit(r, "second")}`;
};
