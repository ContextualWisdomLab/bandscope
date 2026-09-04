import { describe, expect, it } from "vitest";
import type {
  RehearsalLoopWindow,
  RehearsalTransportState,
} from "./rehearsalTransport";
import {
  admitPlaybackSourceSwitchTarget,
  capturePlaybackSourceSwitch,
} from "./playbackSourceSwitch";

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

function transport(
  phase: RehearsalTransportState["phase"],
): RehearsalTransportState {
  return {
    phase,
    loop,
    countInRemainingBeats: phase === "counting-in" ? 3 : 0,
    playheadSeconds: phase === "armed" ? loop.startSeconds : 37.25,
    playbackRate: 0.75,
  };
}

describe("playback source switch continuity", () => {
  it("captures exact looping position and playback rate for resume after target metadata", () => {
    expect(capturePlaybackSourceSwitch(transport("looping"), 37.25)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 37.25,
      playbackRate: 0.75,
      sourcePhase: "looping",
      resumeAfterLoad: true,
    });
  });

  it("preserves a paused position without manufacturing playback intent", () => {
    expect(capturePlaybackSourceSwitch(transport("paused"), 36.5)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 36.5,
      playbackRate: 0.75,
      sourcePhase: "paused",
      resumeAfterLoad: false,
    });
  });

  it("uses the selected loop start when switching an armed transport", () => {
    expect(capturePlaybackSourceSwitch(transport("armed"), Number.NaN)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 30,
      playbackRate: 0.75,
      sourcePhase: "armed",
      resumeAfterLoad: false,
    });
  });

  it.each(["idle", "counting-in"] as const)(
    "fails closed instead of changing source during %s",
    (phase) => {
      expect(capturePlaybackSourceSwitch(transport(phase), 37.25)).toBeNull();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 29.99, 45, 90])(
    "rejects an out-of-loop media position instead of silently clamping it: %s",
    (mediaTime) => {
      expect(capturePlaybackSourceSwitch(transport("looping"), mediaTime)).toBeNull();
      expect(capturePlaybackSourceSwitch(transport("paused"), mediaTime)).toBeNull();
    },
  );

  it("admits a target only when its decoded duration still covers the complete selected loop", () => {
    const plan = capturePlaybackSourceSwitch(transport("looping"), 37.25);
    expect(plan).not.toBeNull();

    expect(admitPlaybackSourceSwitchTarget(plan, 45)).toEqual(plan);
    expect(admitPlaybackSourceSwitchTarget(plan, 44.999)).toBeNull();
    expect(admitPlaybackSourceSwitchTarget(plan, 37.25)).toBeNull();
    expect(admitPlaybackSourceSwitchTarget(plan, Number.NaN)).toBeNull();
    expect(admitPlaybackSourceSwitchTarget(plan, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
