export /** Documented. */
const SUPPORTED_AUDIO_FORMATS = ["wav", "mp3", "flac", "m4a"] as const;
export /** Documented. */
const SECTION_FORM_LABELS = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
  "tag",
  "pickup",
  "stop",
  "handoff"
] as const;
export /** Documented. */
const MAX_SECTION_TIME_SECONDS = 4_294_967_295;

/** Documented. */
export type SectionFormLabel = (typeof SECTION_FORM_LABELS)[number];

/** Documented. */
export type ProjectSummary = {
  id: string;
  title: string;
  status: "idle" | "running" | "done" | "failed";
  supportedAudioFormats: readonly (typeof SUPPORTED_AUDIO_FORMATS)[number][];
};

/** Documented. */
export type ConfidenceLevel = "low" | "medium" | "high";
/** Documented. */
export type ProvenanceSource = "model" | "user";
/** Documented. */
export type CueAnchorKind = "lyric" | "count" | "transition";
/** Documented. */
export type RehearsalPriority = "low" | "medium" | "high";
/** Documented. */
export type ExportFormat = "cue-sheet" | "chart-summary";
/** Documented. */
export type CollaborationAssignmentStatus = "todo" | "in_progress" | "ready" | "blocked";
/** Documented. */
export type CollaborationCommentStatus = "open" | "resolved";
/** Documented. */
export type CollaborationApprovalStatus = "pending" | "approved" | "changes_requested";
/** Documented. */
export type CollaborationSyncMode = "local_only" | "planned_cloud";

/** Documented. */
export type ConfidenceMarker = {
  level: ConfidenceLevel;
  source: ProvenanceSource;
  notes: string;
};

/** Documented. */
export type CueAnchor = {
  kind: CueAnchorKind;
  value: string;
};

/** Documented. */
export type RangeSummary = {
  lowestNote: string;
  highestNote: string;
};

/** Documented. */
export type TranscriptionNote = {
  pitch: string;
  onset: number;
  offset: number;
  velocity: number;
};

/** Documented. */
export type RehearsalAssignment = {
  id: string;
  assignee: string;
  summary: string;
  sectionId: string;
  roleId?: string;
  status: CollaborationAssignmentStatus;
};

/** Documented. */
export type RehearsalComment = {
  id: string;
  author: string;
  body: string;
  sectionId: string;
  roleId?: string;
  status: CollaborationCommentStatus;
};

/** Documented. */
export type RehearsalApproval = {
  id: string;
  scope: string;
  owner: string;
  status: CollaborationApprovalStatus;
};

/** Documented. */
export type RehearsalCollaboration = {
  syncMode: CollaborationSyncMode;
  syncNote: string;
  assignments: RehearsalAssignment[];
  comments: RehearsalComment[];
  approvals: RehearsalApproval[];
};

/** Documented. */
export type RehearsalHarmony = {
  chord: string;
  functionLabel: string;
  source: ProvenanceSource;
};

/** Documented. */
export type ManualOverride =
  {
    field: "harmony";
    value: RehearsalHarmony & { source: "user" };
    source: "user";
  };

/** Documented. */
export type RehearsalRole = {
  id: string;
  name: string;
  roleType: "instrument" | "vocal" | "hand";
  harmony: RehearsalHarmony;
  harmonicExplanation?: string;
  cue: CueAnchor;
  range: RangeSummary;
  confidence: ConfidenceMarker;
  rehearsalPriority: RehearsalPriority;
  simplification: string;
  setupNote: string;
  transpositionPlan?: string;
  /** Rehearsal-facing pad guidance owned by this role when runtime graph evidence corroborates it. */
  padPlan?: string;
  manualOverrides: ManualOverride[];
  overlapWarnings: string[];
  transcription?: TranscriptionNote[];
  practiceProgress?: number;
};

/** Documented. */
export type PartGraphNode = {
  role_id: string;
  is_active: boolean;
  handoff_to: string[];
  handoff_from: string[];
};

/** Documented. */
export type SectionTimeRange = {
  start: number;
  end: number;
};

/** Documented. */
export type RehearsalSection = {
  id: string;
  label: SectionFormLabel;
  groove: string;
  timeRange: SectionTimeRange;
  confidence: ConfidenceMarker;
  roles: RehearsalRole[];
  partGraph: PartGraphNode[];
};

/** Documented. */
export type ExportSummary = {
  format: ExportFormat;
  headline: string;
  focusSections: string[];
};


/** Documented. */
export type PackState = "queued" | "analyzing" | "ready" | "failed";

/** Documented. */
export type SongRehearsalPack = 
  | {
      id: string;
      packState: "queued" | "analyzing";
      engineState: AnalysisJobState;
      sourceLabel: string;
    }
  | {
      id: string;
      packState: "ready";
      engineState?: AnalysisJobState;
      song: RehearsalSong;
      sourceLabel: string;
    }
  | {
      id: string;
      packState: "failed";
      engineState?: AnalysisJobState;
      error: AnalysisJobError;
      sourceLabel: string;
    };

/** Documented. */
export type RehearsalWorkspace = {
  id: string;
  title: string;
  songs: SongRehearsalPack[];
  workspaceVersion: number;
};

/** Documented. */
export type ScoreAttachment = {
  id: string;
  fileName: string;
};

/** Documented. */
export type RehearsalSong = {
  id: string;
  title: string;
  tempo?: number;
  sections: RehearsalSection[];
  exportSummary: ExportSummary;
  collaboration?: RehearsalCollaboration;
  scoreAttachments?: ScoreAttachment[];
};

/** Documented. */
export type AnalysisSourceKind = "demo" | "local_audio";
/** Documented. */
export type AnalysisJobState = "queued" | "running" | "succeeded" | "failed";
/** Documented. */
export type AnalysisJobStage = "queued" | "decode" | "separate" | "analyze" | "persist" | "ready";
/** Documented. */
export type AnalysisCacheStatus = "disabled" | "miss" | "hit" | "stored";
/** Documented. */
export type AnalysisJobErrorCode = "invalid_request" | "not_found" | "engine_unavailable";

