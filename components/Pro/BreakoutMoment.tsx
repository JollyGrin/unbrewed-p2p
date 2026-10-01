/**
 * "Enclosure destroyed — <dinosaur> is loose" interstitial (issue #1158).
 *
 * ~4s, skippable (click / Esc / Enter / button), over a dimmed board. When a prompt is open for
 * the local player it never takes the screen: a compact, click-through toast shows instead so
 * the decision stays reachable. Reduced motion drops the fade. Presentation only — the content
 * comes from `breakoutMoment` (lib/pro/breakoutMoment.ts).
 */
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { colors, fonts } from "@/styles/style";
import { BreakoutMoment as Moment } from "@/lib/pro/breakoutMoment";

export const BREAKOUT_MS = 4000;
export const BREAKOUT_Z = 1480;

const pad = (n: number) => String(n).padStart(2, "0");
const title = (s: string) => s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const BreakoutMomentOverlay = ({
  moment,
  compact,
  onDone,
}: {
  moment: Moment | null;
  /** a prompt is open for the local player — show a toast, never block */
  compact: boolean;
  onDone: () => void;
}) => {
  const reduced = !!useReducedMotion();

  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(onDone, compact ? BREAKOUT_MS + 1500 : BREAKOUT_MS);
    return () => clearTimeout(t);
  }, [moment, compact, onDone]);

  useEffect(() => {
    if (!moment || compact) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      onDone();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moment, compact, onDone]);

  if (!moment) return null;
  const heading = moment.enclosure != null ? `ENCLOSURE ${pad(moment.enclosure)} DESTROYED` : "ENCLOSURE DESTROYED";
  const enemy = moment.enemy;
  const loose = enemy ? `${enemy.name} is loose` : "Something is loose";

  if (compact) {
    return (
      <Box
        position="fixed"
        top="4.5rem"
        right="1rem"
        zIndex={BREAKOUT_Z}
        maxW="18rem"
        p="0.6rem 0.8rem"
        bg={colors.brand.primary}
        color="white"
        borderRadius="6px"
        borderLeft="4px solid #d9534f"
        fontFamily={fonts.SpaceGrotesk}
        cursor="pointer"
        onClick={onDone}
        role="status"
        data-testid="breakout-toast"
      >
        <Text fontFamily={fonts.BebasNeueRegular} fontSize="0.8rem" letterSpacing="0.06em">
          {heading}
        </Text>
        <Text fontSize="0.8rem">{loose}</Text>
      </Box>
    );
  }

  const tiles: { label: string; value: string; note?: string }[] = [
    { label: "Enclosures lost", value: `${moment.lost} of ${moment.total}` },
    { label: "Threat track", value: "Reset to start", note: "any extra steps are lost" },
  ];
  if (moment.pushedBy) tiles.push({ label: "What pushed it over", value: title(moment.pushedBy) });

  return (
    <Flex
      position="fixed"
      inset="0"
      zIndex={BREAKOUT_Z}
      bg="rgba(20, 8, 24, 0.72)"
      align="center"
      justify="center"
      direction="column"
      color="white"
      textAlign="center"
      p="1rem"
      gap="0.9rem"
      cursor="pointer"
      onClick={onDone}
      role="dialog"
      aria-modal="true"
      aria-label={`${heading}. ${loose}.`}
      data-testid="breakout-moment"
      animation={reduced ? undefined : "breakoutFade 0.35s ease-out"}
      sx={{ "@keyframes breakoutFade": { from: { opacity: 0 }, to: { opacity: 1 } } }}
    >
      <Text fontSize="0.8rem" letterSpacing="0.2em" opacity={0.8}>
        THE THREAT TRACK FILLED
      </Text>
      <Text fontFamily={fonts.BebasNeueRegular} fontSize={["1.6rem", "2.6rem"]} letterSpacing="0.06em" color="#ff8a80">
        {heading}
      </Text>
      <Box>
        {moment.marker && (
          <Text fontSize="0.85rem" opacity={0.85} data-testid="breakout-marker">
            {title(moment.marker)}
          </Text>
        )}
        {enemy && (
          <>
            <Text fontFamily={fonts.BebasNeueRegular} fontSize="1.4rem">
              {enemy.name}
            </Text>
            <Text fontSize="0.9rem">
              HP {enemy.hp}/{enemy.maxHp} · {title(enemy.size.toLowerCase())}
              {enemy.move != null ? ` · MOVE ${enemy.move}` : ""}
            </Text>
            {enemy.joinsDeck && (
              <Text fontSize="0.85rem" opacity={0.85}>
                Its card joins this round&apos;s turn deck — it can act this round.
              </Text>
            )}
          </>
        )}
      </Box>
      <Flex gap="0.7rem" wrap="wrap" justify="center">
        {tiles.map((t) => (
          <Box key={t.label} bg="rgba(255,255,255,0.1)" borderRadius="6px" p="0.6rem 0.9rem" minW="9rem">
            <Text fontSize="0.65rem" letterSpacing="0.12em" opacity={0.75}>
              {t.label.toUpperCase()}
            </Text>
            <Text fontFamily={fonts.BebasNeueRegular} fontSize="1.05rem">
              {t.value}
            </Text>
            {t.note && (
              <Text fontSize="0.7rem" opacity={0.75}>
                {t.note}
              </Text>
            )}
          </Box>
        ))}
      </Flex>
      <Button size="sm" variant="outline" color="white" onClick={onDone}>
        Skip
      </Button>
    </Flex>
  );
};
