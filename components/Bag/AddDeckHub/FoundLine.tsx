import { ReactNode } from "react";
import { Text } from "@chakra-ui/react";

/** "✓ Found it: Unmatched Labs set · 3 heroes · by X" under the paste bar. */
export const FoundLine = ({
  children,
  tone = "found",
}: {
  children: ReactNode;
  tone?: "found" | "working" | "problem";
}) => (
  <Text
    data-testid="paste-found"
    role={tone === "problem" ? "alert" : "status"}
    fontSize="0.85rem"
    color={tone === "problem" ? "brand.danger" : "brand.secondary"}
    opacity={tone === "working" ? 0.75 : 1}
    mt="0.5rem"
  >
    {tone === "found" && (
      <Text as="b" mr="0.3rem">
        ✓ Found it:
      </Text>
    )}
    {children}
  </Text>
);
