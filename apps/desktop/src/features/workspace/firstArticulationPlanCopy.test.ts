import { describe, expect, it } from "vitest";
import { formatArticulationPlanCopy } from "./FirstArticulationPlanCallout";

describe("formatArticulationPlanCopy", () => {
  it("interpolates known placeholders from supplied values", () => {
    expect(
      formatArticulationPlanCopy("{role} leads {section} at {at}", {
        role: "Drums",
        section: "verse",
        at: "0:10"
      })
    ).toBe("Drums leads verse at 0:10");
  });

  it("keeps a placeholder verbatim when its value is missing", () => {
    const values = { section: "verse", at: "0:10" } as unknown as Parameters<
      typeof formatArticulationPlanCopy
    >[1];
    expect(formatArticulationPlanCopy("{role} leads {section} at {at}", values)).toBe(
      "{role} leads verse at 0:10"
    );
  });

  it("leaves non-placeholder braces untouched", () => {
    expect(
      formatArticulationPlanCopy("play {section} then {stop}", {
        role: "",
        section: "chorus",
        at: ""
      })
    ).toBe("play chorus then {stop}");
  });
});
