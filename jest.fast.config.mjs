// `npm test`: every test except the slow render list in jest.slowTests.mjs.
import baseConfig from "./jest.config.mjs";
import { slowTestPatterns } from "./jest.slowTests.mjs";

export default async () => {
  const config = await baseConfig();
  return {
    ...config,
    testPathIgnorePatterns: [...(config.testPathIgnorePatterns ?? []), ...slowTestPatterns],
  };
};
