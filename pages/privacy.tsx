import { Box, Button, Flex, Heading, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { PageSeo } from "@/components/Helmet/Head";
import { analyticsAvailable, declineAnalytics, getConsent, resumeAnalytics } from "@/lib/analytics";

const PrivacyPage: React.FC = () => {
  const [declined, setDeclined] = useState(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(analyticsAvailable());
    setDeclined(getConsent() === "declined");
  }, []);

  return (
    <Box maxW="640px" mx="auto" px={4} py={10} color="#f3e9d2">
      <PageSeo path="/privacy" title="Privacy — Unbrewed" description="What Unbrewed measures and how to opt out." />
      <Heading size="lg" mb={4}>Privacy</Heading>
      <Text mb={3}>
        Unbrewed counts visits, which sections get used, which deck sources work, and how long games last, so we know
        what to fix. We use PostHog (EU cloud), reached through our own domain.
      </Text>
      <Text mb={3}>
        There are no cookies. An anonymous random id is kept in this browser&apos;s local storage. We never record
        deck names you type, chat text or e-mail addresses.
      </Text>
      <Text mb={3}>
        <strong>While you are signed in</strong>, analytics are tied to your Unbrewed account id (created when you sign in
        with Discord), including the anonymous history from before you signed in. Signing out stops that.
      </Text>
      <Text mb={5}>Game balance data is kept separately and is not part of this.</Text>
      {available && (
        <Flex align="center" gap={3}>
          <Text>Analytics are {declined ? "off" : "on"} in this browser.</Text>
          <Button
            size="sm"
            onClick={() => {
              if (declined) resumeAnalytics();
              else declineAnalytics();
              setDeclined(!declined);
            }}
          >
            {declined ? "Turn on" : "Opt out"}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default PrivacyPage;
