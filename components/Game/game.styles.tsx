import { fonts } from "@/styles/style";
import { Flex, Tag } from "@chakra-ui/react";
import styled from "@emotion/styled";

export const StatTag = styled(Tag)`
  font-family: ${fonts.SpaceGrotesk};
  background-color: antiquewhite;

  .number {
    font-family: ${fonts.ArchivoNarrow};
    font-size: 1.25rem;
    padding-right: 10px;
  }
`;

export const CarouselTray = styled(Flex)`
  width: 100%;
  overflow-x: auto;
  overflow-y: clip;
`;
