import { useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatEntranceTime, resolveFirstEntrance } from "./firstEntrance";

/** Props for the first-entrance rehearsal callout. */
export interface FirstEntranceCalloutProps {
  song: RehearsalSong;
}

/** Name tonight's first entrance and let the room hear where that part starts. */
export function FirstEntranceCallout({ song }: FirstEntranceCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const entrance = resolveFirstEntrance(song);
  const [heard, setHeard] = useState(false);

  if (!entrance) {
    return (
      <aside
        id="workspace-surface-cues"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstEntranceUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("firstEntranceLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstEntranceUnavailable")}</p>
      </aside>
    );
  }

  const start = formatEntranceTime(entrance.startSeconds);
  const actionLabel = t("firstEntranceAction")
    .replace("{role}", entrance.role.name)
    .replace("{section}", entrance.section.label)
    .replace("{start}", start);
  const body = t("firstEntranceBody")
    .replace("{role}", entrance.role.name)
    .replace("{section}", entrance.section.label)
    .replace("{start}", start)
    .replace("{cue}", entrance.role.cue.value);
  const armed = t("firstEntranceArmed")
    .replace("{role}", entrance.role.name)
    .replace("{section}", entrance.section.label)
    .replace("{start}", start)
    .replace("{cue}", entrance.role.cue.value);

  return (
    <aside
      id="workspace-surface-cues"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstEntranceLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("firstEntranceLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950"
        onClick={() => {
          setHeard(true);
          const target = document.getElementById(`song-structure-section-${entrance.section.id}`);
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
