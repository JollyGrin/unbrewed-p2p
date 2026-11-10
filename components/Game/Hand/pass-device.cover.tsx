import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { colors, fonts } from "@/styles/style";
import { useHotseat, useSeatLabel } from "@/lib/hotseat/useHotseat";
import { useHotseatFlag } from "@/lib/hotseat/hotseatSettings";

/**
 * Pass-the-device cover (hotseat, issue #1564). After a seat switch the hand
 * drawer would show the new seat's hand the instant the previous player hands
 * the device over, so it sits under a one-tap "<Hero>'s turn" cover until
 * the new player reveals it. On in hotseat unless the "Reveal hand right
 * away" setting is on; never rendered otherwise.
 */
export const PassDeviceCover = () => {
  const hotseat = useHotseat();
  const seatLabel = useSeatLabel();
  const active = hotseat?.active;
  const seated = (hotseat?.seats.length ?? 0) > 1;
  const [covered, setCovered] = useState(false);
  const seen = useRef(active);
  const [autoReveal] = useHotseatFlag("autoReveal");

  // Only a switch between two seated players covers — not adding the
  // opponent (the active seat stays put) and not going back to solo.
  useEffect(() => {
    if (active === seen.current) return;
    seen.current = active;
    setCovered(seated);
  }, [active, seated]);
  useEffect(() => {
    if (!seated) setCovered(false);
  }, [seated]);

  if (!hotseat || !seated || !covered || autoReveal) return null;

  return (
    <Cover
      type="button"
      aria-label={`${seatLabel(hotseat.active)}'s turn — tap to reveal the hand`}
      onClick={() => setCovered(false)}
    >
      <Title>{seatLabel(hotseat.active)}&apos;s turn</Title>
      <Hint>tap to reveal</Hint>
    </Cover>
  );
};

/** Over the hand fan (z 200–400) and the pile buttons (z 250). */
const Cover = styled.button`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 240px;
  z-index: 450;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: none;
  border-top: 1px solid rgba(231, 204, 152, 0.35);
  background: linear-gradient(
    180deg,
    rgba(44, 24, 49, 0.88),
    rgba(20, 8, 24, 0.97)
  );
  backdrop-filter: blur(10px);
  color: ${colors.brand.highlight};
  cursor: pointer;
`;

const Title = styled.span`
  font-family: ${fonts.BebasNeueRegular};
  font-size: 2rem;
  letter-spacing: 0.04em;
  line-height: 1;
`;

const Hint = styled.span`
  font-family: ${fonts.SpaceGrotesk};
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.7;
`;
