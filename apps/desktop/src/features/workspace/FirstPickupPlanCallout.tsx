import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatPickupPlanTime,
  resolveFirstPickupPlan,
  type PickupPlanGuidance
} from "./firstPickupPlan";

/** Props for the first pickup-plan rehearsal callout. */
export interface FirstPickupPlanCalloutProps {
  song: RehearsalSong;
}

type PickupPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type PickupPlanSource = "model" | "user";

type OpenedPickupPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  landingRoleId: string;
  pickupPlan: string;
  pickupPlanSource: PickupPlanSource | null;
  pickupPlanGuidanceKind: PickupPlanGuidance["kind"] | null;
  pickupPlanTargetRoleName: string | null;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stablePickupPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate pickup-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatPickupPlanCopy(template: string, values: PickupPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof PickupPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize model pickup guidance from structured landing topology, never from display-copy grammar. */
function localizedPickupPlan(
  pickupPlan: string,
  pickupPlanSource: PickupPlanSource | null,
  guidance: PickupPlanGuidance | null,
  generatedTemplate: string,
  generatedBandTemplate: string
): string {
  if (pickupPlanSource !== "model" || guidance === null) {
    return pickupPlan;
  }
  return guidance.kind === "band"
    ? generatedBandTemplate
    : generatedTemplate.replace("{target}", () => guidance.targetRoleName);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredPickupPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolvePickupPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first pickup plan and open the matching rendered map section. */
export function FirstPickupPlanCallout({ song }: FirstPickupPlanCalloutProps) {
  const calloutId = `workspace-surface-pickup-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stablePickupPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstPickupPlan(song), [song]);
  const [openedPickupPlan, setOpenedPickupPlan] = useState<OpenedPickupPlan | null>(null);
  const [navigationFailed, setNavigationFailed] = useState(false);
  const guidanceKind = named?.pickupPlanGuidance?.kind ?? null;
  const guidanceTargetRoleName =
    named?.pickupPlanGuidance?.kind === "role"
      ? named.pickupPlanGuidance.targetRoleName
      : null;

  useEffect(() => {
    setOpenedPickupPlan(null);
    setNavigationFailed(false);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.landingRoleId,
    named?.pickupPlan,
    named?.pickupPlanSource,
    guidanceKind,
    guidanceTargetRoleName,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstPickupPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstPickupPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstPickupPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedPickupPlan !== null &&
    openedPickupPlan.songIdentity === songIdentity &&
    openedPickupPlan.sectionId === named.sectionId &&
    openedPickupPlan.sectionIndex === named.sectionIndex &&
    openedPickupPlan.landingRoleId === named.landingRoleId &&
    openedPickupPlan.pickupPlan === named.pickupPlan &&
    openedPickupPlan.pickupPlanSource === named.pickupPlanSource &&
    openedPickupPlan.pickupPlanGuidanceKind === guidanceKind &&
    openedPickupPlan.pickupPlanTargetRoleName === guidanceTargetRoleName &&
    openedPickupPlan.atSeconds === named.atSeconds;
  const at = formatPickupPlanTime(named.atSeconds);
  const copyValues: PickupPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatPickupPlanCopy(t("firstPickupPlanOpenAction"), copyValues);
  const body = formatPickupPlanCopy(t("firstPickupPlanBody"), copyValues);
  const armed = formatPickupPlanCopy(t("firstPickupPlanArmed"), copyValues);
  const pickupPlan = localizedPickupPlan(
    named.pickupPlan,
    named.pickupPlanSource,
    named.pickupPlanGuidance,
    t("firstPickupPlanGeneratedGuidance"),
    t("firstPickupPlanGeneratedBandGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstPickupPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstPickupPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{pickupPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolvePickupPlanRenderer(event.currentTarget);
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
            behavior: preferredPickupPlanScrollBehavior()
          });
          setOpenedPickupPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            landingRoleId: named.landingRoleId,
            pickupPlan: named.pickupPlan,
            pickupPlanSource: named.pickupPlanSource,
            pickupPlanGuidanceKind: guidanceKind,
            pickupPlanTargetRoleName: guidanceTargetRoleName,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
      {navigationFailed ? (
        <p role="status" className="mt-2 text-sm leading-6 text-amber-200">
          {t("firstPickupPlanNavigationFailed")}
        </p>
      ) : null}
    </aside>
  );
}
