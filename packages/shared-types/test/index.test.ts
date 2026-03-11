import { createDefaultProjectSummary, SUPPORTED_AUDIO_FORMATS } from "../src/index";

describe("shared type helpers", () => {
  it("creates a project summary for a fresh analysis job", () => {
    expect(
      createDefaultProjectSummary({
        id: "project-1",
        title: "Demo Song"
      })
    ).toEqual({
      id: "project-1",
      title: "Demo Song",
      status: "idle",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    });
  });
});
