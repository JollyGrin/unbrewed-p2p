/**
 * The loadout the DECK PREVIEW modal paints (ticket #623, epic #610).
 *
 * The preview answers one question — "what will MY copy of this deck look like
 * across the table?" — so it reads the same `GET /me/cosmetics` ledger the
 * /collection page spends against and the JOIN_ROOM encoder publishes, and it
 * projects it through the SAME `wireLoadoutFor` the wire uses. That shared
 * projection is the whole point: a preview that computed "which rims do I own"
 * its own way would eventually disagree with the rims a player actually takes
 * into a game, and a preview that lies is worse than no preview.
 *
 * Three rules it inherits from that projection for free:
 *
 *  1. A rim the player switched OFF is not shown — `tokenRim.enabled` is that
 *     opt-out, and the preview must honour it or the /collection switch would
 *     look broken.
 *  2. `unlockedTier: null` (telemetry outage) shows no token rim: the API said
 *     "we don't know", and painting a tier we could not confirm is the one way
 *     this could show somebody a reward they had not earned. Card rows are the
 *     API's own storage and survive the outage, so they still paint.
 *  3. A `<hero>-spice` remix falls back to its base hero's row, like every other
 *     cosmetics consumer.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what something LOOKS like and nothing
 * else. Nothing here reaches the engine, a log line, or a replay outcome.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { norm } from "@/lib/pro/cardAppearance";
import type { CosmeticRimTier } from "@/lib/pro/cosmetics";
import {
  HeroCosmetics,
  fetchCosmetics,
  rimTierName,
  wireLoadoutFor,
} from "./cosmetics";
import { useAccount } from "./useAccount";

/** What one hero's owned cosmetics look like, in the ladder's own vocabulary. */
export interface HeroPreviewLoadout {
  /** Rim per card SET, keyed by `norm(title)` — the key the art snapshot, the
   * rim registry and the API's `cardKey` all already agree on. All copies of a
   * set share the tier, which is what "upgrading Feint" means. */
  cardRims: Record<string, CosmeticRimTier>;
  /** The fighter-token rim, or null when none is unlocked, none is confirmed,
   * or the player has it switched off. */
  tokenRim: CosmeticRimTier | null;
}

/**
 * One hero's ledger rows -> what to paint, or null when there is NOTHING to
 * paint. Null is the toggle's own condition: no upgrades means no control,
 * because a switch that changes nothing is worse than no switch.
 */
export const previewLoadoutFor = (
  heroes: readonly HeroCosmetics[] | null | undefined,
  heroId: string | null | undefined,
): HeroPreviewLoadout | null => {
  const wire = wireLoadoutFor(heroes, heroId);
  if (!wire) return null;
  const cardRims: Record<string, CosmeticRimTier> = {};
  for (const { key, tier } of wire.cards ?? []) {
    // `rimTierName` clamps a beyond-the-ladder tier UP to the top paint — right
    // here, where the number came from points this player provably spent (and
    // deliberately unlike the wire decoder, which reads a remote assertion).
    const name = rimTierName(tier);
    if (name) cardRims[norm(key)] = name;
  }
  const tokenRim = rimTierName(wire.tokenRimTier ?? 0);
  // `wireLoadoutFor` answers non-null for a row with card entries even if every
  // one of them is off-ladder junk; nothing to paint is still nothing to paint.
  if (!tokenRim && Object.keys(cardRims).length === 0) return null;
  return { cardRims, tokenRim };
};

/**
 * The signed-in player's loadout for ONE hero, or null — for a guest, for a
 * hero they own nothing on, and for an API that didn't answer.
 *
 * Deliberately NOT `useCosmetics`: that hook is the /collection page's, it
 * fetches the moment an account exists, and this one hangs off a modal that is
 * mounted (closed) on every /pro visit. Gating on `enabled` is what keeps
 * opening the page free and the request to the one moment a player asked to see
 * their upgrades.
 *
 * Nothing here can delay the modal: the caller renders base art immediately and
 * the rims hydrate in when (if) the answer lands. There is no loading state on
 * purpose — "not yet" and "never" look identical, which is exactly the failure
 * behaviour this surface wants.
 */
export const useHeroPreviewLoadout = (
  heroId: string | null | undefined,
  enabled: boolean,
): HeroPreviewLoadout | null => {
  const { status } = useAccount();
  const signedIn = status === "signed-in";
  const [heroes, setHeroes] = useState<HeroCosmetics[] | null>(null);
  /** One request per mount, not one per open — the ledger covers every hero. */
  const requested = useRef(false);

  useEffect(() => {
    if (!signedIn) {
      // Signing out drops the numbers rather than previewing the previous
      // account's rims, and re-arms the request for whoever signs in next.
      requested.current = false;
      setHeroes(null);
      return;
    }
    if (!enabled || requested.current) return;
    requested.current = true;
    let alive = true;
    void fetchCosmetics().then((result) => {
      if (!alive) return;
      // A 503 still carries the stored ledger (see lib/account/cosmetics (1)),
      // so a telemetry blip must not make a player's upgrades appear to
      // evaporate. Anything else answers nothing, and nothing means no toggle.
      setHeroes(result.ok ? result.value.heroes : (result.degraded?.heroes ?? null));
    });
    return () => {
      alive = false;
    };
  }, [signedIn, enabled]);

  return useMemo(() => previewLoadoutFor(heroes, heroId), [heroes, heroId]);
};
