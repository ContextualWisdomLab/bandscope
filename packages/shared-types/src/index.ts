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

export type AnalysisSourceKind = "demo";
export type AnalysisJobState = "queued" | "running" | "succeeded" | "failed";
export type AnalysisJobErrorCode = "invalid_request" | "not_found" | "engine_unavailable";

export type AnalysisJobRequest = {
  sourceKind: AnalysisSourceKind;
  sourceLabel: string;
  roleFocus: string[];
};

export type AnalysisJobError = {
  code: AnalysisJobErrorCode;
  message: string;
};

export type AnalysisJobStatus = {
  jobId: string;
  state: AnalysisJobState;
  requestedAt: string;
  updatedAt: string;
  progressLabel?: string;
  result?: RehearsalSong;
  error?: AnalysisJobError;
};

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const REHEARSAL_PRIORITIES = ["low", "medium", "high"] as const;
const PROVENANCE_SOURCES = ["model", "user"] as const;
const CUE_ANCHOR_KINDS = ["lyric", "count", "transition"] as const;
const ROLE_TYPES = ["instrument", "vocal", "hand"] as const;
const EXPORT_FORMATS = ["cue-sheet", "chart-summary"] as const;
const ANALYSIS_SOURCE_KINDS = ["demo"] as const;
const ANALYSIS_JOB_STATES = ["queued", "running", "succeeded", "failed"] as const;
const ANALYSIS_JOB_ERROR_CODES = ["invalid_request", "not_found", "engine_unavailable"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Array.from({ length: value.length }, (_, index) => index in value).every(Boolean);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && options.includes(value as T);
}

function invalidField(path: string): string {
  return `Invalid rehearsal song contract: invalid field '${path}'`;
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

export function createDemoAnalysisJobRequest(): AnalysisJobRequest {
  return {
    sourceKind: "demo",
    sourceLabel: demoRehearsalSongSeed.title,
    roleFocus: demoRehearsalSongSeed.sections[0].roles.map((role) => role.id)
  };
}

export function createAnalysisJobStatus(input: {
  jobId: string;
  state: AnalysisJobState;
  result?: RehearsalSong;
  error?: AnalysisJobError;
  progressLabel?: string;
  requestedAt?: string;
  updatedAt?: string;
}): AnalysisJobStatus {
  const now = new Date().toISOString();
  return {
    jobId: input.jobId,
    state: input.state,
    requestedAt: input.requestedAt ?? now,
    updatedAt: input.updatedAt ?? now,
    progressLabel: input.progressLabel,
    result: input.result,
    error: input.error
  };
}

function validateAnalysisJobRequest(value: unknown): string | null {
  if (!isRecord(value)) {
    return "Invalid analysis job request: invalid field 'root'";
  }
  if (!isOneOf(ANALYSIS_SOURCE_KINDS, value.sourceKind)) {
    return "Invalid analysis job request: invalid field 'sourceKind'";
  }
  if (typeof value.sourceLabel !== "string") {
    return "Invalid analysis job request: invalid field 'sourceLabel'";
  }
  if (!isDenseArray(value.roleFocus)) {
    return "Invalid analysis job request: invalid field 'roleFocus'";
  }
  for (const [index, role] of value.roleFocus.entries()) {
    if (typeof role !== "string") {
      return `Invalid analysis job request: invalid field 'roleFocus[${index}]'`;
    }
  }
  const allowedKeys = new Set(["sourceKind", "sourceLabel", "roleFocus"]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `Invalid analysis job request: invalid field '${key}'`;
    }
  }

  return null;
}

export function parseAnalysisJobRequest(value: unknown): AnalysisJobRequest {
  const validationError = validateAnalysisJobRequest(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as AnalysisJobRequest);
}

function validateAnalysisJobError(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (!isOneOf(ANALYSIS_JOB_ERROR_CODES, value.code)) {
    return invalidField(`${path}.code`);
  }
  if (typeof value.message !== "string") {
    return invalidField(`${path}.message`);
  }

  return null;
}

function validateAnalysisJobStatus(value: unknown): string | null {
  if (!isRecord(value)) {
    return invalidField("root");
  }
  if (typeof value.jobId !== "string") {
    return invalidField("jobId");
  }
  if (!isOneOf(ANALYSIS_JOB_STATES, value.state)) {
    return invalidField("state");
  }
  if (typeof value.requestedAt !== "string") {
    return invalidField("requestedAt");
  }
  if (typeof value.updatedAt !== "string") {
    return invalidField("updatedAt");
  }
  if (value.progressLabel !== undefined && typeof value.progressLabel !== "string") {
    return invalidField("progressLabel");
  }
  if (value.result !== undefined) {
    const resultError = validateRehearsalSong(value.result);
    if (resultError) {
      return resultError;
    }
  }
  if (value.error !== undefined) {
    const errorValidation = validateAnalysisJobError(value.error, "error");
    if (errorValidation) {
      return errorValidation;
    }
  }
  if (value.state === "succeeded" && value.result === undefined) {
    return invalidField("result");
  }
  if (value.state === "failed" && value.error === undefined) {
    return invalidField("error");
  }

  return null;
}

export function isAnalysisJobStatus(value: unknown): value is AnalysisJobStatus {
  return validateAnalysisJobStatus(value) === null;
}

