import { PageSeo } from "@/components/Helmet/Head";
import { TablePage } from "@/components/TablePlace/TablePage";

/**
 * Prepare a table.place table and invite a friend (issue #1008). Reachable
 * from /connect via the "Try the 3D Table (beta)" button (issue #1192).
 * Everything else lives in components/TablePlace and lib/tableplace.
 */
export default function Table() {
  return (
    <>
      <PageSeo
        path="/table"
        title="3D Table — Unbrewed"
        description="Set up a 3D table for you and a friend: pick both decks and a map, and our lobby spawns a table at table.place — deal, drag, flip, stack, with minis for the heroes that have them."
      />
      <TablePage />
    </>
  );
}
