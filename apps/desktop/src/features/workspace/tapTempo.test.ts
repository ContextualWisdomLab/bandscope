import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import {
  emptyTapTempo,
  fillTapCopy,
  MAX_TAP_HISTORY,
  MIN_TAP_COUNT,
  recordTap,
  songNeedsTapTempo,
  tapTempoReading,
  trustedTempoBpm
} from "./tapTempo";

function tapsAt(startMs: number, intervalMs: number, count: number) {
  let state = emptyTapTempo();
  for (let index = 0; index < count; index += 1) {
    state = recordTap(state, startMs + index * intervalMs);
  }
  return state;
}

describe("trustedTempoBpm", () => {
  it("admits only finite rehearsal-usable BPM in 20–400", () => {
    expect(trustedTempoBpm(120)).toBe(120);
    expect(trustedTempoBpm(20)).toBe(20);
    expect(trustedTempoBpm(400)).toBe(400);
    expect(trustedTempoBpm(19)).toBeNull();
    expect(trustedTempoBpm(401)).toBeNull();
    expect(trustedTempoBpm(0)).toBeNull();
    expect(trustedTempoBpm(Number.NaN)).toBeNull();
    expect(trustedTempoBpm("120")).toBeNull();
  });
});

describe("recordTap", () => {
  it("ignores non-finite or backwards clocks and caps history", () => {
    expect(recordTap(emptyTapTempo(), Number.NaN)).toEqual({ tapsMs: [] });
    expect(recordTap({ tapsMs: [1000] }, 900)).toEqual({ tapsMs: [1000] });
    expect(recordTap({ tapsMs: [1000] }, 4_501)).toEqual({ tapsMs: [1000, 4_501] });

    let state = emptyTapTempo();
    for (let index = 0; index < MAX_TAP_HISTORY + 3; index += 1) {
      state = recordTap(state, 1_000 + index * 500);
    }
    expect(state.tapsMs).toHaveLength(MAX_TAP_HISTORY);
    expect(state.tapsMs[0]).toBe(1_000 + 3 * 500);
  });

  it("isolates malformed prior state instead of inheriting it", () => {
    const recovered = recordTap({ tapsMs: ["nope", 250, null, 750] }, 1_250);
    expect(recovered.tapsMs).toEqual([250, 750, 1_250]);
    expect(recordTap(null, 40).tapsMs).toEqual([40]);
  });
});

describe("tapTempoReading", () => {
  it("needs four taps and reads 120 BPM from a steady 500 ms groove", () => {
    expect(tapTempoReading(tapsAt(0, 500, MIN_TAP_COUNT - 1))).toBeNull();
    expect(tapTempoReading(tapsAt(0, 500, MIN_TAP_COUNT))).toEqual({
      tempoBpm: 120,
      tapCount: 4,
      intervalMs: 500
    });
    expect(tapTempoReading(tapsAt(0, 500, 5))?.tempoBpm).toBe(120);
    expect(tapTempoReading({ tapsMs: [0, 500, 500, 1_000] })).toBeNull();
  });

  it("uses the median interval and fails closed on an out-of-range window", () => {
    const medianState = recordTap(recordTap(recordTap(recordTap(emptyTapTempo(), 0), 480), 1_000), 1_500);
    expect(tapTempoReading(medianState)?.tempoBpm).toBe(120);

    expect(tapTempoReading(tapsAt(0, 100, 4))).toBeNull();
    expect(tapTempoReading(tapsAt(0, 4_000, 4))).toBeNull();
    expect(tapTempoReading({ tapsMs: [0, 200, 1_200, 1_400] })).toMatchObject({
      tempoBpm: 300,
      intervalMs: 200
    });
    expect(tapTempoReading(null)).toBeNull();
  });
});

describe("songNeedsTapTempo", () => {
  it("hides the tap control for every stored tempo admitted by the shared song contract", () => {
    const song = createDemoRehearsalSong();
    expect(songNeedsTapTempo(song)).toBe(false);
    song.tempo = undefined;
    expect(songNeedsTapTempo(song)).toBe(true);
    song.tempo = 12;
    expect(songNeedsTapTempo(song)).toBe(false);
    song.tempo = 401;
    expect(songNeedsTapTempo(song)).toBe(false);
    song.tempo = Number.NaN;
    expect(songNeedsTapTempo(song)).toBe(true);
    song.tempo = -1;
    expect(songNeedsTapTempo(song)).toBe(true);
    expect(songNeedsTapTempo(null)).toBe(true);
  });
});

describe("fillTapCopy", () => {
  it("fills own-property tokens once and keeps rehearsal values literal", () => {
    expect(
      fillTapCopy("{tempo} BPM from {taps} taps. Count in 4 at {tempo} BPM.", {
        tempo: "118",
        taps: "4"
      })
    ).toBe("118 BPM from 4 taps. Count in 4 at 118 BPM.");
    expect(fillTapCopy("keep {toString}", {})).toBe("keep {toString}");
  });
});
