import { useMemo } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import {
  fillRangeCopy,
  firstRangeSqueeze,
  meaningfulRangeText,
  playableRange
} from "../workspace/firstRangeSqueeze";

/** Return whether an untrusted runtime value is a plain object record. */
function isRuntimeObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return trimmed clash copy from untrusted overlap-warning evidence. */
function namedOverlapWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) {
    return [];
  }
  const named: string[] = [];
  for (const warning of warnings) {
    const namedWarning = meaningfulRangeText(warning);
    if (namedWarning) {
      named.push(namedWarning);
    }
  }
  return named;
}

/** Render per-role playable spans and the next instrument check for the loaded song. */
export function RangesFeature(props: {
  title: string;
  song?: RehearsalSong | null;
  activeRole?: string | null;
}) {
  const { title, song, activeRole = null } = props;
  const t = useMemo(() => createTranslator(detectPreferredLocale()), []);
  const firstRange = useMemo(
    () => (song ? firstRangeSqueeze(song, activeRole) : null),
    [activeRole, song],
  );
  const firstRangeCopy = firstRange
    ? fillRangeCopy(
        t(firstRange.overlapWarning ? "workspaceFirstRangeClash" : "workspaceFirstRangeCheck"),
        {
          roleName: firstRange.roleName,
          lowestNote: firstRange.lowestNote,
          highestNote: firstRange.highestNote,
          sectionLabel: firstRange.sectionLabel
        }
      )
    : t("workspaceFirstRangeMissing");

  if (!song) {
    return (
      <section className="space-y-4 rounded-3xl border border-cyan-300/20 bg-slate-950/72 p-5 text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.24)]">
        <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
        <p className="text-sm leading-6 text-slate-300">{t("rangesEmptyState")}</p>
      </section>
    );
  }

  const runtimeSong: unknown = song;
  const songSections = isRuntimeObject(runtimeSong) ? runtimeSong.sections : undefined;
  const sections = Array.isArray(songSections) ? songSections : [];

  return (
    <section className="space-y-5 text-slate-100">
      <h2 className="text-2xl font-black tracking-tight text-white">{title}</h2>
      <section
        className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.07] p-4"
        data-testid="ranges-first-span"
        aria-label={t("workspaceFirstRangeTitle")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("workspaceFirstRangeTitle")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-100">{firstRangeCopy}</p>
      </section>
      {sections.map((sectionValue, sectionIndex) => {
        if (!isRuntimeObject(sectionValue)) {
          return null;
        }
        const sectionRecord = sectionValue;
        const sectionLabel = meaningfulRangeText(sectionRecord.label);
        const sectionId = meaningfulRangeText(sectionRecord.id) ?? `section-${sectionIndex}`;
        if (!sectionLabel || !Array.isArray(sectionRecord.roles)) {
          return null;
        }
        return (
          <div key={sectionId} className="space-y-3">
            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">{sectionLabel}</h3>
            <div className="flex flex-wrap gap-3">
              {sectionRecord.roles.map((roleValue, roleIndex) => {
                if (!isRuntimeObject(roleValue)) {
                  return null;
                }
                const roleRecord = roleValue;
                const roleName = meaningfulRangeText(roleRecord.name);
                const roleId = meaningfulRangeText(roleRecord.id);
                if (!roleId || !roleName) {
                  return null;
                }
                const rangeRecord =
                  typeof roleRecord.range === "object" && roleRecord.range !== null && !Array.isArray(roleRecord.range)
                    ? (roleRecord.range as Record<string, unknown>)
                    : {};
                const validatedRange = playableRange(rangeRecord.lowestNote, rangeRecord.highestNote);
                const overlapWarnings = namedOverlapWarnings(roleRecord.overlapWarnings);
                const transcriptionCount = Array.isArray(roleRecord.transcription) ? roleRecord.transcription.length : 0;
                return (
                  <article
                    key={`${sectionIndex}-${roleId}-${roleIndex}`}
                    className="min-w-[16rem] flex-1 rounded-2xl border border-white/10 bg-slate-950/70 p-4"
                    data-testid={`range-card-${sectionIndex}-${roleId}-${roleIndex}`}
                  >
                    <p className="text-sm font-bold text-white">{roleName}</p>
                    {validatedRange ? (
                      <>
                        <p className="mt-2 text-sm font-semibold text-slate-100">
                          {validatedRange.lowestNote} — {validatedRange.highestNote}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          {fillRangeCopy(t("sectionRangeNextAction"), { sectionLabel })}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-slate-300">{t("rangesUnnamedSpan")}</p>
                    )}
                    {overlapWarnings.length > 0 ? (
                      <ul className="mt-3 space-y-2" aria-label={t("overlapWarning")}>
                        {overlapWarnings.map((warning, warningIndex) => (
                          <li
                            key={`${warning}-${warningIndex}`}
                            className="rounded-lg border border-rose-300/20 bg-rose-300/[0.08] px-2 py-1 text-xs leading-5 text-rose-100"
                          >
                            {warning}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {transcriptionCount > 0 ? (
                      <p className="mt-3 text-xs leading-5 text-cyan-100">
                        {fillRangeCopy(
                          t(transcriptionCount === 1 ? "rangesOneNoteToCheck" : "rangesNotesToCheck"),
                          { count: String(transcriptionCount) }
                        )}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
