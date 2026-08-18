import { useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatLyricCueTime, resolveFirstLyricCue } from "./firstLyricCue";

/** Props for the first-lyric-cue rehearsal callout. */
export interface FirstLyricCueCalloutProps {
  song: RehearsalSong;
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
  const actionLabel = t("firstLyricCueAction")
    .replace("{role}", cue.role.name)
    .replace("{section}", cue.section.label)
    .replace("{start}", start)
    .replace("{lyric}", cue.lyric);
  const body = t("firstLyricCueBody")
    .replace("{role}", cue.role.name)
    .replace("{section}", cue.section.label)
    .replace("{start}", start)
    .replace("{lyric}", cue.lyric);
  const armed = t("firstLyricCueArmed")
    .replace("{role}", cue.role.name)
    .replace("{section}", cue.section.label)
    .replace("{start}", start)
    .replace("{lyric}", cue.lyric);

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
