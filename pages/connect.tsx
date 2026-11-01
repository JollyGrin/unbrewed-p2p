import { ConnectPage } from "@/components/Connect";
import { PageSeo } from "@/components/Helmet/Head";
import { GameErrorBoundary } from "@/components/ErrorBoundary/GameErrorBoundary";

export default function ConnectToGamePage() {
  return (
    <>
      <PageSeo
        path="/connect"
        title="Connect & Play — Start an Unmatched Game Online | Unbrewed"
        description="Create a lobby, share the room name with a friend, and play Unmatched online in seconds. Free, browser-based, no account required."
      />
      <GameErrorBoundary boundary="sandbox">
        <ConnectPage />
      </GameErrorBoundary>
    </>
  );
}
