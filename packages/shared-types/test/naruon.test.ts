/* eslint-disable @typescript-eslint/no-explicit-any -- boundary tests deliberately construct malformed unknown payloads. */
import {
  MAX_NARUON_EVIDENCE_RECEIPTS,
  NARUON_REHEARSAL_HANDOFF_KIND,
  NARUON_REHEARSAL_HANDOFF_VERSION,
  createNaruonRehearsalHandoff,
  deserializeNaruonRehearsalHandoff,
  isNaruonRehearsalHandoff,
  parseNaruonRehearsalHandoff,
  serializeNaruonRehearsalHandoff,
  validateNaruonRehearsalHandoff,
  type CreateNaruonRehearsalHandoffInput,
  type NaruonRehearsalHandoff
} from "../src/naruon";

function validInput(): CreateNaruonRehearsalHandoffInput {
  return {
    createdAt: "2026-08-03T01:23:45.123Z",
    source: {
      application: "bandscope",
      workspaceId: "workspace-local-alpha",
      bandId: "band-contextual-wisdom",
      rehearsalId: "rehearsal-2026-08-10"
    },
    normGroup: {
      kind: "band",
      id: "band-contextual-wisdom",
      label: "Contextual Wisdom Band"
    },
    event: {
      title: "August rehearsal",
      startsAt: "2026-08-10T19:00:00+09:00",
      endsAt: "2026-08-10T21:30:00+09:00",
      timeZone: "Asia/Seoul",
      venue: "Studio A"
    },
    commitment: {
      status: "confirmed",
      rsvpDirection: "organizer"
    },
    provenance: {
      sourceRecordId: "calendar-record-alpha",
      confidence: 0.94,
      evidence: [
        { field: "startsAt", value: "2026-08-10T19:00:00+09:00" },
        { field: "venue", value: "Studio A" }
      ]
    }
  };
}

function validHandoff(): NaruonRehearsalHandoff {
  return createNaruonRehearsalHandoff(validInput());
}

