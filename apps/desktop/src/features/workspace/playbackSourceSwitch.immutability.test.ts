import { describe, expect, it } from "vitest";
import type { RehearsalTransportState } from "./rehearsalTransport";
import {
  admitPlaybackSourceSwitchTarget,
  beginPlaybackSourceSwitch,
  createPlaybackSourceSwitchSession,
} from "./playbackSourceSwitch";

const fullMixAuthority = "bandscope-project://project-42-7";
const vocalsAuthority = `${fullMixAuthority}/stem/vocals`;
const bassAuthority = `${fullMixAuthority}/stem/bass`;

const loopingTransport: RehearsalTransportState = {
  phase: "looping",
  loop: {
    sourceIndex: 0,
    selectionKey: "section-1:0",
    sectionId: "section-1",
    sectionLabel: "Verse 1",
    startSeconds: 30,
    endSeconds: 45,
    tempoBpm: 120,
    tempoAssumed: false,
    countInBeats: 4,
  },
  countInRemainingBeats: 0,
  playheadSeconds: 37.25,
  playbackRate: 0.75,
};

describe("playback source switch receipt immutability", () => {
  it("does not let later renderer code rewrite an issued receipt or its session identity", () => {
    const started = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      loopingTransport,
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );

    expect(started.plan).not.toBeNull();
    expect(Object.isFrozen(started.plan)).toBe(true);
    expect(Object.isFrozen(started.state)).toBe(true);
    expect(
      Reflect.set(started.plan as object, "targetAuthority", bassAuthority),
    ).toBe(false);
    expect(Reflect.set(started.plan as object, "seekSeconds", 44)).toBe(false);
    expect(Reflect.set(started.state as object, "sequence", 99)).toBe(false);

    expect(started.plan?.targetAuthority).toBe(vocalsAuthority);
    expect(started.plan?.seekSeconds).toBe(37.25);
    expect(started.state.sequence).toBe(1);
    expect(
      admitPlaybackSourceSwitchTarget(
        started.plan,
        45,
        vocalsAuthority,
        started.state.sequence,
      ),
    ).toEqual(started.plan);
  });
});
