/**
 * `/heroes` and `/heroes?h=<heroId>` (issue #938). A query param rather than
 * `/heroes/[id]`: the site is a static export, so this is one `heroes.html`
 * that reads `?h=` and `?window=` once the router hydrates (the `/stats?u=`
 * pattern). No `h` → the roster index; any `h` → that hero's ladder.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { heroIdFromQuery, windowFromQuery } from "@/lib/stats/heroPage";

import { HeroIndex } from "./HeroIndex";
import { HeroLadder } from "./HeroLadder";

export const HeroesPage = () => {
  const router = useRouter();
  // `isReady` is false on the first client render of a static export, when
  // the query is still empty; waiting avoids flashing the index before `?h=`.
  // A bare `/heroes` is ready on the client's first render but not on the
  // server's, so also wait for mount — otherwise the two renders disagree and
  // React throws a hydration error.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = router?.isReady !== false;
  if (!mounted || !ready) return null;
  const heroId = heroIdFromQuery(router?.query?.h);
  const window = windowFromQuery(router?.query?.window);
  return heroId ? <HeroLadder key={heroId} heroId={heroId} window={window} /> : <HeroIndex window={window} />;
};
