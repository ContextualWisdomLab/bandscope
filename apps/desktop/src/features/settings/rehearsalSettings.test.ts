import { describe, expect, it } from "vitest";
import { admittedAudioFormats, settingsNextAction } from "./settingsModel";

describe("admittedAudioFormats", () => {
  it("keeps the canonical local-audio extensions in first-seen order", () => {
    expect(admittedAudioFormats(["wav", "mp3", "flac", "m4a"])).toEqual(["wav", "mp3", "flac", "m4a"]);
  });

  it("normalizes case and spacing without inventing formats", () => {
    expect(admittedAudioFormats([" WAV ", "Mp3", "FLAC", "m4A"])).toEqual(["wav", "mp3", "flac", "m4a"]);
  });

  it("drops duplicates after normalization", () => {
    expect(admittedAudioFormats(["wav", "WAV", " mp3 ", "mp3"])).toEqual(["wav", "mp3"]);
  });

  it("fail-closes untrusted values instead of naming them as playable formats", () => {
    expect(
      admittedAudioFormats([
        "aac",
        "ogg",
        "wav.exe",
        "../mp3",
        "mp3\nwav",
        "",
        "   ",
        1,
        null,
        undefined,
        { format: "wav" },
        ["wav"]
      ])
    ).toEqual([]);
  });

  it("admits only trusted members from a mixed untrusted list", () => {
    expect(admittedAudioFormats(["nope", "wav", 12, "m4a", "webm"])).toEqual(["wav", "m4a"]);
  });
});

describe("settingsNextAction", () => {
  it("asks for a supported file before a song is ready", () => {
    expect(settingsNextAction(false)).toBe("choose-audio");
  });

  it("opens tonight's rehearsal map once a song is ready", () => {
    expect(settingsNextAction(true)).toBe("open-map");
  });
});