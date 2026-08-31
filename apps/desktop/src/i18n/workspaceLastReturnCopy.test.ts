import { describe, expect, it } from "vitest";
import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

describe("workspace final re-entry copy", () => {
  it("uses scan-friendly rehearsal language instead of state-machine jargon", () => {
    const english = [
      enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnTitle,
      enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnNamed,
      enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnComeIn,
      enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnMissing
    ];

    expect(english.join(" ").toLowerCase()).not.toContain("leftover");
    expect(english.join(" ").toLowerCase()).not.toContain("last-dropout");
    expect(enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnTitle).toBe(
      "Tonight's first final re-entry"
    );
    expect(enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnNamed).toBe(
      "{remainingRoleName} is the last part back at {sectionLabel}; the others started returning at {remainingSectionLabel}. Count {remainingRoleName} in from the top of {sectionLabel}."
    );
    expect(enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnComeIn).toBe(
      "{remainingRoleName} is the last part back at {sectionLabel}; the others started returning at {remainingSectionLabel}. Come in from the top of {sectionLabel}."
    );
    expect(enCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnMissing).toBe(
      "No final re-entry is confirmed yet. Before the first section, check which part returns last after the band begins coming back in."
    );
  });

  it("keeps the Korean cue equally concrete and action-oriented", () => {
    expect(koCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnTitle).toBe(
      "오늘 먼저 볼 마지막 재진입"
    );
    expect(koCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnNamed).toBe(
      "{remainingSectionLabel}에서 일부 파트가 먼저 돌아온 뒤 {remainingRoleName}은 {sectionLabel}에서 마지막으로 합류합니다. {sectionLabel} 첫 박부터 {remainingRoleName}을 넣으세요."
    );
    expect(koCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnComeIn).toBe(
      "{remainingSectionLabel}에서 일부 파트가 먼저 돌아온 뒤 {remainingRoleName}은 {sectionLabel}에서 마지막으로 합류합니다. {sectionLabel} 첫 박부터 들어오세요."
    );
    expect(koCommon.workspaceFirstLeftoverLastDropoutRemainingLastReturnMissing).toBe(
      "아직 마지막 재진입을 확정하지 못했습니다. 첫 구간 전에 다른 파트들이 돌아오기 시작한 뒤 누가 마지막으로 합류하는지 확인하세요."
    );
  });
});
