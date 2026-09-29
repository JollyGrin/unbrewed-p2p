import { PageSeo } from "@/components/Helmet/Head";
import { TablePage } from "@/components/TablePlace/TablePage";

/**
 * Prepare a table.place table and invite a friend (issue #1008). Hidden for
 * now: nothing links here until the feel check. Everything else lives in
 * components/TablePlace and lib/tableplace.
 */
export default function Table() {
  return (
    <>
      <PageSeo path="/table" title="3D Table — Unbrewed" noindex />
      <TablePage />
    </>
  );
}