/** Documented. */
export type LocalAudioSource = {
  sourcePath: string;
  fileName: string;
  extension: (typeof SUPPORTED_AUDIO_FORMATS)[number];
  fileSizeBytes: number;
};

/** Documented. */
export type ProjectBootstrapSummary = {
  projectId: string;
  sourceMode: "reference";
  projectRoot: string;
  cacheRoot: string;
  tempRoot: string;
  source: LocalAudioSource;
};

/** Documented. */
export type MetadataHandoffSourceAsset = {
  referenceKind: "local_audio";
  sourceMode: "reference";
  fileName: string;
  extension: (typeof SUPPORTED_AUDIO_FORMATS)[number];
  fileSizeBytes: number;
  status: "referenced" | "missing";
};

/** Documented. */
export type MetadataHandoffRoleBucket = {
  id: string;
  name: string;
  roleType: RehearsalRole["roleType"];
  confidence: ConfidenceMarker;
  rehearsalPriority: RehearsalPriority;
};

/** Documented. */
export type MetadataHandoffSection = {
  id: string;
  label: SectionFormLabel;
  timeRange: SectionTimeRange;
  confidence: ConfidenceMarker;
  roleBuckets: MetadataHandoffRoleBucket[];
};

/** Documented. */
export type MetadataHandoffArtifact = {
  artifactKind: "bandscope.metadata-handoff";
  artifactVersion: 1;
  createdAt: string;
  workspace: {
    id: string;
    title: string;
    workspaceVersion: number;
  };
  song: {
    id: string;
    title: string;
    exportSummary: ExportSummary;
  };
  sections: MetadataHandoffSection[];
  sourceAssets: MetadataHandoffSourceAsset[];
};

/** Documented. */
export type AnalysisJobRequest =
  | {
      sourceKind: "demo";
      sourceLabel: string;
      roleFocus: string[];
    }
  | {
      sourceKind: "local_audio";
      projectId: string;
      sourceLabel: string;
      roleFocus: string[];
    };

/** Documented. */
export type AnalysisJobError = {
  code: AnalysisJobErrorCode;
  message: string;
};

/** Documented. */
export type AnalysisJobStatus = {
  jobId: string;
  state: AnalysisJobState;
  requestedAt: string;
  updatedAt: string;
  progressLabel?: string;
  progressStage?: AnalysisJobStage;
  progressPercent?: number;
  cacheStatus?: AnalysisCacheStatus;
  result?: RehearsalSong;
  error?: AnalysisJobError;
};

/** Documented. */
export type AnalysisJobSnapshot = {
  jobId: string;
  request: AnalysisJobRequest;
  status: AnalysisJobStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: AnalysisJobError;
  metadata?: Record<string, unknown>;
};

const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const PROJECT_STATUSES = ["idle", "running", "done", "failed"] as const;
const REHEARSAL_PRIORITIES = ["low", "medium", "high"] as const;
const PROVENANCE_SOURCES = ["model", "user"] as const;
const CUE_ANCHOR_KINDS = ["lyric", "count", "transition"] as const;
const ROLE_TYPES = ["instrument", "vocal", "hand"] as const;
const EXPORT_FORMATS = ["cue-sheet", "chart-summary"] as const;
const COLLABORATION_ASSIGNMENT_STATUSES = ["todo", "in_progress", "ready", "blocked"] as const;
const COLLABORATION_COMMENT_STATUSES = ["open", "resolved"] as const;
const COLLABORATION_APPROVAL_STATUSES = ["pending", "approved", "changes_requested"] as const;
const COLLABORATION_SYNC_MODES = ["local_only", "planned_cloud"] as const;
const ANALYSIS_SOURCE_KINDS = ["demo", "local_audio"] as const;
const ANALYSIS_JOB_STATES = ["queued", "running", "succeeded", "failed"] as const;
const ANALYSIS_JOB_STAGES = ["queued", "decode", "separate", "analyze", "persist", "ready"] as const;
const ANALYSIS_CACHE_STATUSES = ["disabled", "miss", "hit", "stored"] as const;
const ANALYSIS_JOB_ERROR_CODES = ["invalid_request", "not_found", "engine_unavailable"] as const;
const PACK_STATES = ["queued", "analyzing", "ready", "failed"] as const;
const HANDOFF_ASSET_STATUSES = ["referenced", "missing"] as const;

type ValidationOptions = {
  acceptLegacySectionTimeRanges: boolean;
};

const STRICT_VALIDATION_OPTIONS: ValidationOptions = {
  acceptLegacySectionTimeRanges: false
};

const LEGACY_VALIDATION_OPTIONS: ValidationOptions = {
  acceptLegacySectionTimeRanges: true
};

/** Documented. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Documented. */
function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  // Performance: avoid Array.from() allocation while keeping a one-time length boundary.
  const arrayLength = Number(value.length);
  if (!Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > 0xffffffff) {
    return false;
  }
  for (let i = 0; i < arrayLength; i++) {
    if (!(i in value)) {
      return false;
    }
  }
  return true;
}

/** Documented. */
function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && options.includes(value as T);
}

/** Documented. */
function invalidField(path: string): string {
  return `Invalid rehearsal song contract: invalid field '${path}'`;
}

/** Documented. */
function unexpectedKey(value: Record<string, unknown>, allowedKeys: readonly string[], path: string): string | null {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      return invalidField(path ? `${path}.${key}` : key);
    }
  }

  return null;
}

/** Documented. */
function invalidProjectSummaryField(path: string): string {
  return `Invalid project summary contract: invalid field '${path}'`;
}

