/**
 * Public share landing for a cloud replay (#567) — what a link recipient sees.
 *
 * Deliberately NOT flag-gated: a shared link is usually someone's first contact
 * with replays, so it must work on a clean, signed-out profile with the
 * `replays` beta flag off (the upload UI on /pro/replays stays behind the flag).
 *
 * Load order is the same one every imported bundle already goes through: fetch
 * the public payload → structural gate (assertBundle) → authoritative
 * validation + expansion by the engine's POST /replay → scrubber. A tampered or
 * incompatible bundle therefore lands on the error card below, never on a
 * half-rendered board.
 *
 * One shortcut, and it is the point of #701: if the stored bundle carries the
 * `frames` frozen in at upload time, those are played directly and the engine is
 * never asked. That is what stops a public link from rotting the next time the
 * engine ships — see lib/pro/replayFrames.ts for the trade-off it makes. A
 * bundle with no (or unreadable) frames takes the engine path exactly as before,
 * which since engine #509 can also come back digest-verified or truncated.
 */
import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Box, Button, Flex, Heading, Spinner, Text } from "@chakra-ui/react";
import { TbDeviceFloppy, TbDownload, TbPlayerPlay } from "react-icons/tb";
import type { ReplayBundle, ReplayExpansion } from "@/lib/pro/protocol";
import { fetchSharedReplay } from "@/lib/pro/replayCloud";
import { fetchReplayExpansion } from "@/lib/pro/replayApi";
import { expansionFromFrames, readFrames } from "@/lib/pro/replayFrames";
import { replayVerificationNotice } from "@/lib/pro/replayVerification";
import { assertBundle, downloadBundle, replayLabel } from "@/lib/pro/replayShare";
import { saveReplay } from "@/lib/pro/replayStore";
import { parseSharePath } from "@/lib/share/sharedItem";
import { ReplayScrubber } from "@/components/Pro/ReplayScrubber";
import {
  ReplayDivergenceBanner,
  ReplayVerifiedBadge,
} from "@/components/Pro/ReplayVerificationNotice";
import { replayCosmetics } from "@/lib/pro/seatCosmetics";

