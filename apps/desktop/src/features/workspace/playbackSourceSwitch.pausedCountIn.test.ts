import { describe, expect, it } from "vitest";
import type {
  RehearsalLoopWindow,
  RehearsalTransportState,
} from "./rehearsalTransport";
import { capturePlaybackSourceSwitch } from "./playbackSourceSwitch";

const loop: RehearsalLoopWindow = {
  sourceIndex: 0,
  selectionKey: "section-1:0",
  sectionId: "section-1",
  sectionLabel: "Verse 1",
  startSeconds: 30,
  endSeconds: 45,
  tempoBpm: 120,
  tempoAssumed: false,
  countInBeats: 4,
};

const fullMixAuthority = "bandscope-project://project-42-7";
const vocalsAuthority = `${fullMixAuthority}/stem/vocals`;

describe("playback source switch paused-count-in admission", () => {
  it("does not mint a restoration receipt while a paused count-in still owns pending beats", () => {
    const pausedCountIn: RehearsalTransportState = {
      phase: "paused",
      loop,
      countInRemainingBeats: 2,
      playheadSeconds: 37.25,
      playbackRate: 0.75,
    };

    expect(
      capturePlaybackSourceSwitch(pausedCountIn, 37.25, {
        sourceAuthority: fullMixAuthority,
        targetAuthority: vocalsAuthority,
        sequence: 1,
      }),
    ).toBeNull();
  });
});
