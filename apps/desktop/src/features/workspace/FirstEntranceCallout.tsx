import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatEntranceTime, resolveFirstEntrance } from "./firstEntrance";

/** Props for the first-entrance rehearsal callout. */
export interface FirstEntranceCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearEntrance?: (startSeconds: number) => void;
}

type EntranceCopyValues = Readonly<Record<"role" | "section" | "start" | "cue", string>>;

type HeardEntrance = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  roleId: string;
  startSeconds: number;
  cue: string;
}>;

/** Interpolate entrance placeholders once so rehearsal data is never rescanned as template syntax. */
function formatEntranceCopy(template: string, values: EntranceCopyValues): string {
  return template.replace(/\{(role|section|start|cue)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof EntranceCopyValues;
    return values[key];
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredEntranceScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first entrance and offer only an action that the current surface can execute. */
export function FirstEntranceCallout({
  song,
  actionMode = "workspace-scroll",
  onHearEntrance
}: FirstEntranceCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const entrance = resolveFirstEntrance(song);
  const entranceSectionIndex = entrance ? song.sections.indexOf(entrance.section) : -1;
  const [heardEntrance, setHeardEntrance] = useState<HeardEntrance | null>(null);

  useEffect(() => {
    setHeardEntrance(null);
  }, [
    song.id,
    entranceSectionIndex,
    entrance?.section.id,
    entrance?.role.id,
    entrance?.startSeconds,
    entrance?.role.cue.value
  ]);

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

  const heard =
    heardEntrance?.songId === song.id &&
    heardEntrance.sectionId === entrance.section.id &&
    heardEntrance.sectionIndex === entranceSectionIndex &&
    heardEntrance.roleId === entrance.role.id &&
    heardEntrance.startSeconds === entrance.startSeconds &&
    heardEntrance.cue === entrance.role.cue.value;
  const start = formatEntranceTime(entrance.startSeconds);
  const copyValues: EntranceCopyValues = {
    role: entrance.role.name,
    section: entrance.section.label,
    start,
    cue: entrance.role.cue.value
  };
  const actionLabel = formatEntranceCopy(
    t(actionMode === "callback-only" ? "firstEntranceAction" : "firstEntranceOpenAction"),
    copyValues
  );
  const body = formatEntranceCopy(t("firstEntranceBody"), copyValues);
  const armed = formatEntranceCopy(t("firstEntranceArmed"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || onHearEntrance !== undefined;

  return (
    <aside
      id="workspace-surface-cues"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstEntranceLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("firstEntranceLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950"
          onClick={() => {
            setHeardEntrance({
              songId: song.id,
              sectionId: entrance.section.id,
              sectionIndex: entranceSectionIndex,
              roleId: entrance.role.id,
              startSeconds: entrance.startSeconds,
              cue: entrance.role.cue.value
            });
            if (onHearEntrance) {
              onHearEntrance(entrance.startSeconds);
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = entranceSectionIndex >= 0 ? grid?.children.item(entranceSectionIndex) : null;
            target?.scrollIntoView?.({
              block: "nearest",
              behavior: preferredEntranceScrollBehavior()
            });
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
