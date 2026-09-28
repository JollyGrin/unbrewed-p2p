import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render } from "@testing-library/react";

import Custom404 from "@/pages/404";

/**
 * `/offline/<deckId>` referral links land on 404.html (static export) and are
 * repointed to `/offline?deckId=` — Labs ids included, escaped colon or not (#979).
 */

const mockRouter = { asPath: "/", push: jest.fn() };
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));

const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

const land = (asPath: string) => {
  mockRouter.asPath = asPath;
  mockRouter.push.mockClear();
  render(
    <ChakraProvider>
      <Custom404 />
    </ChakraProvider>,
  );
  return mockRouter.push.mock.calls[0]?.[0];
};

it.each([
  ["/offline/pk1x", "pk1x"],
  [`/offline/labs:${MAROUINE}`, `labs:${MAROUINE}`],
  [`/offline/labs%3A${MAROUINE}`, `labs:${MAROUINE}`],
])("repoints %s to /offline?deckId=%s", (path, deckId) => {
  expect(land(path)).toEqual({ pathname: "offline", query: { deckId, name: "offline" } });
});
