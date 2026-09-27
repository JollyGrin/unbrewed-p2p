/**
 * The parchment card every stats section sits in (Main/Player/Hero.dc.html):
 * radius 12, the mockups' shadow, 28px padding (16px on a phone), with an
 * optional title row — heading + sub-line on the left, an action on the right
 * that wraps underneath on a narrow screen.
 */
import { ReactNode } from "react";
import { Box, Heading } from "@chakra-ui/react";

import { INK, INK_MUTED, PARCHMENT } from "./tokens";

export interface DashCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand slot in the title row (toggle, "show all" link, count). */
  action?: ReactNode;
  children?: ReactNode;
  gap?: string;
  /** Heading level; the pages decide the outline. */
  as?: "h2" | "h3";
}

export const DashCard = ({ title, subtitle, action, children, gap = "16px", as = "h2" }: DashCardProps) => (
  <Box
    as="section"
    data-testid="dash-card"
    bg={PARCHMENT}
    color={INK}
    borderRadius="12px"
    boxShadow="0 2px 8px rgba(20,8,24,0.25)"
    p={{ base: "16px", md: "28px" }}
    display="flex"
    flexDirection="column"
    gap={gap}
    minW={0}
  >
    {(title || action) && (
      <Box
        display="flex"
        flexWrap="wrap"
        justifyContent="space-between"
        alignItems="flex-end"
        gap="12px"
      >
        <Box display="flex" flexDirection="column" gap="4px" minW={0}>
          {title && (
            <Heading as={as} m={0} fontFamily="inherit" fontSize="22px" fontWeight={700} lineHeight={1.2}>
              {title}
            </Heading>
          )}
          {subtitle && (
            <Box fontSize="13px" color={INK_MUTED}>
              {subtitle}
            </Box>
          )}
        </Box>
        {action}
      </Box>
    )}
    {children}
  </Box>
);
