import {
  createNaruonRehearsalHandoff,
  parseNaruonRehearsalHandoff,
  validateNaruonRehearsalHandoff,
  type CreateNaruonRehearsalHandoffInput
} from "../src/naruon";

/** Return one valid handoff for payload-safe validation-error regressions. */
function validHandoff(): unknown {
  const input: CreateNaruonRehearsalHandoffInput = {
    createdAt: "2026-08-03T01:23:45Z",
    source: {
      application: "bandscope",
      workspaceId: "workspace-redaction",
      bandId: "band-redaction",
      rehearsalId: "rehearsal-redaction"
    },
    normGroup: { kind: "band", id: "band-redaction", label: "Redaction Band" },
    event: {
      title: "Payload-safe rehearsal",
      startsAt: "2026-08-10T19:00:00+09:00",
      endsAt: "2026-08-10T20:00:00+09:00",
      timeZone: "Asia/Seoul"
    },
    commitment: { status: "confirmed", rsvpDirection: "organizer" },
    provenance: {
      sourceRecordId: "source-redaction",
      confidence: 1,
      evidence: [{ field: "startsAt", value: "2026-08-10T19:00:00+09:00" }]
    }
  };
  return createNaruonRehearsalHandoff(input);
}

describe("naruon validation error payload safety", () => {
  it.each([
    ["root", (value: Record<string, unknown>, secret: string) => { value[secret] = true; }],
    [
      "source",
      (value: Record<string, unknown>, secret: string) => {
        (value.source as Record<string, unknown>)[secret] = true;
      }
    ],
    [
      "provenance.evidence[0]",
      (value: Record<string, unknown>, secret: string) => {
        const provenance = value.provenance as { evidence: Record<string, unknown>[] };
        provenance.evidence[0]![secret] = true;
      }
    ]
  ])("rejects an unexpected %s field without echoing its attacker-controlled key", (path, mutate) => {
    const secret = "private-person-name-and-api-key";
    const value = structuredClone(validHandoff()) as Record<string, unknown>;
    mutate(value, secret);

    const error = validateNaruonRehearsalHandoff(value);

    expect(error).toBe(`${path} contains an unexpected field`);
    expect(error).not.toContain(secret);
    expect(() => parseNaruonRehearsalHandoff(value)).toThrow(
      `Invalid naruon rehearsal handoff: ${path} contains an unexpected field`
    );
  });
});
