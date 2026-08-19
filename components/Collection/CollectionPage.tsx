/**
 * /collection — the deck-upgrade management surface (epic #610, ticket #614).
 *
 * One page, four blocks: pick a hero, see what that hero has earned, spend it
 * on card art, and decide whether to WEAR what it bought — a switch for the
 * token rim, and one for the card rims (#627). It is the "currency + choice"
 * model of design doc §4c(b), which is exactly the phase §4f says needs a
 * screen of its own.
 *
 * Owning and wearing are separate, and this page is about OWNING: both
 * switches govern the play surfaces only, so the grid keeps rendering every
 * tier the player bought and every upgrade button stays live while a switch is
 * off. A management screen that hid your collection the moment you stopped
 * wearing it would be the wrong screen.
 *
 * The hero block is a PICKER, not a dropdown (#625): every hero states its own
 * points and its own rim at rest, because "where are my points?" is the
 * question that brought the player here and a `<select>` answered it one
 * option at a time. Ordering and the two sections live in
 * `lib/collection/picker.ts`; the rows live in `HeroPicker`.
 *
 * Auth-gated the way /account is, and for the same reason: the site is
 * statically exported, so there is no server to redirect anybody. A guest gets
 * a short explainer plus the sign-in CTA rather than a bounce or a blank page,
 * and costs zero extra requests — nothing here fetches until the `/me` probe
 * says signed-in.
 *
 * DEGRADED IS A FIRST-CLASS STATE. Points earned are recomputed from telemetry
 * on every read, so an upstream outage means the API cannot know a balance —
 * and a spend it cannot price must fail closed. Its 503 still carries the
 * stored ledger, so this page keeps rendering the player's actual upgrades
 * under one calm banner, with every buy button disabled. What must NEVER happen
 * is an outage that reads as a wipe.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what a card LOOKS like and nothing
 * else. Nothing bought on this page touches the engine, a legal action, a bot,
 * a log line or a replay outcome.
 */
import { useMemo, useState } from "react";
import { Box, Button, Flex, Switch, Text, useToast } from "@chakra-ui/react";
import { FaDiscord } from "react-icons/fa";
import NextLink from "next/link";

import { AccountShell, Panel } from "@/components/Account/Shell";
import { CardSetGrid, tierLabel } from "@/components/Collection/CardSetGrid";
import { HeroPicker } from "@/components/Collection/HeroPicker";
import { TokenRimPanel } from "@/components/Collection/TokenRimPanel";
import { tokenInitials } from "@/components/Pro/FighterTokenPortrait";
import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { useCosmetics } from "@/lib/account/useCosmetics";
import { rimProgress, rimTierName } from "@/lib/account/cosmetics";
import { heroPickerSections } from "@/lib/collection/picker";
import { collectionRoster } from "@/lib/collection/roster";
import { CardSet, useHeroDeck } from "@/lib/collection/useHeroDeck";
import { COSMETIC_RIM_PAINTS } from "@/lib/pro/cosmetics";

/**
 * Required disclosure (ticket #614). Points come from real games, and an
 * economy that can be farmed needs to say out loud that it is policed — before
 * anybody spends an evening farming it, not after their account is corrected.
 */
export const DISCLOSURE =
  "Points are earned from completed games. Accounts that farm points through suspicious game patterns may have points and upgrades reversed by admins.";

const Shell = ({ children }: { children: React.ReactNode }) => (
  <AccountShell
    seo={{
      path: "/collection",
      title: "Your collection | Unbrewed",
      description:
        "Spend the points you earn playing Unbrewed Pro on cosmetic upgrades for your decks.",
      noindex: true,
    }}
    maxW="58rem"
  >
    {children}
  </AccountShell>
);

const Heading = () => (
  <Text as="h1" fontFamily="LeagueGothic" fontSize="2.4rem" lineHeight="1.05" mb="0.3rem">
    Your collection
  </Text>
);

/** The one-paragraph pitch, shown to guests and signed-in players alike. */
const EXPLAINER =
  "Every finished Pro game earns points for the hero you piloted. Spend them on cosmetic upgrades for that hero's cards — a metal rim your opponent sees across the table — and earn a matching rim for your fighter token along the way. Upgrades are purely cosmetic: they never change a card, a rule, or a result.";

