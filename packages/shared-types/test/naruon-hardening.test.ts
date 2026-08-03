import {
  MAX_NARUON_EVIDENCE_RECEIPTS,
  MAX_NARUON_SERIALIZED_BYTES,
  createNaruonRehearsalHandoff,
  deserializeNaruonRehearsalHandoff,
  parseNaruonRehearsalHandoff,
  validateNaruonRehearsalHandoff,
  type CreateNaruonRehearsalHandoffInput
} from "../src/naruon";

/** Return one valid handoff input for trust-boundary hardening tests. */
function validInput(): CreateNaruonRehearsalHandoffInput {
  return {
    createdAt: "2026-08-03T01:23:45Z",
    source: {
      application: "bandscope",
      workspaceId: "workspace-hardening",
      bandId: "band-hardening",
      rehearsalId: "rehearsal-hardening"
    },
    normGroup: { kind: "band", id: "band-hardening", label: "Hardening Band" },
    event: {
      title: "Hardening rehearsal",
      startsAt: "2026-08-10T19:00:00+09:00",
      endsAt: "2026-08-10T20:00:00+09:00",
      timeZone: "Asia/Seoul"
    },
    commitment: { status: "confirmed", rsvpDirection: "organizer" },
    provenance: {
      sourceRecordId: "source-hardening",
      confidence: 1,
      evidence: [{ field: "startsAt", value: "2026-08-10T19:00:00+09:00" }]
    }
  };
}

/** Add the fixed artifact discriminator and version to a handoff input. */
function artifact(input: CreateNaruonRehearsalHandoffInput): unknown {
  return {
    ...input,
    artifactKind: "bandscope.naruon.rehearsal-event",
    artifactVersion: 1
  };
}

describe("naruon handoff boundary hardening", () => {
  it("rejects numeric offsets inconsistent with the required IANA time zone", () => {
    const input = validInput();
    input.event.startsAt = "2026-08-10T19:00:00+00:00";
    input.event.endsAt = "2026-08-10T20:00:00+00:00";
    expect(validateNaruonRehearsalHandoff(artifact(input))).toBe(
      "event.startsAt offset is inconsistent with event.timeZone"
    );

    input.event.startsAt = "2026-08-10T19:00:00+09:00";
    input.event.endsAt = "2026-08-10T20:00:00+00:00";
    expect(validateNaruonRehearsalHandoff(artifact(input))).toBe(
      "event.endsAt offset is inconsistent with event.timeZone"
    );
  });

  it("accepts RFC 9557 unknown-local-offset forms with an explicit IANA zone", () => {
    for (const offset of ["Z", "-00:00"]) {
      const input = validInput();
      input.event.startsAt = `2026-08-10T10:00:00${offset}`;
      input.event.endsAt = `2026-08-10T11:00:00${offset}`;
      expect(validateNaruonRehearsalHandoff(artifact(input))).toBeNull();
    }
  });

  it("uses the zone rules at each instant, including daylight-saving changes", () => {
    const input = validInput();
    input.event.timeZone = "America/New_York";
    input.event.startsAt = "2026-07-08T09:00:00-04:00";
    input.event.endsAt = "2026-07-08T10:00:00-04:00";
    expect(validateNaruonRehearsalHandoff(artifact(input))).toBeNull();

    input.event.startsAt = "2026-07-08T09:00:00-05:00";
    input.event.endsAt = "2026-07-08T10:00:00-05:00";
    expect(validateNaruonRehearsalHandoff(artifact(input))).toBe(
      "event.startsAt offset is inconsistent with event.timeZone"
    );
  });

  it("snapshots nested accessors once before validation and canonicalization", () => {
    const input = validInput();
    let reads = 0;
    Object.defineProperty(input.source, "bandId", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "band-hardening" : "band-mutated";
      }
    });

    expect(createNaruonRehearsalHandoff(input).source.bandId).toBe("band-hardening");
    expect(reads).toBe(1);
  });

  it("snapshots public validation inputs before reading nested accessors", () => {
    const value = artifact(validInput()) as {
      source: CreateNaruonRehearsalHandoffInput["source"];
    };
    let reads = 0;
    Object.defineProperty(value.source, "bandId", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "band-hardening" : "band-mutated";
      }
    });

    expect(validateNaruonRehearsalHandoff(value)).toBeNull();
    expect(reads).toBe(1);
  });

  it("rejects proxy-backed boundary inputs that cannot be snapshotted", () => {
    const value = new Proxy(artifact(validInput()) as object, {});
    expect(validateNaruonRehearsalHandoff(value)).toBe(
      "root is not structured-cloneable"
    );
    expect(() => parseNaruonRehearsalHandoff(value)).toThrow(
      "root is not structured-cloneable"
    );
  });

  it("rejects oversized evidence before iterating beyond the contract limit", () => {
    const input = validInput();
    input.provenance.evidence = Array.from(
      { length: MAX_NARUON_EVIDENCE_RECEIPTS + 1 },
      (_, index) => ({ field: `field-${index}`, value: `value-${index}` })
    );
    expect(validateNaruonRehearsalHandoff(artifact(input))).toBe(
      "provenance.evidence is invalid"
    );
  });

  it("bounds untrusted serialized input before JSON parsing", () => {
    expect(() => deserializeNaruonRehearsalHandoff(42)).toThrow(
      "serialized payload is invalid or oversized"
    );
    expect(() =>
      deserializeNaruonRehearsalHandoff("x".repeat(MAX_NARUON_SERIALIZED_BYTES + 1))
    ).toThrow("serialized payload is invalid or oversized");
    expect(() => deserializeNaruonRehearsalHandoff("😀".repeat(70_000))).toThrow(
      "serialized payload is invalid or oversized"
    );
  });

  it("does not echo untrusted JSON fragments in parser errors", () => {
    const secret = "private-rehearsal-secret";
    let message = "";
    try {
      deserializeNaruonRehearsalHandoff(`{"${secret}":`);
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain("malformed JSON");
    expect(message).not.toContain(secret);
  });
});

describe("naruon handoff branch completeness", () => {
  it("accepts null-prototype records and rejects hostile prototype traps", () => {
    const canonical = createNaruonRehearsalHandoff(validInput());
    const nullPrototypeRoot = Object.assign(Object.create(null), canonical);
    expect(validateNaruonRehearsalHandoff(nullPrototypeRoot)).toBeNull();

    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("prototype unavailable");
      }
    });
    expect(validateNaruonRehearsalHandoff(hostile)).toBe(
      "root is not structured-cloneable"
    );
  });

  it("covers non-string timestamps, display-invalid zones, and 30-day months", () => {
    const nonStringTimestamp = artifact(validInput()) as Record<string, unknown>;
    nonStringTimestamp.createdAt = 42;
    expect(validateNaruonRehearsalHandoff(nonStringTimestamp)).toBe(
      "createdAt is invalid"
    );

    const invalidDisplayZone = artifact(validInput()) as {
      event: { timeZone: unknown };
    };
    invalidDisplayZone.event.timeZone = "";
    expect(validateNaruonRehearsalHandoff(invalidDisplayZone)).toBe(
      "event.timeZone is invalid"
    );

    const validApril = artifact(validInput()) as Record<string, unknown>;
    validApril.createdAt = "2026-04-30T00:00:00Z";
    expect(validateNaruonRehearsalHandoff(validApril)).toBeNull();

    const invalidApril = artifact(validInput()) as Record<string, unknown>;
    invalidApril.createdAt = "2026-04-31T00:00:00Z";
    expect(validateNaruonRehearsalHandoff(invalidApril)).toBe(
      "createdAt is invalid"
    );
  });
});
