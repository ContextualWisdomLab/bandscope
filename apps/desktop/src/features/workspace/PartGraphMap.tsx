import { memo } from "react";
import type { RehearsalSong, RehearsalRole } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { ArrowRight, LogIn, Activity, Coffee, Minus } from "lucide-react";

/** Props required to render the selected role's section-by-section handoff evidence. */
interface PartGraphMapProps {
  song: RehearsalSong;
  activeRoleId: string;
  roleMap: Map<string, RehearsalRole>;
}

/** Render a keyboard-discoverable handoff map without inferring state from missing evidence. */
function PartGraphMapComponent({ song, activeRoleId, roleMap }: PartGraphMapProps) {
  const t = createTranslator(detectPreferredLocale());

  /** Resolve stable display names while preserving unknown role identifiers verbatim. */
  const getRoleNames = (roleIds: string[]): string[] => {
    return roleIds.map((id) => roleMap.get(id)?.name ?? id);
  };

  return (
    <div className="mt-4 rounded-xl border border-teal-300/20 bg-teal-300/[0.08] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="part-graph-title" className="text-xs font-black uppercase tracking-[0.24em] text-teal-200">
          {t("partGraphTitle")}
        </h3>
      </div>
      <div
        role="region"
        tabIndex={0}
        aria-labelledby="part-graph-title"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
      >
        {song.sections.map((section) => {
          const node = section.partGraph.find((candidate) => candidate.role_id === activeRoleId);
          const isActive = node?.is_active === true;
          const handoffFrom = node ? getRoleNames(node.handoff_from) : [];
          const handoffTo = node ? getRoleNames(node.handoff_to) : [];

          return (
            <div
              key={section.id}
              className={`w-64 flex-none shrink-0 snap-start rounded-lg border p-3 ${
                isActive
                  ? "border-teal-300/30 bg-teal-900/30"
                  : "border-white/10 bg-white/5 opacity-80"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-100 capitalize">{section.label}</span>
                {node &&
                  (isActive ? (
                    <span className="flex items-center gap-1 rounded-full border border-teal-300/30 bg-teal-300/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-teal-200">
                      <Activity className="size-3" aria-hidden="true" />
                      {t("partGraphActive")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-slate-300">
                      <Coffee className="size-3" aria-hidden="true" />
                      {t("partGraphResting")}
                    </span>
                  ))}
              </div>

              <div className="space-y-1.5 text-xs text-slate-300">
                {handoffFrom.length > 0 && (
                  <div className="flex items-start gap-1.5 text-amber-100">
                    <LogIn className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="leading-snug">
                      <strong className="mr-1 opacity-70">{t("partGraphTakesOverFrom")}:</strong>
                      {handoffFrom.join(", ")}
                    </span>
                  </div>
                )}

                {handoffTo.length > 0 && (
                  <div className="flex items-start gap-1.5 text-sky-100">
                    <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    <span className="leading-snug">
                      <strong className="mr-1 opacity-70">{t("partGraphHandsOffTo")}:</strong>
                      {handoffTo.join(", ")}
                    </span>
                  </div>
                )}

                {handoffFrom.length === 0 && handoffTo.length === 0 && (
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Minus className="size-3.5" aria-hidden="true" />
                    <span>{t("partGraphNoHandoffs")}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Memoized handoff map for the active rehearsal role. */
export const PartGraphMap = memo(PartGraphMapComponent);
