import { useCallback, useContext } from "react";
import { useRouter } from "next/router";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  HotseatControls,
  WebGameContext,
} from "@/lib/contexts/WebGameProvider";
import { useHotseatFlag } from "./hotseatSettings";

/**
 * Hotseat UI helpers (issue #1564): two players sharing one device on
 * /offline. The provider half is OfflineGameProvider (#1562).
 */

/** The page hotseat lives on. */
export const HOTSEAT_PATH = "/offline";

/** The first seat's key — the one /offline has always played as. */
export const SOLO_SEAT = "offline";

/** The seat `hotseat.addSeat` creates. */
export const OPPONENT_SEAT = "opponent";

/**
 * The hotseat controls, only on /offline. /irl mounts the same
 * OfflineGameProvider (so `hotseat` is set there too) and the online
 * providers leave it undefined; every hotseat element gates on this, so
 * nothing new renders on /game, /connect, /table or /irl.
 */
export const useHotseat = (): HotseatControls | undefined => {
  // Read softly: HandContainer (which mounts the pass-the-device cover) is
  // also rendered without a game provider.
  const hotseat = useContext(WebGameContext)?.hotseat;
  const { pathname } = useRouter();
  return pathname === HOTSEAT_PATH ? hotseat : undefined;
};

/** Hotseat with an opponent seated — the state Switch seat applies to. */
export const useActiveHotseat = (): HotseatControls | undefined => {
  const hotseat = useHotseat();
  return hotseat && hotseat.seats.length > 1 ? hotseat : undefined;
};

/**
 * Switch which seat this device plays. Moves the provider's writers
 * (`hotseat.setActive`) AND `?name=` together: GameShell, the hand, header,
 * menus, dice, log and analytics all resolve `self` from `?name=`, so the two
 * must never disagree.
 */
export const useSwitchSeat = () => {
  const hotseat = useHotseat();
  const router = useRouter();
  return useCallback(
    (name: string) => {
      if (!hotseat?.seats.includes(name)) return;
      hotseat.setActive(name);
      void router.replace(
        { query: { ...router.query, name } },
        undefined,
        { shallow: true },
      );
    },
    [hotseat, router],
  );
};

/** The seat after the active one (wraps) — what "Switch seat" moves to. */
export const nextSeat = (hotseat: HotseatControls): string => {
  const at = hotseat.seats.indexOf(hotseat.active);
  return hotseat.seats[(at + 1) % hotseat.seats.length];
};

/** The hero a deck plays, for labels. */
export const heroOf = (deck: DeckImportType | undefined): string | undefined =>
  deck?.deck_data?.hero?.name || deck?.name || undefined;

/** A seat's display name: its hero, falling back to the raw key. */
export const useSeatLabel = () => {
  const deckFor = useContext(WebGameContext)?.deckFor;
  return useCallback(
    (name: string) => heroOf(deckFor?.(name)) ?? name,
    [deckFor],
  );
};

/**
 * Whether the board is turned 180° right now: the "Rotate board" setting is
 * on and the second seat is playing. Always false outside an active hotseat,
 * so the sandbox board never turns.
 */
export const useBoardRotated = (): boolean => {
  const hotseat = useActiveHotseat();
  const [rotateBoard] = useHotseatFlag("rotateBoard");
  return !!hotseat && rotateBoard && hotseat.active !== hotseat.seats[0];
};
