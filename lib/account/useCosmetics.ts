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
 *    display-pref TOGGLES are the one exception (booleans the server stores
 *    verbatim, no balance involved), and they roll back on failure.
 */
import { useCallback, useEffect, useState } from "react";

import {
  CosmeticConstants,
  CosmeticsPayload,
  FALLBACK_CONSTANTS,
  HeroCosmetics,
  RimPrefResult,
  SpendResult,
  emptyHeroCosmetics,
  fetchCosmetics,
  postSpend,
  putCardRims,
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
  setTokenRim: (heroId: string, enabled: boolean) => Promise<RimPrefResult>;
  /** Show or hide ALL of this hero's bought card rims in games (#627). */
  setCardRims: (heroId: string, enabled: boolean) => Promise<RimPrefResult>;
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

  /**
   * The optimistic display-pref write, shared by both switches.
   *
   * Optimistic, and only here: a pref is a stored boolean with no balance
   * behind it, so the switch may move first and step back if the write fails.
   * Nothing is spent either way. `set` patches one hero's row; `write` is the
   * endpoint that agrees or doesn't.
   */
  const setPref = useCallback(
    async (
      heroId: string,
      enabled: boolean,
      set: (row: HeroCosmetics, value: boolean) => HeroCosmetics,
      write: (heroId: string, enabled: boolean) => Promise<RimPrefResult>,
    ): Promise<RimPrefResult> => {
      const apply = (value: boolean) =>
        setPayload((current) => {
          const known = current.heroes.some((row) => row.heroId === heroId);
          return {
            ...current,
            heroes: known
              ? current.heroes.map((row) => (row.heroId === heroId ? set(row, value) : row))
              : [...current.heroes, set(emptyHeroCosmetics(heroId, !failed), value)],
          };
        });

      apply(enabled);
      const result = await write(heroId, enabled);
      if (!result.ok) apply(!enabled);
      return result;
    },
    [failed],
  );

  const setTokenRim = useCallback(
    (heroId: string, enabled: boolean): Promise<RimPrefResult> =>
      setPref(
        heroId,
        enabled,
        (row, value) => ({ ...row, tokenRim: { ...row.tokenRim, enabled: value } }),
        putTokenRim,
      ),
    [setPref],
  );

  const setCardRims = useCallback(
    (heroId: string, enabled: boolean): Promise<RimPrefResult> =>
      setPref(
        heroId,
        enabled,
        // Only the pref moves: `cards` is the ledger of what the player owns,
        // and hiding rims must never look like losing them.
        (row, value) => ({ ...row, cardRims: { enabled: value } }),
        putCardRims,
      ),
    [setPref],
  );

  return {
    status,
    heroes: payload.heroes,
    constants: payload.constants,
    busy,
    heroFor,
    upgrade,
    setTokenRim,
    setCardRims,
  };
};
