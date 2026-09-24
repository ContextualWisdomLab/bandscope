import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

/** Documented. */
export type Locale = "en" | "ko";
/** Documented. */
export type TranslationKey = keyof typeof enCommon;

const TRANSLATION_PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

const dictionaries = {
  en: enCommon,
  ko: koCommon
} as const;

/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}

/** Interpolate owned translation placeholders once while preserving missing and placeholder-shaped values literally. */
export function fillTranslation(
  template: string,
  values: Readonly<Record<string, string | number>>
): string {
  return template.replace(TRANSLATION_PLACEHOLDER_PATTERN, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder
  );
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
