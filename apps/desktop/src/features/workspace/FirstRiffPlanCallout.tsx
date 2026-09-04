import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatRiffPlanTime, resolveFirstRiffPlan } from "./firstRiffPlan";

/** Props for the first riff-plan rehearsal callout. */
export interface FirstRiffPlanCalloutProps {
  song: RehearsalSong;
}

type RiffPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedRiffPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  riffPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableRiffPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate riff-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatRiffPlanCopy(template: string, values: RiffPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof RiffPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredRiffPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveRiffPlanRenderer(origin: HTMLElement): HTMLElement | null {
  const selector = "#workspace-song-structure-grid";
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

/** Name tonight's first riff plan and open the matching rendered map section. */
export function FirstRiffPlanCallout({ song }: FirstRiffPlanCalloutProps) {
  const calloutId = `workspace-surface-riff-plan-${useId()}`;
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableRiffPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstRiffPlan(song), [song]);
  const namedSectionIndex = named?.sectionIndex ?? -1;
  const [openedRiffPlan, setOpenedRiffPlan] = useState<OpenedRiffPlan | null>(null);

  useEffect(() => {
    setOpenedRiffPlan(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.riffPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstRiffPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstRiffPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstRiffPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedRiffPlan !== null &&
    openedRiffPlan.songIdentity === songIdentity &&
    openedRiffPlan.sectionId === named.section.id &&
    openedRiffPlan.sectionIndex === namedSectionIndex &&
    openedRiffPlan.holdingRoleId === named.holdingRole.id &&
    openedRiffPlan.riffPlan === named.riffPlan &&
    openedRiffPlan.atSeconds === named.atSeconds;
  const at = formatRiffPlanTime(named.atSeconds);
  const copyValues: RiffPlanCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatRiffPlanCopy(t("firstRiffPlanOpenAction"), copyValues);
  const body = formatRiffPlanCopy(t("firstRiffPlanBody"), copyValues);
  const armed = formatRiffPlanCopy(t("firstRiffPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstRiffPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstRiffPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.riffPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveRiffPlanRenderer(event.currentTarget);
          const target =
            namedSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${namedSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredRiffPlanScrollBehavior()
          });
          setOpenedRiffPlan({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            riffPlan: named.riffPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
