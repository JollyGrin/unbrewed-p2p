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
      <PageSeo path="/table" title="3D Table — Unbrewed" />
      <TablePage />
    </>
  );
}
