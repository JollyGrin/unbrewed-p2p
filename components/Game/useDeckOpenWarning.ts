import { useState } from "react";
import { ModalType } from "@/pages/game";

// Opening the deck modal shuffles the deck on close (game.modal-template.tsx)
// to prevent stacking it — warn the player once per game before that happens.
const SESSION_KEY = "unbrewed-deck-open-ack";

const canStore = () => typeof window !== "undefined";

const hasAcknowledged = () =>
  canStore() && sessionStorage.getItem(SESSION_KEY) === "1";

/**
 * Wraps a `setModalType` setter so opening the "deck" modal shows a
 * cancelable warning the first time each session; every other modal type
 * (including `false` to close) passes through unchanged.
 */
export const useDeckOpenWarning = (setModalType: (type: ModalType) => void) => {
  const [pendingWarning, setPendingWarning] = useState(false);

  const requestModal = (type: ModalType) => {
    if (type === "deck" && !hasAcknowledged()) {
      setPendingWarning(true);
      return;
    }
    setModalType(type);
  };

  const confirmOpen = () => {
    if (canStore()) sessionStorage.setItem(SESSION_KEY, "1");
    setPendingWarning(false);
    setModalType("deck");
  };

  const cancelOpen = () => setPendingWarning(false);

  return { requestModal, pendingWarning, confirmOpen, cancelOpen };
};