const TABLE_BG = "radial-gradient(ellipse at 50% 20%, #5A3263 0%, #48284F 50%, #2C1831 100%)";
const BTN = { size: "sm" as const, bg: "whiteAlpha.200", color: "brand.parchment", _hover: { bg: "whiteAlpha.400" } };
const BTN_GOLD = { ...BTN, bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accentDeep" } };

type Loaded = {
  bundle: ReplayBundle;
  expansion: ReplayExpansion;
  title: string;
};

type Phase =
  | { status: "loading" }
  | { status: "error"; heading: string; message: string }
  | { status: "ready"; loaded: Loaded };

const Shell = ({ children }: { children: React.ReactNode }) => (
  <Box minH="100svh" bg={TABLE_BG} color="brand.parchment">
    <Flex direction="column" align="center" justify="center" minH="100svh" gap="1rem" px="1rem" textAlign="center">
      {children}
    </Flex>
  </Box>
);

export const ReplayShareLanding = ({ id }: { id: string | null }) => {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [watching, setWatching] = useState(false);
  const [saved, setSaved] = useState<null | { ok: boolean; message: string }>(null);

  useEffect(() => {
    // `id` is null until the router is ready; wait rather than 404-ing early.
    if (!id) return;
    let alive = true;
    setPhase({ status: "loading" });

    (async () => {
      const fetched = await fetchSharedReplay(id);
      if (!alive) return;
      if (!fetched.ok) {
        setPhase({
          status: "error",
          heading: fetched.reason === "not_found" ? "Replay not found" : "Couldn't load that replay",
          message: fetched.message,
        });
        return;
      }

      let bundle: ReplayBundle;
      try {
        bundle = assertBundle(fetched.replay.bundle);
      } catch (e) {
        setPhase({
          status: "error",
          heading: "This replay looks corrupted",
          message: e instanceof Error ? e.message : "The shared data isn't a replay bundle.",
        });
        return;
      }

      const title = fetched.replay.title || replayLabel(bundle);

      // Frames frozen in at upload time (#701) — play them and skip the engine
      // entirely, which is what makes the link outlive engine releases.
      const frames = readFrames(fetched.replay.bundle);
      if (frames) {
        setPhase({ status: "ready", loaded: { bundle, expansion: expansionFromFrames(frames), title } });
        return;
      }

      // No frames (an upload from before #701, or a bundle whose frames didn't
      // survive): authoritative gate: the engine re-runs the action log and
      // refuses one it can neither match nor digest-verify.
      const expanded = await fetchReplayExpansion(bundle);
      if (!alive) return;
      if (!expanded.ok) {
        setPhase({
          status: "error",
          heading:
            expanded.code === "VERSION_MISMATCH"
              ? "This replay is too old to replay"
              : "This replay couldn't be verified",
          message: expanded.message,
        });
        return;
      }
      setPhase({
        status: "ready",
        loaded: { bundle, expansion: expanded.expansion, title },
      });
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const onSave = useCallback(() => {
    if (phase.status !== "ready") return;
    const result = saveReplay(phase.loaded.bundle);
    setSaved(
      result.ok
        ? { ok: true, message: "Saved to this browser — find it under Pro → Replays." }
        : { ok: false, message: result.error ?? "Couldn't save it on this device." },
    );
  }, [phase]);

  if (phase.status === "loading") {
    return (
      <Shell>
        <Spinner color="brand.accent" size="lg" />
        <Text opacity={0.8}>Loading shared replay…</Text>
      </Shell>
    );
  }

  if (phase.status === "error") {
    return (
      <Shell>
        <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem">
          {phase.heading}
        </Heading>
        <Text opacity={0.8} maxW="30rem">
          {phase.message}
        </Text>
        <Flex gap="0.5rem">
          <Button {...BTN_GOLD} as={Link} href="/pro">
            Go to Unbrewed Pro
          </Button>
        </Flex>
      </Shell>
    );
  }

  const { loaded } = phase;
  // Same notice the scrubber shows, so the recipient knows before pressing play
  // whether they are about to watch the whole game (#701).
  const notice = replayVerificationNotice(loaded.expansion);

  if (watching) {
    return (
      <ReplayScrubber
        expansion={loaded.expansion}
        cosmetics={replayCosmetics(loaded.bundle)}
        onExit={() => setWatching(false)}
      />
    );
  }

  return (
    <Shell>
      <Flex gap="0.5rem" align="center">
        <Text fontSize="0.8rem" letterSpacing="0.12em" opacity={0.6}>
          SHARED REPLAY
        </Text>
        <ReplayVerifiedBadge notice={notice} />
      </Flex>
      <Heading fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.05em" fontSize="2.5rem" maxW="34rem">
        {loaded.title}
      </Heading>
      <Text opacity={0.75} fontSize="0.9rem" maxW="30rem">
        {notice.lastVerifiedTurn !== null
          ? `${loaded.bundle.meta.turns} turns played, ${notice.lastVerifiedTurn} playable`
          : `${loaded.bundle.meta.turns} turns`}{" "}
        · re-watch it in full God-view — every hand, deck, and token, step by step.
      </Text>

      <ReplayDivergenceBanner notice={notice} />

      <Flex gap="0.5rem" flexWrap="wrap" justify="center" mt="0.5rem">
        {/* Nothing verified survived (#701) — no button that leads to an empty board. */}
        <Button
          {...BTN_GOLD}
          leftIcon={<TbPlayerPlay />}
          onClick={() => setWatching(true)}
          isDisabled={notice.unplayable}
        >
          Watch replay
        </Button>
        <Button {...BTN} leftIcon={<TbDeviceFloppy />} onClick={onSave} isDisabled={!!saved?.ok}>
          {saved?.ok ? "Saved to this device" : "Save to my device"}
        </Button>
        <Button {...BTN} leftIcon={<TbDownload />} onClick={() => downloadBundle(loaded.bundle)}>
          Download .json
        </Button>
      </Flex>

      {saved && (
        <Text fontSize="0.75rem" color={saved.ok ? "brand.accent" : "#E06A5E"}>
          {saved.message}
        </Text>
      )}

      <Text fontSize="0.75rem" opacity={0.5} mt="1rem">
        <Link href="/pro">Unbrewed Pro</Link> — rules-enforced Unmatched in your browser.
      </Text>
    </Shell>
  );
};

/**
 * Pull the replay id out of a `/share/replay/<id>` URL, or null for any other
 * path. The static export can't pre-render a runtime-minted id, so GitHub Pages
 * serves 404.html for these links and pages/404.tsx uses this to render the
 * landing in place instead of the "Whoops!" copy.
 *
 * Delegates to the one `/share/<kind>/<id>` parser (#566 added `deck`/`map`
 * links through the same rescue), so all three link shapes agree on what counts
 * as a share URL.
 */
export const sharedReplayIdFromPath = (asPath: string): string | null => {
  const share = parseSharePath(asPath);
  return share?.kind === "replay" ? share.id : null;
};

/** Wrapper adding the page chrome, shared by the route and the 404 rescue. */
export const ReplaySharePage = ({ id }: { id: string | null }) => (
  <>
    <Head>
      <title>Unbrewed — shared replay</title>
      <meta name="robots" content="noindex" />
    </Head>
    <ReplayShareLanding id={id} />
  </>
);
