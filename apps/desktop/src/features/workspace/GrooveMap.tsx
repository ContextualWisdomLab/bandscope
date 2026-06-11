import { memo, useMemo } from "react";
import type { TranscriptionNote } from "@bandscope/shared-types";

const EMPTY_NOTES: TranscriptionNote[] = [];

/** Documented. */
interface GrooveMapProps {
  notes?: TranscriptionNote[];
  isLoading?: boolean;
}

/** Documented. */
function GrooveMapComponent({ notes, isLoading }: GrooveMapProps) {
  const renderedNotes = notes ?? EMPTY_NOTES;
  // Find max offset to determine timeline width
  const maxTime = useMemo(() => {
    return renderedNotes.reduce((max, n) => Math.max(max, n.offset), 10);
  }, [renderedNotes]);

  // Unique pitches to determine vertical lanes (avoiding 88-key piano roll)
  const uniquePitches = useMemo(() => {
    return Array.from(new Set(renderedNotes.map(n => n.pitch))).sort();
  }, [renderedNotes]);

  const pitchIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    uniquePitches.forEach((pitch, index) => map.set(pitch, index));
    return map;
  }, [uniquePitches]);

  if (isLoading) {
    return (
      <div
        aria-live="polite"
        style={{
          marginTop: "16px",
          padding: "24px",
          backgroundColor: "#fff",
          borderRadius: "8px",
          border: "1px dashed #d9d9d9",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <span style={{ color: "#1890ff" }}>Analyzing pitch... 45%</span>
        <button style={{ padding: "4px 8px", cursor: "pointer" }}>Cancel</button>
      </div>
    );
  }

  if (renderedNotes.length === 0) {
    return (
      <div
        style={{
          marginTop: "16px",
          padding: "24px",
          backgroundColor: "#fafafa",
          borderRadius: "8px",
          border: "1px dashed #d9d9d9",
          textAlign: "center",
          color: "#999",
          fontStyle: "italic"
        }}
      >
        No transcription yet. Click to analyze bass line.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "16px",
        padding: "16px",
        backgroundColor: "#2c2c2c",
        borderRadius: "8px",
        overflowX: "auto",
        position: "relative"
      }}
      role="region"
      aria-label="Groove Map Transcription"
    >
      <div className="sr-only" style={{ position: "absolute", left: "-9999px" }}>
        Transcription complete. {renderedNotes.length} notes analyzed.
      </div>
      
      <div style={{ position: "relative", minWidth: "100%", height: `${uniquePitches.length * 40}px` }}>
        {/* Render horizontal lanes for unique pitches */}
        {uniquePitches.map((pitch, index) => (
          <div
            key={pitch}
            style={{
              position: "absolute",
              top: `${index * 40}px`,
              left: 0,
              right: 0,
              height: "40px",
              borderBottom: "1px solid #444",
              display: "flex",
              alignItems: "center",
              color: "#aaa",
              fontSize: "12px",
              paddingLeft: "8px"
            }}
          >
            {pitch}
          </div>
        ))}

        {/* Render note blocks */}
        {renderedNotes.map((note, index) => {
          const pitchIndex = pitchIndexMap.get(note.pitch) ?? 0;
          const leftPercent = (note.onset / maxTime) * 100;
          const widthPercent = ((note.offset - note.onset) / maxTime) * 100;

          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: `${pitchIndex * 40 + 8}px`,
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                height: "24px",
                backgroundColor: "#52c41a",
                borderRadius: "4px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.5)"
              }}
              title={`${note.pitch} (${note.onset.toFixed(2)}s - ${note.offset.toFixed(2)}s)`}
            />
          );
        })}
      </div>
    </div>
  );
}

const GrooveMap = memo(GrooveMapComponent);

export { GrooveMap };
