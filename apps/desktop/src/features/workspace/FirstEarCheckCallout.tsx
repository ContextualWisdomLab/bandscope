import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatEarCheckTime, resolveFirstEarCheck } from "./firstEarCheck";

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

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableEarCheckSongIdentity(song: RehearsalSong): unknown {
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

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveEarCheckRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first ear check and open the matching rendered map section. */
export function FirstEarCheckCallout({ song }: FirstEarCheckCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableEarCheckSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const earCheck = resolveFirstEarCheck(song);
  const earCheckSectionIndex =
    earCheck && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(earCheck.section)
      : -1;
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
        id="workspace-surface-ear-check"
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
      id="workspace-surface-ear-check"
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
