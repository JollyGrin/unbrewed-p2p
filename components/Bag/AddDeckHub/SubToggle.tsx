import { HStack, Button } from "@chakra-ui/react";

/**
 * Small segmented control used inside a method panel to switch between
 * a couple of input styles (e.g. file vs. paste) without nesting
 * accordions.
 */
export const SubToggle = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) => {
  return (
    <HStack
      spacing={0}
      bg="rgba(72, 40, 79, 0.1)"
      borderRadius="full"
      p="0.2rem"
      w="fit-content"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Button
            key={opt.value}
            size="sm"
            variant="unstyled"
            h="auto"
            px="0.9rem"
            py="0.35rem"
            borderRadius="full"
            fontSize="0.8rem"
            fontWeight={active ? 700 : 500}
            bg={active ? "brand.secondary" : "transparent"}
            color={active ? "brand.primary" : "brand.secondary"}
            _hover={active ? {} : { bg: "rgba(72, 40, 79, 0.08)" }}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </Button>
        );
      })}
    </HStack>
  );
};
