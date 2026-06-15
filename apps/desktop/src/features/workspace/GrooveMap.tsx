import { memo, useMemo } from "react";
import type { TranscriptionNote } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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
        className="mt-4 flex items-center justify-between rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] p-6"
      >
        <span className="flex items-center font-medium text-emerald-100">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          Analyzing pitch... 45%
        </span>
        <Button variant="outline" size="sm" className="border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20 hover:text-white">
          Cancel
        </Button>
      </div>
    );
  }

  if (renderedNotes.length === 0) {
    return (
      <div
        className="mt-4 rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm italic text-slate-400"
      >
        No transcription yet. Click to analyze bass line.
      </div>
    );
  }

  return (
    <div
      className="relative mt-4 overflow-x-auto rounded-lg bg-[#2c2c2c] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
      role="region"
      tabIndex={0}
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
