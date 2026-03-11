export const SUPPORTED_AUDIO_FORMATS = ["wav", "mp3", "flac", "m4a"] as const;

export type ProjectSummary = {
  id: string;
  title: string;
  status: "idle" | "running" | "done" | "failed";
  supportedAudioFormats: readonly (typeof SUPPORTED_AUDIO_FORMATS)[number][];
};

export type ConfidenceLevel = "low" | "medium" | "high";
export type ProvenanceSource = "model" | "user";
export type CueAnchorKind = "lyric" | "count" | "transition";
export type RehearsalPriority = "low" | "medium" | "high";
export type ExportFormat = "cue-sheet" | "chart-summary";

export type ConfidenceMarker = {
  level: ConfidenceLevel;
  source: ProvenanceSource;
  notes: string;
};

export type CueAnchor = {
  kind: CueAnchorKind;
  value: string;
};

export type RangeSummary = {
  lowestNote: string;
  highestNote: string;
};

export type RehearsalHarmony = {
  chord: string;
  functionLabel: string;
  source: ProvenanceSource;
};

export type ManualOverride =
  {
    field: "harmony";
    value: RehearsalHarmony & { source: "user" };
    source: "user";
  };

export type RehearsalRole = {
  id: string;
  name: string;
  roleType: "instrument" | "vocal" | "hand";
  harmony: RehearsalHarmony;
  cue: CueAnchor;
  range: RangeSummary;
  confidence: ConfidenceMarker;
  rehearsalPriority: RehearsalPriority;
  simplification: string;
  setupNote: string;
  manualOverrides: ManualOverride[];
};

export type RehearsalSection = {
  id: string;
  label: string;
  groove: string;
  confidence: ConfidenceMarker;
  roles: RehearsalRole[];
};

export type ExportSummary = {
  format: ExportFormat;
  headline: string;
  focusSections: string[];
};

export type RehearsalSong = {
  id: string;
  title: string;
  sections: RehearsalSection[];
  exportSummary: ExportSummary;
};

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const REHEARSAL_PRIORITIES = ["low", "medium", "high"] as const;
const PROVENANCE_SOURCES = ["model", "user"] as const;
const CUE_ANCHOR_KINDS = ["lyric", "count", "transition"] as const;
const ROLE_TYPES = ["instrument", "vocal", "hand"] as const;
const EXPORT_FORMATS = ["cue-sheet", "chart-summary"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function isConfidenceMarker(value: unknown): value is ConfidenceMarker {
  return (
    isRecord(value) &&
    isOneOf(CONFIDENCE_LEVELS, value.level) &&
    isOneOf(PROVENANCE_SOURCES, value.source) &&
    typeof value.notes === "string"
  );
}

function isCueAnchor(value: unknown): value is CueAnchor {
  return (
    isRecord(value) &&
    isOneOf(CUE_ANCHOR_KINDS, value.kind) &&
    typeof value.value === "string"
  );
}

function isRangeSummary(value: unknown): value is RangeSummary {
  return (
    isRecord(value) &&
    typeof value.lowestNote === "string" &&
    typeof value.highestNote === "string"
  );
}

function isRehearsalHarmony(value: unknown): value is RehearsalHarmony {
  return (
    isRecord(value) &&
    typeof value.chord === "string" &&
    typeof value.functionLabel === "string" &&
    isOneOf(PROVENANCE_SOURCES, value.source)
  );
}

function isManualOverride(value: unknown): value is ManualOverride {
  return (
    isRecord(value) &&
    value.field === "harmony" &&
    isRehearsalHarmony(value.value) &&
    value.value.source === "user" &&
    value.source === "user"
  );
}

function isRehearsalRole(value: unknown): value is RehearsalRole {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isOneOf(ROLE_TYPES, value.roleType) &&
    isRehearsalHarmony(value.harmony) &&
    isCueAnchor(value.cue) &&
    isRangeSummary(value.range) &&
    isConfidenceMarker(value.confidence) &&
    isOneOf(REHEARSAL_PRIORITIES, value.rehearsalPriority) &&
    typeof value.simplification === "string" &&
    typeof value.setupNote === "string" &&
    Array.isArray(value.manualOverrides) &&
    value.manualOverrides.every((override) => isManualOverride(override))
  );
}

