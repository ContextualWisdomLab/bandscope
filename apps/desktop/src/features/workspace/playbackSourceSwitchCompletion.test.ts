import { describe, expect, it } from "vitest";
import type {
  RehearsalLoopWindow,
  RehearsalTransportState,
} from "./rehearsalTransport";
import {
  admitPlaybackSourceSwitchTarget,
  beginPlaybackSourceSwitch,
  completePlaybackSourceSwitch,
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

const transport: RehearsalTransportState = {
  phase: "looping",
  loop,
  countInRemainingBeats: 0,
  playheadSeconds: 37.25,
  playbackRate: 0.75,
};

describe("playback source switch completion", () => {
  it("retires only the exact active receipt after target metadata is admitted", () => {
    const begun = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport,
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    const admitted = admitPlaybackSourceSwitchTarget(
      begun.plan,
      45,
      vocalsAuthority,
      begun.state.sequence,
    );
    expect(admitted).toBe(begun.plan);

    const completed = completePlaybackSourceSwitch(begun.state, admitted);

    expect(completed).toEqual({ sequence: 1, activePlan: null });
    expect(Object.isFrozen(completed)).toBe(true);
    expect(completePlaybackSourceSwitch(begun.state, { ...begun.plan! })).toBe(
      begun.state,
    );
  });

  it("does not let an admitted stale receipt clear a newer active switch", () => {
    const first = beginPlaybackSourceSwitch(
      createPlaybackSourceSwitchSession(),
      transport,
      37.25,
      fullMixAuthority,
      vocalsAuthority,
    );
    const staleAdmitted = admitPlaybackSourceSwitchTarget(
      first.plan,
      45,
      vocalsAuthority,
      first.state.sequence,
    );
    const second = beginPlaybackSourceSwitch(
      first.state,
      transport,
      37.25,
      vocalsAuthority,
      bassAuthority,
    );

    expect(completePlaybackSourceSwitch(second.state, staleAdmitted)).toBe(
      second.state,
    );
    expect(second.state.activePlan).toBe(second.plan);
  });
});
