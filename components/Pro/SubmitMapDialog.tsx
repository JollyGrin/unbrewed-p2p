/**
 * Gated "submit this map to unbrewed" dialog (issue #756).
 *
 * The map JSON is the deliverable, and it only fits in the prefilled GitHub URL
 * for tiny boards — every real board (26+ spaces) blows the budget, so the
 * author has to paste it. The old flow was a bare link to the prefilled issue
 * with a "paste your JSON here" line buried at the bottom of the body: five
 * community submissions in a row arrived with nothing to import.
 *
 * So: nothing opens GitHub until the JSON is on the clipboard. Step 2 is
 * disabled until step 1 reports success (or the author confirms the manual
 * copy fallback used when the clipboard API is unavailable — an insecure origin,
 * a denied permission). When the JSON DID fit the URL the dialog collapses to a
 * single "open the form" step, so there is only ever one flow to follow.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  OrderedList,
  ListItem,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import type { ProMapDef } from "@/lib/pro/protocol";
import { PASTE_TOKEN, mapSubmissionIssue } from "@/lib/pro/mapIssue";

export const SubmitMapDialog = ({
  isOpen,
  onClose,
  map,
  json,
  onCopy,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** the map being submitted — drives the issue title/details */
  map: ProMapDef;
  /** pretty-printed ProMapDef JSON: exactly what the export box would hold */
  json: string;
  /** side effect to run alongside the copy (the editor fills its export box) */
  onCopy?: () => void;
}) => {
  const { url, embedded } = useMemo(() => mapSubmissionIssue(map, json), [map, json]);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const manualRef = useRef<HTMLTextAreaElement>(null);

  // Re-open = start over: a stale "Copied ✓" would let step 2 through on a
  // clipboard that has since been overwritten by something else.
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setManual(false);
    }
  }, [isOpen]);

  // Focusing the fallback box selects the whole payload, so the author's
  // Ctrl/Cmd+C can't grab half a map.
  useEffect(() => {
    if (manual) manualRef.current?.focus();
  }, [manual]);

  const copy = async () => {
    onCopy?.();
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setManual(true);
    }
  };

  const openForm = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const ready = embedded || copied;

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="brand.surface" color="brand.parchment" border="1px solid" borderColor="whiteAlpha.300">
        <ModalHeader fontFamily="LeagueGothic" letterSpacing="0.04em">
          Submit “{map.meta.title || "Untitled map"}” to unbrewed
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {embedded ? (
            <Text fontSize="0.9rem">
              Your map is already included. On the next page just tick the checkboxes and click{" "}
              <Text as="span" fontWeight="bold">Submit new issue</Text>.
            </Text>
          ) : (
            <>
              <Text fontSize="0.85rem" opacity={0.8} mb="1rem">
                This board is too big to carry in the link, so it travels on your clipboard.
                Copy it first — the button below opens GitHub once it&apos;s safely copied.
              </Text>

              <Text fontWeight="bold" fontSize="0.85rem" mb="0.4rem">
                Step 1 — copy your map
              </Text>
              <Button
                data-testid="submit-map-copy"
                w="100%"
                leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
                bg={copied ? "green.500" : "brand.accent"}
                color={copied ? "white" : "brand.surfaceDim"}
                _hover={{ bg: copied ? "green.500" : "brand.accentDeep" }}
                onClick={copy}
              >
                {copied
                  ? `Copied: ${map.meta.title || "Untitled map"}, ${map.spaces.length} spaces`
                  : "Copy my map"}
              </Button>

              {manual && !copied && (
                <Box mt="0.6rem">
                  <Text fontSize="0.8rem" mb="0.35rem">
                    Your browser wouldn&apos;t let us reach the clipboard. The box below is already
                    selected — press <Text as="span" fontWeight="bold">Ctrl/Cmd+C</Text>, then confirm.
                  </Text>
                  <Textarea
                    ref={manualRef}
                    data-testid="submit-map-fallback"
                    value={json}
                    isReadOnly
                    rows={6}
                    fontSize="0.65rem"
                    fontFamily="monospace"
                    bg="rgba(0,0,0,0.25)"
                    borderColor="whiteAlpha.300"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    mt="0.4rem"
                    size="sm"
                    data-testid="submit-map-confirm-copy"
                    variant="outline"
                    colorScheme="green"
                    onClick={() => setCopied(true)}
                  >
                    I copied it
                  </Button>
                </Box>
              )}

              <Text fontWeight="bold" fontSize="0.85rem" mt="1.2rem" mb="0.4rem">
                Step 2 — open the submission form
              </Text>
              <OrderedList fontSize="0.82rem" opacity={0.85} spacing="0.25rem" mb="0.7rem">
                <ListItem>
                  You&apos;ll land on GitHub with a form already filled in. (You need a free
                  GitHub account —{" "}
                  <Link href="https://github.com/signup" isExternal color="brand.accent" textDecoration="underline">
                    sign up here
                  </Link>
                  .)
                </ListItem>
                <ListItem>
                  Click the line that says <Text as="span" fontFamily="monospace">{PASTE_TOKEN}</Text>{" "}
                  near the top, select it, and press Ctrl/Cmd+V.
                </ListItem>
                <ListItem>
                  Tick the checkboxes, then click <Text as="span" fontWeight="bold">Submit new issue</Text>.
                </ListItem>
              </OrderedList>
            </>
          )}
        </ModalBody>
        <ModalFooter gap="0.5rem">
          <Button size="sm" variant="ghost" onClick={onClose} color="brand.parchment" _hover={{ bg: "whiteAlpha.200" }}>
            Cancel
          </Button>
          <Button
            size="sm"
            data-testid="submit-map-open"
            rightIcon={<ExternalLinkIcon />}
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
            isDisabled={!ready}
            title={ready ? undefined : "copy your map first"}
            onClick={openForm}
          >
            Open the submission form
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