function isRehearsalSection(value: unknown): value is RehearsalSection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.groove === "string" &&
    isConfidenceMarker(value.confidence) &&
    Array.isArray(value.roles) &&
    value.roles.every((role) => isRehearsalRole(role))
  );
}

function isExportSummary(value: unknown): value is ExportSummary {
  return (
    isRecord(value) &&
    isOneOf(EXPORT_FORMATS, value.format) &&
    typeof value.headline === "string" &&
    isStringArray(value.focusSections)
  );
}

const demoRehearsalSongSeed: RehearsalSong = {
  id: "demo-song",
  title: "Late Night Set",
  sections: [
    {
      id: "verse-1",
      label: "Verse 1",
      groove: "Straight eighths with a late snare feel",
      confidence: {
        level: "medium",
        source: "model",
        notes: "Double-check the pickup into the chorus."
      },
      roles: [
        {
          id: "bass-guitar",
          name: "Bass Guitar",
          roleType: "instrument",
          harmony: {
            chord: "C#m7",
            functionLabel: "vi pedal anchor",
            source: "model"
          },
          cue: {
            kind: "transition",
            value: "Hold through the pickup before the downbeat.",
          },
          range: {
            lowestNote: "C#2",
            highestNote: "E3"
          },
          confidence: {
            level: "medium",
            source: "model",
            notes: "Watch the slide into the turnaround."
          },
          rehearsalPriority: "high",
          simplification: "Stay on roots if the chorus entrance gets muddy.",
          setupNote: "Keep the attack short so the verse breathes.",
          manualOverrides: []
        },
        {
          id: "keys-right",
          name: "Keyboard 1 Right Hand",
          roleType: "hand",
          harmony: {
            chord: "Emaj7",
            functionLabel: "Imaj7 color",
            source: "model"
          },
          cue: {
            kind: "count",
            value: "Enter on beat 2 after the pickup."
          },
          range: {
            lowestNote: "B3",
            highestNote: "G#5"
          },
          confidence: {
            level: "medium",
            source: "model",
            notes: "Top note voicing may need a quick ear check."
          },
          rehearsalPriority: "high",
          simplification: "Drop the top extension if the chorus turnaround still feels busy.",
          setupNote: "Keep the patch bright enough to stay over the guitars.",
          manualOverrides: []
        },
        {
          id: "lead-vocal",
          name: "Lead Vocal",
          roleType: "vocal",
          harmony: {
            chord: "C#m7",
            functionLabel: "vi melodic pull",
            source: "model"
          },
          cue: {
            kind: "lyric",
            value: "city lights"
          },
          range: {
            lowestNote: "G#3",
            highestNote: "C#5"
          },
          confidence: {
            level: "high",
            source: "user",
            notes: "Singer confirmed the pickup phrasing in rehearsal notes."
          },
          rehearsalPriority: "medium",
          simplification: "Keep the sustained note centered; skip the ad-lib on the first pass.",
          setupNote: "Watch the breath before the last line of the verse.",
          manualOverrides: [
            {
              field: "harmony",
              value: {
                chord: "C#m11",
                functionLabel: "vi suspended lift",
                source: "user"
              },
              source: "user"
            }
          ]
        }
      ]
    }
  ],
  exportSummary: {
    format: "cue-sheet",
    headline: "Start with Verse 1 entrances before the chorus lift.",
    focusSections: ["Verse 1"]
  }
};

export function createDefaultProjectSummary(input: {
  id: string;
  title: string;
}): ProjectSummary {
  return {
    id: input.id,
    title: input.title,
    status: "idle",
    supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
  };
}

export function createDemoRehearsalSong(): RehearsalSong {
  return structuredClone(demoRehearsalSongSeed);
}

export function isRehearsalSong(value: unknown): value is RehearsalSong {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.sections) &&
    value.sections.every((section) => isRehearsalSection(section)) &&
    isExportSummary(value.exportSummary)
  );
}

export function parseRehearsalSong(value: unknown): RehearsalSong {
  if (!isRehearsalSong(value)) {
    throw new Error("Invalid rehearsal song contract");
  }

  return structuredClone(value);
}
