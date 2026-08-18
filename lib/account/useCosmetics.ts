/**
 * Cosmetic standing for /collection (ticket #614).
 *
 * Component state rather than a module store — the opposite choice from
 * `useBadges` and the same one `useAccountStats` makes, for the same reason:
 * there is exactly one consumer on exactly one page, and a remount should
 * genuinely re-ask. (Equipping cosmetics into a game is #615's problem, and it
 * reads the wire, not this hook.)
 *
 * The standing epic rules hold:
 *
 * 1. **A guest costs nothing.** Nothing fetches until the account probe says
 *    "signed-in", so a signed-out visitor still makes exactly one request.
 * 2. **No retry, no loud failure.** One `GET /me/cosmetics` per mount. An
 *    unreachable or 503 API is a quiet, DEGRADED page — the ledger the 503
 *    carries still renders, and spending is disabled rather than broken.
 * 3. **Writes are never optimistic about money.** A spend moves nothing until
 *    the server has agreed, and its reply carries the hero's whole block, so
 *    there is no local arithmetic to get wrong and nothing to roll back. The
 *    token-rim TOGGLE is the one exception (a boolean the server stores
 *    verbatim, no balance involved), and it rolls back on failure.
 */
import { useCallback, useEffect, useState } from "react";

import {
  CosmeticConstants,
  CosmeticsPayload,
  FALLBACK_CONSTANTS,
  HeroCosmetics,
  SpendResult,
  TokenRimResult,
  emptyHeroCosmetics,
  fetchCosmetics,
  postSpend,
  putTokenRim,
} from "./cosmetics";
import { useAccount } from "./useAccount";

/**
 * - `loading`     — the account probe or the cosmetics request is in flight
 * - `guest`       — nobody signed in (the page renders its own explainer)
 * - `offline`     — the accounts API itself is unreachable
 * - `unavailable` — signed in, but the numbers didn't come back → degraded page
 * - `ready`       — a payload in hand
 */
export type CosmeticsStatus =
  | "loading"
  | "guest"
  | "offline"
  | "unavailable"
  | "ready";

export interface CosmeticsState {
  status: CosmeticsStatus;
  heroes: HeroCosmetics[];
  constants: CosmeticConstants;
  /** A write is in flight; the grid disables itself rather than racing. */
  busy: boolean;
  /** This hero's block, synthesized when the API has never heard of them. */
  heroFor: (heroId: string) => HeroCosmetics;
  /** Buy one tier step. Resolves with the server's verdict for the caller to say. */
  upgrade: (heroId: string, cardKey: string, tier: number) => Promise<SpendResult>;
  /** Show or hide this hero's token rim in games. */
  setTokenRim: (heroId: string, enabled: boolean) => Promise<TokenRimResult>;
}

const EMPTY: CosmeticsPayload = { heroes: [], constants: FALLBACK_CONSTANTS };

export const useCosmetics = (): CosmeticsState => {
  const { status: accountStatus } = useAccount();
  const [payload, setPayload] = useState<CosmeticsPayload>(EMPTY);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const signedIn = accountStatus === "signed-in";

  useEffect(() => {
    if (!signedIn) {
      // Signing out drops the numbers rather than showing the previous
      // account's collection behind a sign-in prompt.
      setPayload(EMPTY);
      setFailed(false);
      setLoaded(false);
      return;
    }
    let alive = true;
    void fetchCosmetics().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setPayload(result.value);
      } else {
        setFailed(true);
        // The 503 body carries the stored ledger; keep it, so a player's
        // upgrades stay visible through a telemetry outage.
        if (result.degraded) setPayload(result.degraded);
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  /** Replace one hero's block, appending it when the API had never sent one. */
  const mergeHero = useCallback((hero: HeroCosmetics) => {
    setPayload((current) => {
      const known = current.heroes.some((row) => row.heroId === hero.heroId);
      return {
        ...current,
        heroes: known
          ? current.heroes.map((row) => (row.heroId === hero.heroId ? hero : row))
          : [...current.heroes, hero],
      };
    });
  }, []);

  const status: CosmeticsStatus =
    accountStatus === "guest"
      ? "guest"
      : accountStatus === "offline"
        ? "offline"
        : accountStatus === "loading" || !loaded
          ? "loading"
          : failed
            ? "unavailable"
            : "ready";

  const heroFor = useCallback(
    (heroId: string): HeroCosmetics =>
      payload.heroes.find((row) => row.heroId === heroId) ??
      // Not in the payload = never played and never bought. During an outage
      // that is "unknown", not "zero" — see `emptyHeroCosmetics`.
      emptyHeroCosmetics(heroId, !failed),
    [payload.heroes, failed],
  );

  const upgrade = useCallback(
    async (heroId: string, cardKey: string, tier: number): Promise<SpendResult> => {
      if (busy) return { ok: false, reason: "rate_limited", message: "One at a time." };
      setBusy(true);
      const result = await postSpend(heroId, cardKey, tier);
      // The reply IS the new state — balance, cards and rim as of the commit —
      // so nothing here recomputes a balance the server already knows.
      if (result.ok) mergeHero(result.hero);
      setBusy(false);
      return result;
    },
    [busy, mergeHero],
  );

  const setTokenRim = useCallback(
    async (heroId: string, enabled: boolean): Promise<TokenRimResult> => {
      // Optimistic, and only here: this is a stored boolean with no balance
      // behind it, so the switch may move first and step back if the write
      // fails. Nothing is spent either way.
      const apply = (value: boolean) =>
        setPayload((current) => {
          const known = current.heroes.some((row) => row.heroId === heroId);
          const patch = (row: HeroCosmetics): HeroCosmetics => ({
            ...row,
            tokenRim: { ...row.tokenRim, enabled: value },
          });
          return {
            ...current,
            heroes: known
              ? current.heroes.map((row) => (row.heroId === heroId ? patch(row) : row))
              : [...current.heroes, patch(emptyHeroCosmetics(heroId, !failed))],
          };
        });

      apply(enabled);
      const result = await putTokenRim(heroId, enabled);
      if (!result.ok) apply(!enabled);
      return result;
    },
    [failed],
  );

  return {
    status,
    heroes: payload.heroes,
    constants: payload.constants,
    busy,
    heroFor,
    upgrade,
    setTokenRim,
  };
};
