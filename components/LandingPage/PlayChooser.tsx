import { useEffect, useId, useRef, useState } from "react";
import { Box, Button, Text } from "@chakra-ui/react";
import Link from "next/link";
import { CHOOSER_OPTIONS } from "./content";

/**
 * The hero's "Play now" button and its four-option chooser.
 *
 * The panel is rendered in place and always in the DOM (only `hidden` while
 * closed), so the four links are in the static HTML for crawlers — it is not a
 * portal overlay. Opening moves focus to the first option; Escape or a click
 * outside closes it and Escape returns focus to the button. The open motion is
 * a short fade + lift that is switched off under prefers-reduced-motion.
 */
export const PlayChooser = () => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <Box ref={rootRef} position="relative" display="inline-block">
      <Button
        ref={buttonRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        bg="brand.accent"
        color="brand.surfaceDim"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        size="lg"
        px="1.75rem"
        boxShadow="0 6px 16px -8px rgba(224,168,46,.9)"
        _hover={{ bg: "brand.accentDeep" }}
        _focusVisible={{ outline: "3px solid", outlineColor: "brand.parchment", outlineOffset: "2px" }}
      >
        Play now
      </Button>
      <Box
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label="Choose how to play"
        hidden={!open}
        position="absolute"
        top="calc(100% + 0.5rem)"
        left="50%"
        transform="translateX(-50%)"
        zIndex={20}
        w="min(22rem, calc(100vw - 2rem))"
        bg="brand.parchment"
        color="brand.surfaceDim"
        borderRadius="0.85rem"
        boxShadow="0 22px 40px -18px rgba(0,0,0,.6)"
        p="0.4rem"
        textAlign="left"
        sx={{
          "@keyframes chooserIn": {
            from: { opacity: 0, transform: "translate(-50%, -6px)" },
            to: { opacity: 1, transform: "translate(-50%, 0)" },
          },
          animation: "chooserIn 160ms ease-out",
          "@media (prefers-reduced-motion: reduce)": { animation: "none" },
        }}
      >
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {CHOOSER_OPTIONS.map((option) => (
            <Box as="li" key={option.href}>
              <Box
                as={Link}
                href={option.href}
                display="block"
                px="0.85rem"
                py="0.65rem"
                borderRadius="0.6rem"
                _hover={{ bg: "brand.highlight" }}
                _focusVisible={{ bg: "brand.highlight", outline: "2px solid", outlineColor: "brand.accentDeep" }}
              >
                <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="1rem">
                  {option.title}
                </Text>
                <Text fontSize="0.82rem" opacity={0.8}>
                  {option.detail}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
