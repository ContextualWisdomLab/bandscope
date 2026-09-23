import { describe, expect, it } from "vitest";
import { createTranslator } from "../../i18n";

describe("section-end coordination copy", () => {
  it("describes structural section-end evidence without inventing a breath cue", () => {
    const en = createTranslator("en");
    const ko = createTranslator("ko");

    expect(en("workspaceFirstBreathTitle")).toBe("Tonight's first section finish");
    expect(en("workspaceFirstBreathNamed")).toBe(
      "{sectionLabel} ends at {endTime}. Finish together at the section boundary."
    );
    expect(en("workspaceFirstBreathMissing")).toBe(
      "Tonight's first section finish still needs a valid end time. Confirm the section ending before rehearsal starts."
    );
    expect(ko("workspaceFirstBreathTitle")).toBe("오늘 먼저 맞출 구간 끝");
    expect(ko("workspaceFirstBreathNamed")).toBe(
      "{sectionLabel}은 {endTime}에 끝납니다. 구간 경계에서 함께 마무리해 보세요."
    );
    expect(ko("workspaceFirstBreathMissing")).toBe(
      "오늘 먼저 맞출 구간 끝은 아직 유효한 종료 시간이 필요합니다. 리허설 시작 전에 구간 마무리를 확인해 보세요."
    );
  });
});
