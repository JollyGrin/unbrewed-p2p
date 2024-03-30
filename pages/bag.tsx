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

const BagPage = () => {
  return (
    <Flex flexDir={"column"} bg="brand.highlight" h="100svh">
      <Box color="brand.secondary">
        <Navbar />
      </Box>
      <Tabs h="100%">
        <TabList>
          <Tab>Decks</Tab>
          <Tab>Maps</Tab>
          <Tab>Bulk Backup/Upload</Tab>
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
          <TabPanel p={0} h="100%" bg="brand.primary">
            <BagBulkContainer />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};
export default BagPage;