const demoRehearsalSongSeed: RehearsalSong = {
  id: "demo-song",
  title: "Late Night Set",
  tempo: 120,
  sections: [
    {
      id: "verse-1",
      label: "verse",
      groove: "Straight eighths with a late snare feel",
      timeRange: {
        start: 10,
        end: 30
      },
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
          harmonicExplanation: "The bass holds the vi center so the rest of the section can lean into the pickup without losing the tonal floor.",
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
          transpositionPlan: "If the singer drops to B minor, keep the shape a whole step lower and let keys keep the color tones.",
          padPlan: "Drop to a two-bar pad so the Keyboard 1 Right Hand run can land.",
          manualOverrides: [],
          overlapWarnings: [
            "Density warning: competing with Keyboard Left Hand in low register."
          ]
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
          harmonicExplanation: "The right hand supplies the major-7 color that distinguishes the verse from the more open chorus voicing.",
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
          transpositionPlan: "If the band rehearses in D, keep the voicing in first inversion so the top line still sings.",
          manualOverrides: [],
          overlapWarnings: [
            "Melodic overlap: top notes conflict with Lead Vocal range."
          ]
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
          harmonicExplanation: "The melody leans on the ninth over vi, so the vocal line should feel like a lift rather than a strict chord-tone outline.",
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
          transpositionPlan: "If the room wants more ease, move the section down a whole step and keep the pickup breath mark in the same place.",
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
          ],
          overlapWarnings: [
            "Melodic overlap: competing with Keyboard 1 Right Hand."
          ]
        }
      ],
      partGraph: [
        { role_id: "bass-guitar", is_active: true, handoff_to: ["lead-vocal"], handoff_from: [] },
        { role_id: "keys-right", is_active: true, handoff_to: [], handoff_from: [] },
        { role_id: "lead-vocal", is_active: true, handoff_to: [], handoff_from: ["bass-guitar"] }
      ]
    }
  ],
  exportSummary: {
    format: "cue-sheet",
    headline: "Start with verse entrances before the chorus lift.",
    focusSections: ["verse"]
  },
  collaboration: {
    syncMode: "planned_cloud",
    syncNote: "Keep assignments local for now. Cloud sync opens only after security and conflict-resolution rules land.",
    assignments: [
      {
        id: "assign-bass-entrance",
        assignee: "Rhythm Section",
        summary: "Lock the bass entrance against the pickup so the chorus lift lands together.",
        sectionId: "verse-1",
        roleId: "bass-guitar",
        status: "in_progress"
      },
      {
        id: "assign-vocal-key",
        assignee: "Lead Vocal",
        summary: "Confirm whether the verse should stay in C# minor or move down for the first rehearsal pass.",
        sectionId: "verse-1",
        roleId: "lead-vocal",
        status: "todo"
      }
    ],
    comments: [
      {
        id: "comment-keys-color",
        author: "MD",
        body: "Keep the keyboard color tone gentle on the first pass so the vocal cue stays forward.",
        sectionId: "verse-1",
        roleId: "keys-right",
        status: "open"
      },
      {
        id: "comment-vocal-breath",
        author: "Lead Vocal",
        body: "Breath mark is confirmed before the last lyric pickup.",
        sectionId: "verse-1",
        roleId: "lead-vocal",
        status: "resolved"
      }
    ],
    approvals: [
      {
        id: "approval-harmony-pass",
        scope: "Verse harmony pass",
        owner: "MD",
        status: "pending"
      },
      {
        id: "approval-vocal-shape",
        scope: "Lead vocal simplification",
        owner: "Lead Vocal",
        status: "approved"
      }
    ]
  }
};

/** Documented. */
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

/** Documented. */
export function validateProjectSummary(value: unknown): string | null {
  if (!isRecord(value)) {
    return invalidProjectSummaryField("root");
  }
  const allowedKeys = ["id", "title", "status", "supportedAudioFormats"] as const;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key as (typeof allowedKeys)[number])) {
      return invalidProjectSummaryField(key);
    }
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    return invalidProjectSummaryField("id");
  }
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    return invalidProjectSummaryField("title");
  }
  if (!isOneOf(PROJECT_STATUSES, value.status)) {
    return invalidProjectSummaryField("status");
  }
  if (!isDenseArray(value.supportedAudioFormats)) {
    return invalidProjectSummaryField("supportedAudioFormats");
  }
  for (const [index, format] of value.supportedAudioFormats.entries()) {
    if (!isOneOf(SUPPORTED_AUDIO_FORMATS, format)) {
      return invalidProjectSummaryField(`supportedAudioFormats[${index}]`);
    }
  }

  return null;
}

/** Documented. */
export function isProjectSummary(value: unknown): value is ProjectSummary {
  return validateProjectSummary(value) === null;
}

/** Documented. */
export function parseProjectSummary(value: unknown): ProjectSummary {
  const validationError = validateProjectSummary(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as ProjectSummary);
}

/** Documented. */
export function createDemoRehearsalSong(): RehearsalSong {
  return structuredClone(demoRehearsalSongSeed);
}

/** Documented. */
export function createDemoAnalysisJobRequest(): AnalysisJobRequest {
  return {
    sourceKind: "demo",
    sourceLabel: demoRehearsalSongSeed.title,
    roleFocus: demoRehearsalSongSeed.sections[0].roles.map((role) => role.id)
  };
}

/** Documented. */
export function createProjectBootstrapSummary(input: {
  projectId: string;
  projectRoot: string;
  cacheRoot: string;
  tempRoot: string;
  source: LocalAudioSource;
}): ProjectBootstrapSummary {
  return {
    projectId: input.projectId,
    sourceMode: "reference",
    projectRoot: input.projectRoot,
    cacheRoot: input.cacheRoot,
    tempRoot: input.tempRoot,
    source: input.source
  };
}

