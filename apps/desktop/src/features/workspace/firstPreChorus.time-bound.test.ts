import { describe, expect, it } from "vitest";
import { MAX_SECTION_TIME_SECONDS } from "@bandscope/shared-types";
import { formatPreChorusTime } from "./firstPreChorus";

describe("formatPreChorusTime", () => {
  it("fails closed when formatter input exceeds the shared timing bound", () => {
    expect(formatPreChorusTime(MAX_SECTION_TIME_SECONDS + 1)).toBe("0:00");
    expect(formatPreChorusTime(Number.MAX_VALUE)).toBe("0:00");
  });
});
