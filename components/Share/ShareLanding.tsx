/**
 * The share-link landing page (issue #566) — `/share/deck/<id>` and
 * `/share/map/<id>`.
 *
 * Works for EVERYONE. No account, no cookie, no prior visit: the `/share/*`
 * endpoints are public, so a friend clicking a link gets a preview and one
 * button that drops the item into their browser's bag through the same import
 * path the Bag itself uses. Nothing about the page assumes the visitor has ever
 * been here before.
 */
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Image,
  Spinner,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { Navbar } from "@/components/Navbar";
import { PageSeo } from "@/components/Helmet/Head";
import { persistAndStarDeck } from "@/lib/invite";
import { useBagMaps } from "@/lib/bag/useBag";
import { useAccount } from "@/lib/account/useAccount";
import {
  SharedDeckPreview,
  SharedLoad,
  SharedMapPreview,
  loadSharedItem,
} from "@/lib/share/sharedItem";

export type ShareRoute = "deck" | "map";

/**
 * Loads the shared item once per id. Split out from the view so the data path
 * is testable on its own and so the page can render a sensible state on the
 * very first paint (a static export has no server-side data).
 */
export const useSharedItem = (route: ShareRoute, id?: string): SharedLoad => {
  const [load, setLoad] = useState<SharedLoad>({
    status: "loading",
    preview: null,
  });

  useEffect(() => {
    // On a static export the id arrives from the URL after hydration, so an
    // undefined id means "not known yet", not "missing".
    if (id === undefined) return;
    let alive = true;
    setLoad({ status: "loading", preview: null });
    loadSharedItem(route, id).then((next) => {
      if (alive) setLoad(next);
    });
    return () => {
      alive = false;
    };
  }, [route, id]);

  return load;
};

export const ShareLanding = ({
  route,
  id,
}: {
  route: ShareRoute;
  id?: string;
}) => {
  const { status, preview } = useSharedItem(route, id);
  const label = route === "deck" ? "deck" : "map";

  return (
    <Flex flexDir="column" bg="brand.highlight" minH="100svh">
      <PageSeo
        path={`/share/${route}`}
        title={`Shared ${label} | Unbrewed`}
        description={`Someone shared an Unmatched ${label} with you. Preview it and add it to your Unbrewed bag in one click.`}
        // A share link is possession-of-link access; keeping these out of search
        // results is the difference between "unlisted" and "published".
        noindex
      />
      <Box color="brand.secondary">
        <Navbar />
      </Box>

      <Flex flex="1" align="center" justify="center" p="1rem">
        <Box
          w="100%"
          maxW="34rem"
          bg="brand.parchment"
          borderRadius="0.75rem"
          p={{ base: "1rem", md: "1.5rem" }}
          boxShadow="0 2px 12px rgba(20, 8, 24, 0.3)"
        >
          {status === "loading" && (
            <VStack py="2rem" spacing="0.75rem">
              <Spinner size="lg" />
              <Text opacity={0.75}>Fetching the shared {label}…</Text>
            </VStack>
          )}

          {status === "not-found" && (
            <Missing
              heading={`This ${label} link has expired`}
              body={`The ${label} it pointed to isn't in the cloud any more — whoever shared it may have deleted it. Ask them for a fresh link.`}
            />
          )}

          {status === "offline" && (
            <Missing
              heading="Couldn't reach the cloud"
              body={`The share service didn't answer, so we can't show this ${label} right now. Everything else on Unbrewed still works — try this link again later.`}
            />
          )}

          {status === "ready" && preview?.kind === "deck" && (
            <DeckPreview preview={preview} />
          )}
          {status === "ready" && preview?.kind === "map" && (
            <MapPreview preview={preview} />
          )}
        </Box>
      </Flex>
    </Flex>
  );
};

const Missing = ({ heading, body }: { heading: string; body: string }) => (
  <VStack spacing="0.75rem" py="1rem" textAlign="center">
    <Text fontSize="2rem">🕳️</Text>
    <Text fontFamily="BebasNeueRegular" fontSize="1.6rem" letterSpacing="0.04em">
      {heading}
    </Text>
    <Text fontSize="0.9rem" opacity={0.8}>
      {body}
    </Text>
    <HStack pt="0.5rem">
      <Button as={Link} href="/bag" size="sm">
        Open your bag
      </Button>
      <Button as={Link} href="/" size="sm" variant="ghost">
        Go home
      </Button>
    </HStack>
  </VStack>
);

