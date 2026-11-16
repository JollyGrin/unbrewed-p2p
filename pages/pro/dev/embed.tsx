/**
 * DEV harness for the embeddable Pro game view (issue #1678).
 *
 * Mounts `<GameView contained>` at a few panel sizes, each against its own
 * normal bot room on its own EPHEMERAL socket, so the extraction can be
 * checked by eye and by script (scripts/pro/embed-check.mjs):
 *
 *   /pro/dev/embed                 all three panels (desktop, tablet, phone)
 *   ?panel=phone                   one panel (desktop | tablet | phone | wide)
 *   ?hero=<id>&vs=<id>             the two fighters (default: the roster's first two)
 *   ?bot=easy|medium|hard          bot tier (default easy)
 *   ?mulligan=1                    keep the opening-hand mulligan (a modal) on
 *   ?puzzle=1                      the switches a puzzle turns off, and the
 *                                  face-up hand slot (fed YOUR hand: the server
 *                                  does not send the opponent's yet)
 *
 * Not linked from anywhere and not in the sitemap. A production build 404s it
 * (`getStaticProps` below) unless NEXT_PUBLIC_PRO_DEV_PAGES=1.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { GetStaticProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Box, Flex, Text } from "@chakra-ui/react";

import { GameView, GameViewFeatures } from "@/components/Pro/GameView";
import type { BotDifficulty } from "@/lib/pro/protocol";
import { useProSocket } from "@/lib/pro/useProSocket";
import { PRO_WS_URL } from "@/lib/pro/wsUrl";

export const EMBED_PANELS = {
  desktop: { label: "Desktop", width: 960, height: 600 },
  tablet: { label: "Tablet", width: 720, height: 520 },
  phone: { label: "Phone", width: 360, height: 640 },
  // The one size here big enough for the desktop arrangement (900 × 680, see
  // `containedLayoutMode`); the three above wear the rail, the rail, the phone.
  wide: { label: "Wide", width: 1120, height: 680 },
} as const;
type PanelId = keyof typeof EMBED_PANELS;
const DEFAULT_PANELS: PanelId[] = ["desktop", "tablet", "phone"];

/** What a puzzle has no use for (the next ticket's panel passes the same). */
const PUZZLE_FEATURES: Partial<GameViewFeatures> = {
  forfeit: false,
  undo: false,
  reportBug: false,
  turnTimer: false,
  postGame: false,
  soundToggles: false,
};

const BOT_TIERS: BotDifficulty[] = ["easy", "medium", "hard"];

const EmbedPanel = ({
  id,
  heroParam,
  vsParam,
  bot,
  puzzle,
  mulligan,
}: {
  id: PanelId;
  heroParam: string | null;
  vsParam: string | null;
  bot: BotDifficulty;
  puzzle: boolean;
  mulligan: boolean;
}) => {
  const { label, width, height } = EMBED_PANELS[id];
  const socket = useProSocket(PRO_WS_URL, false, false, undefined, { ephemeral: true });
  const { status, heroes, roomId, snapshot, error, createRoom } = socket;

  // One bot room per panel, opened once the roster is in. Mulligan off unless
  // asked for: the harness is about the table, and a puzzle starts mid-game.
  const createdRef = useRef(false);
  useEffect(() => {
    if (createdRef.current || status !== "open" || !heroes || heroes.length === 0) return;
    const has = (heroId: string | null) => !!heroId && heroes.some((h) => h.heroId === heroId);
    const heroId = has(heroParam) ? heroParam! : heroes[0].heroId;
    const botHeroId = has(vsParam) ? vsParam! : (heroes.find((h) => h.heroId !== heroId) ?? heroes[0]).heroId;
    createdRef.current = true;
    createRoom(heroId, { difficulty: bot, heroId: botHeroId }, undefined, "duel", [], 0, mulligan);
  }, [status, heroes, heroParam, vsParam, bot, mulligan, createRoom]);

  const ownHand = snapshot?.view.self.hand;
  const opponentHand = useMemo(() => (puzzle && ownHand ? ownHand : null), [puzzle, ownHand]);

  return (
    <Flex direction="column" gap="0.4rem" data-testid={`embed-panel-${id}`}>
      <Text fontFamily="SpaceGrotesk" fontSize="0.8rem" opacity={0.75} data-testid={`embed-status-${id}`}>
        {label} {width}×{height} · {error ? `error: ${error.code}` : snapshot ? `room ${roomId}` : status}
      </Text>
      <Box
        data-testid={`embed-box-${id}`}
        w={`${width}px`}
        h={`${height}px`}
        flexShrink={0}
        borderRadius="12px"
        overflow="hidden"
        boxShadow="0 0 0 1px rgba(224, 168, 46, 0.35), 0 12px 40px rgba(0, 0, 0, 0.5)"
      >
        <GameView
          socket={socket}
          contained
          features={puzzle ? PUZZLE_FEATURES : undefined}
          opponentHand={opponentHand}
          fallback={
            <Flex h="100%" align="center" justify="center">
              <Text fontFamily="SpaceGrotesk" fontSize="0.85rem" opacity={0.7}>
                {error ? `${error.code}: ${error.message}` : "Opening a bot room…"}
              </Text>
            </Flex>
          }
        />
      </Box>
    </Flex>
  );
};

export default function ProEmbedDevPage() {
  const router = useRouter();
  // Client-only: every panel opens a socket, and the query decides what for.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const one = (key: string) => (typeof router.query[key] === "string" ? (router.query[key] as string) : null);
  const panelParam = one("panel");
  const panels: PanelId[] = panelParam && panelParam in EMBED_PANELS ? [panelParam as PanelId] : DEFAULT_PANELS;
  const botParam = one("bot");
  const bot = BOT_TIERS.includes(botParam as BotDifficulty) ? (botParam as BotDifficulty) : "easy";

  return (
    <>
      <Head>
        <title>Embed harness · Unbrewed Pro</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <Box minH="100vh" bg="#1c1020" color="brand.parchment" p="1.5rem">
        <Text fontFamily="SpaceGrotesk" fontSize="0.9rem" mb="1rem" opacity={0.8}>
          Embeddable game view — dev harness (#1678). Each panel is its own bot room on its own ephemeral socket.
        </Text>
        {/* The query is empty on the static export's first render: wait for it,
            so a panel never opens a room for the wrong fighters. */}
        {mounted && router.isReady && (
          <Flex gap="1.5rem" wrap="wrap" align="flex-start">
            {panels.map((id) => (
              <EmbedPanel
                key={id}
                id={id}
                heroParam={one("hero")}
                vsParam={one("vs")}
                bot={bot}
                puzzle={router.query.puzzle !== undefined}
                mulligan={router.query.mulligan !== undefined}
              />
            ))}
          </Flex>
        )}
      </Box>
    </>
  );
}

export const getStaticProps: GetStaticProps = () =>
  process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_PRO_DEV_PAGES !== "1"
    ? { notFound: true }
    : { props: {} };
