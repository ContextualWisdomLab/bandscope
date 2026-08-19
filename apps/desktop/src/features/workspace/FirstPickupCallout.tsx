import { useEffect, useState } from "react";
import type { RehearsalSong } from "@bandscope/shared-types";
import { Button } from "@/components/ui/button";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { formatPickupTime, resolveFirstPickupHandoff } from "./firstPickupHandoff";

/** Props for the first-pickup rehearsal callout. */
export interface FirstPickupCalloutProps {
  song: RehearsalSong;
  actionMode?: "workspace-scroll" | "callback-only";
  onHearPickup?: (atSeconds: number) => void;
}

type PickupCopyValues = Readonly<Record<"from" | "to" | "section" | "at", string>>;

type HeardPickup = Readonly<{
  songId: string;
  sectionId: string;
  sectionIndex: number;
  fromRoleId: string | null;
  toRoleId: string;
  atSeconds: number;
}>;

/** Interpolate pickup placeholders once so rehearsal data is never rescanned as template syntax. */
function formatPickupCopy(template: string, values: PickupCopyValues): string {
  return template.replace(/\{(from|to|section|at)\}/g, (placeholder) => {
    const key = placeholder.slice(1, -1) as keyof PickupCopyValues;
    return values[key] ?? placeholder;
  });
}

/** Use immediate scrolling when the operating system requests reduced motion. */
function preferredPickupScrollBehavior(): ScrollBehavior {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** Name tonight's first pickup and offer only an action that the current surface can execute. */
export function FirstPickupCallout({
  song,
  actionMode = "workspace-scroll",
  onHearPickup
}: FirstPickupCalloutProps) {
  const t = createTranslator(detectPreferredLocale());
  const pickup = resolveFirstPickupHandoff(song);
  const pickupSectionIndex = pickup ? song.sections.indexOf(pickup.section) : -1;
  const [heardPickup, setHeardPickup] = useState<HeardPickup | null>(null);

  useEffect(() => {
    setHeardPickup(null);
  }, [
    song.id,
    pickupSectionIndex,
    pickup?.section.id,
    pickup?.fromRole?.id,
    pickup?.toRole.id,
    pickup?.atSeconds
  ]);

  if (!pickup) {
    return (
      <aside
        id="workspace-surface-pickup"
        className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"
        aria-label={t("firstPickupUnavailable")}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">{t("firstPickupLabel")}</p>
        <p className="mt-2 text-sm leading-6 text-slate-300">{t("firstPickupUnavailable")}</p>
      </aside>
    );
  }

  const heard =
    heardPickup?.songId === song.id &&
    heardPickup.sectionId === pickup.section.id &&
    heardPickup.sectionIndex === pickupSectionIndex &&
    heardPickup.fromRoleId === (pickup.fromRole?.id ?? null) &&
    heardPickup.toRoleId === pickup.toRole.id &&
    heardPickup.atSeconds === pickup.atSeconds;
  const at = formatPickupTime(pickup.atSeconds);
  const copyValues: PickupCopyValues = {
    from: pickup.fromRole?.name ?? "",
    to: pickup.toRole.name,
    section: pickup.section.label,
    at
  };
  const hasFrom = pickup.fromRole !== null;
  const actionLabel = formatPickupCopy(
    t(
      actionMode === "callback-only"
        ? hasFrom
          ? "firstPickupAction"
          : "firstPickupActionSolo"
        : hasFrom
          ? "firstPickupOpenAction"
          : "firstPickupOpenActionSolo"
    ),
    copyValues
  );
  const body = formatPickupCopy(t(hasFrom ? "firstPickupBody" : "firstPickupBodySolo"), copyValues);
  const armed = formatPickupCopy(t(hasFrom ? "firstPickupArmed" : "firstPickupArmedSolo"), copyValues);
  const canExecuteAction = actionMode === "workspace-scroll" || typeof onHearPickup === "function";
  /** Record completion only after the owning surface has executed the selected pickup action. */
  const markPickupActionComplete = () => {
    setHeardPickup({
      songId: song.id,
      sectionId: pickup.section.id,
      sectionIndex: pickupSectionIndex,
      fromRoleId: pickup.fromRole?.id ?? null,
      toRoleId: pickup.toRole.id,
      atSeconds: pickup.atSeconds
    });
  };

  return (
    <aside
      id="workspace-surface-pickup"
      className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4"
      aria-label={t("firstPickupLabel")}
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">{t("firstPickupLabel")}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{heard ? armed : body}</p>
      {canExecuteAction ? (
        <Button
          type="button"
          className="mt-3 min-h-11 bg-gradient-to-r from-emerald-300 to-cyan-400 font-black text-slate-950"
          onClick={() => {
            if (actionMode === "callback-only") {
              onHearPickup!(pickup.atSeconds);
              markPickupActionComplete();
              return;
            }
            const grid = document.querySelector('[data-testid="song-structure-grid"]');
            const target = pickupSectionIndex >= 0 ? grid?.children.item(pickupSectionIndex) : null;
            if (typeof target?.scrollIntoView !== "function") {
              return;
            }
            target.scrollIntoView({
              block: "nearest",
              behavior: preferredPickupScrollBehavior()
            });
            markPickupActionComplete();
          }}
        >
          {actionLabel}
        </Button>
      ) : null}
    </aside>
  );
}
