import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatConfirmedHarmonyTime, resolveFirstConfirmedHarmony } from "./firstConfirmedHarmony";

/** Props for the first confirmed-harmony rehearsal callout. */
export interface FirstConfirmedHarmonyCalloutProps {
  song: RehearsalSong;
}

type ConfirmedHarmonyCopyValues = Readonly<Record<"role" | "section" | "at" | "chord", string>>;

type OpenedConfirmedHarmony = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  chord: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableConfirmedHarmonySongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate confirmed-harmony placeholders once so rehearsal data is never rescanned as template syntax. */
function formatConfirmedHarmonyCopy(template: string, values: ConfirmedHarmonyCopyValues): string {
  return template.replace(/\{(role|section|at|chord)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof ConfirmedHarmonyCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredConfirmedHarmonyScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveConfirmedHarmonyRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first confirmed chord and open the matching rendered map section. */
export function FirstConfirmedHarmonyCallout({ song }: FirstConfirmedHarmonyCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableConfirmedHarmonySongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const confirmed = resolveFirstConfirmedHarmony(song);
  const confirmedSectionIndex =
    confirmed && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(confirmed.section)
      : -1;
  const [openedConfirmedHarmony, setOpenedConfirmedHarmony] = useState<OpenedConfirmedHarmony | null>(
    null
  );

  useEffect(() => {
    setOpenedConfirmedHarmony(null);
  }, [
    songIdentity,
    confirmedSectionIndex,
    confirmed?.section.id,
    confirmed?.holdingRole.id,
    confirmed?.chord,
    confirmed?.atSeconds
  ]);

  if (!confirmed) {
    return (
      <aside
        id="workspace-surface-confirmed-harmony"
        className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"
        aria-label={t("firstConfirmedHarmonyUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
          {t("firstConfirmedHarmonyLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstConfirmedHarmonyUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedConfirmedHarmony !== null &&
    openedConfirmedHarmony.songIdentity === songIdentity &&
    openedConfirmedHarmony.sectionId === confirmed.section.id &&
    openedConfirmedHarmony.sectionIndex === confirmedSectionIndex &&
    openedConfirmedHarmony.holdingRoleId === confirmed.holdingRole.id &&
    openedConfirmedHarmony.chord === confirmed.chord &&
    openedConfirmedHarmony.atSeconds === confirmed.atSeconds;
  const at = formatConfirmedHarmonyTime(confirmed.atSeconds);
  const copyValues: ConfirmedHarmonyCopyValues = {
    role: confirmed.holdingRole.name,
    section: translateSectionFormLabel(locale, confirmed.section.label),
    at,
    chord: confirmed.chord
  };
  const actionLabel = formatConfirmedHarmonyCopy(t("firstConfirmedHarmonyOpenAction"), copyValues);
  const body = formatConfirmedHarmonyCopy(t("firstConfirmedHarmonyBody"), copyValues);
  const armed = formatConfirmedHarmonyCopy(t("firstConfirmedHarmonyArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-confirmed-harmony"
      className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"
      aria-label={t("firstConfirmedHarmonyLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
        {t("firstConfirmedHarmonyLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      {confirmed.hint ? <p className="mt-1 text-sm leading-6 text-slate-400">{confirmed.hint}</p> : null}
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-emerald-300 to-cyan-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveConfirmedHarmonyRenderer(event.currentTarget);
          const target =
            confirmedSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(
                  `[data-section-index="${confirmedSectionIndex}"]`
                ) ?? null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredConfirmedHarmonyScrollBehavior()
          });
          setOpenedConfirmedHarmony({
            songIdentity,
            sectionId: confirmed.section.id,
            sectionIndex: confirmedSectionIndex,
            holdingRoleId: confirmed.holdingRole.id,
            chord: confirmed.chord,
            atSeconds: confirmed.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
