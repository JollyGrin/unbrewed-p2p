import { Box, Button, Text } from "@chakra-ui/react";
import { TAP_TARGET } from "@/lib/pro/mobileLayout";

/**
 * The Undo control (issue #1407). One component for the dock and the phone
 * bars, in three states: enabled (`canUndo`), disabled with a reason line
 * (nothing eligible — the engine says only "not now", so the copy is generic),
 * and pending (our UNDO_REQUEST is out, awaiting the consent flow). It
 * changes no rule: `canUndo` and `onUndo` are the existing protocol v11 flow.
 */
export const UndoButton = ({
  canUndo,
  pending,
  onUndo,
  compact = false,
}: {
  canUndo: boolean;
  pending: boolean;
  onUndo: () => void;
  /** a phone bar: a labelled button only, no reason line under it */
  compact?: boolean;
}) => {
  const disabled = pending || !canUndo;
  const state = pending ? "pending" : canUndo ? "enabled" : "disabled";
  const reason = "Nothing to undo yet";
  return (
    <Box data-testid="pro-undo" data-undo-state={state} flexShrink={0}>
      <Button
        w="100%"
        minH={compact ? TAP_TARGET : "2.75rem"}
        px="1rem"
        fontWeight={700}
        fontSize={compact ? "0.85rem" : "0.95rem"}
        isDisabled={disabled}
        aria-label={pending ? "Undo requested, waiting for a reply" : "Undo move"}
        title={!canUndo && !pending ? reason : undefined}
        onClick={onUndo}
        {...(canUndo && !pending
          ? { bg: "brand.accent", color: "brand.surfaceDim", _hover: { bg: "brand.accent" } }
          : {
              variant: "outline",
              borderStyle: "dashed",
              borderColor: "rgba(231, 204, 152, 0.3)",
              color: "rgba(231, 204, 152, 0.55)",
            })}
      >
        {pending ? "Undo requested…" : "↶ Undo move"}
      </Button>
      {!compact && !canUndo && !pending && (
        <Text data-testid="pro-undo-reason" mt="0.2rem" fontSize="0.7rem" opacity={0.7}>
          {reason}
        </Text>
      )}
    </Box>
  );
};