const SignInPrompt = () => (
  <Panel maxW="32rem">
    <Heading />
    <Text fontSize="0.9rem" opacity={0.8} my="0.6rem">
      {EXPLAINER}
    </Text>
    <Button
      as="a"
      // A real navigation, not next/link: a cross-origin OAuth handoff the API
      // has to be able to set its cookie on.
      href={signInUrl("/collection")}
      size="sm"
      leftIcon={<FaDiscord />}
      bg="#5865F2"
      color="white"
      _hover={{ bg: "#4752C4" }}
    >
      Sign in with Discord
    </Button>
    <Box mt="0.9rem">
      <Text
        as={NextLink}
        href="/pro"
        fontSize="0.85rem"
        textDecoration="underline"
        _hover={{ opacity: 0.8 }}
      >
        Play a game first
      </Text>
    </Box>
  </Panel>
);

/** One number with its label. The header is three of these. */
const Stat = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => (
  <Box flex="1" minW="8rem">
    <Text fontSize="0.72rem" textTransform="uppercase" letterSpacing="0.06em" opacity={0.7}>
      {label}
    </Text>
    <Text fontFamily="LeagueGothic" fontSize="1.9rem" lineHeight="1.1">
      {value}
    </Text>
    {hint && (
      <Text fontSize="0.72rem" opacity={0.7}>
        {hint}
      </Text>
    )}
  </Box>
);

const Disclosure = () => (
  <Text
    data-testid="collection-disclosure"
    fontSize="0.75rem"
    opacity={0.7}
    mt="1.2rem"
    maxW="42rem"
  >
    {DISCLOSURE}
  </Text>
);

