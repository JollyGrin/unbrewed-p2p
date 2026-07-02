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
import { useRouter } from "next/router";

const BagPage = () => {
  const { query, push } = useRouter();
  const tab = query?.tab as number | undefined;

  return (
    <Flex flexDir={"column"} bg="brand.highlight" h="100svh">
      <Box color="brand.secondary">
        <Navbar />
      </Box>
      <Tabs
        h="100%"
        index={tab ? +tab : 0}
        onChange={(e) => {
          push({ query: { ...query, tab: e.toString() } });
        }}
      >
        <TabList borderColor="rgba(72, 40, 79, 0.25)">
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

        <TabPanels h="100%">
          <TabPanel
            h="100%"
            p={0}
            as={Flex}
            direction="column"
            bg="brand.secondary"
          >
            <BagDecks />
          </TabPanel>
          <TabPanel p={0} h="100%">
            <BagMap />
          </TabPanel>
          <TabPanel p={0} h="100%" bg="brand.highlight">
            <BagBulkContainer />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};
export default BagPage;
