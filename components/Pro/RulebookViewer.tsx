import { Box, Button, Flex, Image, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { TbChevronLeft, TbChevronRight } from "react-icons/tb";
import { rulebookPageAlt, rulebookPageUrls, stepPage, type Rulebook } from "@/lib/pro/adventureRulebook";

const SWIPE_PX = 50;

/** Page-by-page viewer for a scenario's original rulebook (#1371). Mounts only the current page and the next. */
export const RulebookViewer = ({ book, isOpen, onClose }: { book: Rulebook; isOpen: boolean; onClose: () => void }) => {
  const urls = rulebookPageUrls(book);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const go = (delta: number) => setIndex((i) => stepPage(i, delta, urls.length));

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, urls.length]);

  const next = urls[index + 1];
  const atStart = index === 0;
  const atEnd = index === urls.length - 1;
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside" isCentered>
      <ModalOverlay />
      <ModalContent bg="brand.surfaceDim" color="brand.parchment" mx="0.5rem" data-testid="rulebook-viewer">
        <ModalHeader fontFamily="LeagueGothic" fontWeight="normal" letterSpacing="0.08em" fontSize="1.3rem" pb="0.3rem">
          ORIGINAL RULEBOOK
        </ModalHeader>
        <ModalCloseButton data-testid="rulebook-close" />
        <ModalBody pb="0.9rem" px={{ base: "0.6rem", md: "1.5rem" }}>
          <Flex direction="column" gap="0.6rem" minW="0">
            <Box
              onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                const end = e.changedTouches[0]?.clientX;
                if (start === null || end === undefined) return;
                if (end - start <= -SWIPE_PX) go(1);
                else if (end - start >= SWIPE_PX) go(-1);
              }}
              display="flex"
              justifyContent="center"
              minW="0"
            >
              <Image
                key={urls[index]}
                src={urls[index]}
                alt={rulebookPageAlt(index)}
                w="100%"
                h="auto"
                maxH="68vh"
                objectFit="contain"
                data-testid="rulebook-page"
              />
            </Box>
            {next && <Image src={next} alt="" aria-hidden display="none" data-testid="rulebook-preload" />}
            <Flex align="center" justify="space-between" gap="0.5rem">
              <Button size="sm" variant="outline" onClick={() => go(-1)} isDisabled={atStart} leftIcon={<TbChevronLeft />} data-testid="rulebook-prev">
                Prev
              </Button>
              <Text fontFamily="SpaceGrotesk" fontSize="0.8rem" data-testid="rulebook-counter">
                {index + 1} / {urls.length}
              </Text>
              <Button size="sm" variant="outline" onClick={() => go(1)} isDisabled={atEnd} rightIcon={<TbChevronRight />} data-testid="rulebook-next">
                Next
              </Button>
            </Flex>
            <Text fontSize="0.7rem" opacity={0.7} textAlign="center" data-testid="rulebook-credit">
              {book.credit}
            </Text>
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
