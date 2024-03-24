import Head from "next/head";
import Script from "next/script";

export const DocumentHeader = () => {
  return (
    <>
      <Head>
        <title>Unbrewed Online</title>
        <meta
          name="description"
          content="Play Unmatched fandecks online with friends"
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scaleable=0"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;700&display=swap"
          rel="stylesheet"
        ></link>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Script
        src="https://cdn.counter.dev/script.js"
        data-id="74aa2526-c0ed-4d9b-8547-a5cfedcb301a"
        data-utcoffset="1"
      />
    </>
  );
};
