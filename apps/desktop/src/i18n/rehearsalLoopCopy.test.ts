import { describe, expect, it } from "vitest";
import { createTranslator } from "./index";

describe("rehearsal loop action copy", () => {
  it("names the role action as starting the selected section in both locales", () => {
    expect(createTranslator("en")("workspaceLoopThisSection")).toBe(
      "Start selected section loop",
    );
    expect(createTranslator("ko")("workspaceLoopThisSection")).toBe(
      "선택한 구간 루프 시작",
    );
  });

  it("describes the timer-only transport as a rehearsal clock in both locales", () => {
    const en = createTranslator("en");
    expect(en("workspaceLoopArmedWithAudio")).toContain("rehearsal clock");
    expect(en("workspaceLoopCountingIn")).toContain("rehearsal clock");
    expect(en("workspaceLoopPlaying")).toContain("rehearsal clock");
    expect(en("workspaceLoopArmedNoAudio")).not.toMatch(/\bhear\b|\blisten\b/i);
    expect(en("workspaceLoopArmedWithAudio")).not.toMatch(/\bhear\b|\blisten\b/i);

    const ko = createTranslator("ko");
    expect(ko("workspaceLoopArmedWithAudio")).toContain("합주 시계");
    expect(ko("workspaceLoopCountingIn")).toContain("합주 시계");
    expect(ko("workspaceLoopPlaying")).toContain("합주 시계");
  });
});
