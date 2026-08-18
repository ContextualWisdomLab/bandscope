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
});
