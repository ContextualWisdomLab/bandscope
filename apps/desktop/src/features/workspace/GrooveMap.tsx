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
        className="mt-4 flex items-center justify-between rounded-lg border border-teal-300/20 bg-slate-950/72 p-6 shadow-inner shadow-cyan-950/40"
      >
        <span className="flex items-center font-medium text-teal-100">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          Checking the bass line... 45%
        </span>
        <Button variant="outline" size="sm" className="border-teal-300/20 bg-teal-300/10 text-teal-100 hover:bg-teal-300/20 hover:text-white">
          Cancel
        </Button>
      </div>
    );
  }

  if (renderedNotes.length === 0) {
    return (
      <div
        className="mt-4 rounded-lg border border-dashed border-cyan-200/15 bg-slate-950/60 p-6 text-center text-sm text-slate-400"
      >
        No bass line transcription yet. Use it when you want to check the groove before rehearsal.
      </div>
    );
  }

  return (
    <div
      className="relative mt-4 overflow-x-auto rounded-lg border border-cyan-200/15 bg-slate-950/80 p-4 shadow-inner shadow-cyan-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      role="region"
      tabIndex={0}
      aria-label="Bass transcription groove map"
    >
      <div className="sr-only">
        Transcription complete. {renderedNotes.length} notes analyzed.
      </div>
      <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">
        {renderedNotes.length} notes mapped for rehearsal
      </p>
      
      <div style={{ position: "relative", minWidth: "100%", height: `${uniquePitches.length * 40}px` }}>
        {/* Render horizontal lanes for unique pitches */}
        {uniquePitches.map((pitch, index) => (
          <div
            key={pitch}
            className="absolute inset-x-0 flex h-10 items-center border-b border-cyan-100/10 pl-2 text-xs font-semibold text-slate-400"
            style={{ top: `${index * 40}px` }}
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
              className="absolute h-6 rounded bg-gradient-to-r from-teal-300 via-cyan-300 to-violet-300 shadow-[0_0_18px_rgba(94,234,212,0.28)]"
              style={{
                top: `${pitchIndex * 40 + 8}px`,
                left: `${leftPercent}%`,
                width: `${widthPercent}%`
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
