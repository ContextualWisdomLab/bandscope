import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatDropoutTime, resolveFirstDropoutHandoff } from "./firstDropoutHandoff";

/** Props for the first-dropout rehearsal callout. */
export interface FirstDropoutCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearDropout?: (endSeconds: number) => void;
}

type DropoutCopyValues = Readonly<Record<"from" | "to" | "section" | "end", string>>;

type HeardDropout = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  fromRoleId: string;
  toRoleId: string;
  endSeconds: number;
}>;

/** Interpolate dropout placeholders once so rehearsal data is never rescanned as template syntax. */
function formatDropoutCopy(template: string, values: DropoutCopyValues): string {
  return template.replace(/\{(from|to|section|end)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof DropoutCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Name tonight's first dropout and offer only an action that the current surface can execute. */
export function FirstDropoutCallout({
  song,
  actionMode = "workspace-scroll",
  onHearDropout
}: FirstDropoutCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const handoff = resolveFirstDropoutHandoff(song);
  const handoffSectionIndex = handoff ? song.sections.indexOf(handoff.section) : -1;
  const [heardDropout, setHeardDropout] = useState<HeardDropout | null>(null);

  useEffect(() => {
    setHeardDropout(null);
  }, [song.id, handoffSectionIndex, handoff?.section.id, handoff?.fromRole.id, handoff?.toRole.id, handoff?.endSeconds]);

  if (!handoff) {
    return (
      <aside
        id="workspace-surface-dropout"
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstDropoutUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstDropoutLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstDropoutUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardDropout?.songId === song.id &&
    heardDropout.sectionId === handoff.section.id &&
    heardDropout.sectionIndex === handoffSectionIndex &&
    heardDropout.fromRoleId === handoff.fromRole.id &&
    heardDropout.toRoleId === handoff.toRole.id &&
    heardDropout.endSeconds === handoff.endSeconds;
  const end = formatDropoutTime(handoff.endSeconds);
  const copyValues: DropoutCopyValues = {
    from: handoff.fromRole.name,
    to: handoff.toRole.name,
    section: handoff.section.label,
    end
  };
  const actionLabel = formatDropoutCopy(
    t(actionMode === "callback-only" ? "firstDropoutAction" : "firstDropoutOpenAction"),
    copyValues
  );
  const body = formatDropoutCopy(t("firstDropoutBody"), copyValues);
  const armed = formatDropoutCopy(t("firstDropoutArmed"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || onHearDropout !== undefined;

  return (
    <aside
      id="workspace-surface-dropout"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstDropoutLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstDropoutLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-400 font-black text-slate-950"
          onClick={() => {
            setHeardDropout({
              songId: song.id,
              sectionId: handoff.section.id,
              sectionIndex: handoffSectionIndex,
              fromRoleId: handoff.fromRole.id,
              toRoleId: handoff.toRole.id,
              endSeconds: handoff.endSeconds
            });
            if (actionMode === "callback-only") {
              onHearDropout?.(handoff.endSeconds);
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = handoffSectionIndex >= 0 ? grid?.children.item(handoffSectionIndex) : null;
            target?.scrollIntoView?.({
              block: "nearest",
              behavior: "smooth"
            });
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
