import { Box } from "@chakra-ui/react";
import { drag } from "d3-drag";

const BoardPage = () => {
  const handler = drag();
  console.log({ handler });
  return <Box>Hello</Box>;
};

export default BoardPage;