function clone(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

describe("naruon rehearsal handoff contract", () => {
  it("builds the versioned standalone handoff and preserves integration semantics", () => {
    const handoff = validHandoff();

    expect(handoff.artifactKind).toBe(NARUON_REHEARSAL_HANDOFF_KIND);
    expect(handoff.artifactVersion).toBe(NARUON_REHEARSAL_HANDOFF_VERSION);
    expect(handoff.source.application).toBe("bandscope");
    expect(handoff.normGroup).toEqual({
      kind: "band",
      id: handoff.source.bandId,
      label: "Contextual Wisdom Band"
    });
    expect(handoff.commitment).toEqual({
      status: "confirmed",
      rsvpDirection: "organizer"
    });
    expect(validateNaruonRehearsalHandoff(handoff)).toBeNull();
    expect(isNaruonRehearsalHandoff(handoff)).toBe(true);
  });

  it("canonicalizes nested values instead of returning caller-owned objects", () => {
    const input = validInput();
    const handoff = createNaruonRehearsalHandoff(input);

    expect(handoff).not.toBe(input);
    expect(handoff.source).not.toBe(input.source);
    expect(handoff.normGroup).not.toBe(input.normGroup);
    expect(handoff.event).not.toBe(input.event);
    expect(handoff.commitment).not.toBe(input.commitment);
    expect(handoff.provenance).not.toBe(input.provenance);
    expect(handoff.provenance.evidence).not.toBe(input.provenance.evidence);
    expect(handoff.provenance.evidence[0]).not.toBe(input.provenance.evidence[0]);

    input.source.bandId = "band-mutated";
    input.provenance.evidence[0].value = "mutated";
    expect(handoff.source.bandId).toBe("band-contextual-wisdom");
    expect(handoff.provenance.evidence[0].value).toBe("2026-08-10T19:00:00+09:00");
  });

  it("omits an absent optional venue from canonical output", () => {
    const input = validInput();
    delete input.event.venue;

    const parsed = createNaruonRehearsalHandoff(input);

    expect(parsed.event).toEqual({
      title: "August rehearsal",
      startsAt: "2026-08-10T19:00:00+09:00",
      endsAt: "2026-08-10T21:30:00+09:00",
      timeZone: "Asia/Seoul"
    });
    expect("venue" in parsed.event).toBe(false);
  });

  it("produces identical serialization regardless of input key insertion order", () => {
    const inputA = validInput();
    const serializedA = serializeNaruonRehearsalHandoff(createNaruonRehearsalHandoff(inputA));

    const inputB: CreateNaruonRehearsalHandoffInput = {
      createdAt: inputA.createdAt,
      source: Object.fromEntries(Object.entries(inputA.source).reverse()) as any,
      normGroup: Object.fromEntries(Object.entries(inputA.normGroup).reverse()) as any,
      event: Object.fromEntries(Object.entries(inputA.event).reverse()) as any,
      commitment: Object.fromEntries(Object.entries(inputA.commitment).reverse()) as any,
      provenance: {
        ...Object.fromEntries(
          Object.entries({
            sourceRecordId: inputA.provenance.sourceRecordId,
            confidence: inputA.provenance.confidence
          }).reverse()
        ),
        evidence: inputA.provenance.evidence.map((receipt) =>
          Object.fromEntries(Object.entries(receipt).reverse())
        )
      } as any
    };
    const serializedB = serializeNaruonRehearsalHandoff(createNaruonRehearsalHandoff(inputB));

    expect(serializedA).toBe(serializedB);
  });

  it("serializes deterministically and validates again when deserializing", () => {
    const serialized = serializeNaruonRehearsalHandoff(validHandoff());

    expect(serialized.endsWith("\n")).toBe(true);
    expect(deserializeNaruonRehearsalHandoff(serialized)).toEqual(validHandoff());
    expect(() => deserializeNaruonRehearsalHandoff("{not-json")).toThrow(
      "Invalid naruon rehearsal handoff JSON"
    );
  });

  it("rejects a non-object root and throws from the parser", () => {
    expect(validateNaruonRehearsalHandoff(null)).toBe("root must be an object");
    expect(isNaruonRehearsalHandoff([])).toBe(false);
    expect(() => parseNaruonRehearsalHandoff("invalid")).toThrow(
      "Invalid naruon rehearsal handoff"
    );
  });

  it.each([
    ["root.extra", (value: any) => { value.extra = true; }],
    ["artifactKind", (value: any) => { value.artifactKind = "other"; }],
    ["artifactVersion", (value: any) => { value.artifactVersion = 2; }],
    ["createdAt", (value: any) => { value.createdAt = "2026-08-03"; }],
    ["source must", (value: any) => { value.source = null; }],
    ["source.extra", (value: any) => { value.source.extra = true; }],
    ["source.application", (value: any) => { value.source.application = "naruon"; }],
    ["source.workspaceId", (value: any) => { value.source.workspaceId = "123"; }],
    ["source.bandId", (value: any) => { value.source.bandId = ""; }],
    ["source.rehearsalId", (value: any) => { value.source.rehearsalId = "bad\nvalue"; }],
    ["normGroup must", (value: any) => { value.normGroup = []; }],
    ["normGroup.extra", (value: any) => { value.normGroup.extra = true; }],
    ["normGroup.kind", (value: any) => { value.normGroup.kind = "team"; }],
    ["normGroup.id is", (value: any) => { value.normGroup.id = "44"; }],
    ["normGroup.label", (value: any) => { value.normGroup.label = " label "; }],
    ["must equal", (value: any) => { value.normGroup.id = "band-other"; }],
    ["event must", (value: any) => { value.event = "event"; }],
    ["event.extra", (value: any) => { value.event.extra = true; }],
    ["event.title", (value: any) => { value.event.title = ""; }],
    ["event.startsAt", (value: any) => { value.event.startsAt = "not-a-date"; }],
    ["event.endsAt is", (value: any) => { value.event.endsAt = "not-a-date"; }],
    ["later than", (value: any) => { value.event.endsAt = value.event.startsAt; }],
    ["event.timeZone", (value: any) => { value.event.timeZone = "Mars/Olympus"; }],
    ["event.venue", (value: any) => { value.event.venue = " "; }],
    ["commitment must", (value: any) => { value.commitment = null; }],
    ["commitment.extra", (value: any) => { value.commitment.extra = true; }],
    ["commitment.status", (value: any) => { value.commitment.status = "maybe"; }],
    ["commitment.rsvpDirection", (value: any) => { value.commitment.rsvpDirection = "observer"; }],
    ["provenance must", (value: any) => { value.provenance = null; }],
    ["provenance.extra", (value: any) => { value.provenance.extra = true; }],
    ["provenance.sourceRecordId", (value: any) => { value.provenance.sourceRecordId = "7"; }],
    ["provenance.confidence", (value: any) => { value.provenance.confidence = Number.NaN; }],
    ["provenance.evidence", (value: any) => { value.provenance.evidence = "receipt"; }],
    ["evidence[0] must", (value: any) => { value.provenance.evidence[0] = null; }],
    ["evidence[0].extra", (value: any) => { value.provenance.evidence[0].extra = true; }],
    ["evidence[0].field", (value: any) => { value.provenance.evidence[0].field = ""; }],
    ["evidence[0].value", (value: any) => { value.provenance.evidence[0].value = "bad\nvalue"; }]
  ])("fails closed for %s", (expected, mutate) => {
    const value = clone(validHandoff());
    mutate(value);

    expect(validateNaruonRehearsalHandoff(value)).toContain(expected);
    expect(isNaruonRehearsalHandoff(value)).toBe(false);
    expect(() => parseNaruonRehearsalHandoff(value)).toThrow(
      "Invalid naruon rehearsal handoff"
    );
  });

  it.each([
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-02-30T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:60Z",
    "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00+01:60",
    "2026-01-01T00:00:00.1234567890Z"
  ])("rejects calendrically invalid RFC 3339 timestamp %s", (createdAt) => {
    const value = clone(validHandoff());
    value.createdAt = createdAt;

    expect(validateNaruonRehearsalHandoff(value)).toBe("createdAt is invalid");
  });

  it.each([null, -0.01, 1.01, Number.POSITIVE_INFINITY])(
    "rejects invalid calibrated confidence %s",
    (confidence) => {
      const value = clone(validHandoff());
      value.provenance.confidence = confidence;

      expect(validateNaruonRehearsalHandoff(value)).toBe(
        "provenance.confidence is invalid"
      );
    }
  );

  it("accepts confidence boundaries and every commitment-axis combination", () => {
    for (const confidence of [0, 1]) {
      for (const status of ["confirmed", "tentative", "desired"] as const) {
        for (const rsvpDirection of ["organizer", "attendee"] as const) {
          const value = clone(validHandoff());
          value.provenance.confidence = confidence;
          value.commitment.status = status;
          value.commitment.rsvpDirection = rsvpDirection;
          expect(validateNaruonRehearsalHandoff(value)).toBeNull();
        }
      }
    }
  });

  it("rejects empty, oversized, and sparse provenance receipt collections", () => {
    const empty = clone(validHandoff());
    empty.provenance.evidence = [];
    expect(validateNaruonRehearsalHandoff(empty)).toBe("provenance.evidence is invalid");

    const oversized = clone(validHandoff());
    oversized.provenance.evidence = Array.from(
      { length: MAX_NARUON_EVIDENCE_RECEIPTS + 1 },
      (_, index) => ({ field: `field-${index}`, value: `value-${index}` })
    );
    expect(validateNaruonRehearsalHandoff(oversized)).toBe(
      "provenance.evidence is invalid"
    );

    const sparse = clone(validHandoff());
    sparse.provenance.evidence = new Array(1);
    expect(validateNaruonRehearsalHandoff(sparse)).toBe("provenance.evidence is invalid");
  });

  it("rejects oversized fields and allows the UTC time zone", () => {
    const oversizedIdentifier = clone(validHandoff());
    oversizedIdentifier.source.workspaceId = `id-${"x".repeat(256)}`;
    expect(validateNaruonRehearsalHandoff(oversizedIdentifier)).toBe(
      "source.workspaceId is invalid"
    );

    const oversizedText = clone(validHandoff());
    oversizedText.event.title = "x".repeat(2_049);
    expect(validateNaruonRehearsalHandoff(oversizedText)).toBe("event.title is invalid");

    const utc = clone(validHandoff());
    utc.event.timeZone = "UTC";
    utc.event.startsAt = "2026-08-10T10:00:00Z";
    utc.event.endsAt = "2026-08-10T12:30:00Z";
    expect(validateNaruonRehearsalHandoff(utc)).toBeNull();
  });

  it("snapshots hostile array length metadata and rejects the forged collection", () => {
    const value = clone(validHandoff());
    value.provenance.evidence = new Proxy([{ field: "title", value: "Rehearsal" }], {
      get(target, property, receiver) {
        if (property === "length") return Number.MAX_SAFE_INTEGER + 1;
        return Reflect.get(target, property, receiver);
      }
    });

    expect(validateNaruonRehearsalHandoff(value)).toBe("provenance.evidence is invalid");
  });
});
