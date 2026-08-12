/**
 * The profile header — avatar, name, worn badge, level bar (issues #573/#577),
 * shared by /account and the public /stats page (#590).
 *
 * Entirely prop-driven, including the trailing control: /account hangs sign-out
 * (and a link to the leaderboard) off `action`, a public profile hangs nothing.
 * Nothing in here knows whose profile it is, which is the point — clicking your
 * own row on the leaderboard has to show you exactly what everyone else sees.
 */
import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";

import { SelectedBadgeChip } from "@/components/Account/AccountBadges";
import { AccountLevelBar } from "@/components/Account/AccountLevel";
import { Panel } from "@/components/Account/Shell";
import { type LevelProgress } from "@/lib/account/stats";
import { BadgeCaseState } from "@/lib/account/useBadges";

export const ProfileHeader = ({
  username,
  avatarUrl,
  level,
  badges,
  subtitle,
  action,
}: {
  username: string;
  avatarUrl: string | null;
  /** #577: null when the API doesn't send the progression block → no level UI. */
  level: LevelProgress | null;
  badges: BadgeCaseState;
  /** The small line under the name. */
  subtitle: string;
  /** Owner-only controls, rendered at the end of the row. */
  action?: React.ReactNode;
}) => {
  // A stale avatar hash 404s on the Discord CDN. At chip size that is a shrug;
  // at 3rem a broken-image glyph is the loudest thing on the page, so fall
  // through to the same placeholder an avatar-less account gets.
  //
  // The URL that broke, not a boolean: on /stats the same header renders one
  // player after another, and a flag would hide the next player's perfectly
  // good avatar because the last one's was stale.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showAvatar = !!avatarUrl && brokenUrl !== avatarUrl;

  return (
    <Panel
      as="header"
      display="flex"
      alignItems="center"
      gap="0.9rem"
      mb="1rem"
    >
      {showAvatar ? (
        // Plain <img>, not next/image: the site is statically exported, so
        // there is no optimizer and the Discord CDN host would need config.
        <Box
          as="img"
          data-testid="account-avatar"
          src={avatarUrl}
          alt=""
          onError={() => setBrokenUrl(avatarUrl)}
          boxSize="3rem"
          borderRadius="full"
          objectFit="cover"
          flexShrink={0}
        />
      ) : (
        <Box
          boxSize="3rem"
          borderRadius="full"
          bg="rgba(72, 40, 79, 0.15)"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <FaDiscord size="1.5rem" />
        </Box>
      )}

      <Box flex="1" minW={0}>
        {/* The worn badge sits ON the name line (#577) — it is a title, and a
            title belongs beside the name rather than under it. It wraps to its
            own line before it squeezes a long username. */}
        <Flex align="center" gap="0.5rem" flexWrap="wrap" minW={0}>
          <Text
            as="h1"
            fontFamily="LeagueGothic"
            fontSize="2rem"
            lineHeight="1.05"
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
            minW={0}
          >
            {username}
          </Text>
          <SelectedBadgeChip state={badges} />
        </Flex>
        <Text fontSize="0.8rem" opacity={0.65}>
          {subtitle}
        </Text>
        <AccountLevelBar progress={level} />
      </Box>

      {action}
    </Panel>
  );
};