export const CollectionPage = () => {
  const { status: accountStatus } = useAccount();
  const cosmetics = useCosmetics();
  const toast = useToast();
  const [pickedHeroId, setPickedHeroId] = useState<string | null>(null);

  const degraded = cosmetics.status === "unavailable";

  // Heroes the API reported lead the list; the rest of the Pro roster follows.
  // Recomputed only when that list actually changes.
  const roster = useMemo(
    () => collectionRoster(cosmetics.heroes.map((row) => row.heroId)),
    [cosmetics.heroes],
  );
  const sections = useMemo(
    () => heroPickerSections(roster, cosmetics.heroes, degraded),
    [roster, cosmetics.heroes, degraded],
  );
  const ordered = useMemo(
    () => [...sections.ranked, ...sections.more].map((row) => row.hero),
    [sections],
  );
  // No effect syncs the default: deriving it means the player's best hero is
  // selected the moment the payload lands — the picker's own top row — without
  // a render that shows the wrong one first.
  const hero = ordered.find((row) => row.heroId === pickedHeroId) ?? ordered[0] ?? null;
  const { deck, isLoading: deckLoading } = useHeroDeck(hero?.deckId ?? null);
  const heroCosmetics = cosmetics.heroFor(hero?.heroId ?? "");

  const canSpend = cosmetics.status === "ready" && !cosmetics.busy;

  const notify = (title: string, status: "success" | "error") =>
    toast({ title, status, duration: 4000, isClosable: true, position: "bottom" });

  const onUpgrade = async (set: CardSet, tier: number) => {
    if (!hero) return;
    const result = await cosmetics.upgrade(hero.heroId, set.key, tier);
    if (result.ok) {
      notify(`${set.title} is now ${tierLabel(tier).toLowerCase()}.`, "success");
      return;
    }
    notify(result.message, "error");
  };

  const onToggleRim = async (enabled: boolean) => {
    if (!hero) return;
    const result = await cosmetics.setTokenRim(hero.heroId, enabled);
    if (!result.ok) notify("Couldn't save that right now — try again.", "error");
  };

  /**
   * "Show card rims" (#627) — the play-surface opt-out, NOT a shop filter. It
   * governs what a hero takes to the table (through `wireLoadoutFor`, so own
   * hand, opponent view and deck preview all follow it at once) and changes
   * nothing about this page: the grid below keeps rendering every tier the
   * player owns and every upgrade button stays live, exactly as the token
   * section keeps showing your unlocked rim while its display is off.
   */
  const onToggleCardRims = async (enabled: boolean) => {
    if (!hero) return;
    const result = await cosmetics.setCardRims(hero.heroId, enabled);
    if (!result.ok) notify("Couldn't save that right now — try again.", "error");
  };

  if (accountStatus === "loading" || cosmetics.status === "loading") {
    return (
      <Shell>
        <Text fontSize="0.9rem" opacity={0.7}>
          Loading your collection…
        </Text>
      </Shell>
    );
  }

  if (accountStatus === "offline") {
    return (
      <Shell>
        <Panel maxW="32rem">
          <Heading />
          <Text fontSize="0.9rem" opacity={0.8} mt="0.5rem">
            Accounts are unavailable right now, so there is nothing to show here.
            Everything else on Unbrewed works as usual — try again later.
          </Text>
        </Panel>
      </Shell>
    );
  }

  if (accountStatus === "guest") {
    return (
      <Shell>
        <SignInPrompt />
      </Shell>
    );
  }

  const progress = rimProgress(heroCosmetics.earned, cosmetics.constants.tokenRimThresholds);
  const cardRimsOn = heroCosmetics.cardRims.enabled;
  const ownedRims = heroCosmetics.cards.length;
  const nextRim = rimTierName((progress.tier ?? 0) + 1);
  const points = (value: number | null) => (value === null ? "—" : value.toLocaleString());

  return (
    <Shell>
      <Flex align="baseline" justify="space-between" gap="0.75rem" flexWrap="wrap" mb="0.6rem">
        <Heading />
        <Text
          as={NextLink}
          href="/account"
          fontSize="0.85rem"
          textDecoration="underline"
          _hover={{ opacity: 0.8 }}
        >
          Back to your account
        </Text>
      </Flex>

      {degraded && (
        <Panel mb="1rem" data-testid="collection-degraded">
          <Text fontSize="0.9rem">
            Stats are temporarily unavailable, so your points can&apos;t be counted
            right now. Everything you have already unlocked is shown below;
            upgrades are paused until stats are back.
          </Text>
        </Panel>
      )}

      <Panel mb="1rem">
        <Text fontSize="0.85rem" opacity={0.8} mb="0.8rem">
          {EXPLAINER}
        </Text>
        <HeroPicker
          sections={sections}
          selectedHeroId={hero?.heroId ?? null}
          onSelect={setPickedHeroId}
        />
        <Flex gap="1rem" flexWrap="wrap" data-testid="collection-points">
          <Stat
            label="Earned"
            value={points(heroCosmetics.earned)}
            hint="Lifetime — never goes down"
          />
          <Stat
            label="Available"
            value={points(heroCosmetics.available)}
            hint={heroCosmetics.spent > 0 ? `${heroCosmetics.spent} spent` : undefined}
          />
          <Stat
            label="Next rim"
            value={
              progress.nextThreshold === null || !nextRim
                ? "—"
                : COSMETIC_RIM_PAINTS[nextRim].label
            }
            hint={
              progress.toGo === null
                ? heroCosmetics.earned === null
                  ? "Unavailable"
                  : "Top of the ladder"
                : `${progress.toGo} points to go`
            }
          />
        </Flex>
      </Panel>

      {hero && (
        <TokenRimPanel
          hero={heroCosmetics}
          constants={cosmetics.constants}
          tokenUrl={deck?.tokenUrl ?? null}
          initials={tokenInitials(deck?.heroName || hero.name)}
          onToggle={onToggleRim}
        />
      )}

      <Panel as="section" aria-labelledby="collection-cards-heading">
        <Flex
          align="center"
          justify="space-between"
          gap="0.75rem"
          flexWrap="wrap"
          mb="0.6rem"
        >
          <Text
            id="collection-cards-heading"
            as="h2"
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize="1.15rem"
          >
            Cards
          </Text>
          <Flex align="center" gap="0.5rem">
            <Switch
              id="collection-card-rims-switch"
              isChecked={cardRimsOn}
              // Nothing bought = nothing to hide. Same rule as the token
              // switch, which stays disabled until a rim exists to wear.
              isDisabled={ownedRims === 0}
              onChange={(event) => void onToggleCardRims(event.target.checked)}
            />
            <Text as="label" htmlFor="collection-card-rims-switch" fontSize="0.85rem">
              Show card rims
            </Text>
          </Flex>
        </Flex>
        {ownedRims > 0 && !cardRimsOn && (
          <Text fontSize="0.75rem" opacity={0.7} mb="0.6rem" data-testid="card-rims-hidden">
            Upgraded but hidden — your cards go to the table with base art. The
            tiers below are still yours, and upgrades still work.
          </Text>
        )}
        <CardSetGrid
          sets={deck?.sets ?? []}
          hero={heroCosmetics}
          constants={cosmetics.constants}
          canSpend={canSpend}
          loading={deckLoading}
          onUpgrade={onUpgrade}
        />
      </Panel>

      <Disclosure />
    </Shell>
  );
};
