import React from "react";

/** Documented. */
export interface NoteEvent {
  pitch: string;
  start_time: number;
  duration: number;
}

interface GrooveMapProps {
  data: NoteEvent[];
}

/** Documented. */
export function GrooveMap({ data }: GrooveMapProps) {
  // A simple horizontal timeline representation of pitches

  if (!data || data.length === 0) {
    return null;
  }

  // Find the maximum end time to calculate relative widths
  const maxTime = Math.max(...data.map(note => note.start_time + note.duration));

  return (
    <div className="groove-map w-full bg-gray-800 rounded p-2 overflow-hidden relative" style={{ height: "60px" }}>
      {data.map((note, index) => {
        const leftPercent = (note.start_time / maxTime) * 100;
        const widthPercent = (note.duration / maxTime) * 100;

        return (
          <div
            key={index}
            className="absolute bg-blue-500 rounded text-xs text-white flex items-center justify-center font-mono overflow-hidden"
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              top: "10px",
              height: "40px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.5)"
            }}
            title={`${note.pitch} (${note.start_time.toFixed(2)}s - ${(note.start_time + note.duration).toFixed(2)}s)`}
          >
            {note.pitch}
          </div>
        );
      })}
    </div>
  );
}
