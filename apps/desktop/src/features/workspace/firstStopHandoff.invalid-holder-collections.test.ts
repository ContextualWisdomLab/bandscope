import { describe, expect, it } from "vitest";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { resolveFirstStopHandoff } from "./firstStopHandoff";

function songWithStop() {
  const song = createDemoRehearsalSong();
  const stop = structuredClone(song.sections[0]!);
  stop.id = "stop-1";
  stop.label = "stop";
  stop.timeRange = { start: 18, end: 19 };
  song.sections = [stop];
  return { song, stop };
}

describe("resolveFirstStopHandoff runtime holder collections", () => {
  it("keeps the cut band-wide when runtime roles are not an array", () => {
    const { song, stop } = songWithStop();
    stop.roles = null as unknown as typeof stop.roles;

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)?.holdingRole).toBeNull();
  });

  it("keeps the cut band-wide when runtime partGraph is not an array", () => {
    const { song, stop } = songWithStop();
    stop.partGraph = null as unknown as typeof stop.partGraph;

    expect(() => resolveFirstStopHandoff(song)).not.toThrow();
    expect(resolveFirstStopHandoff(song)?.holdingRole).toBeNull();
  });
});
