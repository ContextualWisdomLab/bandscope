import type { Locale } from "../../i18n";
import enPlaybackSource from "../../locales/en/playback-source.json";
import koPlaybackSource from "../../locales/ko/playback-source.json";

type PlaybackSourceCopyKey = keyof typeof enPlaybackSource;

const playbackSourceCopyByLocale: Readonly<
  Record<Locale, Readonly<Record<PlaybackSourceCopyKey, string>>>
> = {
  en: enPlaybackSource,
  ko: koPlaybackSource,
};

/** Return one localized playback-source screen string from the current resource set. */
export function createPlaybackSourceCopy(locale: Locale) {
  return function playbackSourceCopy(key: PlaybackSourceCopyKey): string {
    return playbackSourceCopyByLocale[locale][key];
  };
}
