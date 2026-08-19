import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import {
  createTranslator,
  detectPreferredLocale,
  translateSectionFormLabel
} from "../../i18n";
import { formatBridgeTime, resolveFirstBridge } from "./firstBridge";

/** Props for the first-bridge rehearsal callout. */
export interface FirstBridgeCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearBridge?: (atSeconds: number) => void;
}

type BridgeCopyValues = Readonly<Record<"role" | "section" | "at", string>>;

type HeardBridge = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  holdingRoleId: string | null;
  atSeconds: number;
}>;

/** Interpolate bridge placeholders once so rehearsal data is never rescanned as template syntax. */
function formatBridgeCopy(template: string, values: BridgeCopyValues): string {
  return template.replace(/\{(role|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof BridgeCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredBridgeScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first labeled bridge and offer only an action that the current surface can execute. */
export function FirstBridgeCallout({
  song,
  actionMode = "workspace-scroll",
  onHearBridge
}: FirstBridgeCalloutProps) {
  const locale = detectPreferredLocale();
  const t = createTranslator(locale);
  const bridge = resolveFirstBridge(song);
  const bridgeSectionIndex = bridge ? song.sections.indexOf(bridge.section) : -1;
  const [heardBridge, setHeardBridge] = useState<HeardBridge | null>(null);

  useEffect(() => {
    setHeardBridge(null);
  }, [song?.id, bridgeSectionIndex, bridge?.section.id, bridge?.holdingRole?.id, bridge?.atSeconds]);

  if (!bridge) {
    return (
      <aside
        id="workspace-surface-bridge"
        className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4"
        aria-label={t("firstBridgeUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("firstBridgeLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstBridgeUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardBridge?.songId === song.id &&
    heardBridge.sectionId === bridge.section.id &&
    heardBridge.sectionIndex === bridgeSectionIndex &&
    heardBridge.holdingRoleId === (bridge.holdingRole?.id ?? null) &&
    heardBridge.atSeconds === bridge.atSeconds;
  const at = formatBridgeTime(bridge.atSeconds);
  const copyValues: BridgeCopyValues = {
    role: bridge.holdingRole?.name ?? "",
    section: translateSectionFormLabel(locale, bridge.section.label),
    at
  };
  const hasRole = bridge.holdingRole !== null;
  const actionLabel = formatBridgeCopy(
    t(
      actionMode === "callback-only"
        ? hasRole
          ? "firstBridgeAction"
          : "firstBridgeActionBand"
        : hasRole
          ? "firstBridgeOpenAction"
          : "firstBridgeOpenActionBand"
    ),
    copyValues
  );
  const body = formatBridgeCopy(t(hasRole ? "firstBridgeBody" : "firstBridgeBodyBand"), copyValues);
  const armed = formatBridgeCopy(t(hasRole ? "firstBridgeArmed" : "firstBridgeArmedBand"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearBridge === "function";
  /** Record completion only after the owning surface has executed the selected bridge action. */
  const markBridgeActionComplete = () => {
    setHeardBridge({
      songId: song.id,
      sectionId: bridge.section.id,
      sectionIndex: bridgeSectionIndex,
      holdingRoleId: bridge.holdingRole?.id ?? null,
      atSeconds: bridge.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-bridge"
      className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4"
      aria-label={t("firstBridgeLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-fuchsia-200">{t("firstBridgeLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-fuchsia-300 to-amber-300 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearBridge!(bridge.atSeconds);
              markBridgeActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = bridgeSectionIndex >= 0 ? grid?.children.item(bridgeSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredBridgeScrollBehavior()
            });
            markBridgeActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
