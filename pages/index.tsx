import type { GetStaticProps } from "next";
import { LandingPage } from "@/components/LandingPage";
import { buildLandingCatalog, LandingCatalog } from "@/components/LandingPage/catalog";

type Props = { catalog: LandingCatalog };

const Homepage = ({ catalog }: Props) => {
  return <LandingPage catalog={catalog} />;
};

// Catalog counts are read at build time so the map fixtures stay server-side.
export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { catalog: buildLandingCatalog() },
});

export default Homepage;
