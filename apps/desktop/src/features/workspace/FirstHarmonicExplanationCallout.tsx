import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import {
  formatHarmonicExplanationTime,
  resolveFirstHarmonicExplanation
} from "./firstHarmonicExplanation";

/** Props for the first harmonic-explanation rehearsal callout. */
export interface FirstHarmonicExplanationCalloutProps {
  song: RehearsalSong;
}

type HarmonicExplanationCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedHarmonicExplanation = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  explanation: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableHarmonicExplanationSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate harmonic-explanation placeholders once so rehearsal data is never rescanned as template syntax. */
function formatHarmonicExplanationCopy(
  template: string,
  values: HarmonicExplanationCopyValues
): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof HarmonicExplanationCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredHarmonicExplanationScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveHarmonicExplanationRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first harmonic explanation and open the matching rendered map section. */
export function FirstHarmonicExplanationCallout({ song }: FirstHarmonicExplanationCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableHarmonicExplanationSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstHarmonicExplanation(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedHarmonicExplanation, setOpenedHarmonicExplanation] =
    useState<OpenedHarmonicExplanation | null>(null);

  useEffect(() => {
    setOpenedHarmonicExplanation(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.explanation,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id="workspace-surface-harmonic-explanation"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstHarmonicExplanationLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstHarmonicExplanationLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstHarmonicExplanationUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedHarmonicExplanation !== null &&
    openedHarmonicExplanation.songIdentity === songIdentity &&
    openedHarmonicExplanation.sectionId === named.section.id &&
    openedHarmonicExplanation.sectionIndex === namedSectionIndex &&
    openedHarmonicExplanation.holdingRoleId === named.holdingRole.id &&
    openedHarmonicExplanation.explanation === named.explanation &&
    openedHarmonicExplanation.atSeconds === named.atSeconds;
  const at = formatHarmonicExplanationTime(named.atSeconds);
  const copyValues: HarmonicExplanationCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatHarmonicExplanationCopy(t("firstHarmonicExplanationOpenAction"), copyValues);
  const body = formatHarmonicExplanationCopy(t("firstHarmonicExplanationBody"), copyValues);
  const armed = formatHarmonicExplanationCopy(t("firstHarmonicExplanationArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-harmonic-explanation"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstHarmonicExplanationLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstHarmonicExplanationLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.explanation}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveHarmonicExplanationRenderer(event.currentTarget);
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
            behavior: preferredHarmonicExplanationScrollBehavior()
          });
          setOpenedHarmonicExplanation({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            explanation: named.explanation,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
