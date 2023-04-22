import React from "react";
import { DocumentHeader } from "@/components/Helmet/Head";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ChakraProvider } from "@chakra-ui/react";
import { theme } from "@/styles/style";
import { useState } from "react";
import {
  Hydrate,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import "@/styles/fonts.css";
import { Toaster } from "react-hot-toast";

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <Hydrate state={pageProps.dehydratedState}>
          <DocumentHeader />
          <ChakraProvider theme={theme}>
            <Toaster
              position="top-center"
              reverseOrder={false}
              gutter={8}
              containerClassName=""
              containerStyle={{}}
              toastOptions={{
                // Define default options
                className: "",
                duration: 5000,
                style: {
                  background: "#363636",
                  color: "#fff",
                },
              }}
            />
            <Component {...pageProps} />
          </ChakraProvider>
        </Hydrate>
      </QueryClientProvider>
    </>
  );
}
