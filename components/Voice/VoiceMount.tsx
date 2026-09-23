/**
 * Voice chat — mounted once in _app.
 *
 * Lightweight on purpose: it only reads the route. The voice/WebRTC bundle is
 * loaded (client-side only) on pages that actually have a voice room.
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { voiceContextFromRoute } from "@/lib/voice/voiceRoute";

const VoiceDock = dynamic(() => import("./VoiceDock"), { ssr: false });

export function VoiceMount() {
  const router = useRouter();
  const context = voiceContextFromRoute(router.pathname, router.query);
  if (!context) return null;
  return <VoiceDock key={context.roomId} roomId={context.roomId} role={context.role} />;
}
