import { useCallback, useEffect, useState } from "react";
import styled from "@emotion/styled";

import { formatCombo } from "@/lib/keybinds/combo";
import { useKeybinds } from "@/lib/keybinds/store";

/** A phone or tablet with no mouse: assume no keyboard, show no key hints. */
const TOUCH_ONLY = "(hover: none) and (pointer: coarse)";

/**
 * False on touch-only devices. Starts true (also on the server), so the
 * {@link KeyHint} badge hides itself with the same media query in CSS and
 * never flashes there.
 */
export const useShowKeyHints = (): boolean => {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(TOUCH_ONLY);
    const update = () => setShow(!query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return show;
};

/** Looks up the key shown for an action: `D`, `Shift+S`, undefined for none. */
export const useKeyLabels = (): ((action: string) => string | undefined) => {
  const { bindings } = useKeybinds();
  const show = useShowKeyHints();
  return useCallback(
    (action: string) => {
      const combo = show ? bindings[action] : undefined;
      return combo ? formatCombo(combo) : undefined;
    },
    [bindings, show],
  );
};

/** `text` with the action's key appended, for tooltips: "Roll dice (R)". */
export const useKeyTip = (text: string, action: string): string => {
  const label = useKeyLabels()(action);
  return label ? `${text} (${label})` : text;
};

const Badge = styled.kbd`
  display: inline-block;
  flex-shrink: 0;
  margin-left: 0.45rem;
  padding: 0 0.3rem;
  min-width: 1.15rem;
  text-align: center;
  font-family: inherit;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.5;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: inherit;
  background: rgba(72, 40, 79, 0.08);
  border: 1px solid rgba(72, 40, 79, 0.3);
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  opacity: 0.75;

  @media ${TOUCH_ONLY} {
    display: none;
  }
`;

/**
 * The key an action is bound to, as a small badge beside its button or menu
 * entry. Renders nothing when the action has no key.
 */
export const KeyHint = ({ action }: { action: string }) => {
  const combo = useKeybinds().bindings[action];
  if (!combo) return null;
  return (
    <Badge data-key-hint={action} aria-hidden="true">
      {formatCombo(combo)}
    </Badge>
  );
};
