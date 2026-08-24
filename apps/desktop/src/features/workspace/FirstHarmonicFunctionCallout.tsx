import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatHarmonicFunctionTime, resolveFirstHarmonicFunction } from "./firstHarmonicFunction";

/** Props for the first harmonic-function rehearsal callout. */
export interface FirstHarmonicFunctionCalloutProps {
  song: RehearsalSong;
}

type HarmonicFunctionCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedHarmonicFunction = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  functionLabel: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableHarmonicFunctionSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate harmonic-function placeholders once so rehearsal data is never rescanned as template syntax. */
function formatHarmonicFunctionCopy(template: string, values: HarmonicFunctionCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof HarmonicFunctionCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredHarmonicFunctionScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveHarmonicFunctionRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first harmonic function and open the matching rendered map section. */
export function FirstHarmonicFunctionCallout({ song }: FirstHarmonicFunctionCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableHarmonicFunctionSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstHarmonicFunction(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedHarmonicFunction, setOpenedHarmonicFunction] = useState<OpenedHarmonicFunction | null>(null);

  useEffect(() => {
    setOpenedHarmonicFunction(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.functionLabel,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id="workspace-surface-harmonic-function"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstHarmonicFunctionUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstHarmonicFunctionLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstHarmonicFunctionUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedHarmonicFunction !== null &&
    openedHarmonicFunction.songIdentity === songIdentity &&
    openedHarmonicFunction.sectionId === named.section.id &&
    openedHarmonicFunction.sectionIndex === namedSectionIndex &&
    openedHarmonicFunction.holdingRoleId === named.holdingRole.id &&
    openedHarmonicFunction.functionLabel === named.functionLabel &&
    openedHarmonicFunction.atSeconds === named.atSeconds;
  const at = formatHarmonicFunctionTime(named.atSeconds);
  const copyValues: HarmonicFunctionCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatHarmonicFunctionCopy(t("firstHarmonicFunctionOpenAction"), copyValues);
  const body = formatHarmonicFunctionCopy(t("firstHarmonicFunctionBody"), copyValues);
  const armed = formatHarmonicFunctionCopy(t("firstHarmonicFunctionArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-harmonic-function"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstHarmonicFunctionLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstHarmonicFunctionLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.functionLabel}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveHarmonicFunctionRenderer(event.currentTarget);
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
            behavior: preferredHarmonicFunctionScrollBehavior()
          });
          setOpenedHarmonicFunction({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            functionLabel: named.functionLabel,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
