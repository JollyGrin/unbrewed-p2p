import { TournamentsPage } from "@/components/Tournaments/TournamentsPage";

/**
 * `/tournaments` (browse), `/tournaments?t=<slug>` (event) and
 * `/tournaments?new=1` (create). Query params, not dynamic segments: the site is
 * a static export (see pages/stats.tsx).
 */
export default function Tournaments() {
  return <TournamentsPage />;
}
