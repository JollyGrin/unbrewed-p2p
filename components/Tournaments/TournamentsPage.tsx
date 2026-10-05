import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { BrowseView } from "./BrowseView";
import { CreateView } from "./CreateView";
import { EventView } from "./EventView";
import { MatchView } from "./MatchView";

const first = (raw: string | string[] | undefined): string | null => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const t = typeof v === "string" ? v.trim() : "";
  return t.length > 0 ? t : null;
};

export const TournamentsPage = () => {
  const router = useRouter();
  // First client render of a static export has an empty `query` (see
  // PublicProfilePage): don't flash the browse list at an event link.
  // `mounted` keeps the first client render identical to the prerendered one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ready = mounted && router?.isReady !== false;
  if (!ready) return null;
  const slug = first(router?.query?.t);
  const matchId = first(router?.query?.m);
  if (slug && matchId) return <MatchView slug={slug} matchId={matchId} />;
  if (slug)
    return (
      <EventView
        slug={slug}
        justCreated={first(router?.query?.share) === "1"}
      />
    );
  if (first(router?.query?.new) === "1") return <CreateView />;
  return <BrowseView />;
};
