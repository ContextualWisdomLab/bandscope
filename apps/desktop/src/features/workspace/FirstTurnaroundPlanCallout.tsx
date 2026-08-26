import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatTurnaroundPlanTime, resolveFirstTurnaroundPlan } from "./firstTurnaroundPlan";

/** Props for the first turnaround-plan rehearsal callout. */
export interface FirstTurnaroundPlanCalloutProps {
  song: RehearsalSong;
}

type TurnaroundPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;
type TurnaroundPlanSource = "model" | "user";

type OpenedTurnaroundPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  landingRoleId: string;
  turnaroundPlan: string;
  turnaroundPlanSource: TurnaroundPlanSource | null;
  atSeconds: number;
}>;

const GENERATED_ACTIVITY_TURNAROUND_PLAN =
  /^Turn these last bars with (.+); land the downbeat together\.$/u;
const GENERATED_ACTIVITY_TURNAROUND_PLAN_BAND_TARGET = "the rest of the band";

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableTurnaroundPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate turnaround-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatTurnaroundPlanCopy(template: string, values: TurnaroundPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof TurnaroundPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Localize only explicit model-owned engine guidance; preserve user and legacy guidance verbatim. */
function localizedTurnaroundPlan(
  turnaroundPlan: string,
  turnaroundPlanSource: TurnaroundPlanSource | null,
  generatedTemplate: string,
  generatedBandTemplate: string
): string {
  if (turnaroundPlanSource !== "model") {
    return turnaroundPlan;
  }
  const match = GENERATED_ACTIVITY_TURNAROUND_PLAN.exec(turnaroundPlan);
  const targetRole = match?.[1]?.trim() ?? "";
  if (targetRole.length === 0) {
    return turnaroundPlan;
  }
  if (targetRole === GENERATED_ACTIVITY_TURNAROUND_PLAN_BAND_TARGET) {
    return generatedBandTemplate;
  }
  return generatedTemplate.replace("{target}", () => targetRole);
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredTurnaroundPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveTurnaroundPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first turnaround plan and open the matching rendered map section. */
export function FirstTurnaroundPlanCallout({ song }: FirstTurnaroundPlanCalloutProps) {
  const calloutId = `workspace-surface-turnaround-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableTurnaroundPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstTurnaroundPlan(song), [song]);
  const [openedTurnaroundPlan, setOpenedTurnaroundPlan] = useState<OpenedTurnaroundPlan | null>(null);

  useEffect(() => {
    setOpenedTurnaroundPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.landingRoleId,
    named?.turnaroundPlan,
    named?.turnaroundPlanSource,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstTurnaroundPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstTurnaroundPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstTurnaroundPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedTurnaroundPlan !== null &&
    openedTurnaroundPlan.songIdentity === songIdentity &&
    openedTurnaroundPlan.sectionId === named.sectionId &&
    openedTurnaroundPlan.sectionIndex === named.sectionIndex &&
    openedTurnaroundPlan.landingRoleId === named.landingRoleId &&
    openedTurnaroundPlan.turnaroundPlan === named.turnaroundPlan &&
    openedTurnaroundPlan.turnaroundPlanSource === named.turnaroundPlanSource &&
    openedTurnaroundPlan.atSeconds === named.atSeconds;
  const at = formatTurnaroundPlanTime(named.atSeconds);
  const copyValues: TurnaroundPlanCopyValues = {
    role: named.landingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatTurnaroundPlanCopy(t("firstTurnaroundPlanOpenAction"), copyValues);
  const body = formatTurnaroundPlanCopy(t("firstTurnaroundPlanBody"), copyValues);
  const armed = formatTurnaroundPlanCopy(t("firstTurnaroundPlanArmed"), copyValues);
  const turnaroundPlan = localizedTurnaroundPlan(
    named.turnaroundPlan,
    named.turnaroundPlanSource,
    t("firstTurnaroundPlanGeneratedGuidance"),
    t("firstTurnaroundPlanGeneratedBandGuidance")
  );

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstTurnaroundPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstTurnaroundPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{turnaroundPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveTurnaroundPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredTurnaroundPlanScrollBehavior()
          });
          setOpenedTurnaroundPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            landingRoleId: named.landingRoleId,
            turnaroundPlan: named.turnaroundPlan,
            turnaroundPlanSource: named.turnaroundPlanSource,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
