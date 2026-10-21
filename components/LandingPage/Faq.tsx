import { Box, Grid, Text } from "@chakra-ui/react";
import { Eyebrow, H2, Section } from "./ui";
import { FAQS } from "./content";

/**
 * Section 9: native <details> accordions. The same FAQS array feeds the
 * FAQPage JSON-LD in index.tsx, so the markup and the schema can't drift.
 * Answers stay in the DOM while collapsed, which is what Google reads.
 */
export const Faq = () => (
  <Section id="faq" bg="brand.highlight">
    <Eyebrow>Questions</Eyebrow>
    <H2 id="faq">Frequently asked</H2>
    <Grid gap="0.5rem" mt="1.5rem" maxW="54rem">
      {FAQS.map((faq, i) => (
        <Box
          as="details"
          key={faq.q}
          open={i === 0}
          bg="#FFF6E8"
          border="1px solid rgba(72,40,79,.18)"
          borderRadius="0.6rem"
          px="1rem"
          sx={{
            "& > summary": { listStyle: "none" },
            "& > summary::-webkit-details-marker": { display: "none" },
            "& > summary::after": { content: '"+"', color: "brand.accentDeep", fontSize: "1.25rem", lineHeight: 1 },
            "&[open] > summary::after": { content: '"–"' },
          }}
        >
          <Box
            as="summary"
            cursor="pointer"
            display="flex"
            justifyContent="space-between"
            gap="0.75rem"
            py="0.85rem"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
          >
            <Text as="h3" fontSize="1rem" fontWeight={700}>
              {faq.q}
            </Text>
          </Box>
          <Text pb="0.9rem" fontSize="0.95rem" opacity={0.85} maxW="70ch">
            {faq.a}
          </Text>
        </Box>
      ))}
    </Grid>
  </Section>
);
