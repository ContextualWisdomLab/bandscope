import { useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatLyricCueTime, resolveFirstLyricCue } from "./firstLyricCue";

/** Props for the first-lyric-cue rehearsal callout. */
export interface FirstLyricCueCalloutProps {
  song: RehearsalSong;
}

type LyricCueCopyValues = Readonly<Record<"role" | "section" | "start" | "lyric", string>>;

/** Interpolate lyric-cue placeholders once so rehearsal data is never rescanned as template syntax. */
function formatLyricCueCopy(template: string, values: LyricCueCopyValues): string {
  return template.replace(/\{(role|section|start|lyric)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof LyricCueCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Name tonight's first lyric cue and let the singer hear the words they enter on. */
export function FirstLyricCueCallout({ song }: FirstLyricCueCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const cue = resolveFirstLyricCue(song);
  const [heard, setHeard] = useState(false);

  if (!cue) {
    return (
      <aside
        id="workspace-surface-lyric"
        className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] p-4"
        aria-label={t("firstLyricCueUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200">{t("firstLyricCueLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstLyricCueUnavailable")}</p>
      </aside>
    );
  }

  const start = formatLyricCueTime(cue.startSeconds);
  const copyValues: LyricCueCopyValues = {
    role: cue.role.name,
    section: cue.section.label,
    start,
    lyric: cue.lyric
  };
  const actionLabel = formatLyricCueCopy(t("firstLyricCueAction"), copyValues);
  const body = formatLyricCueCopy(t("firstLyricCueBody"), copyValues);
  const armed = formatLyricCueCopy(t("firstLyricCueArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-lyric"
      className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] p-4"
      aria-label={t("firstLyricCueLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-violet-200">{t("firstLyricCueLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-violet-400 to-cyan-400 font-black text-slate-950"
        onClick={() => {
          setHeard(true);
          const target = document.getElementById(`song-structure-section-${cue.section.id}`);
          target?.scrollIntoView?.({
            block: "nearest",
            behavior: "smooth"
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
