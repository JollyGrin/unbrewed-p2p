import { useState } from "react";
import NextLink from "next/link";
import { Box, Flex, Link } from "@chakra-ui/react";

import { posterUrl, videoUrl } from "@/lib/changelog/media";
import type { ChangelogEntry, ChangelogTag } from "@/lib/changelog/types";

const TAG_LABELS: Record<ChangelogTag, string> = {
  deck: "Deck",
  feature: "Feature",
  fix: "Fix",
};

const categoryLabel = (entry: ChangelogEntry): string => {
  const parts = entry.tags.map((tag) => TAG_LABELS[tag]);
  if (entry.pro) parts.push("Pro");
  return parts.join(" · ");
};

const MEDIA_SIZE = { w: { base: "100%", md: "400px" }, h: { base: "auto", md: "225px" } };

/**
 * The card's media slot. The `<video>` element only ever exists after the
 * visitor presses play — before that it's a plain poster `<img>` with a
 * play button overlay. That keeps the element out of the static export
 * (`next export` freezes the pre-click render, which has no `<video>` tag
 * at all) and matches `ProHeroVideo.tsx`'s `preload="none"` / play-gated
 * `<source>` approach without needing its post-hydration mount gate, since
 * there's no SSR/client mismatch risk here (the initial state is the same
 * on both sides).
 */
const ChangelogCardMedia = ({
  slug,
  title,
  onError,
}: {
  slug: string;
  title: string;
  onError: () => void;
}) => {
  const [playing, setPlaying] = useState(false);
  const poster = posterUrl(slug);
  const src = videoUrl(slug);
  if (!poster || !src) return null;

  if (playing) {
    return (
      <Box
        {...MEDIA_SIZE}
        sx={{ aspectRatio: { base: "16 / 9", md: "auto" } }}
        flexShrink={0}
        borderRadius="0.5rem"
        overflow="hidden"
        bg="brand.surfaceDim"
      >
        <video
          autoPlay
          controls
          playsInline
          preload="none"
          poster={poster}
          onError={onError}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        >
          <source src={src} type="video/mp4" />
        </video>
      </Box>
    );
  }

  return (
    <Box
      {...MEDIA_SIZE}
      sx={{ aspectRatio: { base: "16 / 9", md: "auto" } }}
      position="relative"
      flexShrink={0}
      borderRadius="0.5rem"
      overflow="hidden"
      bg="brand.surfaceDim"
    >
      <Box as="img" src={poster} alt="" onError={onError} w="100%" h="100%" objectFit="cover" display="block" />
      <Box
        as="button"
        type="button"
        aria-label={`Play video: ${title}`}
        onClick={() => setPlaying(true)}
        position="absolute"
        inset="0"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="rgba(44, 24, 49, 0.25)"
        minH="44px"
        minW="44px"
      >
        <Box w="60px" h="60px" borderRadius="full" bg="brand.accent" display="flex" alignItems="center" justifyContent="center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#48284F" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </Box>
      </Box>
    </Box>
  );
};

const ChangelogCardBody = ({
  entry,
  isNew,
  linkColor,
}: {
  entry: ChangelogEntry;
  isNew: boolean;
  linkColor: string;
}) => (
  <Flex direction="column" gap="10px" flex="1" minW={0}>
    <Flex align="center" gap="8px" wrap="wrap">
      {isNew && (
        <Box
          as="span"
          bg="brand.accent"
          color="brand.secondary"
          fontFamily="ArchivoNarrow"
          fontSize="11px"
          fontWeight={700}
          letterSpacing="0.12em"
          textTransform="uppercase"
          px="9px"
          py="3px"
          borderRadius="full"
        >
          New
        </Box>
      )}
      <Box as="span" fontFamily="ArchivoNarrow" fontSize="12px" textTransform="uppercase" letterSpacing="0.08em" opacity={0.75}>
        {categoryLabel(entry)}
      </Box>
    </Flex>
    <Box fontFamily="SpaceGrotesk" fontWeight={700} fontSize={{ base: "20px", md: "24px" }} lineHeight="1.2">
      {entry.title}
    </Box>
    <Box fontSize="15px" lineHeight="1.55" opacity={0.88} sx={{ textWrap: "pretty" }}>
      {entry.summary}
    </Box>
    {entry.body?.map((paragraph, i) => (
      <Box key={i} fontSize="15px" lineHeight="1.55" opacity={0.88} sx={{ textWrap: "pretty" }}>
        {paragraph}
      </Box>
    ))}
    {entry.cta && (
      <Link
        as={NextLink}
        href={entry.cta.href}
        display="flex"
        alignItems="center"
        minH="44px"
        color={linkColor}
        fontSize="14px"
        fontWeight={600}
        _hover={{ textDecoration: "underline" }}
      >
        {entry.cta.label}
      </Link>
    )}
  </Flex>
);

interface ChangelogCardProps {
  entry: ChangelogEntry;
  isNew: boolean;
}

export const ChangelogCard = ({ entry, isNew }: ChangelogCardProps) => {
  const [mediaFailed, setMediaFailed] = useState(false);
  const slug = entry.video?.slug;
  const hasVideo = Boolean(slug) && !mediaFailed && posterUrl(slug ?? "") !== null && videoUrl(slug ?? "") !== null;

  if (hasVideo && slug) {
    return (
      <Flex
        as="article"
        direction={{ base: "column", md: "row" }}
        gap="24px"
        bg="brand.secondary"
        color="brand.primary"
        borderRadius="0.75rem"
        p="1.25rem"
        boxShadow="card"
      >
        <ChangelogCardMedia slug={slug} title={entry.title} onError={() => setMediaFailed(true)} />
        <ChangelogCardBody entry={entry} isNew={isNew} linkColor="brand.primary" />
      </Flex>
    );
  }

  return (
    <Box as="article" bg="brand.parchment" border="1px solid" borderColor="brand.parchmentDeep" borderRadius="0.75rem" p="1.25rem" color="brand.secondary">
      <ChangelogCardBody entry={entry} isNew={isNew} linkColor="brand.secondary" />
    </Box>
  );
};
