import { describe, expect, it } from "vitest";
import { createTranslator } from "./index";

const COPY_KEYS = [
  "workspaceFirstLeftoverLastDropoutRemainingReturnTitle",
  "workspaceFirstLeftoverLastDropoutRemainingReturnNamed",
  "workspaceFirstLeftoverLastDropoutRemainingReturnComeIn",
  "workspaceFirstLeftoverLastDropoutRemainingReturnMissing"
] as const;

describe("rehearsal return copy", () => {
  it("keeps English customer copy in rehearsal language instead of state-machine terms", () => {
    const t = createTranslator("en");

    expect(t(COPY_KEYS[0])).toBe("Next part back in");
    expect(t(COPY_KEYS[1])).toBe(
      "{returningRoleName} comes back at {sectionLabel} after sitting out at {remainingSectionLabel}. Count {returningRoleName} in from the top of {sectionLabel}."
    );
    expect(t(COPY_KEYS[2])).toBe(
      "{returningRoleName} comes back at {sectionLabel} after sitting out at {remainingSectionLabel}. Come in from the top of {sectionLabel}."
    );
    expect(t(COPY_KEYS[3])).toBe(
      "The next return is not clear yet. Confirm which part comes back after parts drop out before rehearsal."
    );
    expect(COPY_KEYS.map((key) => t(key)).join(" ").toLowerCase()).not.toContain("leftover");
    expect(COPY_KEYS.map((key) => t(key)).join(" ").toLowerCase()).not.toContain("last-dropout");
  });

  it("keeps Korean customer copy focused on the player's next action", () => {
    const t = createTranslator("ko");

    expect(t(COPY_KEYS[0])).toBe("다음에 다시 들어올 파트");
    expect(t(COPY_KEYS[1])).toBe(
      "{returningRoleName}은 {remainingSectionLabel}에서 쉰 뒤 {sectionLabel} 처음에 다시 들어옵니다. {sectionLabel} 첫 박부터 {returningRoleName}을 함께 세어 주세요."
    );
    expect(t(COPY_KEYS[2])).toBe(
      "{returningRoleName}은 {remainingSectionLabel}에서 쉰 뒤 {sectionLabel} 처음에 다시 들어옵니다. {sectionLabel} 첫 박부터 들어오세요."
    );
    expect(t(COPY_KEYS[3])).toBe(
      "다음 복귀 파트가 아직 명확하지 않습니다. 다음에 파트가 빠진 뒤 누가 다시 들어오는지 합주 전에 확인하세요."
    );
  });
});
