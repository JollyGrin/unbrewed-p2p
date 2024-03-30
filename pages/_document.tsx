import React from "react";
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      {/* @ts-ignore: weird github actions issue */}
      <Head />
      <body>
        {/* @ts-ignore: weird github actions issue */}
        <Main />
        {/* @ts-ignore: weird github actions issue */}
        <NextScript />
      </body>
    </Html>
  );
}
