import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatOpenCommentTime, resolveFirstOpenComment } from "./firstOpenComment";

/** Props for the first-open-comment rehearsal callout. */
export interface FirstOpenCommentCalloutProps {
  song: RehearsalSong;
}

type OpenCommentCopyValues = Readonly<Record<"author" | "role" | "section" | "at", string>>;

type OpenedOpenComment = Readonly<{
  songIdentifier: string | null;
  commentId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Read a stable song id only when runtime data owns it as a plain string value. */
function ownedSongIdentifier(song: RehearsalSong): string | null {
  if (song === null || typeof song !== "object" || Array.isArray(song)) {
    return null;
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(song, "id");
  } catch {
    return null;
  }
  return descriptor !== undefined &&
    Object.prototype.hasOwnProperty.call(descriptor, "value") &&
    typeof descriptor.value === "string"
    ? descriptor.value
    : null;
}

/** Interpolate comment placeholders once so rehearsal data is never rescanned as template syntax. */
function formatOpenCommentCopy(template: string, values: OpenCommentCopyValues): string {
  return template.replace(/\{(author|role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof OpenCommentCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredOpenCommentScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first open rehearsal comment and open the matching rendered map section. */
export function FirstOpenCommentCallout({ song }: FirstOpenCommentCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const songIdentifier = ownedSongIdentifier(song);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const openComment = resolveFirstOpenComment(song);
  const openCommentSectionIndex =
    openComment && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.indexOf(openComment.section)
      : -1;
  const [openedOpenComment, setOpenedOpenComment] = useState<OpenedOpenComment | null>(null);

  useEffect(() => {
    setOpenedOpenComment(null);
  }, [
    songIdentifier,
    openCommentSectionIndex,
    openComment?.comment.id,
    openComment?.section.id,
    openComment?.holdingRole?.id,
    openComment?.atSeconds
  ]);

  if (!openComment) {
    return (
      <aside
        id="workspace-surface-open-comment"
        className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
        aria-label={t("firstOpenCommentUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstOpenCommentLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstOpenCommentUnavailable")}</p>
      </aside>
    );
  }

  const opened =
    openedOpenComment !== null &&
    openedOpenComment.songIdentifier === songIdentifier &&
    openedOpenComment.commentId === openComment.comment.id &&
    openedOpenComment.sectionId === openComment.section.id &&
    openedOpenComment.sectionIndex === openCommentSectionIndex &&
    openedOpenComment.holdingRoleId === (openComment.holdingRole?.id ?? null) &&
    openedOpenComment.atSeconds === openComment.atSeconds;
  const at = formatOpenCommentTime(openComment.atSeconds);
  const copyValues: OpenCommentCopyValues = {
    author: openComment.author,
    role: openComment.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, openComment.section.label),
    at
  };
  const hasRole = openComment.holdingRole !== null;
  const actionLabel = formatOpenCommentCopy(
    t(hasRole ? "firstOpenCommentOpenAction" : "firstOpenCommentOpenActionBand"),
    copyValues
  );
  const body = formatOpenCommentCopy(
    t(hasRole ? "firstOpenCommentBody" : "firstOpenCommentBodyBand"),
    copyValues
  );
  const armed = formatOpenCommentCopy(
    t(hasRole ? "firstOpenCommentArmed" : "firstOpenCommentArmedBand"),
    copyValues
  );

  return (
    <aside
      id="workspace-surface-open-comment"
      className="rounded-2xl border border-sky-300/20 bg-sky-300/[0.06] p-4"
      aria-label={t("firstOpenCommentLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-200">{t("firstOpenCommentLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{opened ? armed : body}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{openComment.hint}</p>
      <Button
        type="button"
        className="mt-3 min-h-11 bg-gradient-to-r from-sky-300 to-cyan-300 font-black text-slate-950"
        onClick={() => {
          const renderer = document.querySelector<HTMLElement>('[data-testid="song-structure-grid"]');
          const target =
            openCommentSectionIndex >= 0
              ? (renderer?.querySelector<HTMLElement>(`[data-section-index="${openCommentSectionIndex}"]`) ??
                null)
              : null;
          if (typeof target?.scrollIntoView !== "function") {
            return;
          }
          target.scrollIntoView({
            block: "nearest",
            behavior: preferredOpenCommentScrollBehavior()
          });
          setOpenedOpenComment({
            songIdentifier,
            commentId: openComment.comment.id,
            sectionId: openComment.section.id,
            sectionIndex: openCommentSectionIndex,
            holdingRoleId: openComment.holdingRole?.id ?? null,
            atSeconds: openComment.atSeconds
          });
        }}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
