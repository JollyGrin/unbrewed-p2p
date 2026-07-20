import { Box, Flex, Text } from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import styled from "@emotion/styled";
import { GiHearts } from "react-icons/gi";
import { TbBow, TbSword } from "react-icons/tb";
import { colors } from "@/styles/style";
import { PoolType } from "@/components/DeckPool/PoolFns";

/**
 * Persistent hero-rules panel for the sandbox HUD (issue #474).
 *
 * The header tooltip (TipBody) shows the same fields, but it vanishes on
 * mouse-out — no use while you are actually resolving the rule it describes.
 * This pins the whole extended ruleset open: special ability, every rule card
 * (issue #372 — e.g. Clone Troopers' board cap), and the sidekick.
 *
 * Layout follows Pro's HeroPreviewModal (gold section headings over parchment)
 * so the two modes read the same, but it renders straight from PoolType, which
 * the header already holds for every seat — so opponents cost no extra
 * plumbing. Exactly one panel is mounted at a time (HeaderContainer owns which
 * player it is showing), which is what keeps it from overlapping itself.
 */
export const HeroRulesPanel = ({
  pool,
  name,
  onClose,
}: {
  pool: PoolType;
  name: string;
  onClose: () => void;
}) => {
  const { deckName, hero, sidekick, ruleCards } = pool;
  const rules = (ruleCards ?? []).filter((rule) => rule.content?.trim());
  const ability = hero?.specialAbility?.trim();
  const hasSidekick = !!sidekick?.name && (sidekick.quantity ?? 0) > 0;

  return (
    <Panel>
      <Header>
        <Box minW={0}>
          <Text
            fontSize="0.65rem"
            textTransform="uppercase"
            letterSpacing="0.08em"
            opacity={0.65}
            noOfLines={1}
          >
            {name}
          </Text>
          <Text fontWeight={700} fontSize="0.95rem" noOfLines={1}>
            {hero?.name || deckName}
          </Text>
        </Box>
        <CloseButton as="button" aria-label="Close hero rules" onClick={onClose}>
          <CloseIcon boxSize="0.55rem" />
        </CloseButton>
      </Header>

      <Body>
        <Flex gap="0.75rem" fontSize="0.8rem" flexWrap="wrap" opacity={0.85}>
          {hero?.hp !== null && hero?.hp !== undefined && (
            <Flex align="center" gap="0.25rem">
              <GiHearts color="#C0392B" size="13px" />
              <Text>{hero.hp}</Text>
            </Flex>
          )}
          <Flex align="center" gap="0.25rem">
            {hero?.isRanged ? <TbBow size="13px" /> : <TbSword size="13px" />}
            <Text>{hero?.isRanged ? "Ranged" : "Melee"}</Text>
          </Flex>
          {typeof hero?.move === "number" && <Text>Move {hero.move}</Text>}
        </Flex>

        {ability ? (
          <Section title="Special ability" body={ability} />
        ) : (
          <Section
            title="Special ability"
            body="No special ability recorded for this deck. Add one from /bag → Edit hero info."
            muted
          />
        )}

        {rules.map((rule, i) => (
          <Section
            key={`${rule.title}-${i}`}
            title={rule.title || "Extra rules"}
            body={rule.content.trim()}
          />
        ))}

        {hasSidekick && (
          <Section
            title="Sidekick"
            body={[
              `${sidekick.name}${
                (sidekick.quantity ?? 0) > 1 ? ` ×${sidekick.quantity}` : ""
              } — ${sidekick.hp ?? "?"} HP, ${
                sidekick.isRanged ? "ranged" : "melee"
              }`,
              sidekick.quote?.trim(),
            ]
              .filter(Boolean)
              .join("\n")}
          />
        )}
      </Body>
    </Panel>
  );
};

const Section = ({
  title,
  body,
  muted,
}: {
  title: string;
  body: string;
  muted?: boolean;
}) => (
  <Box>
    <SectionHeading>{title}</SectionHeading>
    <Text
      fontSize="0.8rem"
      whiteSpace="pre-wrap"
      opacity={muted ? 0.55 : 0.9}
      fontStyle={muted ? "italic" : undefined}
    >
      {body}
    </Text>
  </Box>
);

/** Gold label over a fading hairline — the Pro HeroPreviewModal treatment. */
const SectionHeading = styled(Text)`
  margin-bottom: 0.2rem;
  padding-bottom: 0.15rem;
  font-family: BebasNeueRegular, sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${colors.brand.secondary};
  border-bottom: 1px solid rgba(72, 40, 79, 0.2);
`;

/**
 * Pinned bottom-left, above the hand controls.
 *
 * Not bottom-right: that corner is the on-board selection panels' slot
 * (TokenEditPanel / CardTokenPanel / CardPickupPanel, all at bottom 6.25rem,
 * z 250), and this panel stays open while you play, so it would sit under
 * whichever one you opened. Not top-right either — that is the HUD cluster
 * and the Activity log. The left column above the hand controls is the one
 * region nothing else claims.
 *
 * z-index sits with ActionLog's panel (240), below the selection panels.
 */
const Panel = styled(Box)`
  position: fixed;
  bottom: 11rem;
  left: 1rem;
  z-index: 240;
  width: 260px;
  max-width: calc(100vw - 2rem);
  max-height: min(45vh, 22rem);
  display: flex;
  flex-direction: column;
  background-color: ${colors.brand.parchment};
  color: ${colors.brand.surfaceDim};
  border: 1px solid rgba(72, 40, 79, 0.25);
  border-radius: 0.75rem;
  box-shadow: 0 6px 18px rgba(20, 8, 24, 0.35);
  overflow: hidden;
  opacity: 0.96;
`;

const Header = styled(Flex)`
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(72, 40, 79, 0.18);
`;

const Body = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem 0.8rem;
  overflow-y: auto;
`;

const CloseButton = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  height: 1.4rem;
  width: 1.4rem;
  border-radius: 0.4rem;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s ease, background-color 0.15s ease;
  :hover {
    opacity: 1;
    background-color: ${colors.brand.highlight};
  }
`;
