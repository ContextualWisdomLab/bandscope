import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatSetupNoteTime, resolveFirstSetupNote } from "./firstSetupNote";

/** Props for the first setup-note rehearsal callout. */
export interface FirstSetupNoteCalloutProps {
  song: RehearsalSong;
}

type SetupNoteCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type OpenedSetupNote = Readonly<{
  songIdentity: unknown;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string;
  setupNote: string;
  atSeconds: number;
}>;

/** Read a stable owned song id, falling back to object identity for untrusted identity metadata. */
function stableSetupNoteSongIdentity(song: RehearsalSong): unknown {
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

/** Interpolate setup-note placeholders once so rehearsal data is never rescanned as template syntax. */
function formatSetupNoteCopy(template: string, values: SetupNoteCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof SetupNoteCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredSetupNoteScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the song-structure renderer owned by this workspace, failing closed on ambiguous mounts. */
function resolveSetupNoteRenderer(origin: HTMLElement): HTMLElement | null {
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

/** Name tonight's first setup note and open the matching rendered map section. */
export function FirstSetupNoteCallout({ song }: FirstSetupNoteCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentity = stableSetupNoteSongIdentity(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const named = resolveFirstSetupNote(song);
  const namedSectionIndex =
    named && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(named.section)
      : -1;
  const [openedSetupNote, setOpenedSetupNote] = useState<OpenedSetupNote | null>(null);

  useEffect(() => {
    setOpenedSetupNote(null);
  }, [
    songIdentity,
    namedSectionIndex,
    named?.section.id,
    named?.holdingRole.id,
    named?.setupNote,
    named?.atSeconds
  ]);

  if (!named) {
    return (
      <aside
        id="workspace-surface-setup-note"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstSetupNoteLabel")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          {t("firstSetupNoteLabel")}
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstSetupNoteUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedSetupNote !== null &&
    openedSetupNote.songIdentity === songIdentity &&
    openedSetupNote.sectionId === named.section.id &&
    openedSetupNote.sectionIndex === namedSectionIndex &&
    openedSetupNote.holdingRoleId === named.holdingRole.id &&
    openedSetupNote.setupNote === named.setupNote &&
    openedSetupNote.atSeconds === named.atSeconds;
  const at = formatSetupNoteTime(named.atSeconds);
  const copyValues: SetupNoteCopyValues = {
    role: named.holdingRole.name,
    section: translateSectionFormLabel(locale, named.section.label),
    at
  };
  const actionLabel = formatSetupNoteCopy(t("firstSetupNoteOpenAction"), copyValues);
  const body = formatSetupNoteCopy(t("firstSetupNoteBody"), copyValues);
  const armed = formatSetupNoteCopy(t("firstSetupNoteArmed"), copyValues);

  return (
    <aside
      id="workspace-surface-setup-note"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstSetupNoteLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
        {t("firstSetupNoteLabel")}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{named.setupNote}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-cyan-300 to-emerald-300 font-black text-slate-950"
        onClick={(event) => {
          const renderer = resolveSetupNoteRenderer(event.currentTarget);
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
            behavior: preferredSetupNoteScrollBehavior()
          });
          setOpenedSetupNote({
            songIdentity,
            sectionId: named.section.id,
            sectionIndex: namedSectionIndex,
            holdingRoleId: named.holdingRole.id,
            setupNote: named.setupNote,
            atSeconds: named.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
