import "./index.css";
import "./fonts";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { DemoComposition } from "./DemoComposition";

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
    </>
  );
};
