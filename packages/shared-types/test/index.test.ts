import {
  createDefaultProjectSummary,
  createDemoRehearsalSong,
  isRehearsalSong,
  parseRehearsalSong,
  SUPPORTED_AUDIO_FORMATS
} from "../src/index";

describe("shared type helpers", () => {
  it("creates a project summary for a fresh analysis job", () => {
    expect(
      createDefaultProjectSummary({
        id: "project-1",
        title: "Demo Song"
      })
    ).toEqual({
      id: "project-1",
      title: "Demo Song",
      status: "idle",
      supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
    });
  });

  it("creates a rehearsal song with section and role level guidance", () => {
    const song = createDemoRehearsalSong();

    expect(song).toMatchObject({
      id: "demo-song",
      title: "Late Night Set",
      sections: [
        {
          id: "verse-1",
          label: "Verse 1",
          confidence: {
            level: "medium",
            source: "model"
          },
          roles: [
            {
              id: "bass-guitar",
              name: "Bass Guitar",
              roleType: "instrument"
            },
            {
              id: "keys-right",
              name: "Keyboard 1 Right Hand",
              roleType: "hand",
              harmony: {
                chord: "Emaj7",
                source: "model"
              }
            },
            {
              id: "lead-vocal",
              name: "Lead Vocal",
              roleType: "vocal",
              cue: {
                kind: "lyric",
                value: "city lights"
              }
            }
          ]
        }
      ],
      exportSummary: {
        format: "cue-sheet"
      }
    });

    expect(song.sections[0]?.roles[2]?.harmony.source).toBe("model");
    expect(song.sections[0]?.roles[2]?.manualOverrides[0]).toMatchObject({
      field: "harmony",
      source: "user",
      value: {
        chord: "C#m11"
      }
    });
  });

  it("returns a fresh copy of the rehearsal song fixture", () => {
    const first = createDemoRehearsalSong();
    const second = createDemoRehearsalSong();

    first.sections[0]?.roles[2]?.manualOverrides.splice(0, 1);

    expect(second).not.toBe(first);
    expect(second.sections).not.toBe(first.sections);
    expect(second.sections[0]?.roles).not.toBe(first.sections[0]?.roles);
    expect(second.sections[0]?.roles[2]?.manualOverrides).toHaveLength(1);
  });

  it("validates and parses rehearsal song payloads", () => {
    const song = createDemoRehearsalSong();
    const malformedSong = createDemoRehearsalSong() as unknown as {
      sections: Array<{ roles: unknown[] }>;
    };
    const arrayPayload = Object.assign([], {
      id: "array-song",
      title: "Array Song",
      sections: [],
      exportSummary: {
        format: "cue-sheet",
        headline: "Array payload",
        focusSections: []
      }
    });
    malformedSong.sections[0]!.roles = [{ id: "broken-role" }];

    expect(isRehearsalSong(song)).toBe(true);
    expect(isRehearsalSong({ id: "bad" })).toBe(false);
    expect(isRehearsalSong({
      id: "bad",
      title: "Bad",
      sections: [],
      exportSummary: {
        format: 42,
        headline: "oops"
      }
    })).toBe(false);
    expect(isRehearsalSong(malformedSong)).toBe(false);
    expect(isRehearsalSong(arrayPayload)).toBe(false);

    const parsed = parseRehearsalSong(song);
    parsed.sections[0]?.roles.splice(0, 1);

    expect(parsed.sections[0]?.roles).toHaveLength(2);
    expect(song.sections[0]?.roles).toHaveLength(3);
    expect(() => parseRehearsalSong(null)).toThrow("Invalid rehearsal song contract");
  });
});
