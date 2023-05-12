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
  -webkit-overflow-scrolling: touch; /* Enables momentum scrolling on iOS devices */

  /* Styles for WebKit based browsers (e.g., Chrome, Safari) */
  ::-webkit-scrollbar {
    width: 2px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background-color: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background-color: #550055;
    border-radius: 100px;
  }

  /* Styles for Firefox */
  /* Note: Firefox uses a different syntax for scrollbar customization */
  /* You may need to adjust the color and size according to your preference */
  /* Firefox currently (as of September 2021) does not support styling the thumb color */
  * {
    scrollbar-width: thin;
    scrollbar-color: #ccc transparent;
  }
`;
