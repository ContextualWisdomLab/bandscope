import { describe, expect, it } from "vitest";
import copy from "./common.json";

describe("Korean rehearsal guidance", () => {
  it("describes the hand clash as something to listen for", () => {
    expect(copy.workspaceFirstHandClash).toBe(
      "{sectionLabel}의 {roleName}가 다른 파트와 겹칩니다. {sectionLabel} 들어가기 전에 그 손이 밴드와 어떻게 겹치는지 들어 보세요."
    );
  });
});
