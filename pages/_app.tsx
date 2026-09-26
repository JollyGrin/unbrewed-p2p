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
import { Global } from "@emotion/react";
import { Space_Grotesk } from "next/font/google";

// Self-hosted Space Grotesk via next/font — replaces the fonts.googleapis.com
// <link> that used to live in PageSeo and tripped a Next.js warning. The
// loader call must live in this file for Next to emit its @font-face CSS
// (a shared-module import doesn't). We expose the family as a :root CSS var
// via a global style (works for Chakra portals, which mount on <body> with
// no wrapper ancestor) — styles/style.ts `fonts.SpaceGrotesk` resolves
// through `var(--font-space-grotesk)`, so both the Chakra theme token and
// every direct `fonts.SpaceGrotesk` import get the self-hosted face.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <>
      <Global
        styles={`:root { --font-space-grotesk: ${spaceGrotesk.style.fontFamily}; }`}
      />
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
                // className: "unbrewed-",
                duration: 5000,
                style: {
                  background: "#363636",
                  color: "#fff",
                },
              }}
            />
            {/* @ts-ignore */}
            <Component {...pageProps} />
          </ChakraProvider>
        </Hydrate>
      </QueryClientProvider>
    </>
  );
}
