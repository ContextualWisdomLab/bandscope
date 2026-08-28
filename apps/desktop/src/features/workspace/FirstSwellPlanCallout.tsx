import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatSwellPlanTime,
  resolveFirstSwellPlan,
  type SwellPlanGuidance
} from "./firstSwellPlan";

/** Props for the first swell-plan rehearsal callout. */
export interface FirstSwellPlanCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type SwellPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type SwellPlanSource = "model" | "user";

type OpenedSwellPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  swellPlan: string;
  swellPlanSource: SwellPlanSource | null;
  swellPlanGuidanceKind: SwellPlanGuidance["kind"] | null;
  swellPlanTargetRoleName: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableSwellPlanSongIdentity(song: RehearsalSong, workspaceInstanceKey: unknown): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate swell-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatSwellPlanCopy(template: string, values: SwellPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof SwellPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model swell guidance from structured landing topology, never from display-copy grammar. */
function localizedSwellPlan(
  swellPlan: string,
  swellPlanSource: SwellPlanSource | null,
  guidance: SwellPlanGuidance | null,
  generatedTemplate: string,
  generatedSoloTemplate: string
): string {
  if (swellPlanSource !== "model" || guidance === null) {
    return swellPlan;
  }
  return guidance.kind === "solo"
    ? generatedSoloTemplate
    : generatedTemplate.replace("{target}", () => guidance.targetRoleName);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredSwellPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveSwellPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first swell plan and open the matching rendered map section. */
export function FirstSwellPlanCallout({ song, workspaceInstanceKey }: FirstSwellPlanCalloutProps) {
  const calloutId = `workspace-surface-swell-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableSwellPlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstSwellPlan(song), [song]);
  const [openedSwellPlan, setOpenedSwellPlan] = useState<OpenedSwellPlan | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const guidanceKind = named?.swellPlanGuidance?.kind ?? null;
  const guidanceTargetRoleName =
    named?.swellPlanGuidance?.kind === "role" ? named.swellPlanGuidance.targetRoleName : null;

  useEffect(() => {
    setOpenedSwellPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.swellPlan,
    named?.swellPlanSource,
    guidanceKind,
    guidanceTargetRoleName,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstSwellPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstSwellPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstSwellPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedSwellPlan !== null &&
    openedSwellPlan.songIdentity === songIdentity &&
    openedSwellPlan.sectionId === named.sectionId &&
    openedSwellPlan.sectionIndex === named.sectionIndex &&
    openedSwellPlan.sectionLabel === named.sectionLabel &&
    openedSwellPlan.landingRoleId === named.landingRoleId &&
    openedSwellPlan.landingRoleName === named.landingRoleName &&
    openedSwellPlan.swellPlan === named.swellPlan &&
    openedSwellPlan.swellPlanSource === named.swellPlanSource &&
    openedSwellPlan.swellPlanGuidanceKind === guidanceKind &&
    openedSwellPlan.swellPlanTargetRoleName === guidanceTargetRoleName &&
    openedSwellPlan.atSeconds === named.atSeconds;
  const at = formatSwellPlanTime(named.atSeconds);
  const copyValues: SwellPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatSwellPlanCopy(t("firstSwellPlanOpenAction"), copyValues);
  const body = formatSwellPlanCopy(t("firstSwellPlanBody"), copyValues);
  const armed = formatSwellPlanCopy(t("firstSwellPlanArmed"), copyValues);
  const swellPlan = localizedSwellPlan(
    named.swellPlan,
    named.swellPlanSource,
    named.swellPlanGuidance,
    t("firstSwellPlanGeneratedGuidance"),
    t("firstSwellPlanGeneratedSoloGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstSwellPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstSwellPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {opened && named.swellPlanSource === "model" ? armed : body}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{swellPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveSwellPlanRenderer(event.currentTarget);
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
            behavior: preferredSwellPlanScrollBehavior()
          });
          setOpenedSwellPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            swellPlan: named.swellPlan,
            swellPlanSource: named.swellPlanSource,
            swellPlanGuidanceKind: guidanceKind,
            swellPlanTargetRoleName: guidanceTargetRoleName,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstSwellPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
