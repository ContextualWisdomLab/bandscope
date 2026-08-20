import { describe, expect, it } from "vitest";

import {
  MAX_SUPPORT_BUNDLE_EVENTS,
  buildSupportBundleManifest,
  renderSupportBundleReport,
  serializeSupportBundleManifest
} from "./supportBundle";

const revision = "a".repeat(40);

function validInput() {
  return {
    generatedAt: "2026-08-20T12:00:00.000Z",
    app: {
      version: "0.1.4",
      sourceRevision: revision,
      buildId: "desktop-release-42",
      platform: "windows",
      architecture: "x86_64"
    },
    events: [
      {
        eventId: "analysis.decode.failed",
        severity: "error",
        stage: "decode",
        component: "analysis-engine",
        retryable: true,
        nextAction: "choose-another-file",
        correlationId: "analysis-7",
        sequence: 2,
        fields: {
          errorClass: "DecodeError",
          backend: "ffmpeg",
          device: "cuda:0",
          codec: "flac",
          durationMs: 48,
          queueDepth: 1
        }
      },
      {
        eventId: "analysis.started",
        severity: "info",
        stage: "dispatch",
        component: "desktop",
        retryable: false,
        nextAction: "none",
        correlationId: "analysis-7",
        sequence: 1,
        fields: {
          backend: "cpu"
        }
      }
    ]
  };
}

