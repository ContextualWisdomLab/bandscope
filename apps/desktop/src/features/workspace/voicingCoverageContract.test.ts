import { describe, expect, it } from "vitest";
import { DESKTOP_OWNED_PRODUCTION_COVERAGE } from "../../../vite.config";

describe("desktop owned production coverage", () => {
  it("keeps the voicing-plan resolver and callout inside the coverage gate", () => {
    expect(DESKTOP_OWNED_PRODUCTION_COVERAGE).toEqual(
      expect.arrayContaining([
        "src/features/workspace/firstVoicingPlan.ts",
        "src/features/workspace/FirstVoicingPlanCallout.tsx"
      ])
    );
  });
});
