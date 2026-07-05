/**
 * In-game "Report bug" dialog (issue #87). The reporter types what happened and
 * picks a time window; everything else — matchup, turn/HP state, a windowed log
 * excerpt, versions, UA — is auto-captured by lib/pro/bugReport. Submit opens a
 * prefilled GitHub new-issue page in a new tab.
 *
 * The full activity log can't ride in the URL (GitHub caps it ~8KB), so the
 * dialog leads with a Download CSV button and tells the reporter to drag the
 * file into the issue after it opens — GitHub attachments can't be prefilled.
 */
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Select,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { DownloadIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { PlayerView } from "@/lib/pro/protocol";
import { ProLogEntry } from "@/lib/pro/gameLog";
import {
  BugTimeWindow,
  buildBugReportUrl,
  downloadLogCsv,
  turnsInLog,
} from "@/lib/pro/bugReport";
import { APP_COMMIT, APP_VERSION } from "@/lib/pro/appVersion";

export const ReportBugDialog = ({
  isOpen,
  onClose,
  view,
  roomId,
  entries,
}: {
  isOpen: boolean;
  onClose: () => void;
  view: PlayerView;
  roomId: string | null;
  /** newest-first activity feed, exactly as the page stores it */
  entries: ProLogEntry[];
}) => {
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState<"just-now" | "earlier">("just-now");
  const [downloaded, setDownloaded] = useState(false);

  const turns = useMemo(() => turnsInLog(entries), [entries]);
  const [turn, setTurn] = useState<number | null>(null);
  const effectiveTurn = turn ?? turns[0] ?? view.turnNumber;

  const timeWindow: BugTimeWindow =
    when === "earlier" ? { kind: "earlier", turn: effectiveTurn } : { kind: "just-now" };

  const canSubmit = description.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const url = buildBugReportUrl({
      description,
      when: timeWindow,
      view,
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
          Report a bug
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text fontSize="0.85rem" opacity={0.8} mb="1rem">
            Your matchup, turn/HP state, a slice of the activity log, and app/browser
            details are attached automatically — just tell us what went wrong.
          </Text>

          <Text fontWeight="bold" fontSize="0.85rem" mb="0.35rem">
            What happened? <Text as="span" color="red.300">*</Text>
          </Text>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. I committed a defense card but the attacker's damage didn't drop"
            rows={4}
            bg="rgba(0,0,0,0.25)"
            borderColor="whiteAlpha.300"
            _hover={{ borderColor: "whiteAlpha.400" }}
            _focus={{ borderColor: "brand.accent" }}
            mb="1.1rem"
          />

          <Text fontWeight="bold" fontSize="0.85rem" mb="0.35rem">
            When did it happen?
          </Text>
          <RadioGroup value={when} onChange={(v) => setWhen(v as "just-now" | "earlier")} mb="0.5rem">
            <Flex gap="1.25rem">
              <Radio value="just-now" colorScheme="yellow">
                Just now
              </Radio>
              <Radio value="earlier" colorScheme="yellow" isDisabled={turns.length === 0}>
                Earlier this game
              </Radio>
            </Flex>
          </RadioGroup>
          {when === "earlier" && turns.length > 0 && (
            <Flex align="center" gap="0.5rem" mb="1.1rem">
              <Text fontSize="0.8rem" opacity={0.8}>
                Around
              </Text>
              <Select
                size="sm"
                w="auto"
                value={effectiveTurn}
                onChange={(e) => setTurn(Number(e.target.value))}
                bg="rgba(0,0,0,0.25)"
                borderColor="whiteAlpha.300"
              >
                {turns.map((t) => (
                  <option key={t} value={t} style={{ color: "black" }}>
                    turn {t}
                  </option>
                ))}
              </Select>
              <Text fontSize="0.75rem" opacity={0.6}>
                — we&apos;ll include the log around that turn
              </Text>
            </Flex>
          )}
          {when === "just-now" && <Box mb="1.1rem" />}

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
                downloadLogCsv(entries);
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
