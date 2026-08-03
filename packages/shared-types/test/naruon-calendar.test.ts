import {
  createNaruonRehearsalHandoff,
  validateNaruonRehearsalHandoff,
  type CreateNaruonRehearsalHandoffInput
} from "../src/naruon";

/** Return a valid minimal handoff input with a configurable creation timestamp. */
function inputWithCreatedAt(createdAt: string): CreateNaruonRehearsalHandoffInput {
  return {
    createdAt,
    source: {
      application: "bandscope",
      workspaceId: "workspace-calendar-edge",
      bandId: "band-calendar-edge",
      rehearsalId: "rehearsal-calendar-edge"
    },
    normGroup: {
      kind: "band",
      id: "band-calendar-edge",
      label: "Calendar Edge Band"
    },
    event: {
      title: "Gregorian boundary rehearsal",
      startsAt: "2026-08-10T19:00:00+09:00",
      endsAt: "2026-08-10T20:00:00+09:00",
      timeZone: "Asia/Seoul"
    },
    commitment: {
      status: "tentative",
      rsvpDirection: "attendee"
    },
    provenance: {
      sourceRecordId: "calendar-edge-record",
      confidence: 1,
      evidence: [{ field: "createdAt", value: createdAt }]
    }
  };
}

describe("naruon RFC 3339 Gregorian validation", () => {
  it("accepts February 29 in year 0000 under the proleptic Gregorian calendar", () => {
    expect(
      createNaruonRehearsalHandoff(
        inputWithCreatedAt("0000-02-29T00:00:00Z")
      ).createdAt
    ).toBe("0000-02-29T00:00:00Z");
  });

  it.each([
    "0099-02-29T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "2100-02-29T00:00:00Z"
  ])("rejects February 29 in non-leap year %s", (createdAt) => {
    const value = {
      artifactKind: "bandscope.naruon.rehearsal-event",
      artifactVersion: 1,
      ...inputWithCreatedAt(createdAt)
    };

    expect(validateNaruonRehearsalHandoff(value)).toBe("createdAt is invalid");
  });
});
