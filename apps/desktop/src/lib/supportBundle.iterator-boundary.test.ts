import { describe, expect, it } from "vitest";

import { buildSupportBundleManifest } from "./supportBundle";

const revision = "a".repeat(40);

function validEvent() {
  return {
    eventId: "analysis.started",
    severity: "info",
    stage: "dispatch",
    component: "desktop",
    retryable: false,
    nextAction: "none",
    correlationId: "analysis-7",
    sequence: 1,
    fields: { backend: "cpu" }
  };
}

describe("support-bundle event snapshot authority", () => {
  it("does not execute a caller-controlled array iterator when snapshotting bounded events", () => {
    const events = [validEvent()];
    Object.defineProperty(events, Symbol.iterator, {
      configurable: true,
      get() {
        throw new Error("token=super-secret /Users/alice/private.wav");
      }
    });

    const manifest = buildSupportBundleManifest({
      generatedAt: "2026-08-20T12:00:00Z",
      app: {
        version: "0.1.4",
        sourceRevision: revision,
        buildId: "desktop-release-42",
        platform: "windows",
        architecture: "x86_64"
      },
      events
    });

    expect(manifest.events).toHaveLength(1);
    expect(manifest.events[0]?.eventId).toBe("analysis.started");
  });
});
