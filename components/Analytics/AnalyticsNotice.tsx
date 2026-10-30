import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { acknowledgeNotice, declineAnalytics, isGameRoute, shouldShowNotice, startAnalytics } from "@/lib/analytics";

/**
 * One-line, dismissible analytics notice. Capturing starts from the effect
 * AFTER the notice has painted (or immediately for a visitor who already
 * dismissed it); a declined visitor never starts. Renders nothing when
 * analytics is unavailable (no key / dev / test).
 */
export const AnalyticsNotice = () => {
  const [show, setShow] = useState(false);
  const { pathname } = useRouter();

  useEffect(() => {
    if (shouldShowNotice()) {
      // In-game routes never show the notice, so a new visitor is not started
      // there either; they start on the first normal route.
      if (isGameRoute(pathname)) {
        setShow(false);
        return;
      }
      setShow(true);
      // Notice is now in the tree; start once it has had a frame to render.
      const raf = requestAnimationFrame(acknowledgeNotice);
      return () => cancelAnimationFrame(raf);
    }
    // Already seen/declined (or analytics unavailable): never (re-)show.
    setShow(false);
    startAnalytics();
  }, [pathname]);

  // Render guard, independent of effect ordering: never over the game UI.
  if (!show || isGameRoute(pathname)) return null;
  return (
    <Flex
      role="region"
      aria-label="Analytics notice"
      position="fixed"
      bottom={2}
      left={2}
      right={2}
      zIndex={1500}
      maxW="640px"
      mx="auto"
      px={3}
      py={2}
      gap={3}
      align="center"
      justify="space-between"
      bg="#2b1b3d"
      color="#f3e9d2"
      border="1px solid #6b4a8e"
      borderRadius="md"
      fontSize="sm"
    >
      <Text>
        We count anonymous visits and games to improve Unbrewed — no cookies.{" "}
        <Box as={Link} href="/privacy" textDecoration="underline">
          Privacy
        </Box>
      </Text>
      <Flex gap={2} flexShrink={0}>
        <Button size="xs" variant="ghost" onClick={() => { declineAnalytics(); setShow(false); }}>
          Decline
        </Button>
        <Button size="xs" onClick={() => setShow(false)}>
          OK
        </Button>
      </Flex>
    </Flex>
  );
};
