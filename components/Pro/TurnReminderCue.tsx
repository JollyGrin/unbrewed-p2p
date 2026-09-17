/**
 * Turn reminder's on-screen cue (player request: nudge someone who forgot it
 * is their move) — the foreground half of the three-channel nudge driven by
 * lib/pro/useTurnReminder.ts. iOS Safari has NO vibration API at all, so this
 * plus the shared "turn" sound are what actually reach an iPhone with the tab
 * in front; the document title (handled inside the hook) covers it
 * backgrounded.
 *
 * Deliberately NOT another full-screen banner like the YOUR-TURN! / DEFEND!
 * combat callouts (combatFx.ts, rendered in pages/pro/game.tsx) — those
 * already fire once, loudly, on the hand-over itself. This is the *quiet,
 * repeatable* nudge for when nothing happened after that: a small pill, not
 * a takeover, that can reappear a couple of times without becoming the thing
 * the player is staring at. It borrows game.tsx's hurtVignette trick: a
 * changing `pulse.key` mounts a fresh element whose own keyframe ends at
 * opacity 0, so nothing here needs a cleanup timer — the old pulse just sits
 * invisible until the next key replaces it.
 */
import { Box, Text } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import type { TurnReminderPulse } from "@/lib/pro/useTurnReminder";
import type { TurnReminderReason } from "@/lib/pro/turnReminder";

const COPY: Record<TurnReminderReason, string> = {
  turn: "YOUR TURN — waiting on you",
  defense: "DEFEND! — waiting on you",
};

/** Rise in, hold, settle back out — smaller and calmer than the combat
 *  callouts' banner/pulse sweeps (no scale overshoot, no slam). */
const nudgePulse = keyframes`
  0%   { opacity: 0; transform: translate(-50%, 0.4rem) scale(0.96); }
  15%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
  85%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -0.3rem) scale(0.98); }
`;

export interface TurnReminderCueProps {
  pulse: TurnReminderPulse | null;
}

export const TurnReminderCue = ({ pulse }: TurnReminderCueProps) => {
  if (!pulse) return null;
  return (
    <Box
      key={pulse.key}
      data-testid="turn-reminder-cue"
      position="fixed"
      top="30%"
      left="50%"
      zIndex={195}
      pointerEvents="none"
      px="1rem"
      py="0.5rem"
      borderRadius="999px"
      bg={pulse.reason === "defense" ? "rgba(58, 20, 20, 0.88)" : "rgba(44, 24, 49, 0.88)"}
      border="1px solid"
      borderColor={pulse.reason === "defense" ? "brand.danger" : "brand.accent"}
      boxShadow="0 4px 18px rgba(12, 4, 16, 0.5)"
      animation={`${nudgePulse} 1.8s ease-out both`}
    >
      <Text
        fontFamily="BebasNeueRegular"
        fontSize="1.1rem"
        letterSpacing="0.06em"
        whiteSpace="nowrap"
        color={pulse.reason === "defense" ? "brand.danger" : "brand.accent"}
      >
        {COPY[pulse.reason]}
      </Text>
    </Box>
  );
};
