import type { ConfidenceLevel } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

/** Documented. */
export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const t = createTranslator(detectPreferredLocale());
  
  let label = "";
  let colorClass = "";
  
  switch (level) {
    case "low":
      label = t("confidenceLevelLow");
      colorClass = "bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200";
      break;
    case "medium":
      label = t("confidenceLevelMedium");
      colorClass = "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200";
      break;
    case "high":
      label = t("confidenceLevelHigh");
      colorClass = "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200";
      break;
  }

  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0 h-5 text-[0.65rem] font-bold uppercase tracking-wider ${colorClass}`}
      title={`${t("roleConfidence")}: ${label}`}
    >
      {label}
    </Badge>
  );
}
