import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatChorusTime, resolveFirstChorus } from "./firstChorus";

/** Props for the first-chorus rehearsal callout. */
export interface FirstChorusCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearChorus?: (atSeconds: number) => void;
}

type ChorusCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardChorus = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate chorus placeholders once so rehearsal data is never rescanned as template syntax. */
function formatChorusCopy(template: string, values: ChorusCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof ChorusCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredChorusScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled chorus and offer only an action that the current surface can execute. */
export function FirstChorusCallout({
  song,
  actionMode = "workspace-scroll",
  onHearChorus
}: FirstChorusCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const chorus = resolveFirstChorus(song);
  const chorusSectionIndex = chorus ? song.sections.indexOf(chorus.section) : -1;
  const [heardChorus, setHeardChorus] = useState<HeardChorus | null>(null);

  useEffect(() => {
    setHeardChorus(null);
  }, [song?.id, chorusSectionIndex, chorus?.section.id, chorus?.holdingRole?.id, chorus?.atSeconds]);

  if (!chorus) {
    return (
      <aside
        id="workspace-surface-chorus"
        className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4"
        aria-label={t("firstChorusUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("firstChorusLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstChorusUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardChorus?.songId === song.id &&
    heardChorus.sectionId === chorus.section.id &&
    heardChorus.sectionIndex === chorusSectionIndex &&
    heardChorus.holdingRoleId === (chorus.holdingRole?.id ?? null) &&
    heardChorus.atSeconds === chorus.atSeconds;
  const at = formatChorusTime(chorus.atSeconds);
  const copyValues: ChorusCopyValues = {
    role: chorus.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, chorus.section.label),
    at
  };
  const hasRole = chorus.holdingRole !== null;
  const actionLabel = formatChorusCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstChorusAction"
          : "firstChorusActionBand"
        : hasRole
          ? "firstChorusOpenAction"
          : "firstChorusOpenActionBand"
    ),
    copyValues
  );
  const body = formatChorusCopy(t(hasRole ? "firstChorusBody" : "firstChorusBodyBand"), copyValues);
  const armed = formatChorusCopy(t(hasRole ? "firstChorusArmed" : "firstChorusArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearChorus === "function";
  /** Record completion only after the owning surface has executed the selected chorus action. */
  const markChorusActionComplete = () => {
    setHeardChorus({
      songId: song.id,
      sectionId: chorus.section.id,
      sectionIndex: chorusSectionIndex,
      holdingRoleId: chorus.holdingRole?.id ?? null,
      atSeconds: chorus.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-chorus"
      className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4"
      aria-label={t("firstChorusLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("firstChorusLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-fuchsia-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearChorus!(chorus.atSeconds);
              markChorusActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = chorusSectionIndex >= 0 ? grid?.children.item(chorusSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredChorusScrollBehavior()
            });
            markChorusActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
