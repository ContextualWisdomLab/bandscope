import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatDropPlanTime,
  resolveFirstDropPlan,
  type DropPlanGuidance
} from "./firstDropPlan";

/** Props for the first drop-plan rehearsal callout. */
export interface FirstDropPlanCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type DropPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type DropPlanSource = "model" | "user";

type OpenedDropPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  dropPlan: string;
  dropPlanSource: DropPlanSource | null;
  dropPlanGuidanceKind: DropPlanGuidance["kind"] | null;
  dropPlanTargetRoleName: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableDropPlanSongIdentity(song: RehearsalSong, workspaceInstanceKey: unknown): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate drop-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatDropPlanCopy(template: string, values: DropPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof DropPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model drop guidance from structured landing topology, never from display-copy grammar. */
function localizedDropPlan(
  dropPlan: string,
  dropPlanSource: DropPlanSource | null,
  guidance: DropPlanGuidance | null,
  generatedTemplate: string,
  generatedSoloTemplate: string
): string {
  if (dropPlanSource !== "model" || guidance === null) {
    return dropPlan;
  }
  return guidance.kind === "solo"
    ? generatedSoloTemplate
    : generatedTemplate.replace("{target}", () => guidance.targetRoleName);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredDropPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveDropPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first drop plan and open the matching rendered map section. */
export function FirstDropPlanCallout({ song, workspaceInstanceKey }: FirstDropPlanCalloutProps) {
  const calloutId = `workspace-surface-drop-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableDropPlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstDropPlan(song), [song]);
  const [openedDropPlan, setOpenedDropPlan] = useState<OpenedDropPlan | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const guidanceKind = named?.dropPlanGuidance?.kind ?? null;
  const guidanceTargetRoleName =
    named?.dropPlanGuidance?.kind === "role" ? named.dropPlanGuidance.targetRoleName : null;

  useEffect(() => {
    setOpenedDropPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.dropPlan,
    named?.dropPlanSource,
    guidanceKind,
    guidanceTargetRoleName,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstDropPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstDropPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstDropPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedDropPlan !== null &&
    openedDropPlan.songIdentity === songIdentity &&
    openedDropPlan.sectionId === named.sectionId &&
    openedDropPlan.sectionIndex === named.sectionIndex &&
    openedDropPlan.sectionLabel === named.sectionLabel &&
    openedDropPlan.landingRoleId === named.landingRoleId &&
    openedDropPlan.landingRoleName === named.landingRoleName &&
    openedDropPlan.dropPlan === named.dropPlan &&
    openedDropPlan.dropPlanSource === named.dropPlanSource &&
    openedDropPlan.dropPlanGuidanceKind === guidanceKind &&
    openedDropPlan.dropPlanTargetRoleName === guidanceTargetRoleName &&
    openedDropPlan.atSeconds === named.atSeconds;
  const at = formatDropPlanTime(named.atSeconds);
  const copyValues: DropPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatDropPlanCopy(t("firstDropPlanOpenAction"), copyValues);
  const body = formatDropPlanCopy(t("firstDropPlanBody"), copyValues);
  const armed = formatDropPlanCopy(t("firstDropPlanArmed"), copyValues);
  const dropPlan = localizedDropPlan(
    named.dropPlan,
    named.dropPlanSource,
    named.dropPlanGuidance,
    t("firstDropPlanGeneratedGuidance"),
    t("firstDropPlanGeneratedSoloGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstDropPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstDropPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {opened && named.dropPlanSource === "model" ? armed : body}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{dropPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveDropPlanRenderer(event.currentTarget);
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
            behavior: preferredDropPlanScrollBehavior()
          });
          setOpenedDropPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            dropPlan: named.dropPlan,
            dropPlanSource: named.dropPlanSource,
            dropPlanGuidanceKind: guidanceKind,
            dropPlanTargetRoleName: guidanceTargetRoleName,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstDropPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
