import { useEffect, useRef, useState } from "react";
import { Box } from "@chakra-ui/react";
import { colors } from "@/styles/style";

/**
 * The /pro hero backdrop: a muted, looping clip of a real Pro game playing
 * behind the title block (unbrewed-p2p-504).
 *
 * Three things make this wallpaper rather than a feature:
 *
 * 1. It costs nothing on the critical path. Nothing at all renders on the
 *    server or on the first client render, so the statically exported HTML
 *    (`next export`) carries no <video>, no poster and no media URLs. The
 *    element is mounted from a `requestIdleCallback` after hydration, which is
 *    also what keeps the first render deterministic — a gate read during render
 *    would differ between server and client and blow up as a hydration
 *    mismatch. LCP stays the headline.
 *
 * 2. It is completely inert: `pointer-events: none`, `aria-hidden`, no controls,
 *    negative tabindex. It is not in the a11y tree and cannot be focused,
 *    clicked or scrubbed.
 *
 * 3. It backs off when it isn't wanted. Under reduced-motion, Save-Data, or
 *    below the `md` breakpoint the <source> children are never rendered, so the
 *    browser has nothing to fetch and only the ~64 KB poster is requested.
 *    `preload="none"` means even the playable path fetches the clip lazily.
 */

/** Chakra's default `md` breakpoint. Below this the clip never loads. */
const MD_BREAKPOINT = "48em";

/**
 * The contrast scrim, as measured (see the note at the usage site). `brand.
 * surfaceDim` at these alphas — the page background, so the wash reads as the
 * page dimming the clip rather than as a grey film over it.
 */
const SCRIM_TOP = "rgba(44, 24, 49, 0.45)";
const SCRIM_BOTTOM = "rgba(44, 24, 49, 0.30)";

interface HeroClip {
  id: string;
  /** Still frame shown before (and instead of) playback. */
  poster: string;
  /**
   * Ordered *smallest first* — the browser takes the first type it can play,
   * so byte size decides the order, not codec fashion. On this UI-dense,
   * mostly-static capture single-pass VP9 lost to x264: 0.61 MB mp4 vs 0.78 MB
   * webm at the specified quality settings, so mp4 leads.
   */
  sources: { src: string; type: string }[];
}

/**
 * One clip today. The array is the seam for a later rotation — a second capture
 * is a second entry, and only the picker below needs to change.
 */
const HERO_CLIPS: HeroClip[] = [
  {
    id: "thrall-vs-batman",
    poster: "/pro/hero/thrall-vs-batman-poster.webp",
    sources: [
      { src: "/pro/hero/thrall-vs-batman.mp4", type: "video/mp4" },
      { src: "/pro/hero/thrall-vs-batman.webm", type: "video/webm" },
    ],
  },
];

/**
 * Save-Data is a Chromium-only hint and is absent from the DOM lib types, so
 * it is read defensively rather than asserted onto Navigator.
 */
const prefersSaveData = () => {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
};

export const ProHeroVideo = () => {
  const clip = HERO_CLIPS[0];
  /** false until the post-hydration idle callback has run — see note 1 above. */
  const [attached, setAttached] = useState(false);
  /** whether the gates allow actually fetching and playing the clip */
  const [playable, setPlayable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Without matchMedia the reduced-motion and breakpoint gates cannot be
    // answered, and a backdrop is never worth overriding an accessibility
    // preference we failed to read — so stay dark instead of guessing. In
    // practice this is only jsdom; browsers have had matchMedia for a decade.
    if (typeof window.matchMedia !== "function") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia(`(min-width: ${MD_BREAKPOINT})`);

    const evaluate = () => {
      setPlayable(!reduced.matches && wide.matches && !prefersSaveData());
      setAttached(true);
    };

    // Defer the whole thing past hydration and past any work the browser still
    // has queued. The timeout is both a ceiling on idle-callback starvation and
    // the fallback for browsers without requestIdleCallback (Safari < 17).
    const supportsIdle = typeof window.requestIdleCallback === "function";
    const idleId = supportsIdle
      ? window.requestIdleCallback(evaluate, { timeout: 2000 })
      : window.setTimeout(evaluate, 500);

    // Keep honouring the gates if the user rotates, resizes, or flips the OS
    // reduced-motion switch while the page is open.
    reduced.addEventListener("change", evaluate);
    wide.addEventListener("change", evaluate);

    return () => {
      if (supportsIdle) window.cancelIdleCallback(idleId as number);
      else window.clearTimeout(idleId as number);
      reduced.removeEventListener("change", evaluate);
      wide.removeEventListener("change", evaluate);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playable) return;
    // React sets `muted` as a property, and it can land after the element has
    // already tried to autoplay; setting it directly keeps the clip inside the
    // muted-autoplay allowance. A rejected play() is fine — the poster stays.
    video.muted = true;
    void video.play().catch(() => undefined);
  }, [playable]);

  // Nothing on the server, nothing in the first commit, nothing in the export.
  if (!attached) return null;

  return (
    <Box
      aria-hidden="true"
      position="absolute"
      top="0"
      left="0"
      right="0"
      height="100svh"
      overflow="hidden"
      pointerEvents="none"
      zIndex={0}
    >
      <video
        // Remounting on the gate flip is what re-runs source selection: a
        // <source> appended to a live <video> is ignored without an explicit
        // load(), and remounting expresses "these are different elements"
        // rather than hiding an imperative reload.
        key={playable ? "clip" : "poster-only"}
        ref={videoRef}
        poster={clip.poster}
        preload="none"
        autoPlay={playable}
        muted
        loop
        playsInline
        controls={false}
        disablePictureInPicture
        tabIndex={-1}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // Blur softens the UI text in the capture so it reads as texture
          // instead of competing copy; the dimming is what buys the headline
          // its contrast ratio. These four numbers are load-bearing — see the
          // scrim note below before touching them.
          filter: "blur(3px) saturate(0.85) brightness(0.42)",
          opacity: 0.3,
          // The blur samples transparent pixels past the edges, which shows up
          // as a pale vignette; overscanning hides it.
          transform: "scale(1.06)",
        }}
      >
        {/* Gated: with no <source> children the browser fetches only the
            poster, so reduced-motion / Save-Data / mobile never see a byte of
            video. This is the gate — not a `display: none` or a paused clip. */}
        {playable &&
          clip.sources.map((source) => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
      </video>

      {/*
        Contrast scrim. The capture is UI-dense — the parchment activity log and
        the lava-lit board are far too bright to sit under gold text — so the
        video is dimmed above and this purple wash is laid over it.
        Verified numerically over all 480 frames of the loop, compositing the
        exact stack below (video filter → this scrim → the page's scanline +
        gold spotlight layer) and taking the brightest *pixel* of the brightest
        *frame*, not an average:
            #E0A82E "Pro"      4.63:1   (AA needs 4.5:1)
            #FAEBD7 "Unbrewed" 8.47:1
        The measurement ignores the blur and applies the gold spotlight at full
        strength everywhere, so the real ratios are better than these.
      */}
      <Box
        position="absolute"
        inset="0"
        bg={`linear-gradient(180deg, ${SCRIM_TOP} 0%, ${SCRIM_BOTTOM} 100%)`}
      />
      {/* Fade the bottom edge out so the clip ends as atmosphere rather than a
          hard horizontal seam across the CTA row. Only ever darkens, so it
          cannot weaken the ratios above. */}
      <Box
        position="absolute"
        inset="0"
        bg={`linear-gradient(180deg, transparent 55%, ${colors.brand.surfaceDim} 100%)`}
      />
    </Box>
  );
};
