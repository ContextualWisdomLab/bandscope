import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { createLoopWindow } from "./rehearsalTransport";

describe("rehearsal transport descriptor authority", () => {
  it("uses one owned section snapshot instead of Proxy get values", () => {
    const song = createDemoRehearsalSong();
    const section = song.sections[0]!;
    const expectedId = section.id;
    const expectedLabel = section.label;
    const expectedRange = { ...section.timeRange };
    const proxiedSection = new Proxy(section, {
      get(target, property, receiver) {
        if (property === "id") {
          return "proxy-injected-section";
        }
        if (property === "label") {
          return "outro";
        }
        if (property === "timeRange") {
          return { start: 90, end: 100 };
        }
        return Reflect.get(target, property, receiver);
      }
    });

    expect(createLoopWindow(proxiedSection, song.tempo)).toEqual({
      sourceIndex: 0,
      sectionId: expectedId,
      sectionLabel: expectedLabel,
      startSeconds: expectedRange.start,
      endSeconds: expectedRange.end,
      tempoBpm: 120,
      tempoAssumed: false,
      countInBeats: 4
    });
  });
});
