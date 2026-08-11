import "./index.css";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { DemoComposition } from "./DemoComposition";
import {
  DeckAnnouncement,
  deckAnnouncementMetadata,
  FPS,
  totalDuration,
} from "./DeckAnnouncement";
import { deckAnnouncementSchema } from "./DeckAnnouncement/schema";
import taranis from "../props/taranis.json";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="UnbrewedDemo"
        component={DemoComposition}
        durationInFrames={960}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="UnbrewedTrailer"
        component={MyComposition}
        durationInFrames={360}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* One promo per deck: `props/<slug>.json` + `npm run render:deck`.
          Duration comes from calculateMetadata (how many cards are featured);
          the value here is only what the Studio shows before it runs. */}
      <Composition
        id="DeckAnnouncement"
        component={DeckAnnouncement}
        schema={deckAnnouncementSchema}
        defaultProps={taranis}
        calculateMetadata={deckAnnouncementMetadata}
        durationInFrames={totalDuration(taranis.featuredCards.length, true)}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
