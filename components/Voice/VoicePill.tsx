import { Box, Text } from "@chakra-ui/react";
import { FaMicrophone, FaMicrophoneSlash } from "react-icons/fa";

type PillProps = {
  onClick: () => void;
  label: string;
  isLive?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  /** Hide the label on phones, where the pill squeezes between the two hero chips. */
  isLabelDesktopOnly?: boolean;
};

export function VoicePill({
  onClick,
  label,
  isLive = false,
  isSpeaking = false,
  isMuted = false,
  isLabelDesktopOnly = false,
}: PillProps) {
  return (
    <Box
      as="button"
      onClick={onClick}
      aria-label="Voice chat"
      display="flex"
      alignItems="center"
      gap="0.4rem"
      px={isLabelDesktopOnly ? { base: "0.65rem", md: "0.75rem" } : "0.75rem"}
      h="2.1rem"
      borderRadius="999px"
      bg={isLive ? "brand.surface" : "brand.surfaceDim"}
      color={isLive ? "brand.accent" : "brand.primary"}
      border="2px solid"
      borderColor={isSpeaking ? "brand.accent" : "rgba(231,204,152,0.35)"}
      boxShadow={isSpeaking ? "0 0 0 3px rgba(224,168,46,0.35)" : "0 4px 14px rgba(0,0,0,0.35)"}
      transition="box-shadow 120ms ease, border-color 120ms ease"
    >
      {isMuted ? <FaMicrophoneSlash size={14} /> : <FaMicrophone size={14} />}
      <Text
        as="span"
        display={isLabelDesktopOnly ? { base: "none", md: "inline" } : "inline"}
        fontFamily="BebasNeueRegular" fontSize="1.05rem" letterSpacing="0.05em" lineHeight={1}>
        {label}
      </Text>
    </Box>
  );
}

export function VoiceIdlePill({ onClick }: { onClick: () => void }) {
  return <VoicePill onClick={onClick} label="Voice" isLabelDesktopOnly />;
}
