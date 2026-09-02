import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatStopTime, resolveFirstStopHandoff } from "./firstStopHandoff";

/** Props for the first-stop rehearsal callout. */
export interface FirstStopCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearStop?: (atSeconds: number) => void;
}

type StopCopyValues = Readonly<
  Record<"role" | "section" | "at" | "previousSection" | "nextSection", string>
>;

type HeardStop = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate stop placeholders once so rehearsal data is never rescanned as template syntax. */
function formatStopCopy(template: string, values: StopCopyValues): string {
  return template.replace(/\{(role|section|at|previousSection|nextSection)\}/g, (placeholder) => {
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
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const stop = resolveFirstStopHandoff(song);
  const stopSectionIndex =
    stop && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(stop.section)
      : -1;
  const [heardStop, setHeardStop] = useState<HeardStop | null>(null);

  useEffect(() => {
    setHeardStop(null);
  }, [songId, stopSectionIndex, stop?.section.id, stop?.holdingRole?.id, stop?.atSeconds]);

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
    heardStop?.songId === songId &&
    heardStop.sectionId === stop.section.id &&
    heardStop.sectionIndex === stopSectionIndex &&
    heardStop.holdingRoleId === (stop.holdingRole?.id ?? null) &&
    heardStop.atSeconds === stop.atSeconds;
  const at = formatStopTime(stop.atSeconds);
  const copyValues: StopCopyValues = {
    role: stop.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, stop.section.label),
    at,
    previousSection: stop.previousSectionLabel
      ? translateSectionFormLabel(locale, stop.previousSectionLabel)
      : "",
    nextSection: stop.nextSectionLabel
      ? translateSectionFormLabel(locale, stop.nextSectionLabel)
      : ""
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
  const route = stop.hasFollowingSection
    ? stop.previousSectionLabel && stop.nextSectionLabel
      ? formatStopCopy(t("firstStopRouteBoth"), copyValues)
      : stop.nextSectionLabel
        ? formatStopCopy(t("firstStopRouteNext"), copyValues)
        : stop.previousSectionLabel
          ? formatStopCopy(t("firstStopRoutePrevious"), copyValues)
          : null
    : null;
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearStop === "function";
  /** Record completion only after the owning surface has executed the selected stop action. */
  const markStopActionComplete = () => {
    setHeardStop({
      songId,
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
      {route ? (
        <p className="mt-1 text-sm leading-6 text-slate-200" data-testid="first-stop-route">
          {route}
        </p>
      ) : null}
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-rose-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearStop!(stop.atSeconds);
              markStopActionComplete();
              return;
            }
            const structureGrid = document.querySelector('[data-testid="song-structure-grid"]');
            const sectionTarget =
              stopSectionIndex >= 0
                ? Array.from(structureGrid?.children ?? []).find(
                    (gridChild) =>
                      gridChild instanceof HTMLElement &&
                      gridChild.dataset.sectionPosition === String(stopSectionIndex)
                  )
                : undefined;
            if (typeof sectionTarget?.scrollIntoView !== "function") {
              return;
            }
            sectionTarget.scrollIntoView({
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
