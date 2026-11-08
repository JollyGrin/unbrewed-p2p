import { ReactNode, useState } from "react";
import { Button, ButtonProps, Flex, Text } from "@chakra-ui/react";

/**
 * A destructive action in two taps (#1538 review): the trigger turns into
 * "<question> Yes · Cancel" in place, so a thumb that misses the link next
 * to it can't delete a deck from the account. Resets after either answer.
 */
export const DangerConfirm = ({
  label,
  question,
  confirmLabel = "Yes",
  onConfirm,
  trigger,
  size = "sm",
}: {
  /** the trigger's text, e.g. "Toss" */
  label: ReactNode;
  /** e.g. "Toss Alpha?" */
  question: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => void;
  /** styles for the trigger (a text link by default) */
  trigger?: ButtonProps;
  size?: "xs" | "sm";
}) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        variant="link"
        size={size}
        fontSize="0.82rem"
        fontWeight={700}
        color="brand.danger"
        textDecoration="underline"
        textUnderlineOffset="3px"
        minH="2rem"
        {...trigger}
        onClick={() => setAsking(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <Flex
      as="span"
      role="group"
      aria-label="Confirm"
      align="center"
      gap="0.4rem"
      flexWrap="wrap"
      fontSize="0.82rem"
    >
      <Text as="span" fontWeight={700}>
        {question}
      </Text>
      <Button
        size={size}
        h="2rem"
        px="0.8rem"
        bg="brand.danger"
        color="white"
        _hover={{ opacity: 0.9 }}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button size={size} h="2rem" variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </Flex>
  );
};
