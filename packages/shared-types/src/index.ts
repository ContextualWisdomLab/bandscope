export const SUPPORTED_AUDIO_FORMATS = ["wav", "mp3", "flac", "m4a"] as const;

export type ProjectSummary = {
  id: string;
  title: string;
  status: "idle" | "running" | "done" | "failed";
  supportedAudioFormats: readonly (typeof SUPPORTED_AUDIO_FORMATS)[number][];
};

export function createDefaultProjectSummary(input: {
  id: string;
  title: string;
}): ProjectSummary {
  return {
    id: input.id,
    title: input.title,
    status: "idle",
    supportedAudioFormats: SUPPORTED_AUDIO_FORMATS
  };
}
