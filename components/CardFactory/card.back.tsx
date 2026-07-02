import { FC } from "react";
import { Flex } from "@chakra-ui/react";
import { IconLogo } from "../Icons/IconLogo";

/**
 * Generic face-down card. The pool synced over the websocket doesn't
 * carry the deck's cardbackUrl, so every hidden card gets the house back.
 */
export const CardBack: FC<{ width?: string; height?: string }> = ({
  width = "300px",
  height = "420px",
}) => {
  return (
    <Flex
      w={width}
      h={height}
      alignItems="center"
      justifyContent="center"
      borderRadius="12px"
      border="6px solid"
      borderColor="brand.primary"
      bg={`
        radial-gradient(circle at 50% 42%, rgba(231, 204, 152, 0.18) 0%, rgba(231, 204, 152, 0) 55%),
        repeating-linear-gradient(45deg, rgba(231, 204, 152, 0.06) 0 6px, transparent 6px 12px),
        linear-gradient(160deg, #48284F 0%, #2C1831 100%)
      `}
      boxShadow="0 6px 18px rgba(20, 8, 24, 0.45)"
      userSelect="none"
    >
      <IconLogo color="rgba(231, 204, 152, 0.55)" boxSize="30%" />
    </Flex>
  );
};
