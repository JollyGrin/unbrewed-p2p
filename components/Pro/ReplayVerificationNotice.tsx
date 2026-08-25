/**
 * What the viewer is told about a cross-version replay (#701, engine #509).
 *
 * Two shapes, one source of truth (`replayVerificationNotice`):
 *  - `ReplayVerifiedBadge` — the quiet "verified across engine versions" tag,
 *    for a replay recorded on an older engine that still re-simulates identically.
 *    Renders nothing at all for the ordinary same-engine case.
 *  - `ReplayDivergenceBanner` — the loud one: the rules changed how this game
 *    plays from turn N, so only turns 1..N−1 are shown. A truncated replay is
 *    still worth watching; being silent about WHY it ends early is not.
 */
import { Box, Flex, Tag, Text, Tooltip } from "@chakra-ui/react";
import { TbAlertTriangle, TbShieldCheck } from "react-icons/tb";
import type { ReplayVerificationNotice } from "@/lib/pro/replayVerification";

export const ReplayVerifiedBadge = ({ notice }: { notice: ReplayVerificationNotice }) => {
  if (notice.verification !== "digest-verified" || !notice.badge) return null;
  return (
    <Tooltip label={notice.badgeDetail ?? ""} hasArrow>
      <Tag
        size="sm"
        bg="rgba(20,8,24,0.65)"
        color="brand.parchment"
        fontSize="0.7rem"
        gap="0.25rem"
        aria-label={notice.badge}
      >
        <TbShieldCheck aria-hidden />
        {notice.badge}
      </Tag>
    </Tooltip>
  );
};

/**
 * `compact` is the in-scrubber form (a single strip under the top chrome);
 * without it the banner is the fuller card the share landing shows before you
 * press play.
 */
export const ReplayDivergenceBanner = ({
  notice,
  compact = false,
}: {
  notice: ReplayVerificationNotice;
  compact?: boolean;
}) => {
  if (!notice.banner) return null;
  return (
    <Box
      role="status"
      bg="rgba(60,40,10,0.7)"
      border="1px solid"
      borderColor="brand.accent"
      borderRadius="0.6rem"
      px={compact ? "0.75rem" : "1rem"}
      py={compact ? "0.5rem" : "0.85rem"}
      maxW={compact ? "34rem" : "32rem"}
      textAlign="left"
    >
      <Flex gap="0.5rem" align="flex-start">
        <Box color="brand.accent" mt="0.15rem" flexShrink={0}>
          <TbAlertTriangle aria-hidden />
        </Box>
        <Box>
          <Text
            fontFamily="BebasNeueRegular"
            fontSize={compact ? "0.95rem" : "1.1rem"}
            letterSpacing="0.04em"
          >
            {notice.banner.heading}
          </Text>
          <Text fontSize={compact ? "0.75rem" : "0.85rem"} opacity={0.9} mt="0.15rem">
            {notice.banner.body}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
};
