import { createTranslator, detectPreferredLocale } from "../../i18n";

export function EmptyState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <div style={{ textAlign: "center", padding: "64px", color: "#666", backgroundColor: "#fafafa", borderRadius: "8px" }}>
      <p style={{ fontSize: "1.2em", marginBottom: "16px" }}>🎵</p>
      <p>{t("workspaceEmptyState")}</p>
    </div>
  );
}

export function LoadingState() {
  const t = createTranslator(detectPreferredLocale());
  return (
    <div style={{ textAlign: "center", padding: "64px", color: "#666", backgroundColor: "#e6f7ff", borderRadius: "8px" }}>
      <p style={{ fontSize: "1.2em", marginBottom: "16px" }}>⏳</p>
      <p>{t("workspaceLoadingState")}</p>
    </div>
  );
}

export function ErrorState({ error }: { error?: string }) {
  const t = createTranslator(detectPreferredLocale());
  return (
    <div style={{ textAlign: "center", padding: "64px", color: "#a8071a", backgroundColor: "#fff1f0", borderRadius: "8px" }}>
      <p style={{ fontSize: "1.2em", marginBottom: "16px" }}>❌</p>
      <p>{t("workspaceErrorState")}</p>
      {error && <p style={{ fontSize: "0.9em", marginTop: "8px" }}>{error}</p>}
    </div>
  );
}
