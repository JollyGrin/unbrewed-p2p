import {
  Box,
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from "@chakra-ui/react";

import { Navbar } from "@/components/Navbar";
import { BagDecks } from "@/components/Bag/Deck";
import { BagMap } from "@/components/Bag/Map";
import { BagBulkContainer } from "@/components/Bag/Bulk";
import { PageSeo } from "@/components/Helmet/Head";
import { useRouter } from "next/router";

const BagPage = () => {
  const { query, push } = useRouter();
  const tab = query?.tab as number | undefined;

  return (
    <Flex flexDir={"column"} bg="brand.highlight" h="100svh">
      <PageSeo
        path="/bag"
        title="Deck Bag — Import Unmatched Decks & Maps | Unbrewed"
        description="Load Unmatched decks from unmatched.cards, the-unmatched.club, Tabletop Simulator exports, JSON, or image URLs. Manage your fan decks and custom maps in one place."
      />
      <Box color="brand.secondary">
        <Navbar />
      </Box>
      <Tabs
        flex="1"
        minH={0}
        display="flex"
        flexDirection="column"
        index={tab ? +tab : 0}
        onChange={(e) => {
          push({ query: { ...query, tab: e.toString() } });
        }}
      >
        <TabList borderColor="rgba(72, 40, 79, 0.25)" flexShrink={0}>
          <Tab fontFamily="SpaceGrotesk" fontWeight={700}>
            Decks
          </Tab>
          <Tab fontFamily="SpaceGrotesk" fontWeight={700}>
            Maps
          </Tab>
          <Tab fontFamily="SpaceGrotesk" fontWeight={700}>
            Backup &amp; Share
          </Tab>
        </TabList>

        <TabPanels flex="1" minH={0} overflow="hidden">
          <TabPanel
            h="100%"
            p={0}
            as={Flex}
            direction="column"
            bg="brand.secondary"
          >
            <BagDecks />
          </TabPanel>
          <TabPanel p={0} h="100%" overflow="hidden">
            <BagMap />
          </TabPanel>
          <TabPanel p={0} h="100%" bg="brand.highlight" overflowY="auto">
            <BagBulkContainer />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};
export default BagPage;
