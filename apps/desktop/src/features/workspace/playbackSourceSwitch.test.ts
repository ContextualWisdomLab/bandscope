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

const fullMixAuthority = "bandscope-project://project-42-7";
const vocalsAuthority = `${fullMixAuthority}/stem/vocals`;
const bassAuthority = `${fullMixAuthority}/stem/bass`;

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

function capture(
  phase: RehearsalTransportState["phase"],
  mediaTime: number,
  targetAuthority = vocalsAuthority,
  sequence = 3,
) {
  return capturePlaybackSourceSwitch(transport(phase), mediaTime, {
    sourceAuthority: fullMixAuthority,
    targetAuthority,
    sequence,
  });
}

describe("playback source switch continuity", () => {
  it("captures exact looping position, playback rate, and target identity for resume after target metadata", () => {
    expect(capture("looping", 37.25)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 37.25,
      playbackRate: 0.75,
      sourcePhase: "looping",
      resumeAfterLoad: true,
      sourceAuthority: fullMixAuthority,
      targetAuthority: vocalsAuthority,
      sequence: 3,
    });
  });

  it("preserves a paused position without manufacturing playback intent", () => {
    expect(capture("paused", 36.5)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 36.5,
      playbackRate: 0.75,
      sourcePhase: "paused",
      resumeAfterLoad: false,
      sourceAuthority: fullMixAuthority,
      targetAuthority: vocalsAuthority,
      sequence: 3,
    });
  });

  it("uses the selected loop start when switching an armed transport", () => {
    expect(capture("armed", Number.NaN)).toEqual({
      loopStartSeconds: 30,
      loopEndSeconds: 45,
      seekSeconds: 30,
      playbackRate: 0.75,
      sourcePhase: "armed",
      resumeAfterLoad: false,
      sourceAuthority: fullMixAuthority,
      targetAuthority: vocalsAuthority,
      sequence: 3,
    });
  });

  it.each(["idle", "counting-in"] as const)(
    "fails closed instead of changing source during %s",
    (phase) => {
      expect(capture(phase, 37.25)).toBeNull();
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 29.99, 45, 90])(
    "rejects an out-of-loop media position instead of silently clamping it: %s",
    (mediaTime) => {
      expect(capture("looping", mediaTime)).toBeNull();
      expect(capture("paused", mediaTime)).toBeNull();
    },
  );

  it.each([
    { targetAuthority: fullMixAuthority, sequence: 3 },
    { targetAuthority: vocalsAuthority, sequence: 0 },
    { targetAuthority: vocalsAuthority, sequence: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects a no-op or invalid switch identity: %o", ({ targetAuthority, sequence }) => {
    expect(capture("looping", 37.25, targetAuthority, sequence)).toBeNull();
  });

  it("admits a target only when its decoded duration and switch receipt still match the active target", () => {
    const plan = capture("looping", 37.25);
    expect(plan).not.toBeNull();

    expect(admitPlaybackSourceSwitchTarget(plan, 45, vocalsAuthority, 3)).toEqual(plan);
    expect(admitPlaybackSourceSwitchTarget(plan, 44.999, vocalsAuthority, 3)).toBeNull();
    expect(admitPlaybackSourceSwitchTarget(plan, 37.25, vocalsAuthority, 3)).toBeNull();
    expect(admitPlaybackSourceSwitchTarget(plan, Number.NaN, vocalsAuthority, 3)).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        plan,
        Number.POSITIVE_INFINITY,
        vocalsAuthority,
        3,
      ),
    ).toBeNull();
  });

  it("rejects stale loadedmetadata receipts after a newer source switch supersedes the target", () => {
    const stalePlan = capture("looping", 37.25, vocalsAuthority, 3);
    const currentPlan = capture("looping", 37.25, bassAuthority, 4);
    expect(stalePlan).not.toBeNull();
    expect(currentPlan).not.toBeNull();

    expect(
      admitPlaybackSourceSwitchTarget(stalePlan, 45, bassAuthority, 4),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(stalePlan, 45, vocalsAuthority, 4),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(currentPlan, 45, bassAuthority, 4),
    ).toEqual(currentPlan);
  });
});
