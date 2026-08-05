/**
 * /share/deck/<id> — public landing for a shared cloud deck (#566).
 *
 * Same shape as pages/share/replay/[id].tsx (#567): unbrewed.xyz is a
 * `next export` static site, so this dynamic route can't be pre-rendered for
 * ids minted at runtime — `getStaticPaths` returns no paths and the export
 * emits no HTML for it. On GitHub Pages the URL falls through to 404.html,
 * which recognises the path and renders the very same landing (pages/404.tsx).
 * This file is what serves the route under `next dev` / `next start`, and keeps
 * the URL a real route rather than a 404-only special case.
 */
import type { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { ShareLanding } from "@/components/Share/ShareLanding";

export const getStaticPaths: GetStaticPaths = () => ({ paths: [], fallback: false });

export const getStaticProps: GetStaticProps = () => ({ props: {} });

const SharedDeckRoute = () => {
  const router = useRouter();
  const raw = router.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  // `undefined` until the router is ready — the landing shows its spinner.
  return <ShareLanding route="deck" id={router.isReady ? id : undefined} />;
};

export default SharedDeckRoute;
