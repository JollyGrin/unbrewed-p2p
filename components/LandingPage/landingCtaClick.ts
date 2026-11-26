import type { MouseEvent } from "react";
import Router from "next/router";
import { trackLandingCta, type LandingSection } from "@/lib/growthAnalytics";
import { exposeExperiment } from "@/lib/experiments";
import { vsParamFor } from "@/lib/pro/vsParam";
import { VS_BOT_HREF } from "./content";

/**
 * onClick for a landing CTA link. Always sends `landing_cta_clicked` with the
 * link's own href. For the "Play a bot" links (`VS_BOT_HREF`) a plain left
 * click also runs the `first_bot_tier` experiment (#1611): the markup keeps the
 * medium href (static HTML, pre-hydration clicks, new-tab opens), and only a
 * variant other than medium swaps the destination at click time.
 */
export const landingCtaClick =
  (section: LandingSection, href: string) =>
  (e: MouseEvent<HTMLElement>): void => {
    trackLandingCta(section, href);
    if (href !== VS_BOT_HREF) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const variant = exposeExperiment("first_bot_tier");
    if (variant === null || variant === "medium") return;
    e.preventDefault();
    void Router.push(`/pro/game?vs=${vsParamFor(variant)}`);
  };
