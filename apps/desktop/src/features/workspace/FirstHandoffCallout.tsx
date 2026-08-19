import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatHandoffTime, resolveFirstLabeledHandoff } from "./firstLabeledHandoff";

/** Props for the first-handoff rehearsal callout. */
export interface FirstHandoffCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearHandoff?: (atSeconds: number) => void;
}

type HandoffCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardHandoff = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate handoff placeholders once so rehearsal data is never rescanned as template syntax. */
function formatHandoffCopy(template: string, values: HandoffCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof HandoffCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredHandoffScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled handoff and offer only an action that the current surface can execute. */
export function FirstHandoffCallout({
  song,
  actionMode = "workspace-scroll",
  onHearHandoff
}: FirstHandoffCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const handoff = resolveFirstLabeledHandoff(song);
  const handoffSectionIndex = handoff ? song.sections.indexOf(handoff.section) : -1;
  const [heardHandoff, setHeardHandoff] = useState<HeardHandoff | null>(null);

  useEffect(() => {
    setHeardHandoff(null);
  }, [song.id, handoffSectionIndex, handoff?.section.id, handoff?.holdingRole?.id, handoff?.atSeconds]);

  if (!handoff) {
    return (
      <aside
        id="workspace-surface-handoff"
        className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
        aria-label={t("firstHandoffUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstHandoffLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstHandoffUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardHandoff?.songId === song.id &&
    heardHandoff.sectionId === handoff.section.id &&
    heardHandoff.sectionIndex === handoffSectionIndex &&
    heardHandoff.holdingRoleId === (handoff.holdingRole?.id ?? null) &&
    heardHandoff.atSeconds === handoff.atSeconds;
  const at = formatHandoffTime(handoff.atSeconds);
  const copyValues: HandoffCopyValues = {
    role: handoff.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, handoff.section.label),
    at
  };
  const hasRole = handoff.holdingRole !== null;
  const actionLabel = formatHandoffCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstHandoffAction"
          : "firstHandoffActionBand"
        : hasRole
          ? "firstHandoffOpenAction"
          : "firstHandoffOpenActionBand"
    ),
    copyValues
  );
  const body = formatHandoffCopy(t(hasRole ? "firstHandoffBody" : "firstHandoffBodyBand"), copyValues);
  const armed = formatHandoffCopy(t(hasRole ? "firstHandoffArmed" : "firstHandoffArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearHandoff === "function";
  /** Record completion only after the owning surface has executed the selected handoff action. */
  const markHandoffActionComplete = () => {
    setHeardHandoff({
      songId: song.id,
      sectionId: handoff.section.id,
      sectionIndex: handoffSectionIndex,
      holdingRoleId: handoff.holdingRole?.id ?? null,
      atSeconds: handoff.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-handoff"
      className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
      aria-label={t("firstHandoffLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstHandoffLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-sky-300 to-emerald-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearHandoff!(handoff.atSeconds);
              markHandoffActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = handoffSectionIndex >= 0 ? grid?.children.item(handoffSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredHandoffScrollBehavior()
            });
            markHandoffActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
