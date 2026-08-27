import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatBreakdownPlanTime,
  resolveFirstBreakdownPlan,
  type BreakdownPlanGuidance
} from "./firstBreakdownPlan";

/** Props for the first breakdown-plan rehearsal callout. */
export interface FirstBreakdownPlanCalloutProps {
  song: RehearsalSong;
}

type BreakdownPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type BreakdownPlanSource = "model" | "user";

type OpenedBreakdownPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  breakdownPlan: string;
  breakdownPlanSource: BreakdownPlanSource | null;
  breakdownPlanGuidanceKind: BreakdownPlanGuidance["kind"] | null;
  breakdownPlanTargetRoleName: string | null;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableBreakdownPlanSongIdentity(song: RehearsalSong): unknown {
  if (song === null || typeof song !== "object" || Array.isArray(song)) {
    return song;
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(song, "id");
  } catch {
    return song;
  }
  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, "value") &&
    typeof descriptor.value === "string" &&
    descriptor.value.trim().length > 0
    ? descriptor.value
    : song;
}

/** Interpolate breakdown-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatBreakdownPlanCopy(template: string, values: BreakdownPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof BreakdownPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model breakdown guidance from structured holding topology, never from display-copy grammar. */
function localizedBreakdownPlan(
  breakdownPlan: string,
  breakdownPlanSource: BreakdownPlanSource | null,
  guidance: BreakdownPlanGuidance | null,
  generatedTemplate: string,
  generatedSoloTemplate: string
): string {
  if (breakdownPlanSource !== "model" || guidance === null) {
    return breakdownPlan;
  }
  return guidance.kind === "solo"
    ? generatedSoloTemplate
    : generatedTemplate.replace("{target}", () => guidance.targetRoleName);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredBreakdownPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveBreakdownPlanRenderer(origin: HTMLElement): HTMLElement | null {
  const selector = '[data-testid="song-structure-grid"]';
  const localScope = origin.closest("aside")?.parentElement ?? null;
  const localRenderers = localScope?.querySelectorAll<HTMLElement>(selector) ?? [];
  if (localRenderers.length === 1) {
    return localRenderers[0] ?? null;
  }
  if (localRenderers.length > 1) {
    return null;
  }

  const globalRenderers = document.querySelectorAll<HTMLElement>(selector);
  return globalRenderers.length === 1 ? (globalRenderers[0] ?? null) : null;
}

/** Name tonight's first breakdown plan and open the matching rendered map section. */
export function FirstBreakdownPlanCallout({ song }: FirstBreakdownPlanCalloutProps) {
  const calloutId = `workspace-surface-breakdown-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableBreakdownPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstBreakdownPlan(song), [song]);
  const [openedBreakdownPlan, setOpenedBreakdownPlan] = useState<OpenedBreakdownPlan | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const guidanceKind = named?.breakdownPlanGuidance?.kind ?? null;
  const guidanceTargetRoleName =
    named?.breakdownPlanGuidance?.kind === "role"
      ? named.breakdownPlanGuidance.targetRoleName
      : null;

  useEffect(() => {
    setOpenedBreakdownPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.holdingRoleId,
    named?.breakdownPlan,
    named?.breakdownPlanSource,
    guidanceKind,
    guidanceTargetRoleName,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstBreakdownPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstBreakdownPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstBreakdownPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedBreakdownPlan !== null &&
    openedBreakdownPlan.songIdentity === songIdentity &&
    openedBreakdownPlan.sectionId === named.sectionId &&
    openedBreakdownPlan.sectionIndex === named.sectionIndex &&
    openedBreakdownPlan.holdingRoleId === named.holdingRoleId &&
    openedBreakdownPlan.breakdownPlan === named.breakdownPlan &&
    openedBreakdownPlan.breakdownPlanSource === named.breakdownPlanSource &&
    openedBreakdownPlan.breakdownPlanGuidanceKind === guidanceKind &&
    openedBreakdownPlan.breakdownPlanTargetRoleName === guidanceTargetRoleName &&
    openedBreakdownPlan.atSeconds === named.atSeconds;
  const at = formatBreakdownPlanTime(named.atSeconds);
  const copyValues: BreakdownPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatBreakdownPlanCopy(t("firstBreakdownPlanOpenAction"), copyValues);
  const body = formatBreakdownPlanCopy(t("firstBreakdownPlanBody"), copyValues);
  const armed = formatBreakdownPlanCopy(t("firstBreakdownPlanArmed"), copyValues);
  const breakdownPlan = localizedBreakdownPlan(
    named.breakdownPlan,
    named.breakdownPlanSource,
    named.breakdownPlanGuidance,
    t("firstBreakdownPlanGeneratedGuidance"),
    t("firstBreakdownPlanGeneratedSoloGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstBreakdownPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstBreakdownPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{breakdownPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveBreakdownPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            setNavigationFailed(true);
            return;
          }
          setNavigationFailed(false);
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredBreakdownPlanScrollBehavior()
          });
          setOpenedBreakdownPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            holdingRoleId: named.holdingRoleId,
            breakdownPlan: named.breakdownPlan,
            breakdownPlanSource: named.breakdownPlanSource,
            breakdownPlanGuidanceKind: guidanceKind,
            breakdownPlanTargetRoleName: guidanceTargetRoleName,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstBreakdownPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
