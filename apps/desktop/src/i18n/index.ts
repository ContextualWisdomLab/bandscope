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

/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey, variables?: Record<string, string>): string {
    let text = dictionaries[locale][key] ?? dictionaries.en[key];
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{${k}}`, "g"), v);
      }
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
