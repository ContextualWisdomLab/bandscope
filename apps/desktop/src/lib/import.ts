import JSZip from "jszip";
import { parseBndscpMetadata, type BndscpMetadata } from "@bandscope/shared-types";
import { invoke } from "@tauri-apps/api/core";

// Security notes:
// 1. JSON schema validation applied before accepting payload.
// 2. Strip potential path traversal from filenames by just using basenames if extracting any files.
// 3. Fallback logic prompts user securely via mock file picker if audio is missing.

/** Documented. */
export function sanitizeImportPath(filePath: string): string {
  // Strip any directory traversal or path prefixes, just get the filename
  return filePath.split(/[/\\]/).pop() || "unknown";
}

/** Documented. */
function sanitizeFilename(title: string): string {
  // Matches export.ts logic
  return title.replace(/[^a-zA-Z0-9_\-\s]/g, "_").trim() || "export";
}

/** Documented. */
export async function parseBndscpArchive(fileBlob: Blob | File): Promise<{
  metadata: BndscpMetadata;
  audioFiles: Map<string, Blob>;
  requiresMissingAudio: string[];
}> {
  if (fileBlob.size > 500 * 1024 * 1024) {
    throw new Error("File too large");
  }
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(fileBlob);

  const entries = Object.values(loadedZip.files);
  if (entries.length > 1000) {
    throw new Error("Too many files in zip");
  }
  let uncompressedSize = 0;
  for (const file of entries) {
    // @ts-expect-error accessing internal jszip prop
    uncompressedSize += file._data?.uncompressedSize ?? 0;
  }
  if (uncompressedSize > 1000 * 1024 * 1024) {
    throw new Error("Uncompressed size too large");
  }

  const metadataFile = loadedZip.file("metadata.json");
  if (!metadataFile) {
    throw new Error("Invalid .bndscp archive: missing metadata.json");
  }

  const rawMetadata = await metadataFile.async("string");
  let jsonMetadata: unknown;
  try {
    jsonMetadata = JSON.parse(rawMetadata);
  } catch (e) {
    throw new Error("Invalid .bndscp archive: malformed metadata.json", { cause: e });
  }

  // Schema validation (Security)
  const metadata = parseBndscpMetadata(jsonMetadata);

  const audioFiles = new Map<string, Blob>();
  const requiresMissingAudio: string[] = [];

  if (metadata.includes_audio) {
    for (const pack of metadata.workspace.songs) {
      if (pack.packState === "ready") {
        const expectedFileName = `audio/${pack.id}.m4a`;
        const audioFile = loadedZip.file(expectedFileName);
        
        if (audioFile) {
          const blob = await audioFile.async("blob");
          audioFiles.set(pack.id, blob);
        } else {
          requiresMissingAudio.push(pack.id);
        }
      } else {
        requiresMissingAudio.push(pack.id);
      }
    }
  } else {
    for (const pack of metadata.workspace.songs) {
      requiresMissingAudio.push(pack.id);
    }
  }

  return { metadata, audioFiles, requiresMissingAudio };
}

export async function mockResolveMissingAudio(songId: string, expectedFileName: string): Promise<File | null> {
  let response;
  try {
    response = await invoke("open_audio_file_dialog", {
      suggestedFilename: sanitizeImportPath(expectedFileName)
    });
  } catch {
    return null;
  }
  
  if (typeof response !== "object" || response === null) {
    return null;
  }
  
  const typedResponse = response as { canceled: boolean; filePath?: string };
  if (typedResponse.canceled || !typedResponse.filePath || typeof typedResponse.filePath !== "string") {
    return null;
  }

  return new File(["mock_raw_audio_data"], sanitizeImportPath(typedResponse.filePath), { type: "audio/wav" });
}
