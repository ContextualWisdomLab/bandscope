import { readFileSync } from "node:fs";

describe("shared-types coverage policy", () => {
  it("requires 100% for every configured coverage metric", () => {
    const configSource = readFileSync(
      new URL("../vitest.config.ts", import.meta.url),
      "utf8"
    );

    for (const metricName of ["lines", "functions", "branches", "statements"]) {
      expect(configSource).toMatch(
        new RegExp(`\\b${metricName}:\\s*100\\b`)
      );
    }
  });
});
