import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

/** Documented. */
export type Locale = "en" | "ko";
/** Documented. */
export type TranslationKey = keyof typeof enCommon;

const dictionaries = {
  en: enCommon,
  ko: koCommon
} as const;

/** Create a locale-bound translator with single-pass literal placeholder interpolation. */
export function createTranslator(locale: Locale = "en") {
  return function translate(
    key: TranslationKey,
    variables?: Readonly<Record<string, string>>
  ): string {
    let text = dictionaries[locale][key] ?? dictionaries.en[key];
    if (variables) {
      text = text.replace(/\{([^{}]+)\}/g, (placeholder, variableName: string) =>
        Object.prototype.hasOwnProperty.call(variables, variableName)
          ? variables[variableName]
          : placeholder
      );
    }
    return text;
  };
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
