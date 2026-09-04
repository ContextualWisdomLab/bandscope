import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatPreChorusTime, resolveFirstPreChorus } from "./firstPreChorus";

/** Props for the first-pre-chorus rehearsal callout. */
export interface FirstPreChorusCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearPreChorus?: (atSeconds: number) => void;
}

type PreChorusCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardPreChorus = Readonly<{
  song: RehearsalSong;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate pre-chorus placeholders once so rehearsal data is never rescanned as template syntax. */
function formatPreChorusCopy(template: string, values: PreChorusCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof PreChorusCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredPreChorusScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled pre-chorus and offer only an action that the current surface can execute. */
export function FirstPreChorusCallout({
  song,
  actionMode = "workspace-scroll",
  onHearPreChorus
}: FirstPreChorusCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const preChorus = resolveFirstPreChorus(song);
  const preChorusSectionIndex =
    preChorus && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(preChorus.section)
      : -1;
  const [heardPreChorus, setHeardPreChorus] = useState<HeardPreChorus | null>(null);

  useEffect(() => {
    setHeardPreChorus(null);
  }, [song, preChorusSectionIndex, preChorus?.section.id, preChorus?.holdingRole?.id, preChorus?.atSeconds]);

  if (!preChorus) {
    return (
      <aside
        id="workspace-surface-pre-chorus"
        className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
        aria-label={t("firstPreChorusUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstPreChorusLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstPreChorusUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardPreChorus?.song === song &&
    heardPreChorus.sectionId === preChorus.section.id &&
    heardPreChorus.sectionIndex === preChorusSectionIndex &&
    heardPreChorus.holdingRoleId === (preChorus.holdingRole?.id ?? null) &&
    heardPreChorus.atSeconds === preChorus.atSeconds;
  const at = formatPreChorusTime(preChorus.atSeconds);
  const copyValues: PreChorusCopyValues = {
    role: preChorus.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, preChorus.section.label),
    at
  };
  const hasRole = preChorus.holdingRole !== null;
  const actionLabel = formatPreChorusCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstPreChorusAction"
          : "firstPreChorusActionBand"
        : hasRole
          ? "firstPreChorusOpenAction"
          : "firstPreChorusOpenActionBand"
    ),
    copyValues
  );
  const body = formatPreChorusCopy(t(hasRole ? "firstPreChorusBody" : "firstPreChorusBodyBand"), copyValues);
  const armed = formatPreChorusCopy(t(hasRole ? "firstPreChorusArmed" : "firstPreChorusArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearPreChorus === "function";
  /** Record completion only after the owning surface has executed the selected pre-chorus action. */
  const markPreChorusActionComplete = () => {
    setHeardPreChorus({
      song,
      sectionId: preChorus.section.id,
      sectionIndex: preChorusSectionIndex,
      holdingRoleId: preChorus.holdingRole?.id ?? null,
      atSeconds: preChorus.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-pre-chorus"
      className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
      aria-label={t("firstPreChorusLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstPreChorusLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-sky-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearPreChorus!(preChorus.atSeconds);
              markPreChorusActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = preChorusSectionIndex >= 0 ? grid?.children.item(preChorusSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredPreChorusScrollBehavior()
            });
            markPreChorusActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
