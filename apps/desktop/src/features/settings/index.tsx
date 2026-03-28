import { SUPPORTED_AUDIO_FORMATS } from "@bandscope/shared-types";

/** Documented. */
export function SettingsFeature(props: { title: string }) {
  const { title } = props;

  return (
    <section style={{ padding: "24px" }}>
      <h2>{title}</h2>
      <div style={{ maxWidth: "480px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "1em", margin: "0 0 8px 0" }}>Supported Audio Formats</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {SUPPORTED_AUDIO_FORMATS.map((format) => (
              <span
                key={format}
                style={{
                  padding: "4px 12px",
                  borderRadius: "4px",
                  backgroundColor: "#f0f5ff",
                  border: "1px solid #adc6ff",
                  fontSize: "0.85em",
                }}
              >
                .{format}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <h3 style={{ fontSize: "1em", margin: "0 0 8px 0" }}>Analysis Pipeline</h3>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#595959" }}>
            <li>Decode audio source</li>
            <li>Draft section and role extraction</li>
            <li>Separate stems by category</li>
            <li>Persist analysis results</li>
          </ul>
        </div>

        <div>
          <h3 style={{ fontSize: "1em", margin: "0 0 8px 0" }}>About</h3>
          <p style={{ color: "#666", fontSize: "0.9em", margin: 0 }}>
            BandScope is a local-first rehearsal prep tool. All analysis runs on your device.
          </p>
        </div>
      </div>
    </section>
  );
}
