import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  createIdleTransportState,
  nextActionValues,
  reduceRehearsalTransport,
  resolveLoopWindow,
} from "./rehearsalTransport";

describe("rehearsal transport tempo display", () => {
  it("rounds the playback-adjusted tempo for rehearsal copy", () => {
    const song = createDemoRehearsalSong();
    song.tempo = 90;
    const loop = resolveLoopWindow(song);
    let state = reduceRehearsalTransport(createIdleTransportState(), {
      type: "arm",
      loop,
    });
    state = reduceRehearsalTransport(state, {
      type: "set-playback-rate",
      rate: 1.25,
    });

    expect(nextActionValues(state).tempo).toBe("113");
  });
});
