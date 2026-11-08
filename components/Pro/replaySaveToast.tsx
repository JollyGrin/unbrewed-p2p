import { Link } from "@chakra-ui/react";
import { toast } from "react-hot-toast";
import type { SaveResult } from "@/lib/pro/replayStore";

const ReplaysLink = ({ toastId }: { toastId: string }) => (
  <Link href="/pro/replays" color="brand.accent" onClick={() => toast.dismiss(toastId)}>
    Replays
  </Link>
);

/**
 * Toast the outcome of saving a finished match to the local Replays store.
 * A failed save used to be silent (#1551). It fails when localStorage is full
 * or when only starred replays are left to evict, so the copy points at
 * Replays (unstar or delete) rather than claiming storage is full.
 */
export function toastReplaySaveResult(res: SaveResult): void {
  if (res.ok) {
    toast.success(
      (t) => (
        <span>
          Match saved to <ReplaysLink toastId={t.id} />
        </span>
      ),
      { duration: 6000 }
    );
    return;
  }
  toast.error(
    (t) => (
      <span>
        Couldn&apos;t save this replay — free up space in <ReplaysLink toastId={t.id} />
      </span>
    ),
    { id: "replay-save-failed", duration: 7000 }
  );
}
