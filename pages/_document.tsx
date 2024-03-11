import React from "react";
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      {/* @ts-expect-error: jsx */}
      <Head />
      <body>
        <Main />
        {/* @ts-expect-error: jsx */}
        <NextScript />
      </body>
    </Html>
  );
}
