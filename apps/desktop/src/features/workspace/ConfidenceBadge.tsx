import type { ConfidenceLevel } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

/** Render a localized confidence state with the rehearsal workspace confidence tokens. */
export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const t = createTranslator(detectPreferredLocale());

  let label = "";
  let colorClass = "";

  switch (level) {
    case "low":
      label = t("confidenceLevelLow");
      colorClass =
        "border-[color:var(--bandscope-confidence-low-border)] bg-[var(--bandscope-confidence-low-bg)] text-[color:var(--bandscope-confidence-low-fg)] hover:bg-[var(--bandscope-confidence-low-bg)]";
      break;
    case "medium":
      label = t("confidenceLevelMedium");
      colorClass =
        "border-[color:var(--bandscope-confidence-medium-border)] bg-[var(--bandscope-confidence-medium-bg)] text-[color:var(--bandscope-confidence-medium-fg)] hover:bg-[var(--bandscope-confidence-medium-bg)]";
      break;
    case "high":
      label = t("confidenceLevelHigh");
      colorClass =
        "border-[color:var(--bandscope-confidence-high-border)] bg-[var(--bandscope-confidence-high-bg)] text-[color:var(--bandscope-confidence-high-fg)] hover:bg-[var(--bandscope-confidence-high-bg)]";
      break;
  }

  return (
    <Badge
      variant="outline"
      className={`px-1.5 py-0 h-5 text-[0.65rem] font-bold uppercase tracking-wider ${colorClass}`}
      title={label}
    >
      {label}
    </Badge>
  );
}
