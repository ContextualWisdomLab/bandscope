import type { ConfidenceLevel } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";
import { Badge } from "@/components/ui/badge";

export type ConfidenceBadgeSize = "compact" | "default";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  size?: ConfidenceBadgeSize;
}

/** Render a localized confidence state using the Figma-backed workspace confidence variants. */
export function ConfidenceBadge({ level, size = "compact" }: ConfidenceBadgeProps) {
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

  const heightClass =
    size === "default"
      ? "h-[var(--bandscope-confidence-default-height)]"
      : "h-[var(--bandscope-confidence-compact-height)]";

  return (
    <Badge
      variant="outline"
      className={`${heightClass} px-1.5 py-0 text-[0.65rem] font-bold uppercase tracking-wider ${colorClass}`}
      title={label}
    >
      {label}
    </Badge>
  );
}
