/** @type {import('next').NextConfig} */

const pathPrefix = process.env.NODE_ENV === "production" ? "/unbrewed-v2" : "";

console.log("xxxx", process.env.NODE_ENV);
const nextConfig = {
  assetPrefix: pathPrefix,
  env: {
    pathPrefix,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
