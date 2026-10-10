import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Box,
  Flex,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
} from "@chakra-ui/react";

import { posterUrl, videoUrl } from "@/lib/changelog/media";
import type { ChangelogEntry } from "@/lib/changelog/types";
import { useChangelogSeen } from "@/lib/changelog/useChangelogSeen";
import { setUpdateDialogOpen } from "@/lib/changelog/updateDialogOpen";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const shortDate = (isoDate: string, withYear: boolean): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}${withYear ? ` ${year}` : ""}`;
};

const MAX_ROWS = 3;
const MD_BREAKPOINT = "48em";

const labelStyle = {
  fontFamily: "ArchivoNarrow",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "#5B3A63",
};

/** Save-Data is Chromium-only and absent from the DOM lib types (as in ProHeroVideo). */
const prefersSaveData = () =>
  (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/** Muted autoplay is allowed only on wide screens with no reduced-motion / Save-Data preference. */
const canAutoplay = (): boolean => {
  if (typeof window.matchMedia !== "function") return false;
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    window.matchMedia(`(min-width: ${MD_BREAKPOINT})`).matches &&
    !prefersSaveData()
  );
};

/**
 * Poster first. The <video> only exists once the visitor taps play, or on
 * wide screens without reduced-motion / Save-Data (muted autoplay).
 */
const DialogMedia = ({ slug, title, onError }: { slug: string; title: string; onError: () => void }) => {
  const [playing, setPlaying] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const poster = posterUrl(slug);
  const src = videoUrl(slug);

  useEffect(() => {
    setAutoplay(canAutoplay());
  }, []);

  if (!poster || !src) return null;

  const frame = { sx: { aspectRatio: "16 / 9" }, position: "relative" as const, bg: "brand.surfaceDim" };

  if (playing || autoplay) {
    return (
      <Box {...frame}>
        <video
          autoPlay
          muted={autoplay && !playing}
          loop={autoplay && !playing}
          controls={playing}
          playsInline
          preload="none"
          poster={poster}
          onError={onError}
          aria-label={title}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        >
          <source src={src} type="video/mp4" />
        </video>
      </Box>
    );
  }

  return (
    <Box {...frame}>
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a build-time asset */}
      <img src={poster} alt="" onError={onError} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
      >
        <Box
          w={{ base: "60px", md: "76px" }}
          h={{ base: "60px", md: "76px" }}
          borderRadius="full"
          bg="brand.accent"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="#48284F" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </Box>
      </Box>
    </Box>
  );
};

const AlsoNewRow = ({ entry, last, onNavigate }: { entry: ChangelogEntry; last: boolean; onNavigate: () => void }) => (
  <Flex
    as={Link}
    href={`/changelog#${entry.id}`}
    onClick={onNavigate}
    align="center"
    justify="space-between"
    gap="16px"
    minH="44px"
    color="brand.surfaceDim"
    borderBottom={last ? "none" : "1px solid #EBD3A8"}
  >
    <Box as="span" fontSize="15px" fontWeight={600}>
      {entry.title}
    </Box>
    <Box as="span" fontSize="12px" flexShrink={0} {...labelStyle}>
      {shortDate(entry.date, false)}
      {entry.video ? " · video" : ""}
    </Box>
  </Flex>
);

/**
 * "What's new" dialog (desktop) / bottom sheet (phones) on the first landing
 * page visit after a highlight update (unbrewed-p2p-985). Every close path
 * calls markAllSeen(), which empties `unseen` and so closes it for good.
 */
