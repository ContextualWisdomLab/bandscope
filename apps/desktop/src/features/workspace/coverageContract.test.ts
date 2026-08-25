import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESKTOP_OWNED_PRODUCTION_COVERAGE } from "../../../vite.config";

describe("desktop owned production coverage", () => {
  it("keeps the first solo-plan resolver and callout inside the coverage gate", () => {
    expect(DESKTOP_OWNED_PRODUCTION_COVERAGE).toEqual(
      expect.arrayContaining([
        "src/features/workspace/firstSoloPlan.ts",
        "src/features/workspace/FirstSoloPlanCallout.tsx"
      ])
    );
  });

  it("wires the owned production list into Vitest coverage", () => {
    const viteConfigSource = readFileSync(new URL("../../../vite.config.ts", import.meta.url), "utf8");
    expect(viteConfigSource).toMatch(/include:\s*DESKTOP_OWNED_PRODUCTION_COVERAGE\b/);
  });
});
