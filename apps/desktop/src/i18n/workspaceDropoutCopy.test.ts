import { describe, expect, it } from "vitest";
import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

describe("workspace sit-out copy", () => {
  it("uses player-readable English instead of state-machine jargon", () => {
    const english = [
      enCommon.workspaceFirstLeftoverLastDropoutTitle,
      enCommon.workspaceFirstLeftoverLastDropoutNamed,
      enCommon.workspaceFirstLeftoverLastDropoutStayOut,
      enCommon.workspaceFirstLeftoverLastDropoutMissing
    ];

    expect(english.join(" ").toLowerCase()).not.toContain("leftover");
    expect(english.join(" ").toLowerCase()).not.toContain("last-dropout");
    expect(enCommon.workspaceFirstLeftoverLastDropoutTitle).toBe("Next part to sit out");
    expect(enCommon.workspaceFirstLeftoverLastDropoutNamed).toBe(
      "{dropoutRoleName} sits out at {sectionLabel} after the band is back in at {lastReturnSectionLabel}. Count {dropoutRoleName} out from the top of {sectionLabel}."
    );
    expect(enCommon.workspaceFirstLeftoverLastDropoutStayOut).toBe(
      "{dropoutRoleName} sits out at {sectionLabel} after the band is back in at {lastReturnSectionLabel}. Stay out from the top of {sectionLabel}."
    );
    expect(enCommon.workspaceFirstLeftoverLastDropoutMissing).toBe(
      "The next sit-out is not clear yet. Confirm who sits out after the band is back in before rehearsal."
    );
  });

  it("keeps the Korean cue equally concrete and action-oriented", () => {
    expect(koCommon.workspaceFirstLeftoverLastDropoutTitle).toBe("다음에 쉬는 파트");
    expect(koCommon.workspaceFirstLeftoverLastDropoutNamed).toBe(
      "{dropoutRoleName}은 {lastReturnSectionLabel}에서 모두 다시 들어온 뒤 {sectionLabel}에서 쉽니다. {sectionLabel} 첫 박부터 {dropoutRoleName}을 빼 주세요."
    );
    expect(koCommon.workspaceFirstLeftoverLastDropoutStayOut).toBe(
      "{dropoutRoleName}은 {lastReturnSectionLabel}에서 모두 다시 들어온 뒤 {sectionLabel}에서 쉽니다. {sectionLabel} 첫 박부터 쉬세요."
    );
    expect(koCommon.workspaceFirstLeftoverLastDropoutMissing).toBe(
      "다음에 쉬는 파트가 아직 명확하지 않습니다. 모두 다시 들어온 뒤 누가 쉬는지 합주 전에 확인하세요."
    );
  });
});
