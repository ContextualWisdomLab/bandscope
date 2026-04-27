import type { ConfidenceLevel } from "@bandscope/shared-types";
import { createTranslator, detectPreferredLocale } from "../../i18n";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

/** Documented. */
export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const t = createTranslator(detectPreferredLocale());
  
  let label = "";
  let color = "";
  
  switch (level) {
    case "low":
      label = t("confidenceLevelLow");
      color = "#ff4d4f"; // Red-ish for warning
      break;
    case "medium":
      label = t("confidenceLevelMedium");
      color = "#faad14"; // Orange/Yellow
      break;
    case "high":
      label = t("confidenceLevelHigh");
      color = "#52c41a"; // Green
      break;
  }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: "bold",
        color: "#fff",
        backgroundColor: color,
        marginLeft: "8px",
      }}
      title={`Confidence: ${level}`}
    >
      {label}
    </span>
  );
}
