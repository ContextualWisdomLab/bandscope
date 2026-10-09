import { memo, useMemo, useState } from "react";
import type { TranscriptionNote } from "@bandscope/shared-types";
import { midiPitchForNoteName } from "@/lib/transcription";
import { createTranscriptionTranslator } from "@/i18n/transcription";
import type { Locale } from "@/i18n";

const EMPTY_NOTES: TranscriptionNote[] = [];

interface GrooveMapProps {
  notes?: TranscriptionNote[];
  durationSeconds?: number;
  isLoading?: boolean;
  locale?: Locale;
}

/** Show only occupied pitch lanes; note lengths and positions use the recording's real seconds. */
function GrooveMapComponent({ notes, durationSeconds, isLoading, locale }: GrooveMapProps) {
  const t = useMemo(() => createTranscriptionTranslator(locale), [locale]);
  const [showNoteList, setShowNoteList] = useState(false);
  const renderedNotes = notes ?? EMPTY_NOTES;
  const maxTime = useMemo(() => {
    const lastOffset = renderedNotes.reduce((max, note) => Math.max(max, note.offset), 0.01);
    return Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0 ? Math.max(durationSeconds!, lastOffset) : lastOffset;
  }, [renderedNotes, durationSeconds]);
  const uniquePitches = useMemo(() => {
    const pitches = new Set<string>();
    for (const note of renderedNotes) pitches.add(note.pitch);
    return Array.from(pitches).sort((left, right) => (midiPitchForNoteName(right) ?? -1) - (midiPitchForNoteName(left) ?? -1));
  }, [renderedNotes]);
  const pitchIndexMap = useMemo(() => new Map(uniquePitches.map((pitch, index) => [pitch, index])), [uniquePitches]);

  if (isLoading) {
    return <p role="status" className="mt-4 text-sm leading-6 text-slate-200">{t("mapLoading")}</p>;
  }

  if (renderedNotes.length === 0) {
    return <p className="mt-4 text-sm leading-6 text-slate-400">{t("mapEmpty")}</p>;
  }

  return (
    <div className="mt-4 min-w-0">
      <p className="mb-2 text-sm font-medium text-cyan-200">{t("mapCount", { count: renderedNotes.length })}</p>
      <div role="region" tabIndex={0} aria-label={t("mapTitle")}
        className="relative max-h-80 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
        <div aria-hidden="true" style={{ minWidth: `${Math.max(300, Math.min(2400, maxTime * 20))}px` }}>
          <div className="ml-12 flex justify-between pb-2 text-xs tabular-nums text-slate-400">
            {[0, 0.25, 0.5, 0.75, 1].map(fraction => <span key={fraction}>{(maxTime * fraction).toFixed(1)} s</span>)}
          </div>
          <div className="relative" style={{ height: `${uniquePitches.length * 32}px` }}>
            {uniquePitches.map((pitch, index) => <div key={pitch}
              className="absolute inset-x-0 flex h-8 items-center border-b border-slate-800 text-xs font-medium text-slate-300"
              style={{ top: `${index * 32}px` }}><span className="w-12 shrink-0">{pitch}</span></div>)}
            <div className="absolute inset-y-0 left-12 right-0">
              {renderedNotes.map((note, index) => <div key={index}
                className="absolute h-5 rounded-sm bg-cyan-300"
                style={{
                  top: `${(pitchIndexMap.get(note.pitch) ?? 0) * 32 + 6}px`,
                  left: `${(note.onset / maxTime) * 100}%`,
                  width: `${((note.offset - note.onset) / maxTime) * 100}%`
                }}
                title={`${note.pitch} (${note.onset.toFixed(2)}–${note.offset.toFixed(2)} s)`}
              />)}
            </div>
          </div>
        </div>
      </div>
      <details className="mt-2 text-sm text-slate-300" onToggle={event => setShowNoteList(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer content-center rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{t("noteList")}</summary>
        {showNoteList && <div className="max-h-64 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" tabIndex={0} role="region" aria-label={t("noteList")}>
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">{t("mapCount", { count: renderedNotes.length })}</caption>
            <thead><tr>
              <th scope="col" className="p-2">{t("pitch")}</th>
              <th scope="col" className="p-2">{t("onset")}</th>
              <th scope="col" className="p-2">{t("offset")}</th>
            </tr></thead>
            <tbody>{renderedNotes.map((note, index) => <tr key={index} className="border-t border-slate-800">
              <td className="p-2">{note.pitch}</td><td className="p-2">{note.onset.toFixed(2)}</td><td className="p-2">{note.offset.toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </details>
    </div>
  );
}

const GrooveMap = memo(GrooveMapComponent);

export { GrooveMap };