describe("offline support-bundle manifest", () => {
  it("produces a stable schema-v1 manifest ordered by monotonic sequence", () => {
    const manifest = buildSupportBundleManifest(validInput());

    expect(manifest).toEqual({
      schema: "bandscope.support-bundle-manifest",
      schemaVersion: 1,
      generatedAt: "2026-08-20T12:00:00.000Z",
      app: {
        version: "0.1.4",
        sourceRevision: revision,
        buildId: "desktop-release-42",
        platform: "windows",
        architecture: "x86_64"
      },
      events: [
        {
          eventId: "analysis.started",
          severity: "info",
          stage: "dispatch",
          component: "desktop",
          retryable: false,
          nextAction: "none",
          correlationId: "analysis-7",
          sequence: 1,
          fields: { backend: "cpu" }
        },
        {
          eventId: "analysis.decode.failed",
          severity: "error",
          stage: "decode",
          component: "analysis-engine",
          retryable: true,
          nextAction: "choose-another-file",
          correlationId: "analysis-7",
          sequence: 2,
          fields: {
            errorClass: "DecodeError",
            backend: "ffmpeg",
            device: "cuda:0",
            codec: "flac",
            durationMs: 48,
            queueDepth: 1
          }
        }
      ]
    });

    expect(serializeSupportBundleManifest(validInput())).toBe(
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    expect(serializeSupportBundleManifest(validInput())).toBe(
      serializeSupportBundleManifest(validInput())
    );
  });

  it("renders a deterministic human report from the same privacy-safe manifest", () => {
    const input = validInput() as Record<string, unknown>;
    input.absolutePath = "C:\\Users\\Alice\\secret.wav";

    const events = input.events as Array<Record<string, unknown>>;
    events[0] = {
      ...events[0],
      message: "Bearer super-secret /Users/alice/song.wav",
      fields: {
        ...(events[0].fields as Record<string, unknown>),
        rawUrl: "https://example.test/?token=super-secret"
      }
    };

    const report = renderSupportBundleReport(input);

    expect(report).toBe(
      [
        "BandScope support report",
        "Schema: bandscope.support-bundle-manifest v1",
        "Generated: 2026-08-20T12:00:00.000Z",
        "Build: 0.1.4 | desktop-release-42",
        `Source: ${revision}`,
        "Platform: windows/x86_64",
        "Events: 2",
        "1. [info] desktop/dispatch analysis.started | next=none | retryable=no | correlation=analysis-7 | backend=cpu",
        "2. [error] analysis-engine/decode analysis.decode.failed | next=choose-another-file | retryable=yes | correlation=analysis-7 | errorClass=DecodeError | backend=ffmpeg | device=cuda:0 | codec=flac | durationMs=48 | queueDepth=1",
        ""
      ].join("\n")
    );

    for (const forbidden of ["Users", "secret.wav", "super-secret", "Bearer", "token="]) {
      expect(report).not.toContain(forbidden);
    }
  });

  it("copies only allowlisted diagnostic evidence and drops sensitive arbitrary payloads", () => {
    const input = validInput() as Record<string, unknown>;
    input.absolutePath = "C:\\Users\\Alice\\secret.wav";
    input.environment = { NVIDIA_NIM_API_KEY: "super-secret" };

    const events = input.events as Array<Record<string, unknown>>;
    events[0] = {
      ...events[0],
      message: "Bearer super-secret /Users/alice/song.wav",
      stack: "trace with token=super-secret",
      url: "https://user:pass@example.test/watch?v=secret",
      audio: "raw-audio-payload",
      fields: {
        ...(events[0].fields as Record<string, unknown>),
        absolutePath: "/Users/alice/song.wav",
        rawUrl: "https://example.test/?token=super-secret",
        secret: "super-secret",
        subprocessArgs: ["--password", "super-secret"]
      }
    };

    const serialized = serializeSupportBundleManifest(input);

    for (const forbidden of [
      "Users",
      "secret.wav",
      "super-secret",
      "Bearer",
      "token=",
      "user:pass",
      "raw-audio-payload",
      "subprocessArgs"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).toContain("DecodeError");
    expect(serialized).toContain("ffmpeg");
  });

  it("accepts an event with no structured fields and drops absent optional fields", () => {
    const event = { ...validInput().events[0], fields: undefined, severity: "warning" };
    const manifest = buildSupportBundleManifest({ ...validInput(), events: [event] });

    expect(manifest.events[0]?.fields).toEqual({});
    expect(manifest.events[0]?.severity).toBe("warning");

    const emptyFields = buildSupportBundleManifest({
      ...validInput(),
      events: [{ ...validInput().events[0], fields: {}, severity: "debug" }]
    });
    expect(emptyFields.events[0]?.fields).toEqual({});
    expect(emptyFields.events[0]?.severity).toBe("debug");
  });

  it("rejects malformed top-level identity and unbounded event collections", () => {
    const invalidCases: unknown[] = [
      null,
      [],
      {},
      { ...validInput(), app: null },
      { ...validInput(), generatedAt: 123 },
      { ...validInput(), generatedAt: "x".repeat(41) },
      { ...validInput(), generatedAt: "not-rfc3339" },
      { ...validInput(), generatedAt: "2026-99-99T99:99:99Z" },
      { ...validInput(), generatedAt: "2026-02-31T12:00:00Z" },
      { ...validInput(), generatedAt: "2026-04-31T12:00:00Z" },
      { ...validInput(), events: "not-an-array" },
      {
        ...validInput(),
        events: Array.from({ length: MAX_SUPPORT_BUNDLE_EVENTS + 1 }, (_, index) => ({
          ...validInput().events[0],
          sequence: index
        }))
      },
      { ...validInput(), app: { ...validInput().app, sourceRevision: "mutable-main" } },
      { ...validInput(), app: { ...validInput().app, version: "" } },
      { ...validInput(), app: { ...validInput().app, version: "line\nbreak" } }
    ];

    for (const input of invalidCases) {
      expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
    }
  });

  it("rejects malformed event authority instead of coercing it", () => {
    const invalidEvents: unknown[] = [
      null,
      [],
      { ...validInput().events[0], sequence: "1" },
      { ...validInput().events[0], sequence: -1 },
      { ...validInput().events[0], sequence: 1.5 },
      { ...validInput().events[0], retryable: "true" },
      { ...validInput().events[0], severity: "fatal-ish" },
      { ...validInput().events[0], eventId: "x".repeat(129) },
      { ...validInput().events[0], correlationId: "bad\ncorrelation" },
      { ...validInput().events[0], fields: null },
      { ...validInput().events[0], fields: { durationMs: -1 } },
      { ...validInput().events[0], fields: { durationMs: 86_400_001 } },
      { ...validInput().events[0], fields: { queueDepth: "1" } },
      { ...validInput().events[0], fields: { queueDepth: Number.POSITIVE_INFINITY } },
      { ...validInput().events[0], fields: { queueDepth: 100_001 } },
      { ...validInput().events[0], fields: { errorClass: "bad\u0000class" } }
    ];

    for (const event of invalidEvents) {
      expect(() => buildSupportBundleManifest({ ...validInput(), events: [event] })).toThrow(
        "Invalid support bundle input"
      );
    }
  });

  it("snapshots accessor-backed Boolean authority exactly once", () => {
    const event = { ...validInput().events[0] } as Record<string, unknown>;
    let retryableReads = 0;
    Object.defineProperty(event, "retryable", {
      enumerable: true,
      get() {
        retryableReads += 1;
        return retryableReads === 1 ? true : "not-a-boolean";
      }
    });

    const manifest = buildSupportBundleManifest({ ...validInput(), events: [event] });

    expect(manifest.events[0]?.retryable).toBe(true);
    expect(retryableReads).toBe(1);
  });

  it("contains accessor exceptions at the stable support-bundle boundary", () => {
    const input = validInput() as Record<string, unknown>;
    Object.defineProperty(input, "app", {
      enumerable: true,
      get() {
        throw new Error("token=super-secret /Users/alice/private.wav");
      }
    });

    expect(() => buildSupportBundleManifest(input)).toThrow("Invalid support bundle input");
  });

  it("rejects duplicate sequence numbers so ordering evidence cannot be ambiguous", () => {
    const first = validInput().events[0];
    const second = { ...validInput().events[1], sequence: first.sequence };

    expect(() => buildSupportBundleManifest({ ...validInput(), events: [first, second] })).toThrow(
      "Invalid support bundle input"
    );
  });
});