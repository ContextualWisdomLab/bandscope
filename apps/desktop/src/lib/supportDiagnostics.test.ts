import { describe, expect, it } from "vitest";

import { MAX_SUPPORT_BUNDLE_EVENTS, SupportDiagnosticBuffer } from "./supportBundle";

function event(sequence: number, overrides: Record<string, unknown> = {}) {
  return {
    eventId: "analysis.step",
    severity: "info",
    stage: "analysis",
    component: "desktop",
    retryable: false,
    nextAction: "none",
    correlationId: "analysis-7",
    sequence,
    fields: { backend: "cpu" },
    ...overrides
  };
}

describe("local support diagnostic ring buffer", () => {
  it("keeps only the newest bounded typed events in sequence order", () => {
    const buffer = new SupportDiagnosticBuffer(2);

    buffer.record(event(1));
    buffer.record(event(2, { fields: { backend: "rust" } }));
    buffer.record(event(3, { fields: { backend: "cuda:0" } }));

    expect(buffer.snapshot()).toEqual([
      expect.objectContaining({ sequence: 2, fields: { backend: "rust" } }),
      expect.objectContaining({ sequence: 3, fields: { backend: "cuda:0" } })
    ]);
  });

  it.each([0, -1, 1.5, MAX_SUPPORT_BUNDLE_EVENTS + 1])(
    "rejects invalid capacity %s before allocating diagnostic state",
    (capacity) => {
      expect(() => new SupportDiagnosticBuffer(capacity)).toThrow("Invalid support bundle input");
    }
  );

  it("rejects duplicate or out-of-order sequence authority without mutating retained evidence", () => {
    const buffer = new SupportDiagnosticBuffer(2);
    buffer.record(event(2));
    const before = buffer.snapshot();

    expect(() => buffer.record(event(2))).toThrow("Invalid support bundle input");
    expect(() => buffer.record(event(1))).toThrow("Invalid support bundle input");
    expect(buffer.snapshot()).toEqual(before);
  });

  it("stores only privacy-minimized evidence and contains invalid records before mutation", () => {
    const buffer = new SupportDiagnosticBuffer(2);
    const raw = event(1, {
      message: "private dependency payload",
      absolutePath: "C:\\Users\\Alice\\private.wav",
      fields: {
        backend: "ffmpeg",
        rawUrl: "https://example.invalid/private"
      }
    });

    buffer.record(raw);
    expect(buffer.snapshot()).toEqual([
      {
        eventId: "analysis.step",
        severity: "info",
        stage: "analysis",
        component: "desktop",
        retryable: false,
        nextAction: "none",
        correlationId: "analysis-7",
        sequence: 1,
        fields: { backend: "ffmpeg" }
      }
    ]);

    expect(() => buffer.record(event(2, { retryable: "yes" }))).toThrow(
      "Invalid support bundle input"
    );
    expect(buffer.snapshot()).toHaveLength(1);
  });

  it("returns independent event and field snapshots to callers", () => {
    const buffer = new SupportDiagnosticBuffer(2);
    buffer.record(event(1));

    const first = buffer.snapshot();
    first[0]!.eventId = "mutated";
    first[0]!.fields.backend = "mutated";

    expect(buffer.snapshot()[0]).toEqual(
      expect.objectContaining({ eventId: "analysis.step", fields: { backend: "cpu" } })
    );
  });
});
