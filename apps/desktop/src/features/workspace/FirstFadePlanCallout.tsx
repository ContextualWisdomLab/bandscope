import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatFadePlanTime,
  resolveFirstFadePlan,
  type FadePlanGuidance
} from "./firstFadePlan";

/** Props for the first fade-plan rehearsal callout. */
export interface FirstFadePlanCalloutProps {
  song: RehearsalSong;
  workspaceInstanceKey?: unknown;
}

type FadePlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type FadePlanSource = "model" | "user";

type OpenedFadePlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  sectionLabel: string;
  landingRoleId: string;
  landingRoleName: string;
  fadePlan: string;
  fadePlanSource: FadePlanSource | null;
  fadePlanGuidanceKind: FadePlanGuidance["kind"] | null;
  fadePlanTargetRoleName: string | null;
  atSeconds: number;
}>;

/** Prefer the owning workspace instance while preserving direct-call compatibility. */
function stableFadePlanSongIdentity(song: RehearsalSong, workspaceInstanceKey: unknown): unknown {
  return workspaceInstanceKey ?? song;
}

/** Interpolate fade-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatFadePlanCopy(template: string, values: FadePlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof FadePlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model fade guidance from structured landing topology, never from display-copy grammar. */
function localizedFadePlan(
  fadePlan: string,
  fadePlanSource: FadePlanSource | null,
  guidance: FadePlanGuidance | null,
  generatedTemplate: string,
  generatedSoloTemplate: string
): string {
  if (fadePlanSource !== "model" || guidance === null) {
    return fadePlan;
  }
  return guidance.kind === "solo"
    ? generatedSoloTemplate
    : generatedTemplate.replace("{target}", () => guidance.targetRoleName);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredFadePlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveFadePlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first fade plan and open the matching rendered map section. */
export function FirstFadePlanCallout({ song, workspaceInstanceKey }: FirstFadePlanCalloutProps) {
  const calloutId = `workspace-surface-fade-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableFadePlanSongIdentity(song, workspaceInstanceKey);
  const named = useMemo(() => resolveFirstFadePlan(song), [song]);
  const [openedFadePlan, setOpenedFadePlan] = useState<OpenedFadePlan | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const guidanceKind = named?.fadePlanGuidance?.kind ?? null;
  const guidanceTargetRoleName =
    named?.fadePlanGuidance?.kind === "role" ? named.fadePlanGuidance.targetRoleName : null;

  useEffect(() => {
    setOpenedFadePlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.sectionLabel,
    named?.landingRoleId,
    named?.landingRoleName,
    named?.fadePlan,
    named?.fadePlanSource,
    guidanceKind,
    guidanceTargetRoleName,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstFadePlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
          {t("firstFadePlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstFadePlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedFadePlan !== null &&
    openedFadePlan.songIdentity === songIdentity &&
    openedFadePlan.sectionId === named.sectionId &&
    openedFadePlan.sectionIndex === named.sectionIndex &&
    openedFadePlan.sectionLabel === named.sectionLabel &&
    openedFadePlan.landingRoleId === named.landingRoleId &&
    openedFadePlan.landingRoleName === named.landingRoleName &&
    openedFadePlan.fadePlan === named.fadePlan &&
    openedFadePlan.fadePlanSource === named.fadePlanSource &&
    openedFadePlan.fadePlanGuidanceKind === guidanceKind &&
    openedFadePlan.fadePlanTargetRoleName === guidanceTargetRoleName &&
    openedFadePlan.atSeconds === named.atSeconds;
  const at = formatFadePlanTime(named.atSeconds);
  const copyValues: FadePlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatFadePlanCopy(t("firstFadePlanOpenAction"), copyValues);
  const body = formatFadePlanCopy(t("firstFadePlanBody"), copyValues);
  const armed = formatFadePlanCopy(t("firstFadePlanArmed"), copyValues);
  const fadePlan = localizedFadePlan(
    named.fadePlan,
    named.fadePlanSource,
    named.fadePlanGuidance,
    t("firstFadePlanGeneratedGuidance"),
    t("firstFadePlanGeneratedSoloGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstFadePlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">
        {t("firstFadePlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {opened && named.fadePlanSource === "model" ? armed : body}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{fadePlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveFadePlanRenderer(event.currentTarget);
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
            behavior: preferredFadePlanScrollBehavior()
          });
          setOpenedFadePlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            sectionLabel: named.sectionLabel,
            landingRoleId: named.landingRoleId,
            landingRoleName: named.landingRoleName,
            fadePlan: named.fadePlan,
            fadePlanSource: named.fadePlanSource,
            fadePlanGuidanceKind: guidanceKind,
            fadePlanTargetRoleName: guidanceTargetRoleName,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstFadePlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
