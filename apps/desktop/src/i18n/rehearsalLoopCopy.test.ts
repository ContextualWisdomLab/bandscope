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
});
