import { getBoardViewControls } from "@/components/BoardCanvas/boardView";
import {
  DISCARD_SELECTED_CARD,
  useKeybindHandler,
} from "@/lib/keybinds/handlers";

const ZOOM_STEP = 1.25;
const zoomIn = () => getBoardViewControls()?.zoomBy(ZOOM_STEP);
const zoomOut = () => getBoardViewControls()?.zoomBy(1 / ZOOM_STEP);
const fitBoard = () => getBoardViewControls()?.fit();

/**
 * The board's shortcuts: the selected card or piece, and the view. Each
 * selection action is passed only while it applies (a card can go to hand, a
 * piece cannot), which is what leaves the key alone the rest of the time.
 */
export const useBoardKeybinds = (selection: {
  flip?: () => void;
  toHand?: () => void;
  /** Discard the selected card, or delete the selected piece. */
  remove?: () => void;
  /** Discard the selected card; absent for a piece (what Backspace runs). */
  discardCard?: () => void;
  clear?: () => void;
}) => {
  useKeybindHandler("flipSelected", selection.flip);
  useKeybindHandler("handSelected", selection.toHand);
  useKeybindHandler("removeSelected", selection.remove);
  useKeybindHandler(DISCARD_SELECTED_CARD, selection.discardCard);
  useKeybindHandler("clearSelection", selection.clear);
  useKeybindHandler("zoomIn", zoomIn);
  useKeybindHandler("zoomOut", zoomOut);
  useKeybindHandler("fitBoard", fitBoard);
};
