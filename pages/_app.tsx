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
import { extendTheme } from "@chakra-ui/react";
import { Space_Grotesk } from "next/font/google";

// Self-hosted Space Grotesk via next/font — replaces the fonts.googleapis.com
// <link> that used to live in PageSeo and tripped a Next.js warning. The font
// loader only works inside Next's build (not the renderFuzz CLI), so it lives
// here rather than in styles/style.ts where the theme token is declared.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});
const themeWithGrotesk = extendTheme(theme, {
  fonts: {
    SpaceGrotesk: `${spaceGrotesk.style.fontFamily}, sans-serif`,
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <Hydrate state={pageProps.dehydratedState}>
          <DocumentHeader />
          <ChakraProvider theme={themeWithGrotesk}>
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
