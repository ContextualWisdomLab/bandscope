import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatEarCheckTime, resolveFirstEarCheckWithSectionIndex } from "./firstEarCheck";

/** Props for the first ear-check rehearsal callout. */
export interface FirstEarCheckCalloutProps {
  song: RehearsalSong;
}

type EarCheckCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedEarCheck = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Bound the identity fingerprint so hostile or oversized songs cannot stall a render. */
const MAX_EAR_CHECK_FINGERPRINT_SECTIONS = 32;

/** Read one owned data value without invoking an accessor or ordinary Proxy get trap. */
function ownedRuntimeData(value: unknown, key: PropertyKey): unknown {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

/** Summarize bounded owned song content so distinct songs sharing an id do not share armed guidance. */
function earCheckSongFingerprint(song: RehearsalSong): string | null {
  try {
    const runtimeSections = ownedRuntimeData(song, "sections");
    const title = ownedRuntimeData(song, "title");
    if (!Array.isArray(runtimeSections) || typeof title !== "string") {
      return null;
    }
    const sectionCount = ownedRuntimeData(runtimeSections, "length");
    if (
      !Number.isSafeInteger(sectionCount) ||
      (sectionCount as number) < 0 ||
      (sectionCount as number) > MAX_EAR_CHECK_FINGERPRINT_SECTIONS
    ) {
      return null;
    }

    const sections: Array<{ id: string; start: number; end: number }> = [];
    for (let sectionIndex = 0; sectionIndex < (sectionCount as number); sectionIndex += 1) {
      const section = ownedRuntimeData(runtimeSections, sectionIndex);
      const id = ownedRuntimeData(section, "id");
      const timeRange = ownedRuntimeData(section, "timeRange");
      const start = ownedRuntimeData(timeRange, "start");
      const end = ownedRuntimeData(timeRange, "end");
      if (typeof id !== "string" || typeof start !== "number" || typeof end !== "number") {
        return null;
      }
      sections.push({ id, start, end });
    }

    return JSON.stringify({ title, sectionCount, sections });
  } catch {
    return null;
  }
}

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableEarCheckSongId(song: RehearsalSong): string | null {
  const songId = ownedRuntimeData(song, "id");
  return typeof songId === "string" && songId.trim().length > 0 ? songId : null;
}

/**
 * Build the armed-guidance identity from the owned id plus a bounded content fingerprint. Two
 * distinct songs that share an id string therefore stop sharing armed state when their bounded
 * content differs. Oversized or hostile songs fall back to object identity instead of trusting a
 * truncated fingerprint, while immutable copies of ordinary bounded songs keep their guidance.
 */
function stableEarCheckSongIdentity(song: RehearsalSong): unknown {
  const songId = stableEarCheckSongId(song);
  if (songId === null) {
    return song;
  }
  const fingerprint = earCheckSongFingerprint(song);
  return fingerprint === null ? song : `${songId}\u0000${fingerprint}`;
}

/** Interpolate ear-check placeholders once so rehearsal data is never rescanned as template syntax. */
function formatEarCheckCopy(template: string, values: EarCheckCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof EarCheckCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredEarCheckScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Accessible surfaces that own rendered section cells, matched structurally rather than by name. */
const EAR_CHECK_REGION_CELLS_SELECTOR = "[role='region'] [data-section-index]";
const EAR_CHECK_REGION_SELECTOR = "[role='region']";
/** Legacy song-structure hook kept as the last-resort renderer tier for older markup. */
const EAR_CHECK_LEGACY_RENDERER_SELECTOR = '[data-testid="song-structure-grid"]';

/**
 * Return unique accessibility-scoped song-structure surfaces that own rendered section cells.
 * Matching is structural (`role="region"`) and never depends on an accessible-name string, so
 * localized labels cannot break navigation.
 */
function earCheckRegionSurfaces(scope: ParentNode): HTMLElement[] {
  const surfaces = new Set<HTMLElement>();
  for (const cell of scope.querySelectorAll<HTMLElement>(EAR_CHECK_REGION_CELLS_SELECTOR)) {
    const surface = cell.closest<HTMLElement>(EAR_CHECK_REGION_SELECTOR);
    if (surface !== null && scope.contains(surface)) {
      surfaces.add(surface);
    }
  }
  return [...surfaces];
}

/** Return every legacy test-hook renderer inside a scope. */
function earCheckLegacySurfaces(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(EAR_CHECK_LEGACY_RENDERER_SELECTOR)];
}

/**
 * Return the song-structure surfaces a scope owns, collapsing nested identifications of the same
 * map (for example a legacy hook inside its accessibility region) into the outermost surface.
 * Only disjoint surfaces remain, so genuine ambiguity is what fails closed.
 */
function earCheckOwnedSurfaces(scope: ParentNode): HTMLElement[] {
  const candidates = new Set<HTMLElement>([
    ...earCheckRegionSurfaces(scope),
    ...earCheckLegacySurfaces(scope)
  ]);
  return [...candidates].filter(
    (surface) =>
      ![...candidates].some((other) => other !== surface && other.contains(surface))
  );
}

/**
 * Resolve the song-structure renderer owned by this workspace for map navigation.
 *
 * Scoping contract (fail closed):
 * 1. Surfaces are identified structurally first: accessibility regions that own rendered section
 *    cells, with the legacy `[data-testid]` hook accepted only as an additional identification of
 *    the same map, never as the preferred signal.
 * 2. Exactly one surface inside the callout's parent subtree wins; several disjoint local
 *    surfaces abort navigation instead of guessing.
 * 3. Only when the local subtree owns no surface does resolution consider the document, and only
 *    when exactly one global surface exists there. Ambiguous global mounts (for example two
 *    concurrently mounted workspaces whose renderers sit outside the local subtree) therefore
 *    no-op deterministically instead of scrolling an arbitrary surface.
 */
function resolveEarCheckRenderer(origin: HTMLElement): HTMLElement | null {
  const aside = origin.closest("aside");
  if (aside === null || aside.parentElement === null) {
    return null;
  }

  const localSurfaces = earCheckOwnedSurfaces(aside.parentElement);
  if (localSurfaces.length > 1) {
    return null;
  }
  if (localSurfaces.length === 1) {
    return localSurfaces[0] ?? null;
  }

  const globalSurfaces = earCheckOwnedSurfaces(document);
  if (globalSurfaces.length > 1) {
    return null;
  }
  if (globalSurfaces.length === 1) {
    return globalSurfaces[0] ?? null;
  }
  return null;
}

/** Name tonight's first ear check and open the matching rendered map section. */
export function FirstEarCheckCallout({ song }: FirstEarCheckCalloutProps) {
  // Match the surrounding workspace pattern: locale detection and translation are mount-scoped.
  const [locale] = useState(() => detectPreferredLocale());
  const t = useMemo(() => createTranslator(locale), [locale]);
  const landmarkId = useId();
  const resolution = useMemo(() => {
    const songIdentity = stableEarCheckSongIdentity(song);
    const earCheckResolution = resolveFirstEarCheckWithSectionIndex(song);
    return {
      songIdentity,
      earCheck: earCheckResolution?.earCheck ?? null,
      earCheckSectionIndex: earCheckResolution?.sectionIndex ?? -1
    } as const;
  }, [song]);
  const { songIdentity, earCheck, earCheckSectionIndex } = resolution;
  const [openedEarCheck, setOpenedEarCheck] = useState<OpenedEarCheck | null>(null);

  useEffect(() => {
    setOpenedEarCheck(null);
  }, [
    songIdentity,
    earCheckSectionIndex,
    earCheck?.section.id,
    earCheck?.holdingRole?.id,
    earCheck?.atSeconds
  ]);

  if (!earCheck) {
    return (
      <aside
        id={`workspace-surface-ear-check-${landmarkId}`}
        className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
        aria-label={t("firstEarCheckUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstEarCheckLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstEarCheckUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedEarCheck !== null &&
    openedEarCheck.songIdentity === songIdentity &&
    openedEarCheck.sectionId === earCheck.section.id &&
    openedEarCheck.sectionIndex === earCheckSectionIndex &&
    openedEarCheck.holdingRoleId === (earCheck.holdingRole?.id ?? null) &&
    openedEarCheck.atSeconds === earCheck.atSeconds;
  const at = formatEarCheckTime(earCheck.atSeconds);
  const copyValues: EarCheckCopyValues = {
    role: earCheck.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, earCheck.section.label),
    at
  };
  const hasRole = earCheck.holdingRole !== null;
  const actionLabel = formatEarCheckCopy(
    t(hasRole ? "firstEarCheckOpenAction" : "firstEarCheckOpenActionBand"),
    copyValues
  );
  const body = formatEarCheckCopy(t(hasRole ? "firstEarCheckBody" : "firstEarCheckBodyBand"), copyValues);
  const armed = formatEarCheckCopy(t(hasRole ? "firstEarCheckArmed" : "firstEarCheckArmedBand"), copyValues);

  return (
    <aside
      id={`workspace-surface-ear-check-${landmarkId}`}
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4"
      aria-label={t("firstEarCheckLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">{t("firstEarCheckLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      {earCheck.hint ? <p className="mt-1 text-sm leading-6 text-slate-400">{earCheck.hint}</p> : null}
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-amber-300 to-rose-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveEarCheckRenderer(event.currentTarget);
          const target =
            earCheckSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${earCheckSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredEarCheckScrollBehavior()
          });
          setOpenedEarCheck({
            songIdentity,
            sectionId: earCheck.section.id,
            sectionIndex: earCheckSectionIndex,
            holdingRoleId: earCheck.holdingRole?.id ?? null,
            atSeconds: earCheck.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