export const ChangelogUpdateDialog = () => {
  const { unseen, markAllSeen } = useChangelogSeen();
  const [mediaFailed, setMediaFailed] = useState(false);

  const headline = unseen.find((e) => e.highlight);
  const isOpen = Boolean(headline);

  useEffect(() => {
    setUpdateDialogOpen(isOpen);
    return () => setUpdateDialogOpen(false);
  }, [isOpen]);

  if (!headline) return null;

  const others = unseen.filter((e) => e !== headline);
  const rows = others.slice(0, MAX_ROWS);
  const slug = headline.video?.slug;
  const hasMedia = Boolean(slug) && !mediaFailed && posterUrl(slug ?? "") !== null && videoUrl(slug ?? "") !== null;

  return (
    <Modal isOpen onClose={markAllSeen} isCentered returnFocusOnClose>
      <ModalOverlay bg="rgba(28, 14, 32, 0.72)" />
      <ModalContent
        bg="brand.parchment"
        color="brand.surfaceDim"
        overflow="hidden"
        maxW={{ base: "100%", md: "760px" }}
        w="100%"
        m={{ base: 0, md: "1rem" }}
        alignSelf={{ base: "flex-end", md: "center" }}
        borderRadius={{ base: "1rem 1rem 0 0", md: "0.75rem" }}
        boxShadow="0 8px 24px rgba(44, 24, 49, 0.5)"
        maxH="100svh"
        overflowY="auto"
      >
        <ModalCloseButton
          top={{ base: "8px", md: "12px" }}
          right={{ base: "8px", md: "12px" }}
          w="44px"
          h="44px"
          borderRadius="full"
          zIndex={2}
          color={hasMedia ? "brand.parchment" : "brand.secondary"}
          bg={hasMedia ? "rgba(250, 235, 215, 0.14)" : "transparent"}
        />

        {hasMedia && slug && <DialogMedia slug={slug} title={headline.title} onError={() => setMediaFailed(true)} />}

        <Flex direction="column" gap={{ base: "12px", md: "14px" }} p={{ base: "20px 16px 24px", md: "28px 32px 24px" }}>
          <Flex align="center" gap="10px" pr={hasMedia ? 0 : "44px"}>
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
            <Box as="span" fontSize="13px" {...labelStyle}>
              {shortDate(headline.date, true)}
              {headline.pro ? " · Pro" : ""}
            </Box>
          </Flex>

          <ModalHeader
            as="h2"
            p={0}
            fontFamily="SpaceGrotesk"
            fontWeight={700}
            fontSize={{ base: "24px", md: "30px" }}
            lineHeight="1.15"
            color="brand.secondary"
          >
            {headline.title}
          </ModalHeader>
          <Text fontSize={{ base: "15px", md: "16px" }} lineHeight="1.55" sx={{ textWrap: "pretty" }}>
            {headline.summary}
          </Text>

          {rows.length > 0 && (
            <Flex direction="column" display={{ base: "none", md: "flex" }} borderTop="1px solid #DEB887" mt="6px">
              <Box fontSize="12px" p="14px 0 4px" {...labelStyle}>
                Also new since your last visit
              </Box>
              {rows.map((entry, i) => (
                <AlsoNewRow key={entry.id} entry={entry} last={i === rows.length - 1} onNavigate={markAllSeen} />
              ))}
            </Flex>
          )}
          {others.length > 0 && (
            <Flex
              as={Link}
              href="/changelog"
              onClick={markAllSeen}
              display={{ base: "flex", md: "none" }}
              align="center"
              justify="space-between"
              minH="48px"
              px="14px"
              border="1px solid"
              borderColor="brand.parchmentDeep"
              borderRadius="0.5rem"
              fontSize="14px"
              fontWeight={600}
            >
              <span>
                {others.length} more {others.length === 1 ? "update" : "updates"} since your last visit
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Flex>
          )}

          <Flex
            direction={{ base: "column-reverse", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            gap="16px"
            mt={{ base: 0, md: "8px" }}
          >
            <Flex
              as={Link}
              href="/changelog"
              onClick={markAllSeen}
              display={{ base: others.length > 0 ? "none" : "flex", md: "flex" }}
              align="center"
              justify={{ base: "center", md: "flex-start" }}
              minH="44px"
              fontSize="15px"
              color="brand.secondary"
            >
              See all updates
            </Flex>
            <Box
              as="button"
              type="button"
              onClick={markAllSeen}
              minH="48px"
              px="28px"
              borderRadius="0.5rem"
              bg="brand.secondary"
              color="brand.primary"
              fontFamily="SpaceGrotesk"
              fontWeight={700}
              fontSize="16px"
              _hover={{ bg: "brand.surfaceDim" }}
            >
              Got it
            </Box>
          </Flex>
        </Flex>
      </ModalContent>
    </Modal>
  );
};
