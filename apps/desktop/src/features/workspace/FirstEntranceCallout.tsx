import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatEntranceTime, resolveFirstEntrance } from "./firstEntrance";

/** Props for the first-entrance rehearsal callout. */
export interface FirstEntranceCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearEntrance?: (startSeconds: number) => void;
}

type EntranceCopyValues = Readonly<Record<"role" | "section" | "sectionParticle" | "start" | "cue", string>>;

type HeardEntrance = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  roleId: string;
  startSeconds: number;
  cue: string;
}>;

/** Interpolate entrance placeholders once so rehearsal data is never rescanned as template syntax. */
function formatEntranceCopy(template: string, values: EntranceCopyValues): string {
  return template.replace(/\{(role|section|sectionParticle|start|cue)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof EntranceCopyValues;
    return values[key];
  });
}

/** Choose the Korean locative particle for a rendered section label. */
function koreanLocativeParticle(value: string): "로" | "으로" {
  const lastCharacter = [...value].at(-1);
  if (!lastCharacter) {
    return "로";
  }

  const codePoint = lastCharacter.charCodeAt(0);
  if (codePoint < 0xac00 || codePoint > 0xd7a3) {
    return "로";
  }

  const finalSound = (codePoint - 0xac00) % 28;
  return finalSound === 0 || finalSound === 8 ? "로" : "으로";
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredEntranceScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Resolve the renderer-owned song-structure grid without depending on test-only markers. */
function resolveSongStructureGrid(): Element | null {
  const stableGrids = document.querySelectorAll("#workspace-song-structure-grid");
  if (stableGrids.length > 1) {
    return null;
  }
  if (stableGrids.length === 1) {
    return stableGrids.item(0);
  }

  const cueSurfaces = document.querySelectorAll("#workspace-surface-cues");
  if (cueSurfaces.length !== 1) {
    return null;
  }
  const songStructure = cueSurfaces.item(0).nextElementSibling;
  const timelineRegion = songStructure?.querySelector('[role="region"]');
  return timelineRegion?.firstElementChild ?? null;
}

/** Name tonight's first entrance and offer only an action that the current surface can execute. */
export function FirstEntranceCallout({
  song,
  actionMode = "workspace-scroll",
  onHearEntrance
}: FirstEntranceCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const runtimeSong = song as unknown as Partial<RehearsalSong> | null;
  const songId = typeof runtimeSong?.id === "string" ? runtimeSong.id : "";
  const entrance = resolveFirstEntrance(song);
  const entranceSectionIndex =
    entrance && Array.isArray(runtimeSong?.sections)
      ? runtimeSong.sections.findIndex((section) => section === entrance.section)
      : -1;
  const [heardEntrance, setHeardEntrance] = useState<HeardEntrance | null>(null);

  useEffect(() => {
    setHeardEntrance(null);
  }, [
    songId,
    entranceSectionIndex,
    entrance?.section.id,
    entrance?.role.id,
    entrance?.startSeconds,
    entrance?.role.cue.value
  ]);

  if (!entrance) {
    return (
      <aside
        id="workspace-surface-cues"
        className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
        aria-label={t("firstEntranceUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("firstEntranceLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstEntranceUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardEntrance?.songId === songId &&
    heardEntrance.sectionId === entrance.section.id &&
    heardEntrance.sectionIndex === entranceSectionIndex &&
    heardEntrance.roleId === entrance.role.id &&
    heardEntrance.startSeconds === entrance.startSeconds &&
    heardEntrance.cue === entrance.role.cue.value;
  const start = formatEntranceTime(entrance.startSeconds);
  const section = translateSectionFormLabel(locale, entrance.section.label);
  const copyValues: EntranceCopyValues = {
    role: entrance.role.name,
    section,
    sectionParticle: locale === "ko" ? koreanLocativeParticle(section) : "",
    start,
    cue: entrance.role.cue.value
  };
  const actionLabel = formatEntranceCopy(
    t(actionMode === "callback-only" ? "firstEntranceAction" : "firstEntranceOpenAction"),
    copyValues
  );
  const body = formatEntranceCopy(t("firstEntranceBody"), copyValues);
  const armed = formatEntranceCopy(t("firstEntranceArmed"), copyValues);
  const canExecuteAction =
    actionMode === "workspace-scroll" || typeof onHearEntrance === "function";

  /** Record completion only after the owning surface executes the selected entrance action. */
  const markEntranceActionComplete = () => {
    setHeardEntrance({
      songId,
      sectionId: entrance.section.id,
      sectionIndex: entranceSectionIndex,
      roleId: entrance.role.id,
      startSeconds: entrance.startSeconds,
      cue: entrance.role.cue.value
    });
  };

  return (
    <aside
      id="workspace-surface-cues"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4"
      aria-label={t("firstEntranceLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">{t("firstEntranceLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-cyan-400 to-violet-500 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearEntrance!(entrance.startSeconds);
              markEntranceActionComplete();
              return;
            }
            const grid = resolveSongStructureGrid();
            const target = entranceSectionIndex >= 0 ? grid?.children.item(entranceSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredEntranceScrollBehavior()
            });
            markEntranceActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