function validateConfidenceMarker(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (!isOneOf(CONFIDENCE_LEVELS, value.level)) {
    return invalidField(`${path}.level`);
  }
  if (!isOneOf(PROVENANCE_SOURCES, value.source)) {
    return invalidField(`${path}.source`);
  }
  if (typeof value.notes !== "string") {
    return invalidField(`${path}.notes`);
  }

  return null;
}

function validateCueAnchor(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (!isOneOf(CUE_ANCHOR_KINDS, value.kind)) {
    return invalidField(`${path}.kind`);
  }
  if (typeof value.value !== "string") {
    return invalidField(`${path}.value`);
  }

  return null;
}

function validateRangeSummary(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (typeof value.lowestNote !== "string") {
    return invalidField(`${path}.lowestNote`);
  }
  if (typeof value.highestNote !== "string") {
    return invalidField(`${path}.highestNote`);
  }

  return null;
}

function validateRehearsalHarmony(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (typeof value.chord !== "string") {
    return invalidField(`${path}.chord`);
  }
  if (typeof value.functionLabel !== "string") {
    return invalidField(`${path}.functionLabel`);
  }
  if (!isOneOf(PROVENANCE_SOURCES, value.source)) {
    return invalidField(`${path}.source`);
  }

  return null;
}

function validateManualOverride(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (value.field !== "harmony") {
    return invalidField(`${path}.field`);
  }
  if (value.source !== "user") {
    return invalidField(`${path}.source`);
  }

  const harmonyError = validateRehearsalHarmony(value.value, `${path}.value`);
  if (harmonyError) {
    return harmonyError;
  }
  const harmonyValue = value.value as RehearsalHarmony;
  if (harmonyValue.source !== "user") {
    return invalidField(`${path}.value.source`);
  }

  return null;
}

function validateRehearsalRole(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (typeof value.name !== "string") {
    return invalidField(`${path}.name`);
  }
  if (!isOneOf(ROLE_TYPES, value.roleType)) {
    return invalidField(`${path}.roleType`);
  }

  const harmonyError = validateRehearsalHarmony(value.harmony, `${path}.harmony`);
  if (harmonyError) {
    return harmonyError;
  }

  const cueError = validateCueAnchor(value.cue, `${path}.cue`);
  if (cueError) {
    return cueError;
  }

  const rangeError = validateRangeSummary(value.range, `${path}.range`);
  if (rangeError) {
    return rangeError;
  }

  const confidenceError = validateConfidenceMarker(value.confidence, `${path}.confidence`);
  if (confidenceError) {
    return confidenceError;
  }

  if (!isOneOf(REHEARSAL_PRIORITIES, value.rehearsalPriority)) {
    return invalidField(`${path}.rehearsalPriority`);
  }
  if (typeof value.simplification !== "string") {
    return invalidField(`${path}.simplification`);
  }
  if (typeof value.setupNote !== "string") {
    return invalidField(`${path}.setupNote`);
  }
  if (!isDenseArray(value.manualOverrides)) {
    return invalidField(`${path}.manualOverrides`);
  }
  for (const [index, override] of value.manualOverrides.entries()) {
    const overrideError = validateManualOverride(override, `${path}.manualOverrides[${index}]`);
    if (overrideError) {
      return overrideError;
    }
  }

  return null;
}

function validateRehearsalSection(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (typeof value.label !== "string") {
    return invalidField(`${path}.label`);
  }
  if (typeof value.groove !== "string") {
    return invalidField(`${path}.groove`);
  }

  const confidenceError = validateConfidenceMarker(value.confidence, `${path}.confidence`);
  if (confidenceError) {
    return confidenceError;
  }

  if (!isDenseArray(value.roles)) {
    return invalidField(`${path}.roles`);
  }
  for (const [index, role] of value.roles.entries()) {
    const roleError = validateRehearsalRole(role, `${path}.roles[${index}]`);
    if (roleError) {
      return roleError;
    }
  }

  return null;
}

function validateExportSummary(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  if (!isOneOf(EXPORT_FORMATS, value.format)) {
    return invalidField(`${path}.format`);
  }
  if (typeof value.headline !== "string") {
    return invalidField(`${path}.headline`);
  }
  if (!isDenseArray(value.focusSections)) {
    return invalidField(`${path}.focusSections`);
  }
  for (const [index, section] of value.focusSections.entries()) {
    if (typeof section !== "string") {
      return invalidField(`${path}.focusSections[${index}]`);
    }
  }

  return null;
}

function validateRehearsalSong(value: unknown): string | null {
  if (!isRecord(value)) {
    return invalidField("root");
  }
  if (typeof value.id !== "string") {
    return invalidField("id");
  }
  if (typeof value.title !== "string") {
    return invalidField("title");
  }
  if (!isDenseArray(value.sections)) {
    return invalidField("sections");
  }
  for (const [index, section] of value.sections.entries()) {
    const sectionError = validateRehearsalSection(section, `sections[${index}]`);
    if (sectionError) {
      return sectionError;
    }
  }

  return validateExportSummary(value.exportSummary, "exportSummary");
}

export function isRehearsalSong(value: unknown): value is RehearsalSong {
  return validateRehearsalSong(value) === null;
}

export function parseRehearsalSong(value: unknown): RehearsalSong {
  const validationError = validateRehearsalSong(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as RehearsalSong);
}
