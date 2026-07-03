import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Fade, HStack, Text } from "@chakra-ui/react";
import { GiRollingDices } from "react-icons/gi";
import { IoClose } from "react-icons/io5";
import { useWebGame } from "@/lib/contexts/WebGameProvider";
import { DiceRoll } from "@/lib/gamesocket/message";
import { colors, fonts, shadows } from "@/styles/style";
import { toPredeterminedNotation } from "./rollDice";

// Full-viewport, click-through canvas that renders the shared 3D dice, plus a
// result banner. Everything is client-only — the dice-box-threejs module is
// dynamically imported in an effect (it touches window/document), and the whole
// component is mounted via next/dynamic({ ssr: false }) in the game page.
const CONTAINER_ID = "unbrewed-dice-box";

export const DiceOverlay = () => {
  const { latestRoll } = useWebGame();

  // The dice-box instance (typed via our ambient declaration). Held in a ref so
  // the roll effect can reach it without re-subscribing.
  const boxRef = useRef<import("@3d-dice/dice-box-threejs").default | null>(
    null,
  );
  const readyRef = useRef(false);
  // Roll id we've already animated, so re-renders don't replay the same roll.
  const animatedIdRef = useRef<string | null>(null);
  // A roll that arrived before the box finished initializing.
  const pendingNotationRef = useRef<string | null>(null);

  const [banner, setBanner] = useState<DiceRoll | undefined>();

  // Dismiss the banner and clear the dice from the scene.
  const dismiss = useCallback(() => {
    setBanner(undefined);
    boxRef.current?.clearDice();
  }, []);

  // Initialize the dice box once, on mount.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const { default: DiceBox } = await import("@3d-dice/dice-box-threejs");
      if (disposed) return;
      const box = new DiceBox(`#${CONTAINER_ID}`, {
        sounds: false,
        shadows: true,
        // Must be a known surface key (green-felt/red-felt/taverntable/…); the
        // renderer is alpha:true and the floor is a shadow-only plane, so this
        // only affects the (transparent) shadow catcher, not an opaque backdrop.
        theme_surface: "green-felt",
        theme_customColorset: {
          background: colors.brand.secondary, // die body: brand purple
          foreground: colors.brand.primary, // pips/numbers: parchment gold
          texture: "none",
          material: "plastic",
        },
        gravity_multiplier: 400,
        light_intensity: 0.9,
        baseScale: 100,
        strength: 1.4,
      });
      // The library does not auto-initialize; roll() needs the renderer/scene
      // that initialize() builds. With sounds off and a texture-less colorset
      // this loads no external assets.
      await box.initialize();
      if (disposed) return;
      boxRef.current = box;
      readyRef.current = true;
      // Play a roll that landed while we were still loading.
      if (pendingNotationRef.current) {
        box.roll(pendingNotationRef.current);
        pendingNotationRef.current = null;
      }
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("DiceOverlay: failed to initialize dice-box", err);
    });
    return () => {
      disposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animate + show a banner whenever a new roll (local or remote) surfaces.
  useEffect(() => {
    if (!latestRoll) return;
    if (animatedIdRef.current === latestRoll.id) return;
    animatedIdRef.current = latestRoll.id;

    const notation = toPredeterminedNotation(latestRoll);
    if (readyRef.current && boxRef.current) {
      boxRef.current.roll(notation);
    } else {
      pendingNotationRef.current = notation;
    }

    // The banner stays until the player dismisses it (which also clears the
    // dice); a subsequent roll simply replaces it.
    setBanner(latestRoll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestRoll]);

  // Show the total only when it adds information (multiple dice or a modifier).
  const showTotal =
    !!banner && (banner.values.length > 1 || banner.total !== banner.values[0]);

  return (
    <>
      {/* dice-box-threejs appends its <canvas> here */}
      <Box
        id={CONTAINER_ID}
        position="fixed"
        inset={0}
        zIndex={1400}
        pointerEvents="none"
        sx={{ "& canvas": { pointerEvents: "none" } }}
      />
      <Fade in={!!banner} unmountOnExit>
        <HStack
          position="fixed"
          top="1.25rem"
          left="50%"
          transform="translateX(-50%)"
          zIndex={2000}
          pointerEvents="auto"
          gap="0.6rem"
          pl="1.1rem"
          pr="0.6rem"
          py="0.6rem"
          borderRadius="0.6rem"
          bg={colors.brand.surfaceDim}
          color={colors.brand.parchment}
          boxShadow={shadows.cardHover}
          border={`2px solid ${colors.brand.accent}`}
          fontFamily={fonts.SpaceGrotesk}
        >
          <Box
            as={GiRollingDices}
            fontSize="1.6rem"
            color={colors.brand.accent}
          />
          <Text fontSize="0.95rem">
            <Text as="span" fontWeight="700">
              {banner?.by}
            </Text>{" "}
            rolled{" "}
            <Text as="span" fontWeight="700">
              {banner?.notation}
            </Text>{" "}
            → {banner?.values.join(", ")}
            {showTotal ? ` = ${banner?.total}` : ""}
          </Text>
          <Box
            as="button"
            type="button"
            aria-label="Dismiss roll and clear dice"
            onClick={dismiss}
            display="flex"
            alignItems="center"
            justifyContent="center"
            borderRadius="0.4rem"
            p="0.2rem"
            cursor="pointer"
            color={colors.brand.parchment}
            _hover={{ bg: "rgba(255,255,255,0.12)", color: colors.brand.accent }}
          >
            <IoClose size="1.25rem" />
          </Box>
        </HStack>
      </Fade>
    </>
  );
};

export default DiceOverlay;
