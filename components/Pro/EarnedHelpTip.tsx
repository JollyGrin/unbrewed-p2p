/**
 * The "?" beside a line of the post-game earned card (p2p #1670): a real
 * button that opens one or two sentences of explanation.
 *
 * Chakra's `Tooltip` on its own opens on hover and focus only, which leaves a
 * phone with nothing: iOS does not even focus a button on tap. So the tooltip
 * is controlled here and every way in is handled by hand:
 *
 * - mouse: opens on hover, closes on leave; a click keeps it open.
 * - keyboard: opens on focus, Enter/Space toggles, Escape closes.
 * - touch: a tap toggles; a tap anywhere else closes.
 *
 * The glyph is an icon, not a "?" character, so the row's text content is the
 * label and the amount and nothing else.
 */
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { QuestionOutlineIcon } from "@chakra-ui/icons";
import { Box, Tooltip } from "@chakra-ui/react";

import type { EarnedHelp } from "@/lib/pro/earned";

export const EarnedHelpTip = ({ help }: { help: EarnedHelp }) => {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // The pointer that is pressing the button right now ("" = keyboard). Focus
  // that a press caused is left to the click, or a tap would open and close.
  const pressedWith = useRef("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture phase + stop: Escape closes the tip, not the dialog under it.
      event.stopPropagation();
      setOpen(false);
    };
    const onPress = (event: Event) => {
      if (!button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPress, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPress, true);
    };
  }, [open]);

  const hover = (next: boolean) => (event: ReactPointerEvent) => {
    if (event.pointerType !== "touch") setOpen(next);
  };

  return (
    <Tooltip
      label={help.text}
      isOpen={open}
      hasArrow
      placement="top"
      fontSize="0.7rem"
      lineHeight="1.35"
      maxW="17rem"
      px="0.6rem"
      py="0.4rem"
    >
      <Box
        as="button"
        ref={button}
        type="button"
        aria-label={help.ask}
        aria-expanded={open}
        data-testid="post-game-help"
        data-open={open ? "true" : "false"}
        onPointerDown={(event: ReactPointerEvent) => {
          pressedWith.current = event.pointerType || "mouse";
        }}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        onFocus={() => {
          if (!pressedWith.current) setOpen(true);
        }}
        onBlur={() => {
          pressedWith.current = "";
          setOpen(false);
        }}
        onClick={() => {
          const mouse = pressedWith.current === "mouse";
          pressedWith.current = "";
          setOpen((was) => (mouse ? true : !was));
        }}
        position="relative"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        flexShrink={0}
        boxSize="1.05rem"
        borderRadius="full"
        color={open ? "brand.accent" : "rgba(250, 235, 215, 0.55)"}
        cursor="help"
        transition="color 120ms ease"
        _hover={{ color: "brand.accent" }}
        _focusVisible={{ outline: "2px solid", outlineColor: "brand.accent", outlineOffset: "1px" }}
        // A 17 px glyph with a 25 px target: the rows are too tight for more.
        _after={{ content: '""', position: "absolute", inset: "-4px" }}
      >
        <QuestionOutlineIcon boxSize="0.74rem" aria-hidden />
      </Box>
    </Tooltip>
  );
};
