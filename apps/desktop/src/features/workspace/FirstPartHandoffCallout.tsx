import { useEffect, useId, useMemo, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatPartHandoffTime, resolveFirstPartHandoff } from "./firstPartHandoff";

/** Props for the first part-handoff rehearsal callout. */
export interface FirstPartHandoffCalloutProps {
  song: RehearsalSong;
}

type PartHandoffCopyValues = Readonly<Record<"from" | "to" | "section" | "at", string>>;

type OpenedPartHandoff = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  givingRoleId: string;
  receivingRoleId: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stablePartHandoffSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate part-handoff placeholders once so rehearsal data is never rescanned as template syntax. */
function formatPartHandoffCopy(template: string, values: PartHandoffCopyValues): string {
  return template.replace(/\{(from|to|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof PartHandoffCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredPartHandoffScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolvePartHandoffRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first part handoff and open the matching rendered map section. */
export function FirstPartHandoffCallout({ song }: FirstPartHandoffCalloutProps) {
  const calloutId = useId();
  const locale = useMemo(() => detectPreferredLocale(), []);
  const t = useMemo(() => createTranslator(locale), [locale]);
  const songIdentity = stablePartHandoffSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = useMemo(() => resolveFirstPartHandoff(song), [song]);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedPartHandoff, setOpenedPartHandoff] = useState<OpenedPartHandoff | null>(null);

  useEffect(() => {
    setOpenedPartHandoff(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.givingRole.id,
    named?.receivingRole.id,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id={`workspace-surface-part-handoff-${calloutId}`}
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstPartHandoffLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstPartHandoffLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstPartHandoffUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedPartHandoff !== null &&
    openedPartHandoff.songIdentity === songIdentity &&
    openedPartHandoff.sectionId === named.section.id &&
    openedPartHandoff.sectionIndex === namedSectionIndex &&
    openedPartHandoff.givingRoleId === named.givingRole.id &&
    openedPartHandoff.receivingRoleId === named.receivingRole.id &&
    openedPartHandoff.atSeconds === named.atSeconds;
  const at = formatPartHandoffTime(named.atSeconds);
  const copyValues: PartHandoffCopyValues = {
    from: named.givingName,
    to: named.receivingName,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatPartHandoffCopy(t("firstPartHandoffOpenAction"), copyValues);
  const body = formatPartHandoffCopy(t("firstPartHandoffBody"), copyValues);
  const armed = formatPartHandoffCopy(t("firstPartHandoffArmed"), copyValues);

  return (
    <aside
      id={`workspace-surface-part-handoff-${calloutId}`}
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstPartHandoffLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstPartHandoffLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolvePartHandoffRenderer(event.currentTarget);
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
            behavior: preferredPartHandoffScrollBehavior()
          });
          setOpenedPartHandoff({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            givingRoleId: named.givingRole.id,
            receivingRoleId: named.receivingRole.id,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
