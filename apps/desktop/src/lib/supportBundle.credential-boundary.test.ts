import { describe, expect, it } from "vitest";

import { buildSupportBundleManifest } from "./supportBundle";

const revision = "a".repeat(40);

function credential(prefix: string, suffix: string): string {
  return [prefix, suffix].join("");
}

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

function inputWithField(field: string, value: string) {
  const input = baseInput();
  input.events[0]!.fields = { [field]: value };
  return input;
}

describe("support-bundle credential boundary", () => {
  it.each([
    ["backend", credential("gh", "p_abcdefghijklmnopqrstuvwxyz0123456789")],
    ["device", credential("github", "_pat_11AA0_exampleCredential")],
    ["codec", credential("sk", "-proj-exampleCredential")],
    ["errorClass", credential("xox", "b-exampleCredential")]
  ])("rejects credential-shaped %s evidence before it enters the manifest", (field, value) => {
    expect(() => buildSupportBundleManifest(inputWithField(field, value))).toThrow(
      "Invalid support bundle input"
    );
  });

  it.each([
    ["backend", credential("AK", "IAIOSFODNN7EXAMPLE")],
    ["device", credential("AI", "zaSyA123456789012345678901234567890123")],
    ["codec", "glpat-abcdefghijklmnopqrst"],
    ["errorClass", "sk_live_51exampleCredential"]
  ])("rejects additional high-confidence credential-shaped %s evidence", (field, value) => {
    expect(() => buildSupportBundleManifest(inputWithField(field, value))).toThrow(
      "Invalid support bundle input"
    );
  });

  it("rejects credential-shaped correlation identifiers before serialization", () => {
    const input = baseInput();
    input.events[0]!.correlationId = credential("gh", "o_exampleCredential");

    expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
  });

  it("rejects credential-shaped build identifiers before serialization", () => {
    const input = baseInput();
    input.app.buildId = credential("sk", "-proj-exampleCredential");

    expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
  });

  it.each([
    ["correlationId", `analysis:${credential("gh", "p_exampleCredential")}`],
    ["buildId", `desktop.${credential("github", "_pat_11AA0_exampleCredential")}`],
    ["backend", `remote:${credential("xox", "b-exampleCredential")}`]
  ])("rejects credential segments embedded after token delimiters in %s", (slot, value) => {
    const input = baseInput();
    if (slot === "correlationId") {
      input.events[0]!.correlationId = value;
    } else if (slot === "buildId") {
      input.app.buildId = value;
    } else {
      input.events[0]!.fields = { backend: value };
    }

    expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
  });

  it("does not treat ordinary interior letter sequences as credential prefixes", () => {
    const input = baseInput();
    input.app.buildId = "desktop-risk-score";

    expect(buildSupportBundleManifest(input).app.buildId).toBe("desktop-risk-score");
  });

  it("continues to preserve ordinary allowlisted structured tokens", () => {
    expect(buildSupportBundleManifest(inputWithField("device", "cuda:0")).events[0]?.fields).toEqual({
      device: "cuda:0"
    });
  });
});