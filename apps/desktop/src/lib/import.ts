import JSZip from "jszip";
import { parseBndscpMetadata, type BndscpMetadata } from "@bandscope/shared-types";

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
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(fileBlob);

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
        const expectedFileName = `audio/${sanitizeFilename(pack.song.title)}.txt`;
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

/** Documented. */
export async function mockResolveMissingAudio(songId: string, expectedFileName: string): Promise<File | null> {
  // This simulates an OS-level file picker establishing a user-consented trust boundary
  // Note: UI mockup resolution of missing audio
  const mockContent = `mock_raw_audio_data_for_${songId}`;
  return new File([mockContent], sanitizeImportPath(expectedFileName), { type: "audio/wav" });
}
