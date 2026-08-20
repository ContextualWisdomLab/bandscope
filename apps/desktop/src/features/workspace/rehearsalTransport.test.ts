import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  beatDurationMs,
  createIdleTransportState,
  createLoopWindow,
  fillRehearsalCopy,
  formatRehearsalClock,
  isPlayableLoopSection,
  nextActionTemplateKey,
  nextActionValues,
  reduceRehearsalTransport,
  resolveLoopWindow,
  resolveRehearsalTempo,
  wrapPlayhead,
} from "./rehearsalTransport";

describe("rehearsalTransport", () => {
  it("rejects blank, inverted, and non-finite section windows before arming a loop", () => {
    const song = createDemoRehearsalSong();
    expect(isPlayableLoopSection(song.sections[0])).toBe(true);
    expect(isPlayableLoopSection(undefined)).toBe(false);
    song.sections[0]!.timeRange = { start: Number.NaN, end: 30 };
    expect(createLoopWindow(song.sections[0]!, song.tempo)).toBeNull();
    song.sections[0]!.timeRange = { start: 40, end: 10 };
    expect(isPlayableLoopSection(song.sections[0])).toBe(false);
  });

  it("arms the first valid section and skips a requested invalid id", () => {
    const song = createDemoRehearsalSong();
    const chorus = structuredClone(song.sections[0]!);
    chorus.id = "chorus-1";
    chorus.label = "chorus";
    chorus.timeRange = { start: 40, end: 64 };
    song.sections.push(chorus);
    song.sections[0]!.timeRange = { start: Number.POSITIVE_INFINITY, end: 30 };
    const window = resolveLoopWindow(song, "missing-section");
    expect(window?.sectionId).toBe("chorus-1");
    expect(window?.startSeconds).toBe(40);
    expect(window?.endSeconds).toBe(64);
  });

  it("assumes 120 BPM when tempo is missing and keeps published tempo in range", () => {
    expect(resolveRehearsalTempo(undefined)).toEqual({
      tempoBpm: 120,
      tempoAssumed: true,
    });
    expect(resolveRehearsalTempo(0)).toEqual({
      tempoBpm: 120,
      tempoAssumed: true,
    });
    expect(resolveRehearsalTempo(96)).toEqual({
      tempoBpm: 96,
      tempoAssumed: false,
    });
    expect(beatDurationMs(120)).toBe(500);
  });

  it("counts in four beats then wraps the playhead inside the section", () => {
    const song = createDemoRehearsalSong();
    const loop = resolveLoopWindow(song);
    expect(loop).not.toBeNull();
    let state = reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop,
    });
    expect(nextActionTemplateKey(state, false)).toBe(
      "workspaceLoopArmedNoAudio",
    );
    state = reduceRehearsalTransport(state, { type: "start" });
    expect(state.phase).toBe("counting-in");
    expect(state.countInRemainingBeats).toBe(4);
    state = reduceRehearsalTransport(state, { type: "beat" });
    state = reduceRehearsalTransport(state, { type: "beat" });
    state = reduceRehearsalTransport(state, { type: "beat" });
    state = reduceRehearsalTransport(state, { type: "beat" });
    expect(state.phase).toBe("looping");
    expect(state.playheadSeconds).toBe(loop!.startSeconds);
    state = reduceRehearsalTransport(state, {
      type: "tick",
      deltaSeconds: loop!.endSeconds - loop!.startSeconds + 1.5,
    });
    expect(state.playheadSeconds).toBeCloseTo(loop!.startSeconds + 1.5);
    expect(wrapPlayhead(loop!.endSeconds, loop!)).toBe(loop!.startSeconds);
  });

  it("pauses a live loop and names the next play action", () => {
    const song = createDemoRehearsalSong();
    const loop = resolveLoopWindow(song, song.sections[0]!.id);
    let state = reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop,
    });
    state = reduceRehearsalTransport(state, { type: "start" });
    state = reduceRehearsalTransport(
      { ...state, phase: "looping", countInRemainingBeats: 0 },
      { type: "pause" },
    );
    expect(state.phase).toBe("paused");
    expect(nextActionTemplateKey(state, true)).toBe("workspaceLoopPaused");
    expect(
      fillRehearsalCopy(
        "Loop {section} from {start}–{end}.",
        nextActionValues(state),
      ),
    ).toContain(song.sections[0]!.label);
    state = reduceRehearsalTransport(state, { type: "stop" });
    expect(state.phase).toBe("armed");
    expect(state.playheadSeconds).toBe(loop!.startSeconds);
  });

  it("formats a safe clock and stays idle when no playable section exists", () => {
    expect(formatRehearsalClock(Number.NaN)).toBe("0:00");
    expect(formatRehearsalClock(125)).toBe("2:05");
    const song = createDemoRehearsalSong();
    song.sections = [];
    expect(resolveLoopWindow(song)).toBeNull();
    const idle = reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop: null,
    });
    expect(nextActionTemplateKey(idle, true)).toBe("workspaceLoopIdle");
    expect(reduceRehearsalTransport(idle, { type: "start" }).phase).toBe(
      "idle",
    );
  });
});
