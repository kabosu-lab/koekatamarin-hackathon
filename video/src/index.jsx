import { registerRoot, Composition } from "remotion";
import { Trial } from "./Trial";
import { CandidateA } from "./candidates/A";
import { CandidateB } from "./candidates/B";
import { CandidateC } from "./candidates/C";
import { CandidateD } from "./candidates/D";
import { CandidateE, CHAPTER_FRAMES, Opening, Story, STORY_FRAMES } from "./candidates/Story";
import { Chapters } from "./candidates/Chapters";
import { KoeLumpTest, LUMP_FRAMES } from "./candidates/KoeLump";
import { DIRECTION_FRAMES, DirectionP, DirectionQ, DirectionR, DirectionS, DirectionT, DirectionU, DirectionV } from "./candidates/Direction";
import { VOICE_CHAR_FRAMES, VoiceChar } from "./candidates/VoiceChar";
import { Full, FULL_FRAMES } from "./candidates/Full";
import T from "./timing.json";

const CANDIDATES = { A: CandidateA, B: CandidateB, C: CandidateC, D: CandidateD, E: CandidateE, F: Opening };
const common = { durationInFrames: T.total, fps: T.fps, width: 1920, height: 1080 };

registerRoot(() => (
  <>
    <Composition id="Trial" component={Trial} {...common} />
    {[["P", DirectionP], ["Q", DirectionQ], ["R", DirectionR], ["S", DirectionS], ["T", DirectionT], ["U", DirectionU], ["V", DirectionV]].map(([k, C]) => <Composition key={k} id={`Direction-${k}`} component={C} durationInFrames={DIRECTION_FRAMES} fps={60} width={1920} height={1080} />)}
    <Composition id="VoiceChar" component={VoiceChar} durationInFrames={VOICE_CHAR_FRAMES} fps={60} width={1920} height={1080} />
    <Composition id="Full" component={Full} durationInFrames={FULL_FRAMES} fps={60} width={1920} height={1080} />
    <Composition id="KoeLump" component={KoeLumpTest} durationInFrames={LUMP_FRAMES} fps={60} width={1920} height={1080} />
    {["hira", "kata"].map(name => <Composition key={name} id={`Story-${name}`} component={Story} defaultProps={{ name }} {...common} durationInFrames={STORY_FRAMES} />)}
    {["hira", "kata"].map(name => <Composition key={name} id={`Chapters-${name}`} component={Chapters} defaultProps={{ name }} {...common} durationInFrames={CHAPTER_FRAMES} />)}
    {Object.entries(CANDIDATES).flatMap(([id, C]) => ["hira", "kata"].flatMap(name => [
      <Composition key={id + name} id={`${id}-${name}`} component={C} defaultProps={{ name }} {...common} />,
      /* 生成画像を使わず、コードで描いた絵の版 */
      <Composition key={id + name + "code"} id={`${id}-${name}-code`} component={C} defaultProps={{ name, art: "code" }} {...common} />,
    ]))}
  </>
));
