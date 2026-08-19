import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

describe("resolveFirstStopHandoff runtime time range", () => {
  it("rejects a stop whose runtime timeRange is not an object", () => {
    const song = createDemoRehearsalSong();
    const stop = structuredClone(song.sections[0]!);
    stop.id = "stop-1";
    stop.label = "stop";
    stop.timeRange = null as unknown as typeof stop.timeRange;
    song.sections = [stop];

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)).toBeNull();
  });

  it("skips a zero-length stop window and selects the next valid cut", () => {
    const song = createDemoRehearsalSong();
    const zeroLengthStop = structuredClone(song.sections[0]!);
    zeroLengthStop.id = "stop-zero-length";
    zeroLengthStop.label = "stop";
    zeroLengthStop.timeRange = { start: 10, end: 10 };

    const validStop = structuredClone(song.sections[0]!);
    validStop.id = "stop-valid";
    validStop.label = "stop";
    validStop.timeRange = { start: 18, end: 19 };
    song.sections = [zeroLengthStop, validStop];

    expect(resolveFirstStopHandoff(song)?.section.id).toBe("stop-valid");
  });
});
