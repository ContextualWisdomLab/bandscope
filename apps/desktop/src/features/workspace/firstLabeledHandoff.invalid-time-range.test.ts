import { MAX_SECTION_TIME_SECONDS, createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

describe("resolveFirstLabeledHandoff runtime time range", () => {
  it("rejects a handoff whose runtime timeRange is not an object", () => {
    const song = createDemoRehearsalSong();
    const handoff = structuredClone(song.sections[0]!);
    handoff.id = "handoff-1";
    handoff.label = "handoff";
    handoff.timeRange = null as unknown as typeof handoff.timeRange;
    song.sections = [handoff];

    expect(() => resolveFirstLabeledHandoff(song)).not.toThrow();
    expect(resolveFirstLabeledHandoff(song)).toBeNull();
  });

  it("skips a zero-length handoff window and selects the next valid pass", () => {
    const song = createDemoRehearsalSong();
    const zeroLength = structuredClone(song.sections[0]!);
    zeroLength.id = "handoff-zero-length";
    zeroLength.label = "handoff";
    zeroLength.timeRange = { start: 10, end: 10 };

    const valid = structuredClone(song.sections[0]!);
    valid.id = "handoff-valid";
    valid.label = "handoff";
    valid.timeRange = { start: 22, end: 24 };
    song.sections = [zeroLength, valid];

    expect(resolveFirstLabeledHandoff(song)?.section.id).toBe("handoff-valid");
  });

  it("skips a handoff whose runtime window exceeds the shared u32 timing contract", () => {
    const song = createDemoRehearsalSong();
    const overflowing = structuredClone(song.sections[0]!);
    overflowing.id = "handoff-overflow";
    overflowing.label = "handoff";
    overflowing.timeRange = { start: 10, end: MAX_SECTION_TIME_SECONDS + 1 };

    const valid = structuredClone(song.sections[0]!);
    valid.id = "handoff-valid";
    valid.label = "handoff";
    valid.timeRange = { start: 22, end: 24 };
    song.sections = [overflowing, valid];

    expect(resolveFirstLabeledHandoff(song)?.section.id).toBe("handoff-valid");
  });

  it("skips a handoff whose runtime window uses fractional seconds outside the shared timing contract", () => {
    const song = createDemoRehearsalSong();
    const fractional = structuredClone(song.sections[0]!);
    fractional.id = "handoff-fractional";
    fractional.label = "handoff";
    fractional.timeRange = { start: 10.5, end: 11.5 };

    const valid = structuredClone(song.sections[0]!);
    valid.id = "handoff-valid";
    valid.label = "handoff";
    valid.timeRange = { start: 22, end: 24 };
    song.sections = [fractional, valid];

    expect(resolveFirstLabeledHandoff(song)?.section.id).toBe("handoff-valid");
  });
});
