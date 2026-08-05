/**
 * /share/map/<id> — public landing for a shared custom map (#566). The deck
 * twin next door carries the note on why a static export needs both this route
 * and the 404.html rescue in pages/404.tsx.
 */
import type { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import { ShareLanding } from "@/components/Share/ShareLanding";

export const getStaticPaths: GetStaticPaths = () => ({ paths: [], fallback: false });

export const getStaticProps: GetStaticProps = () => ({ props: {} });

const SharedMapRoute = () => {
  const router = useRouter();
  const raw = router.query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return <ShareLanding route="map" id={router.isReady ? id : undefined} />;
};

export default SharedMapRoute;
