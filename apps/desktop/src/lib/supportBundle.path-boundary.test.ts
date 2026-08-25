import { describe, expect, it } from "vitest";

import { buildSupportBundleManifest } from "./supportBundle";

const revision = "a".repeat(40);

function baseInput() {
  return {
    generatedAt: "2026-08-20T12:00:00Z",
    app: {
      version: "0.1.4",
      sourceRevision: revision,
      buildId: "desktop-release-42",
      platform: "windows",
      architecture: "x86_64"
    },
    events: [
      {
        eventId: "analysis.failed",
        severity: "error",
        stage: "analysis",
        component: "analysis-engine",
        retryable: false,
        nextAction: "retry",
        correlationId: "analysis-7",
        sequence: 1,
        fields: {}
      }
    ]
  };
}

describe("support-bundle path boundary", () => {
  it.each([
    ["buildId", "C:private-project"],
    ["correlationId", "D:rehearsal-cache"],
    ["backend", "E:dependency-log"]
  ])("rejects Windows drive-relative path-shaped %s evidence", (slot, value) => {
    const input = baseInput();
    if (slot === "buildId") {
      input.app.buildId = value;
    } else if (slot === "correlationId") {
      input.events[0]!.correlationId = value;
    } else {
      input.events[0]!.fields = { backend: value };
    }

    expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
  });

  it("preserves colon-bearing device identifiers that are not drive-relative paths", () => {
    const input = baseInput();
    input.events[0]!.fields = { device: "cuda:0" };

    expect(buildSupportBundleManifest(input).events[0]?.fields).toEqual({ device: "cuda:0" });
  });
});
