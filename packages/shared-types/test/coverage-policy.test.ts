import { coverageThresholds } from "../vitest.config";

describe("shared-types coverage policy", () => {
  it("requires 100% for every configured coverage metric", () => {
    expect(coverageThresholds).toEqual({
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100
    });
  });
});
