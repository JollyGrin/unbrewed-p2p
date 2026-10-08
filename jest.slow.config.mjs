// `npm run test:slow`: only the slow render list in jest.slowTests.mjs.
import baseConfig from "./jest.config.mjs";
import { slowTests } from "./jest.slowTests.mjs";

export default async () => {
  const config = await baseConfig();
  return {
    ...config,
    testMatch: slowTests.map((path) => `<rootDir>/${path}`),
  };
};
