import React, { useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { GrooveMap } from "./GrooveMap";

interface TranscriptionFeatureProps {
  roleId: string;
  song?: RehearsalSong | null;
}

/** Documented. */
export function TranscriptionFeature({ roleId }: TranscriptionFeatureProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [transcriptionData, setTranscriptionData] = useState<any[] | null>(null);

  const isBass = roleId.toLowerCase() === "bass";

  /** Documented. */
  const handleTranscribe = async () => {
    setIsTranscribing(true);
    setError(null);
    setTranscriptionData(null);

    try {
      // In a real implementation, this would trigger the Tauri command to analyze the stem
      // For this step, we will mock the backend call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).__MOCK_TRANSCRIBE_ERROR) {
            reject(new Error("Mock Error"));
          } else {
            resolve(true);
          }
        }, 100);
      });

      const mockData = [
        { pitch: "E1", start_time: 0.0, duration: 0.5 },
        { pitch: "A1", start_time: 0.5, duration: 0.5 },
        { pitch: "D2", start_time: 1.0, duration: 0.5 },
      ];
      setTranscriptionData(mockData);
    } catch {
      setError("Transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  };

  /** Documented. */
  const handleCancel = () => {
    setIsTranscribing(false);
    setError(null);
  };

  /** Documented. */
  const handleDownloadMid = () => {
    // In a real implementation, this would generate and save a .mid file
    // For now, we simulate the action
    const content = JSON.stringify(transcriptionData, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.mid";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="transcription-container p-4 mt-4 border rounded bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Transcription</h3>

      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handleTranscribe}
          disabled={!isBass || isTranscribing}
          className={`px-4 py-2 rounded font-medium text-white ${
            !isBass || isTranscribing
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          title={!isBass ? "Transcription is currently optimized for Bass. More instruments coming soon." : "Transcribe"}
          aria-disabled={!isBass || isTranscribing}
        >
          {isTranscribing ? "Transcribing..." : "Transcribe Part"}
        </button>

        {isTranscribing && (
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Cancel
          </button>
        )}

        {transcriptionData && (
          <button
            onClick={handleDownloadMid}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium ml-auto"
          >
            Download .mid
          </button>
        )}
      </div>

      <div aria-live="polite" className="text-sm text-gray-700 mb-2">
        {isTranscribing && <span>Analyzing pitch...</span>}
        {error && <span className="text-red-600 font-medium">{error}</span>}
      </div>

      {transcriptionData ? (
        <GrooveMap data={transcriptionData} />
      ) : (
        <div className="text-gray-500 italic p-4 border border-dashed rounded bg-white text-center">
          No transcription yet. Click to analyze bass line.
        </div>
      )}
    </div>
  );
}
