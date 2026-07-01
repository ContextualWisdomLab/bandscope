import {
  parseAnalysisJobRequest,
  parseMetadataHandoffArtifact,
  parseProjectBootstrapSummary,
  parseRehearsalSong,
  type AnalysisJobRequest,
  type MetadataHandoffArtifact,
  type ProjectBootstrapSummary,
  type RehearsalSong
} from "@bandscope/shared-types";

// Security notes:
// 1. Filename sanitization to prevent directory traversal or invalid characters.
// 2. CSV formula injection prevention (fields starting with =, +, -, @ must be prefixed with a single quote).

/** Documented. */
export function sanitizeFilename(title: string): string {
  // Replace invalid filename characters with underscores
  const safe = title.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim();
  return safe || "export";
}

/** Documented. */
export function escapeCsvField(value: string): string {
  let escapedValue = value;
  // Prevent CSV formula injection by prefixing problematic leading characters with a single quote
  if (/^[\s\uFEFF\xA0]*[=+\-@\t\r\n]/.test(value)) {
    escapedValue = `'${value}`;
  }
  // Enclose in double quotes if there's a comma, newline, or double quote
  if (escapedValue.includes(",") || escapedValue.includes("\n") || escapedValue.includes("\r") || escapedValue.includes('"')) {
    const escapedQuotes = escapedValue.replace(/"/g, '""');
    return `"${escapedQuotes}"`;
  }
  return escapedValue;
}

/** Documented. */
export function generateCueSheetCsv(song: RehearsalSong): string {
  const headers = ["Section", "Groove", "Role", "Harmony", "Cue", "Priority", "Notes"];
  const rows: string[] = [headers.join(",")];

  for (const section of song.sections) {
    for (const role of section.roles) {
      const notes = [role.setupNote, role.simplification].filter(Boolean).join(" | ");
      const row = [
        section.label,
        section.groove,
        role.name,
        role.harmony.chord,
        role.cue.value,
        role.rehearsalPriority,
        notes
      ].map(escapeCsvField);
      
      rows.push(row.join(","));
    }
  }

  return rows.join("\n");
}

/** Documented. */
export function generateChartSummaryJson(song: RehearsalSong): string {
  // Just a clean JSON stringification for now, focusing on the core chart data
  const summary = {
    title: song.title,
    headline: song.exportSummary?.headline || "",
    sections: song.sections.map(s => ({
      label: s.label,
      groove: s.groove,
      roles: s.roles.map(r => ({
        name: r.name,
        chord: r.harmony.chord,
        cue: r.cue.value,
        priority: r.rehearsalPriority
      }))
    }))
  };
  return JSON.stringify(summary, null, 2);
}

/** Documented. */
export function createMetadataHandoffArtifact(
  song: RehearsalSong,
  options: {
    createdAt?: string;
    sourceBootstrap?: ProjectBootstrapSummary | null;
    workspaceId?: string;
    workspaceTitle?: string;
  } = {}
): MetadataHandoffArtifact {
  const parsedSong = parseRehearsalSong(song);
  const sourceBootstrap = options.sourceBootstrap
    ? parseProjectBootstrapSummary(options.sourceBootstrap)
    : null;

  return parseMetadataHandoffArtifact({
    artifactKind: "bandscope.metadata-handoff",
    artifactVersion: 1,
    createdAt: options.createdAt ?? new Date().toISOString(),
    workspace: {
      id: options.workspaceId ?? parsedSong.id,
      title: options.workspaceTitle ?? parsedSong.title,
      workspaceVersion: 1
    },
    song: {
      id: parsedSong.id,
      title: parsedSong.title,
      exportSummary: parsedSong.exportSummary
    },
    sections: parsedSong.sections.map((section) => ({
      id: section.id,
      label: section.label,
      timeRange: section.timeRange,
      confidence: section.confidence,
      roleBuckets: section.roles.map((role) => ({
        id: role.id,
        name: role.name,
        roleType: role.roleType,
        confidence: role.confidence,
        rehearsalPriority: role.rehearsalPriority
      }))
    })),
    sourceAssets: sourceBootstrap
      ? [
          {
            referenceKind: "local_audio",
            sourceMode: "reference",
            fileName: sourceBootstrap.source.fileName,
            extension: sourceBootstrap.source.extension,
            fileSizeBytes: sourceBootstrap.source.fileSizeBytes,
            status: "referenced"
          }
        ]
      : []
  });
}

/** Documented. */
export function generateMetadataHandoffJson(
  song: RehearsalSong,
  options: Parameters<typeof createMetadataHandoffArtifact>[1] = {}
): string {
  return JSON.stringify(createMetadataHandoffArtifact(song, options), null, 2);
}

/** Documented. */
export function createReanalysisRequestFromHandoff(
  handoff: unknown,
  selectedSource: ProjectBootstrapSummary
): AnalysisJobRequest {
  const parsedHandoff = parseMetadataHandoffArtifact(handoff);
  const parsedSource = parseProjectBootstrapSummary(selectedSource);
  // Performance: Calculate role focus using O(1) memory nested loops instead of allocating intermediate flatMap().map() arrays
  const roleIds = new Set<string>();
  for (const section of parsedHandoff.sections) {
    for (const role of section.roleBuckets) {
      roleIds.add(role.id);
    }
  }
  const roleFocus = Array.from(roleIds);

  return parseAnalysisJobRequest({
    sourceKind: "local_audio",
    projectId: parsedSource.projectId,
    sourceLabel: parsedSource.source.fileName,
    roleFocus
  });
}
