import {
  parseAnalysisJobRequest,
  parseMetadataHandoffArtifact,
  type AnalysisJobRequest,
  type MetadataHandoffArtifact,
  type ProjectBootstrapSummary
} from "@bandscope/shared-types";
import { createReanalysisRequestFromHandoff } from "./export";

export /**
 * Maximum number of bytes read from one untrusted metadata handoff file.
 */
const MAX_HANDOFF_FILE_BYTES = 1_048_576;

/** Stable, payload-free error classifications for handoff import UI copy. */
export type HandoffImportErrorCode =
  | "unsupported_file"
  | "too_large"
  | "invalid_utf8"
  | "invalid_json"
  | "invalid_artifact"
  | "read_failed";

/** Minimum browser File/Blob contract required for allocation-bounded reading. */
export type MetadataHandoffFile = {
  name: string;
  size: number;
  slice(start?: number, end?: number): Blob;
};

/** Result of reading and validating one local metadata handoff file. */
export type MetadataHandoffImportResult =
  | {
      ok: true;
      fileName: string;
      artifact: MetadataHandoffArtifact;
      roleFocus: string[];
    }
  | {
      ok: false;
      code: HandoffImportErrorCode;
    };

/** Return unique role IDs in their first-seen section order. */
export function handoffRoleFocus(artifact: MetadataHandoffArtifact): string[] {
  const roleIds = new Set<string>();
  for (const section of artifact.sections) {
    for (const role of section.roleBuckets) {
      roleIds.add(role.id);
    }
  }
  return Array.from(roleIds);
}

/** Read a bounded slice, decode strict UTF-8, and validate one untrusted handoff. */
export async function readMetadataHandoffFile(
  file: MetadataHandoffFile
): Promise<MetadataHandoffImportResult> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    return { ok: false, code: "unsupported_file" };
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_HANDOFF_FILE_BYTES) {
    return { ok: false, code: "too_large" };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.slice(0, MAX_HANDOFF_FILE_BYTES + 1).arrayBuffer();
  } catch {
    return { ok: false, code: "read_failed" };
  }
  if (bytes.byteLength > MAX_HANDOFF_FILE_BYTES) {
    return { ok: false, code: "too_large" };
  }
  if (bytes.byteLength !== file.size) {
    return { ok: false, code: "read_failed" };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, code: "invalid_utf8" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_json" };
  }

  let artifact: MetadataHandoffArtifact;
  try {
    artifact = parseMetadataHandoffArtifact(payload);
  } catch {
    return { ok: false, code: "invalid_artifact" };
  }

  return {
    ok: true,
    fileName: file.name,
    artifact,
    roleFocus: handoffRoleFocus(artifact)
  };
}

/** Build the analysis request for the explicit local source and optional handoff. */
export function createAnalysisRequestForSelection(
  defaultRequest: AnalysisJobRequest,
  selectedSource: ProjectBootstrapSummary | null,
  handoff: MetadataHandoffArtifact | null
): AnalysisJobRequest {
  if (!selectedSource) {
    return parseAnalysisJobRequest(defaultRequest);
  }
  if (handoff) {
    return createReanalysisRequestFromHandoff(handoff, selectedSource);
  }
  return parseAnalysisJobRequest({
    sourceKind: "local_audio",
    projectId: selectedSource.projectId,
    sourceLabel: selectedSource.source.fileName,
    roleFocus: [...defaultRequest.roleFocus]
  });
}