/** Documented. */
function validateProjectBootstrapSummary(value: unknown): string | null {
  if (!isRecord(value)) {
    return "Invalid project bootstrap summary: invalid field 'root'";
  }
  const allowedKeys = ["projectId", "sourceMode", "projectRoot", "cacheRoot", "tempRoot", "source"] as const;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key as (typeof allowedKeys)[number])) {
      return `Invalid project bootstrap summary: invalid field '${key}'`;
    }
  }
  if (typeof value.projectId !== "string" || value.projectId.trim().length === 0) {
    return "Invalid project bootstrap summary: invalid field 'projectId'";
  }
  if (value.sourceMode !== "reference") {
    return "Invalid project bootstrap summary: invalid field 'sourceMode'";
  }
  if (typeof value.projectRoot !== "string" || value.projectRoot.trim().length === 0) {
    return "Invalid project bootstrap summary: invalid field 'projectRoot'";
  }
  if (typeof value.cacheRoot !== "string" || value.cacheRoot.trim().length === 0) {
    return "Invalid project bootstrap summary: invalid field 'cacheRoot'";
  }
  if (typeof value.tempRoot !== "string" || value.tempRoot.trim().length === 0) {
    return "Invalid project bootstrap summary: invalid field 'tempRoot'";
  }
  const sourceError = validateLocalAudioSource(value.source);
  if (sourceError) {
    return sourceError.replace("Invalid local audio source", "Invalid project bootstrap summary.source");
  }

  return null;
}

/** Documented. */
export function parseProjectBootstrapSummary(value: unknown): ProjectBootstrapSummary {
  const validationError = validateProjectBootstrapSummary(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as ProjectBootstrapSummary);
}

/** Documented. */
function validateMetadataHandoffSourceAsset(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["referenceKind", "sourceMode", "fileName", "extension", "fileSizeBytes", "status"], path);
  if (extraKey) {
    return extraKey;
  }
  if (value.referenceKind !== "local_audio") {
    return invalidField(`${path}.referenceKind`);
  }
  if (value.sourceMode !== "reference") {
    return invalidField(`${path}.sourceMode`);
  }
  if (typeof value.fileName !== "string" || value.fileName.trim().length === 0) {
    return invalidField(`${path}.fileName`);
  }
  if (!isOneOf(SUPPORTED_AUDIO_FORMATS, value.extension)) {
    return invalidField(`${path}.extension`);
  }
  if (typeof value.fileSizeBytes !== "number" || !Number.isFinite(value.fileSizeBytes) || value.fileSizeBytes <= 0) {
    return invalidField(`${path}.fileSizeBytes`);
  }
  if (!isOneOf(HANDOFF_ASSET_STATUSES, value.status)) {
    return invalidField(`${path}.status`);
  }

  return null;
}

/** Documented. */
function validateMetadataHandoffRoleBucket(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "name", "roleType", "confidence", "rehearsalPriority"], path);
  if (extraKey) {
    return extraKey;
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
  const confidenceError = validateConfidenceMarker(value.confidence, `${path}.confidence`);
  if (confidenceError) {
    return confidenceError;
  }
  if (!isOneOf(REHEARSAL_PRIORITIES, value.rehearsalPriority)) {
    return invalidField(`${path}.rehearsalPriority`);
  }

  return null;
}

/** Documented. */
function validateMetadataHandoffSection(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "label", "timeRange", "confidence", "roleBuckets"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (!isOneOf(SECTION_FORM_LABELS, value.label)) {
    return invalidField(`${path}.label`);
  }
  const timeRangeError = validateSectionTimeRange(value.timeRange, `${path}.timeRange`);
  if (timeRangeError) {
    return timeRangeError;
  }
  const confidenceError = validateConfidenceMarker(value.confidence, `${path}.confidence`);
  if (confidenceError) {
    return confidenceError;
  }
  if (!isDenseArray(value.roleBuckets)) {
    return invalidField(`${path}.roleBuckets`);
  }
  for (const [index, role] of value.roleBuckets.entries()) {
    const roleError = validateMetadataHandoffRoleBucket(role, `${path}.roleBuckets[${index}]`);
    if (roleError) {
      return roleError;
    }
  }

  return null;
}

/** Documented. */
function validateMetadataHandoffArtifact(value: unknown): string | null {
  if (!isRecord(value)) {
    return invalidField("root");
  }
  const extraKey = unexpectedKey(
    value,
    ["artifactKind", "artifactVersion", "createdAt", "workspace", "song", "sections", "sourceAssets"],
    ""
  );
  if (extraKey) {
    return extraKey;
  }
  if (value.artifactKind !== "bandscope.metadata-handoff") {
    return invalidField("artifactKind");
  }
  if (value.artifactVersion !== 1) {
    return invalidField("artifactVersion");
  }
  if (typeof value.createdAt !== "string" || value.createdAt.trim().length === 0) {
    return invalidField("createdAt");
  }
  if (!isRecord(value.workspace)) {
    return invalidField("workspace");
  }
  const workspaceExtraKey = unexpectedKey(value.workspace, ["id", "title", "workspaceVersion"], "workspace");
  if (workspaceExtraKey) {
    return workspaceExtraKey;
  }
  if (typeof value.workspace.id !== "string") {
    return invalidField("workspace.id");
  }
  if (typeof value.workspace.title !== "string") {
    return invalidField("workspace.title");
  }
  if (
    typeof value.workspace.workspaceVersion !== "number" ||
    !Number.isInteger(value.workspace.workspaceVersion) ||
    value.workspace.workspaceVersion < 1
  ) {
    return invalidField("workspace.workspaceVersion");
  }
  if (!isRecord(value.song)) {
    return invalidField("song");
  }
  const songExtraKey = unexpectedKey(value.song, ["id", "title", "exportSummary"], "song");
  if (songExtraKey) {
    return songExtraKey;
  }
  if (typeof value.song.id !== "string") {
    return invalidField("song.id");
  }
  if (typeof value.song.title !== "string") {
    return invalidField("song.title");
  }
  const exportSummaryError = validateExportSummary(value.song.exportSummary, "song.exportSummary");
  if (exportSummaryError) {
    return exportSummaryError;
  }
  if (!isDenseArray(value.sections)) {
    return invalidField("sections");
  }
  for (const [index, section] of value.sections.entries()) {
    const sectionError = validateMetadataHandoffSection(section, `sections[${index}]`);
    if (sectionError) {
      return sectionError;
    }
  }
  if (!isDenseArray(value.sourceAssets)) {
    return invalidField("sourceAssets");
  }
  for (const [index, sourceAsset] of value.sourceAssets.entries()) {
    const sourceAssetError = validateMetadataHandoffSourceAsset(sourceAsset, `sourceAssets[${index}]`);
    if (sourceAssetError) {
      return sourceAssetError;
    }
  }

  return null;
}

