/** The tournaments page shell's description (p2p #1279, UX P5): not "single-elimination" only. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render } from "@testing-library/react";

import { Page } from "./ui";

jest.mock("next/head", () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock("next/script", () => ({ __esModule: true, default: () => null }));
jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn(), asPath: "/" }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

it("describes brackets AND round robins", () => {
  const { container } = render(
    <ChakraProvider>
      <Page title="Tournaments" path="/tournaments" heading="Tournaments">
        <p />
      </Page>
    </ChakraProvider>,
  );
  const meta = container.querySelector('meta[name="description"]');
  expect(meta).toHaveAttribute("content", "Async tournaments for Unbrewed Pro: brackets and round robins, played on your own time.");
});
