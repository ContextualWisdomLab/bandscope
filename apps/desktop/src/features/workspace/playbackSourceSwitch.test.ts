import { describe, expect, it } from "vitest";
import type {
  RehearsalLoopWindow,
  RehearsalTransportState,
} from "./rehearsalTransport";
import {
  admitPlaybackSourceSwitchTarget,
  beginPlaybackSourceSwitch,
  capturePlaybackSourceSwitch,
  createPlaybackSourceSwitchSession,
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

  it.each([
    ["file:///private/source.wav", vocalsAuthority],
    [fullMixAuthority, "https://example.com/reference.wav"],
    [fullMixAuthority, "bandscope-project://project-99-1/stem/vocals"],
    [`${fullMixAuthority}/stem/guitar`, vocalsAuthority],
  ])(
    "rejects non-canonical or cross-project source-switch authority: %s -> %s",
    (sourceAuthority, targetAuthority) => {
      expect(
        capturePlaybackSourceSwitch(transport("looping"), 37.25, {
          sourceAuthority,
          targetAuthority,
          sequence: 3,
        }),
      ).toBeNull();
    },
  );

  it("admits a target only when its decoded duration and switch receipt still match the active target", () => {
    const begun = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport("looping"),
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    expect(begun.plan).not.toBeNull();

    expect(
      admitPlaybackSourceSwitchTarget(begun.state, begun.plan, 45, vocalsAuthority),
    ).toBe(begun.plan);
    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        begun.plan,
        44.999,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        begun.plan,
        37.25,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        begun.plan,
        Number.NaN,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        begun.plan,
        Number.POSITIVE_INFINITY,
        vocalsAuthority,
      ),
    ).toBeNull();
  });

  it("rejects a copied switch plan instead of treating equal scalar fields as an issued active receipt", () => {
    const begun = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport("looping"),
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    expect(begun.plan).not.toBeNull();
    const copiedPlan = Object.freeze({ ...begun.plan! });

    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        copiedPlan,
        45,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        begun.state,
        begun.plan,
        45,
        vocalsAuthority,
      ),
    ).toBe(begun.plan);
  });

  it("rejects stale loadedmetadata receipts after a newer source switch supersedes the target", () => {
    const first = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport("looping"),
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    const second = beginPlaybackSourceSwitch(
      first.state,
      transport("looping"),
      37.25,
      fullMixAuthority,
      bassAuthority,
    );

    expect(
      admitPlaybackSourceSwitchTarget(
        second.state,
        first.plan,
        45,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        second.state,
        first.plan,
        45,
        bassAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        second.state,
        second.plan,
        45,
        bassAuthority,
      ),
    ).toBe(second.plan);
  });

  it("invalidates the prior media receipt as soon as a newer source switch begins", () => {
    const first = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport("looping"),
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    const second = beginPlaybackSourceSwitch(
      first.state,
      transport("looping"),
      37.25,
      fullMixAuthority,
      bassAuthority,
    );

    expect(first.plan?.sequence).toBe(1);
    expect(second.plan?.sequence).toBe(2);
    expect(second.state.activePlan).toBe(second.plan);
    expect(
      admitPlaybackSourceSwitchTarget(
        second.state,
        first.plan,
        45,
        vocalsAuthority,
      ),
    ).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        second.state,
        second.plan,
        45,
        bassAuthority,
      ),
    ).toBe(second.plan);
  });

  it("burns a switch identity even when the newer attempt cannot produce a continuity plan", () => {
    const first = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport("looping"),
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    const rejected = beginPlaybackSourceSwitch(
      first.state,
      transport("counting-in"),
      37.25,
      fullMixAuthority,
      bassAuthority,
    );

    expect(rejected.plan).toBeNull();
    expect(rejected.state.sequence).toBe(2);
    expect(rejected.state.activePlan).toBeNull();
    expect(
      admitPlaybackSourceSwitchTarget(
        rejected.state,
        first.plan,
        45,
        vocalsAuthority,
      ),
    ).toBeNull();
  });

  it("fails closed without reusing a switch receipt after sequence exhaustion", () => {
    const exhausted = {
      sequence: Number.MAX_SAFE_INTEGER,
      activePlan: capture("looping", 37.25, vocalsAuthority, Number.MAX_SAFE_INTEGER),
    };
    const result = beginPlaybackSourceSwitch(
      exhausted,
      transport("looping"),
      37.25,
      fullMixAuthority,
      bassAuthority,
    );

    expect(result.plan).toBeNull();
    expect(result.state).toEqual({
      sequence: Number.MAX_SAFE_INTEGER,
      activePlan: null,
    });
  });
});