/** Documented. */
export function isMetadataHandoffArtifact(value: unknown): value is MetadataHandoffArtifact {
  return validateMetadataHandoffArtifact(value) === null;
}

/** Documented. */
export function parseMetadataHandoffArtifact(value: unknown): MetadataHandoffArtifact {
  const validationError = validateMetadataHandoffArtifact(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as MetadataHandoffArtifact);
}

/** Documented. */
function validateLocalAudioSource(value: unknown): string | null {
  if (!isRecord(value)) {
    return "Invalid local audio source: invalid field 'root'";
  }
  const allowedKeys = ["sourcePath", "fileName", "extension", "fileSizeBytes"] as const;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key as (typeof allowedKeys)[number])) {
      return `Invalid local audio source: invalid field '${key}'`;
    }
  }
  if (typeof value.sourcePath !== "string" || value.sourcePath.trim().length === 0) {
    return "Invalid local audio source: invalid field 'sourcePath'";
  }
  if (typeof value.fileName !== "string" || value.fileName.trim().length === 0) {
    return "Invalid local audio source: invalid field 'fileName'";
  }
  if (!isOneOf(SUPPORTED_AUDIO_FORMATS, value.extension)) {
    return "Invalid local audio source: invalid field 'extension'";
  }
  if (typeof value.fileSizeBytes !== "number" || !Number.isFinite(value.fileSizeBytes) || value.fileSizeBytes <= 0) {
    return "Invalid local audio source: invalid field 'fileSizeBytes'";
  }

  return null;
}

/** Documented. */
export function parseLocalAudioSource(value: unknown): LocalAudioSource {
  const validationError = validateLocalAudioSource(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as LocalAudioSource);
}

/** Documented. */
export function createAnalysisJobStatus(input:
  | {
      jobId: string;
      state: "queued" | "running";
      progressLabel?: string;
      progressStage?: AnalysisJobStage;
      progressPercent?: number;
      cacheStatus?: AnalysisCacheStatus;
      requestedAt?: string;
      updatedAt?: string;
    }
  | {
      jobId: string;
      state: "succeeded";
      result: RehearsalSong;
      progressLabel?: string;
      progressStage?: AnalysisJobStage;
      progressPercent?: number;
      cacheStatus?: AnalysisCacheStatus;
      requestedAt?: string;
      updatedAt?: string;
    }
  | {
      jobId: string;
      state: "failed";
      error: AnalysisJobError;
      progressLabel?: string;
      progressStage?: AnalysisJobStage;
      progressPercent?: number;
      cacheStatus?: AnalysisCacheStatus;
      requestedAt?: string;
      updatedAt?: string;
    }
): AnalysisJobStatus {
  const now = new Date().toISOString();
  const status: AnalysisJobStatus = {
    jobId: input.jobId,
    state: input.state,
    requestedAt: input.requestedAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };

  if (input.progressLabel !== undefined) {
    status.progressLabel = input.progressLabel;
  }
  if (input.progressStage !== undefined) {
    status.progressStage = input.progressStage;
  }
  if (input.progressPercent !== undefined) {
    status.progressPercent = input.progressPercent;
  }
  if (input.cacheStatus !== undefined) {
    status.cacheStatus = input.cacheStatus;
  }
  if ("result" in input) {
    status.result = input.result;
  }
  if ("error" in input) {
    status.error = input.error;
  }

  return status;
}

/** Documented. */
function validateAnalysisJobRequest(value: unknown): string | null {
  if (!isRecord(value)) {
    return "Invalid analysis job request: invalid field 'root'";
  }
  if (!isOneOf(ANALYSIS_SOURCE_KINDS, value.sourceKind)) {
    return "Invalid analysis job request: invalid field 'sourceKind'";
  }
  if (typeof value.sourceLabel !== "string" || value.sourceLabel.trim().length === 0) {
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
  const allowedKeys = new Set(
    value.sourceKind === "local_audio"
      ? ["sourceKind", "projectId", "sourceLabel", "roleFocus"]
      : ["sourceKind", "sourceLabel", "roleFocus"]
  );
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return `Invalid analysis job request: invalid field '${key}'`;
    }
  }
  if (value.sourceKind === "local_audio") {
    if (typeof value.projectId !== "string" || value.projectId.trim().length === 0) {
      return "Invalid analysis job request: invalid field 'projectId'";
    }
  }
  
  return null;
}

/** Documented. */
export function parseAnalysisJobRequest(value: unknown): AnalysisJobRequest {
  const validationError = validateAnalysisJobRequest(value);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(value as AnalysisJobRequest);
}

/** Documented. */
function validateAnalysisJobError(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["code", "message"], path);
  if (extraKey) {
    return extraKey;
  }
  if (!isOneOf(ANALYSIS_JOB_ERROR_CODES, value.code)) {
    return invalidField(`${path}.code`);
  }
  if (typeof value.message !== "string") {
    return invalidField(`${path}.message`);
  }

  return null;
}

