/**
 * Where the in-game view's light notices go (issue #1679).
 *
 * On /pro/game they are toasts in the page's toaster. An embedded view (a
 * puzzle panel on the landing page) must not raise toasts on its host page, so
 * it hands the view an `onNotice` callback instead: every notice then arrives
 * there as plain text and nothing reaches react-hot-toast.
 */
import { toast as hotToast } from "react-hot-toast";

type NoticeOptions = { id?: string; icon?: string; duration?: number };

/** The part of react-hot-toast's `toast` the view uses. */
export interface ViewToast {
  (message: string, options?: NoticeOptions): unknown;
  loading: (message: string, options?: NoticeOptions) => unknown;
  error: (message: string, options?: NoticeOptions) => unknown;
  success: (message: string, options?: NoticeOptions) => unknown;
  dismiss: (id?: string) => void;
}

export type OnViewNotice = (text: string) => void;

/**
 * react-hot-toast itself when `getOnNotice` is absent; otherwise a stand-in
 * that forwards the text to the callback (read at call time, so the caller may
 * pass a fresh function every render). `dismiss` is a no-op there: how long a
 * routed notice stays up is the host's business.
 */
export const makeViewToast = (getOnNotice?: () => OnViewNotice | undefined): ViewToast => {
  if (!getOnNotice) return hotToast as unknown as ViewToast;
  const say = (message: string) => getOnNotice()?.(message);
  const routed = ((message: string) => say(message)) as ViewToast;
  routed.loading = say;
  routed.error = say;
  routed.success = say;
  routed.dismiss = () => {};
  return routed;
};
