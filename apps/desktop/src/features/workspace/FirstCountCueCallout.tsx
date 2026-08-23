import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatCountCueTime, resolveFirstCountCue } from "./firstCountCue";

/** Props for the first-count rehearsal callout. */
export interface FirstCountCueCalloutProps {
  song: RehearsalSong;
}

type CountCueCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedCountCue = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate count placeholders once so rehearsal data is never rescanned as template syntax. */
function formatCountCueCopy(template: string, values: CountCueCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof CountCueCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredCountCueScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first count and open the matching rendered map section. */
export function FirstCountCueCallout({ song }: FirstCountCueCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity: unknown = song;
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const countCue = resolveFirstCountCue(song);
  const countCueSectionIndex =
    countCue && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(countCue.section)
      : -1;
  const [openedCountCue, setOpenedCountCue] = useState<OpenedCountCue | null>(null);

  useEffect(() => {
    setOpenedCountCue(null);
  }, [songIdentity, countCueSectionIndex, countCue?.section.id, countCue?.holdingRole?.id, countCue?.atSeconds]);

  if (!countCue) {
    return (
      <aside
        id="workspace-surface-count-cue"
        className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
        aria-label={t("firstCountCueUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstCountCueLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstCountCueUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedCountCue !== null &&
    openedCountCue.songIdentity === songIdentity &&
    openedCountCue.sectionId === countCue.section.id &&
    openedCountCue.sectionIndex === countCueSectionIndex &&
    openedCountCue.holdingRoleId === (countCue.holdingRole?.id ?? null) &&
    openedCountCue.atSeconds === countCue.atSeconds;
  const at = formatCountCueTime(countCue.atSeconds);
  const copyValues: CountCueCopyValues = {
    role: countCue.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, countCue.section.label),
    at
  };
  const hasRole = countCue.holdingRole !== null;
  const actionLabel = formatCountCueCopy(
    t(hasRole ? "firstCountCueOpenAction" : "firstCountCueOpenActionBand"),
    copyValues
  );
  const body = formatCountCueCopy(t(hasRole ? "firstCountCueBody" : "firstCountCueBodyBand"), copyValues);
  const armed = formatCountCueCopy(t(hasRole ? "firstCountCueArmed" : "firstCountCueArmedBand"), copyValues);

  return (
    <aside
      id="workspace-surface-count-cue"
      className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
      aria-label={t("firstCountCueLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstCountCueLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{countCue.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-sky-300 to-cyan-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            countCueSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(`[data-section-index="${countCueSectionIndex}"]`) ??
                null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredCountCueScrollBehavior()
          });
          setOpenedCountCue({
            songIdentity,
            sectionId: countCue.section.id,
            sectionIndex: countCueSectionIndex,
            holdingRoleId: countCue.holdingRole?.id ?? null,
            atSeconds: countCue.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