/** Documented. */
function validateAnalysisJobStatus(
  value: unknown,
  options: ValidationOptions = STRICT_VALIDATION_OPTIONS
): string | null {
  if (!isRecord(value)) {
    return invalidField("root");
  }
  const allowedKeysByState: Record<AnalysisJobState, string[]> = {
    queued: ["jobId", "state", "requestedAt", "updatedAt", "progressLabel", "progressStage", "progressPercent", "cacheStatus"],
    running: ["jobId", "state", "requestedAt", "updatedAt", "progressLabel", "progressStage", "progressPercent", "cacheStatus"],
    succeeded: ["jobId", "state", "requestedAt", "updatedAt", "progressLabel", "progressStage", "progressPercent", "cacheStatus", "result"],
    failed: ["jobId", "state", "requestedAt", "updatedAt", "progressLabel", "progressStage", "progressPercent", "cacheStatus", "error"]
  };
  if (typeof value.jobId !== "string") {
    return invalidField("jobId");
  }
  if (!isOneOf(ANALYSIS_JOB_STATES, value.state)) {
    return invalidField("state");
  }
  const extraKey = unexpectedKey(value, allowedKeysByState[value.state], "");
  if (extraKey) {
    return extraKey;
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
  if (value.progressStage !== undefined && !isOneOf(ANALYSIS_JOB_STAGES, value.progressStage)) {
    return invalidField("progressStage");
  }
  if (
    value.progressPercent !== undefined &&
    (
      typeof value.progressPercent !== "number" ||
      !Number.isInteger(value.progressPercent) ||
      value.progressPercent < 0 ||
      value.progressPercent > 100
    )
  ) {
    return invalidField("progressPercent");
  }
  if (value.cacheStatus !== undefined && !isOneOf(ANALYSIS_CACHE_STATUSES, value.cacheStatus)) {
    return invalidField("cacheStatus");
  }
  if (value.result !== undefined) {
    const resultError = validateRehearsalSong(value.result, options);
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

/** Documented. */
export function isAnalysisJobStatus(value: unknown): value is AnalysisJobStatus {
  return validateAnalysisJobStatus(value) === null;
}

/** Documented. */
export function parseAnalysisJobStatus(value: unknown): AnalysisJobStatus {
  const validationError = validateAnalysisJobStatus(value, LEGACY_VALIDATION_OPTIONS);
  if (validationError) {
    throw new Error(validationError);
  }

  const parsed = structuredClone(value as AnalysisJobStatus);
  if (parsed.result !== undefined) {
    parsed.result = parseRehearsalSong(parsed.result);
  }
  return parsed;
}

/** Documented. */
function validateConfidenceMarker(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["level", "source", "notes"], path);
  if (extraKey) {
    return extraKey;
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

/** Documented. */
function validateCueAnchor(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["kind", "value"], path);
  if (extraKey) {
    return extraKey;
  }
  if (!isOneOf(CUE_ANCHOR_KINDS, value.kind)) {
    return invalidField(`${path}.kind`);
  }
  if (typeof value.value !== "string") {
    return invalidField(`${path}.value`);
  }

  return null;
}

/** Documented. */
function validateRangeSummary(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["lowestNote", "highestNote"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.lowestNote !== "string") {
    return invalidField(`${path}.lowestNote`);
  }
  if (typeof value.highestNote !== "string") {
    return invalidField(`${path}.highestNote`);
  }

  return null;
}

/** Documented. */
function validateRehearsalHarmony(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["chord", "functionLabel", "source"], path);
  if (extraKey) {
    return extraKey;
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

/** Documented. */
function validateRehearsalAssignment(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "assignee", "summary", "sectionId", "roleId", "status"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (typeof value.assignee !== "string") {
    return invalidField(`${path}.assignee`);
  }
  if (typeof value.summary !== "string") {
    return invalidField(`${path}.summary`);
  }
  if (typeof value.sectionId !== "string") {
    return invalidField(`${path}.sectionId`);
  }
  if (value.roleId !== undefined && typeof value.roleId !== "string") {
    return invalidField(`${path}.roleId`);
  }
  if (!isOneOf(COLLABORATION_ASSIGNMENT_STATUSES, value.status)) {
    return invalidField(`${path}.status`);
  }

  return null;
}

/** Documented. */
function validateRehearsalComment(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "author", "body", "sectionId", "roleId", "status"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (typeof value.author !== "string") {
    return invalidField(`${path}.author`);
  }
  if (typeof value.body !== "string") {
    return invalidField(`${path}.body`);
  }
  if (typeof value.sectionId !== "string") {
    return invalidField(`${path}.sectionId`);
  }
  if (value.roleId !== undefined && typeof value.roleId !== "string") {
    return invalidField(`${path}.roleId`);
  }
  if (!isOneOf(COLLABORATION_COMMENT_STATUSES, value.status)) {
    return invalidField(`${path}.status`);
  }

  return null;
}

/** Documented. */
function validateRehearsalApproval(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "scope", "owner", "status"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (typeof value.scope !== "string") {
    return invalidField(`${path}.scope`);
  }
  if (typeof value.owner !== "string") {
    return invalidField(`${path}.owner`);
  }
  if (!isOneOf(COLLABORATION_APPROVAL_STATUSES, value.status)) {
    return invalidField(`${path}.status`);
  }

  return null;
}

/** Documented. */
function validateRehearsalCollaboration(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["syncMode", "syncNote", "assignments", "comments", "approvals"], path);
  if (extraKey) {
    return extraKey;
  }
  if (!isOneOf(COLLABORATION_SYNC_MODES, value.syncMode)) {
    return invalidField(`${path}.syncMode`);
  }
  if (typeof value.syncNote !== "string") {
    return invalidField(`${path}.syncNote`);
  }
  if (!isDenseArray(value.assignments)) {
    return invalidField(`${path}.assignments`);
  }
  for (const [index, assignment] of value.assignments.entries()) {
    const assignmentError = validateRehearsalAssignment(assignment, `${path}.assignments[${index}]`);
    if (assignmentError) {
      return assignmentError;
    }
  }
  if (!isDenseArray(value.comments)) {
    return invalidField(`${path}.comments`);
  }
  for (const [index, comment] of value.comments.entries()) {
    const commentError = validateRehearsalComment(comment, `${path}.comments[${index}]`);
    if (commentError) {
      return commentError;
    }
  }
  if (!isDenseArray(value.approvals)) {
    return invalidField(`${path}.approvals`);
  }
  for (const [index, approval] of value.approvals.entries()) {
    const approvalError = validateRehearsalApproval(approval, `${path}.approvals[${index}]`);
    if (approvalError) {
      return approvalError;
    }
  }

  return null;
}

/** Documented. */
function validateManualOverride(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["field", "value", "source"], path);
  if (extraKey) {
    return extraKey;
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

/** Documented. */
function validateTranscriptionNote(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["pitch", "onset", "offset", "velocity"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.pitch !== "string") {
    return invalidField(`${path}.pitch`);
  }
  if (typeof value.onset !== "number") {
    return invalidField(`${path}.onset`);
  }
  if (typeof value.offset !== "number") {
    return invalidField(`${path}.offset`);
  }
  if (typeof value.velocity !== "number") {
    return invalidField(`${path}.velocity`);
  }
  return null;
}

/** Documented. */
function validateRehearsalRole(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(
    value,
    [
      "id",
      "name",
      "roleType",
      "harmony",
      "harmonicExplanation",
      "cue",
      "range",
      "confidence",
      "rehearsalPriority",
      "simplification",
      "setupNote",
      "transpositionPlan",
      "padPlan",
      "manualOverrides",
      "overlapWarnings",
      "transcription",
      "practiceProgress"
    ],
    path
  );
  if (extraKey) {
    return extraKey;
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
  if (value.harmonicExplanation !== undefined && typeof value.harmonicExplanation !== "string") {
    return invalidField(`${path}.harmonicExplanation`);
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
  if (value.transpositionPlan !== undefined && typeof value.transpositionPlan !== "string") {
    return invalidField(`${path}.transpositionPlan`);
  }
  if (value.padPlan !== undefined && typeof value.padPlan !== "string") {
    return invalidField(`${path}.padPlan`);
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
  if (!isDenseArray(value.overlapWarnings)) {
    return invalidField(`${path}.overlapWarnings`);
  }
  for (const [index, warning] of value.overlapWarnings.entries()) {
    if (typeof warning !== "string") {
      return invalidField(`${path}.overlapWarnings[${index}]`);
    }
  }

  if (value.transcription !== undefined) {
    if (!isDenseArray(value.transcription)) {
      return invalidField(`${path}.transcription`);
    }
    for (const [index, note] of value.transcription.entries()) {
      const noteError = validateTranscriptionNote(note, `${path}.transcription[${index}]`);
      if (noteError) {
        return noteError;
      }
    }
  }

  if (value.practiceProgress !== undefined) {
    if (typeof value.practiceProgress !== "number" || !Number.isFinite(value.practiceProgress) || !Number.isInteger(value.practiceProgress) || value.practiceProgress < 0 || value.practiceProgress > 100) {
      return invalidField(`${path}.practiceProgress`);
    }
  }

  return null;
}

/** Documented. */
function validatePartGraphNode(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["role_id", "is_active", "handoff_to", "handoff_from"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.role_id !== "string") {
    return invalidField(`${path}.role_id`);
  }
  if (typeof value.is_active !== "boolean") {
    return invalidField(`${path}.is_active`);
  }
  if (!isDenseArray(value.handoff_to)) {
    return invalidField(`${path}.handoff_to`);
  }
  for (const [index, handoff] of value.handoff_to.entries()) {
    if (typeof handoff !== "string") {
      return invalidField(`${path}.handoff_to[${index}]`);
    }
  }
  if (!isDenseArray(value.handoff_from)) {
    return invalidField(`${path}.handoff_from`);
  }
  for (const [index, handoff] of value.handoff_from.entries()) {
    if (typeof handoff !== "string") {
      return invalidField(`${path}.handoff_from[${index}]`);
    }
  }

  return null;
}

/** Documented. */
function validateSectionTimeRange(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["start", "end"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.start !== "number" || !Number.isFinite(value.start) || !Number.isInteger(value.start) || value.start < 0 || value.start > MAX_SECTION_TIME_SECONDS) {
    return invalidField(`${path}.start`);
  }
  if (typeof value.end !== "number" || !Number.isFinite(value.end) || !Number.isInteger(value.end) || value.end <= value.start || value.end > MAX_SECTION_TIME_SECONDS) {
    return invalidField(`${path}.end`);
  }

  return null;
}

/** Documented. */
function validateRehearsalSection(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "label", "groove", "timeRange", "confidence", "roles", "partGraph"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string") {
    return invalidField(`${path}.id`);
  }
  if (!isOneOf(SECTION_FORM_LABELS, value.label)) {
    return invalidField(`${path}.label`);
  }
  if (typeof value.groove !== "string") {
    return invalidField(`${path}.groove`);
  }

  const timeRangeError = validateSectionTimeRange(value.timeRange, `${path}.timeRange`);
  if (timeRangeError) {
    return timeRangeError;
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

  if (!isDenseArray(value.partGraph)) {
    return invalidField(`${path}.partGraph`);
  }
  for (const [index, node] of value.partGraph.entries()) {
    const nodeError = validatePartGraphNode(node, `${path}.partGraph[${index}]`);
    if (nodeError) {
      return nodeError;
    }
  }

  return null;
}

/** Documented. */
function validateExportSummary(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["format", "headline", "focusSections"], path);
  if (extraKey) {
    return extraKey;
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

/** Documented. */
function legacySectionTimeRange(index: number): SectionTimeRange {
  return {
    start: index,
    end: index + 1
  };
}

/** Documented. */
function migrateLegacySectionTimeRanges(value: unknown): unknown {
  if (!isRecord(value) || !isDenseArray(value.sections)) {
    return value;
  }

  const migrated = structuredClone(value) as Record<string, unknown> & {
    sections: unknown[];
  };
  migrated.sections = migrated.sections.map((section, index) => {
    if (!isRecord(section) || section.timeRange !== undefined) {
      return section;
    }

    return {
      ...section,
      timeRange: legacySectionTimeRange(index)
    };
  });

  return migrated;
}

/** Documented. */
function validateScoreAttachment(value: unknown, path: string): string | null {
  if (!isRecord(value)) {
    return invalidField(path);
  }
  const extraKey = unexpectedKey(value, ["id", "fileName"], path);
  if (extraKey) {
    return extraKey;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return invalidField(`${path}.id`);
  }
  if (typeof value.fileName !== "string" || value.fileName.length === 0) {
    return invalidField(`${path}.fileName`);
  }

  return null;
}

/** Documented. */
function validateRehearsalSong(
  value: unknown,
  options: ValidationOptions = STRICT_VALIDATION_OPTIONS
): string | null {
  const normalized = options.acceptLegacySectionTimeRanges
    ? migrateLegacySectionTimeRanges(value)
    : value;
  if (!isRecord(normalized)) {
    return invalidField("root");
  }
  const extraKey = unexpectedKey(
    normalized,
    ["id", "title", "tempo", "sections", "exportSummary", "collaboration", "scoreAttachments"],
    ""
  );
  if (extraKey) {
    return extraKey;
  }
  if (typeof normalized.id !== "string") {
    return invalidField("id");
  }
  if (typeof normalized.title !== "string") {
    return invalidField("title");
  }
  if (
    normalized.tempo !== undefined &&
    (typeof normalized.tempo !== "number" || !Number.isFinite(normalized.tempo) || normalized.tempo <= 0)
  ) {
    return invalidField("tempo");
  }
  if (!isDenseArray(normalized.sections)) {
    return invalidField("sections");
  }
  for (const [index, section] of normalized.sections.entries()) {
    const sectionError = validateRehearsalSection(section, `sections[${index}]`);
    if (sectionError) {
      return sectionError;
    }
  }
  if (normalized.collaboration !== undefined) {
    const collaborationError = validateRehearsalCollaboration(normalized.collaboration, "collaboration");
    if (collaborationError) {
      return collaborationError;
    }
  }
  if (normalized.scoreAttachments !== undefined) {
    if (!isDenseArray(normalized.scoreAttachments)) {
      return invalidField("scoreAttachments");
    }
    for (const [index, attachment] of normalized.scoreAttachments.entries()) {
      const attachmentError = validateScoreAttachment(attachment, `scoreAttachments[${index}]`);
      if (attachmentError) {
        return attachmentError;
      }
    }
  }

  return validateExportSummary(normalized.exportSummary, "exportSummary");
}

/** Documented. */
export function isRehearsalSong(value: unknown): value is RehearsalSong {
  return validateRehearsalSong(value) === null;
}

/** Documented. */
export function parseRehearsalSong(value: unknown): RehearsalSong {
  const migratedValue = migrateLegacySectionTimeRanges(value);
  const validationError = validateRehearsalSong(migratedValue);
  if (validationError) {
    throw new Error(validationError);
  }

  return structuredClone(migratedValue as RehearsalSong);
}


/** Documented. */
function validateSongRehearsalPack(
  value: unknown,
  path: string,
  options: ValidationOptions = STRICT_VALIDATION_OPTIONS
): string | null {
  if (!isRecord(value)) return invalidField(path);
  
  if (typeof value.id !== "string") return invalidField(`${path}.id`);
  if (!isOneOf(PACK_STATES, value.packState)) return invalidField(`${path}.packState`);
  if (typeof value.sourceLabel !== "string") return invalidField(`${path}.sourceLabel`);
  if (value.engineState !== undefined && !isOneOf(ANALYSIS_JOB_STATES, value.engineState)) return invalidField(`${path}.engineState`);
  
  if (value.packState === "queued" || value.packState === "analyzing") {
    const extraKey = unexpectedKey(value, ["id", "packState", "engineState", "sourceLabel"], path);
    if (extraKey) return extraKey;
    if (!isOneOf(ANALYSIS_JOB_STATES, value.engineState)) return invalidField(`${path}.engineState`);
  } else if (value.packState === "ready") {
    const extraKey = unexpectedKey(value, ["id", "packState", "engineState", "sourceLabel", "song"], path);
    if (extraKey) return extraKey;
    if (value.song === undefined) return invalidField(`${path}.song`);
    const songError = validateRehearsalSong(value.song, options);
    if (songError) return songError;
  } else {
    const extraKey = unexpectedKey(value, ["id", "packState", "engineState", "sourceLabel", "error"], path);
    if (extraKey) return extraKey;
    if (value.error === undefined) return invalidField(`${path}.error`);
    const errorValidation = validateAnalysisJobError(value.error, `${path}.error`);
    if (errorValidation) return errorValidation;
  }
  return null;
}

/** Documented. */
export function parseSongRehearsalPack(value: unknown): SongRehearsalPack {
  const validationError = validateSongRehearsalPack(value, "root", LEGACY_VALIDATION_OPTIONS);
  if (validationError) throw new Error(validationError);
  const parsed = structuredClone(value as SongRehearsalPack);
  if (parsed.packState === "ready") {
    parsed.song = parseRehearsalSong(parsed.song);
  }
  return parsed;
}

/** Documented. */
function validateRehearsalWorkspace(
  value: unknown,
  options: ValidationOptions = STRICT_VALIDATION_OPTIONS
): string | null {
  if (!isRecord(value)) return invalidField("root");
  const extraKey = unexpectedKey(value, ["id", "title", "songs", "workspaceVersion"], "");
  if (extraKey) return extraKey;
  if (typeof value.id !== "string") return invalidField("id");
  if (typeof value.title !== "string") return invalidField("title");
  if (typeof value.workspaceVersion !== "number") return invalidField("workspaceVersion");
  if (!isDenseArray(value.songs)) return invalidField("songs");
  
  for (const [index, song] of value.songs.entries()) {
    const packError = validateSongRehearsalPack(song, `songs[${index}]`, options);
    if (packError) return packError;
  }
  return null;
}

/** Documented. */
export function isRehearsalWorkspace(value: unknown): value is RehearsalWorkspace {
  return validateRehearsalWorkspace(value) === null;
}

/** Documented. */
export function parseRehearsalWorkspace(value: unknown): RehearsalWorkspace {
  const validationError = validateRehearsalWorkspace(value, LEGACY_VALIDATION_OPTIONS);
  if (validationError) throw new Error(validationError);
  const parsed = structuredClone(value as RehearsalWorkspace);
  parsed.songs = parsed.songs.map((pack) => (
    pack.packState === "ready"
      ? { ...pack, song: parseRehearsalSong(pack.song) }
      : pack
  ));
  return parsed;
}
