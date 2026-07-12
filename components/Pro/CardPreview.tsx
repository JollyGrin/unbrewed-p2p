/**
 * Hover / press card preview (issue #167). Cards in a match render small
 * (~120px combat slots, ~135px hand) with body text far too tiny to read
 * mid-decision. This surfaces a large, full-resolution copy of whatever card
 * you point at, floating in a dead corner and vanishing the instant you leave.
 *
 * Design:
 * - A single floating overlay (position: fixed, pointer-events: none) rendered
 *   once by `CardPreviewProvider`. It never reserves layout space, so the board
 *   and panels never shift or shrink.
 * - `useCardPreview(card)` returns handlers you spread onto any card trigger.
 *   Desktop: ~150ms hover enter delay (kills flicker on cursor pass-through),
 *   instant exit. Keyboard: focus shows it immediately (accessibility parity).
 *   Touch: press-and-hold (~250ms) peeks, release dismisses, and a real tap
 *   still fires the underlying action because the hold timer never fired.
 * - The overlay renders the SAME `Card` renderer as the table, at a large size,
 *   so the art is genuinely full-resolution — never an upscaled thumbnail.
 *
 * The whole thing is opt-in via context: `useCardPreview` outside a provider
 * returns no-op handlers, so `CardFace` can call it unconditionally and cards
 * shown in lobby/replay surfaces (no provider) simply stay inert.
 */
import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import {
  createContext,
  ReactNode,
  TouchEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Card } from "@/components/CardFactory/Card";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

/** ~150ms kills flicker when the cursor merely passes over a card. */
const HOVER_ENTER_MS = 150;
/** Press-and-hold threshold; under this a touch is a tap and plays the card. */
const TOUCH_HOLD_MS = 250;

type Source = "hover" | "touch";

interface PreviewState {
  card: DeckImportCardType;
  source: Source;
}

interface CardPreviewApi {
  show: (card: DeckImportCardType, source: Source) => void;
  hide: () => void;
}

const CardPreviewContext = createContext<CardPreviewApi | null>(null);

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(0.75rem) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

/** The lone floating overlay. Anchored bottom-left on desktop (a dead corner
 *  next to the activity log), bottom-centre on touch where it can go bigger. */
const PreviewOverlay = ({ card, source }: PreviewState) => (
  <Box
    position="fixed"
    zIndex={2000}
    pointerEvents="none"
    bottom={{ base: "1rem", md: "1.5rem" }}
    left={source === "touch" ? "50%" : { base: "50%", md: "1.5rem" }}
    transform={source === "touch" ? "translateX(-50%)" : { base: "translateX(-50%)", md: "none" }}
    animation={`${fadeIn} 0.16s ease-out both`}
  >
    <Box
      // Touch has no hover competing for the screen, so it can go larger.
      h={source === "touch" ? "min(80vh, 720px)" : "min(60vh, 560px)"}
      sx={{ aspectRatio: "63 / 88" }}
      borderRadius="0.75rem"
      overflow="hidden"
      bg="brand.surfaceDim"
      boxShadow="0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)"
    >
      <Card card={card} />
    </Box>
  </Box>
);

export const CardPreviewProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PreviewState | null>(null);
  const show = useCallback(
    (card: DeckImportCardType, source: Source) => setState({ card, source }),
    []
  );
  const hide = useCallback(() => setState(null), []);
  const api = useMemo<CardPreviewApi>(() => ({ show, hide }), [show, hide]);

  return (
    <CardPreviewContext.Provider value={api}>
      {children}
      {state && <PreviewOverlay {...state} />}
    </CardPreviewContext.Provider>
  );
};

type PreviewHandlers = {
  tabIndex?: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: (e: TouchEvent) => void;
  onTouchCancel?: () => void;
};

/**
 * Handlers to spread onto a card trigger element. Pass the resolved card (or
 * null for a hidden / face-down card — hidden cards get no preview and stay
 * inert). Returns `{}` when there's no card or no surrounding provider.
 */
export const useCardPreview = (card: DeckImportCardType | null): PreviewHandlers => {
  const api = useContext(CardPreviewContext);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = useRef(false);

  const clearTimer = useCallback(() => {
    if (enterTimer.current) {
      clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
  }, []);

  // Never leave the overlay stuck if the trigger unmounts while showing (a hand
  // card played, a combat card revealed) — clean up on unmount.
  useEffect(
    () => () => {
      clearTimer();
      if (shown.current) api?.hide();
    },
    [api, clearTimer]
  );

  if (!api || !card) return {};

  const showNow = (source: Source) => {
    shown.current = true;
    api.show(card, source);
  };
  const hideNow = () => {
    clearTimer();
    if (shown.current) {
      shown.current = false;
      api.hide();
    }
  };

  return {
    tabIndex: 0,
    onMouseEnter: () => {
      clearTimer();
      enterTimer.current = setTimeout(() => showNow("hover"), HOVER_ENTER_MS);
    },
    onMouseLeave: hideNow,
    // Keyboard focus mirrors hover, minus the anti-flicker delay.
    onFocus: () => showNow("hover"),
    onBlur: hideNow,
    onTouchStart: () => {
      clearTimer();
      enterTimer.current = setTimeout(() => showNow("touch"), TOUCH_HOLD_MS);
    },
    onTouchEnd: (e: TouchEvent) => {
      // A held press already peeked: swallow the trailing click so release just
      // dismisses. A quick tap never showed anything, so its click plays on.
      if (shown.current) e.preventDefault();
      hideNow();
    },
    onTouchCancel: hideNow,
  };
};
