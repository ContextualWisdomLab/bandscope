import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatStopTime, resolveFirstStopHandoff } from "./firstStopHandoff";

/** Props for the first-stop rehearsal callout. */
export interface FirstStopCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearStop?: (atSeconds: number) => void;
}

type StopCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardStop = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate stop placeholders once so rehearsal data is never rescanned as template syntax. */
function formatStopCopy(template: string, values: StopCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof StopCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredStopScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first stop and offer only an action that the current surface can execute. */
export function FirstStopCallout({
  song,
  actionMode = "workspace-scroll",
  onHearStop
}: FirstStopCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const stop = resolveFirstStopHandoff(song);
  const stopSectionIndex = stop ? song.sections.indexOf(stop.section) : -1;
  const [heardStop, setHeardStop] = useState<HeardStop | null>(null);

  useEffect(() => {
    setHeardStop(null);
  }, [song.id, stopSectionIndex, stop?.section.id, stop?.holdingRole?.id, stop?.atSeconds]);

  if (!stop) {
    return (
      <aside
        id="workspace-surface-stop"
        className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
        aria-label={t("firstStopUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstStopLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstStopUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardStop?.songId === song.id &&
    heardStop.sectionId === stop.section.id &&
    heardStop.sectionIndex === stopSectionIndex &&
    heardStop.holdingRoleId === (stop.holdingRole?.id ?? null) &&
    heardStop.atSeconds === stop.atSeconds;
  const at = formatStopTime(stop.atSeconds);
  const copyValues: StopCopyValues = {
    role: stop.holdingRole?.name ?? "",
    section: stop.section.label,
    at
  };
  const hasRole = stop.holdingRole !== null;
  const actionLabel = formatStopCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstStopAction"
          : "firstStopActionBand"
        : hasRole
          ? "firstStopOpenAction"
          : "firstStopOpenActionBand"
    ),
    copyValues
  );
  const body = formatStopCopy(t(hasRole ? "firstStopBody" : "firstStopBodyBand"), copyValues);
  const armed = formatStopCopy(t(hasRole ? "firstStopArmed" : "firstStopArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearStop === "function";
  const markStopActionComplete = () => {
    setHeardStop({
      songId: song.id,
      sectionId: stop.section.id,
      sectionIndex: stopSectionIndex,
      holdingRoleId: stop.holdingRole?.id ?? null,
      atSeconds: stop.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-stop"
      className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4"
      aria-label={t("firstStopLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">{t("firstStopLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-rose-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              if (typeof onHearStop !== "function") {
                return;
              }
              onHearStop(stop.atSeconds);
              markStopActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = stopSectionIndex >= 0 ? grid?.children.item(stopSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredStopScrollBehavior()
            });
            markStopActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
