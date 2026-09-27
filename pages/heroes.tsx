import { HeroesPage } from "@/components/Heroes/HeroesPage";

/**
 * `/heroes` (the hero index) and `/heroes?h=<heroId>` (one hero's ladder).
 * A query param, not a dynamic segment: the site is statically exported, so
 * this emits one plain `heroes.html` that reads `?h=` on the client — the same
 * pattern as `/stats?u=`.
 */
export default function Heroes() {
  return <HeroesPage />;
}
