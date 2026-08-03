import {
  parseAnalysisJobRequest,
  parseMetadataHandoffArtifact,
  type AnalysisJobRequest,
  type MetadataHandoffArtifact,
  type ProjectBootstrapSummary
} from "@bandscope/shared-types";
import { createReanalysisRequestFromHandoff } from "./export";

/** Documented. */
export const MAX_HANDOFF_FILE_BYTES = 1_048_576;

/** Documented. */
export type HandoffImportErrorCode =
  | "unsupported_file"
  | "too_large"
  | "invalid_utf8"
  | "invalid_json"
  | "invalid_artifact"
  | "read_failed";

/** Documented. */
export type MetadataHandoffFile = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

/** Documented. */
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

/** Documented. */
export function handoffRoleFocus(artifact: MetadataHandoffArtifact): string[] {
  const roleIds = new Set<string>();
  for (const section of artifact.sections) {
    for (const role of section.roleBuckets) {
      roleIds.add(role.id);
    }
  }
  return Array.from(roleIds);
}

/** Documented. */
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
    bytes = await file.arrayBuffer();
  } catch {
    return { ok: false, code: "read_failed" };
  }
  if (bytes.byteLength > MAX_HANDOFF_FILE_BYTES) {
    return { ok: false, code: "too_large" };
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

/** Documented. */
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
