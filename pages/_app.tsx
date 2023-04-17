import { DocumentHeader } from "@/components/Head";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ChakraProvider } from "@chakra-ui/react";
import { theme } from "@/styles/style";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <DocumentHeader />
      <ChakraProvider theme={theme}>
        <Component {...pageProps} />
      </ChakraProvider>
    </>
  );
}
