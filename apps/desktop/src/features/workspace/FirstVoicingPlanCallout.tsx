import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatVoicingPlanTime, resolveFirstVoicingPlan } from "./firstVoicingPlan";

/** Props for the first voicing-plan rehearsal callout. */
export interface FirstVoicingPlanCalloutProps {
  song: RehearsalSong;
}

type VoicingPlanCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedVoicingPlan = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  voicingPlan: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableVoicingPlanSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate voicing-plan placeholders once so rehearsal data is never rescanned as template syntax. */
function formatVoicingPlanCopy(template: string, values: VoicingPlanCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof VoicingPlanCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredVoicingPlanScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveVoicingPlanRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first voicing plan and open the matching rendered map section. */
export function FirstVoicingPlanCallout({ song }: FirstVoicingPlanCalloutProps) {
  const calloutId = `workspace-surface-voicing-plan-${useId()}`;
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stableVoicingPlanSongIdentity(song);
  const named = useMemo(() => resolveFirstVoicingPlan(song), [song]);
  const [openedVoicingPlan, setOpenedVoicingPlan] = useState<OpenedVoicingPlan | null>(null);

  useEffect(() => {
    setOpenedVoicingPlan(null);
  }, [
    songIdentity,
    named?.sectionIndex,
    named?.sectionId,
    named?.holdingRoleId,
    named?.voicingPlan,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={calloutId}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstVoicingPlanLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstVoicingPlanLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstVoicingPlanUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedVoicingPlan !== null &&
    openedVoicingPlan.songIdentity === songIdentity &&
    openedVoicingPlan.sectionId === named.sectionId &&
    openedVoicingPlan.sectionIndex === named.sectionIndex &&
    openedVoicingPlan.holdingRoleId === named.holdingRoleId &&
    openedVoicingPlan.voicingPlan === named.voicingPlan &&
    openedVoicingPlan.atSeconds === named.atSeconds;
  const at = formatVoicingPlanTime(named.atSeconds);
  const copyValues: VoicingPlanCopyValues = {
    role: named.holdingRoleName,
    section: translateSectionFormLabel(locale, named.sectionLabel),
    at
  };
  const actionLabel = formatVoicingPlanCopy(t("firstVoicingPlanOpenAction"), copyValues);
  const body = formatVoicingPlanCopy(t("firstVoicingPlanBody"), copyValues);
  const armed = formatVoicingPlanCopy(t("firstVoicingPlanArmed"), copyValues);

  return (
    <aside
      id={calloutId}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstVoicingPlanLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstVoicingPlanLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.voicingPlan}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveVoicingPlanRenderer(event.currentTarget);
          const target =
            renderer?.querySelector<HTMLElement>(
              `[data-section-index="${named.sectionIndex}"]`
            ) ?? null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredVoicingPlanScrollBehavior()
          });
          setOpenedVoicingPlan({
            songIdentity,
            sectionId: named.sectionId,
            sectionIndex: named.sectionIndex,
            holdingRoleId: named.holdingRoleId,
            voicingPlan: named.voicingPlan,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
