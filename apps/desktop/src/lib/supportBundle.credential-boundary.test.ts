import { describe, expect, it } from "vitest";

import { buildSupportBundleManifest } from "./supportBundle";

const revision = "a".repeat(40);

function inputWithField(field: string, value: string) {
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
        fields: { [field]: value }
      }
    ]
  };
}

describe("support-bundle credential boundary", () => {
  it.each([
    ["backend", ["gh", "p_abcdefghijklmnopqrstuvwxyz0123456789"].join("")],
    ["device", ["github", "_pat_11AA0_exampleCredential"].join("")],
    ["codec", ["sk", "-proj-exampleCredential"].join("")],
    ["errorClass", ["xox", "b-exampleCredential"].join("")]
  ])("rejects credential-shaped %s evidence before it enters the manifest", (field, value) => {
    expect(() => buildSupportBundleManifest(inputWithField(field, value))).toThrow(
      "Invalid support bundle input"
    );
  });

  it("continues to preserve ordinary allowlisted structured tokens", () => {
    expect(buildSupportBundleManifest(inputWithField("device", "cuda:0")).events[0]?.fields).toEqual({
      device: "cuda:0"
    });
  });
});