const Heading = ({ children }: { children: React.ReactNode }) => (
  <Text
    fontFamily="BebasNeueRegular"
    fontSize="1.75rem"
    letterSpacing="0.04em"
    lineHeight={1.1}
  >
    {children}
  </Text>
);

const DeckPreview = ({ preview }: { preview: SharedDeckPreview }) => {
  const [added, setAdded] = useState(false);

  return (
    <Box>
      <Text fontSize="0.75rem" textTransform="uppercase" letterSpacing="0.08em" opacity={0.6}>
        Someone shared a deck with you
      </Text>
      <Grid templateColumns="auto 1fr" gap="0.9rem" alignItems="center" mt="0.5rem">
        <Box
          h="5rem"
          w="3.6rem"
          borderRadius="0.35rem"
          bg={preview.highlightColour ?? "brand.secondary"}
          bgImg={preview.cardbackUrl}
          bgPos="center"
          bgSize="cover"
          boxShadow="inset 0 0 0 1px rgba(0,0,0,0.2)"
        />
        <Box minW={0}>
          <Heading>{preview.name}</Heading>
          <HStack mt="0.4rem" spacing="0.35rem" flexWrap="wrap">
            {preview.heroName && <Tag size="sm">🦸 {preview.heroName}</Tag>}
            {preview.sidekickName && <Tag size="sm">🤝 {preview.sidekickName}</Tag>}
            <Tag size="sm">🃏 {preview.cardCount} cards</Tag>
          </HStack>
        </Box>
      </Grid>

      <Flex gap="0.5rem" mt="1.25rem" flexWrap="wrap">
        {added ? (
          <Button
            as={Link}
            href="/bag"
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
          >
            Open your bag
          </Button>
        ) : (
          <Button
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
            onClick={async () => {
              // Same write the invite flow uses, so the deck is there the
              // moment the user navigates on — the account's copy when they
              // are signed in, this browser's when they aren't.
              await persistAndStarDeck(preview.deck);
              setAdded(true);
              toast.success(`${preview.name} is in your bag, ready to play`);
            }}
          >
            Add to my bag
          </Button>
        )}
        <Button as={Link} href="/connect" variant="ghost">
          Start a game
        </Button>
      </Flex>
      <BagDestinationNote thing="deck" />
    </Box>
  );
};

/**
 * Where "Add to my bag" actually puts it. A guest's copy still lands in this
 * browser and needs no account, which is what this line has always promised;
 * for a signed-in user the bag IS the account (#644), so saying "nothing is
 * uploaded" would be a lie.
 */
const BagDestinationNote = ({ thing }: { thing: "deck" | "map" }) => {
  const { status } = useAccount();
  return (
    <Text fontSize="0.72rem" opacity={0.6} mt="0.8rem">
      {status === "signed-in"
        ? `Adding it saves the ${thing} to your account, so it follows you to any browser you sign in to.`
        : `Adding it stores the ${thing} in this browser. Nothing is uploaded, and you don't need an account.`}
    </Text>
  );
};

const MapPreview = ({ preview }: { preview: SharedMapPreview }) => {
  const { importMaps } = useBagMaps();
  const [added, setAdded] = useState(false);

  return (
    <Box>
      <Text fontSize="0.75rem" textTransform="uppercase" letterSpacing="0.08em" opacity={0.6}>
        Someone shared a map with you
      </Text>
      <Heading>{preview.name}</Heading>
      {preview.author && (
        <Text fontSize="0.8rem" opacity={0.75}>
          by {preview.author}
        </Text>
      )}
      <Image
        alt={preview.name}
        src={preview.imgUrl}
        mt="0.75rem"
        borderRadius="0.5rem"
        maxH="16rem"
        w="100%"
        objectFit="contain"
        bg="rgba(20, 8, 24, 0.08)"
      />

      <Flex gap="0.5rem" mt="1.25rem" flexWrap="wrap">
        {added ? (
          <Button
            as={Link}
            href="/bag?tab=1"
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
          >
            Open your maps
          </Button>
        ) : (
          <Button
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
            onClick={async () => {
              const count = await importMaps([preview.map]);
              setAdded(true);
              toast.success(
                count > 0
                  ? `${preview.name} added to your maps`
                  : `${preview.name} was already in your maps`,
              );
            }}
          >
            Add to my maps
          </Button>
        )}
      </Flex>
      <BagDestinationNote thing="map" />
    </Box>
  );
};
