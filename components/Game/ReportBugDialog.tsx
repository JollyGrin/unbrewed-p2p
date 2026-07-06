/**
 * In-game "Report bug" dialog for the sandbox game (issue #127, sibling to
 * the Pro dialog in components/Pro/ReportBugDialog.tsx). The sandbox has no
 * rules engine, so there's no matchup/turn/HP state to auto-capture — the
 * reporter types what happened and everything else (room id, app/browser
 * versions, a windowed log excerpt) is attached automatically. Submit opens
 * a prefilled GitHub new-issue page in a new tab, clearly marked as a
 * sandbox report so triage never assumes Pro match state.
 *
 * As with Pro, the full activity log can't ride in the URL (GitHub caps it
 * ~8KB), so the dialog leads with a Download CSV button and tells the
 * reporter to drag the file into the issue after it opens.
 */
import { Box, Button, Modal, ModalBody, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";
import { DownloadIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { SandboxLogEntry } from "@/lib/sandbox/gameLog";
import { buildSandboxBugReportUrl, downloadSandboxLogCsv } from "@/lib/sandbox/bugReport";
import { APP_COMMIT, APP_VERSION } from "@/lib/pro/appVersion";

export const ReportBugDialog = ({
  isOpen,
  onClose,
  roomId,
  entries,
}: {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
  /** newest-first activity feed, exactly as the page stores it */
  entries: SandboxLogEntry[];
}) => {
  const [description, setDescription] = useState("");
  const [downloaded, setDownloaded] = useState(false);

  const canSubmit = description.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const url = buildSandboxBugReportUrl({
      description,
      roomId,
      entries,
      commit: APP_COMMIT,
      appVersion: APP_VERSION,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
      <ModalOverlay />
      <ModalContent bg="brand.surface" color="brand.parchment" border="1px solid" borderColor="whiteAlpha.300">
        <ModalHeader fontFamily="LeagueGothic" letterSpacing="0.04em">
          Report a sandbox bug
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="0.85rem" opacity={0.8} mb="1rem">
            This is the freeform sandbox, not a rules-enforced Pro match — the room id, a
            slice of the activity log, and app/browser details are attached automatically;
            just tell us what went wrong.
          </Text>

          <Text fontWeight="bold" fontSize="0.85rem" mb="0.35rem">
            What happened? <Text as="span" color="red.300">*</Text>
          </Text>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. a card token got stuck under the board and I couldn't select it"
            rows={4}
            bg="rgba(0,0,0,0.25)"
            borderColor="whiteAlpha.300"
            _hover={{ borderColor: "whiteAlpha.400" }}
            _focus={{ borderColor: "brand.accent" }}
            mb="1.1rem"
          />

          <Box bg="rgba(224,168,46,0.08)" border="1px solid" borderColor="brand.accent" borderRadius="0.5rem" p="0.75rem">
            <Text fontSize="0.82rem" mb="0.5rem">
              <Text as="span" fontWeight="bold">
                Recommended:
              </Text>{" "}
              download the full activity log and drag it into the GitHub issue after it opens
              (the prefill only carries a short excerpt).
            </Text>
            <Button
              size="sm"
              leftIcon={<DownloadIcon />}
              bg="brand.accent"
              color="brand.surfaceDim"
              _hover={{ bg: "brand.accentDeep" }}
              onClick={() => {
                downloadSandboxLogCsv(entries);
                setDownloaded(true);
              }}
            >
              {downloaded ? "Downloaded — drag it into the issue" : "Download activity log (CSV)"}
            </Button>
          </Box>
        </ModalBody>
        <ModalFooter gap="0.5rem">
          <Button size="sm" variant="ghost" onClick={onClose} color="brand.parchment" _hover={{ bg: "whiteAlpha.200" }}>
            Cancel
          </Button>
          <Button
            size="sm"
            rightIcon={<ExternalLinkIcon />}
            bg="brand.accent"
            color="brand.surfaceDim"
            _hover={{ bg: "brand.accentDeep" }}
            isDisabled={!canSubmit}
            onClick={submit}
          >
            Open GitHub issue
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
