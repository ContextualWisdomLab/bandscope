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
  return function t(key: TranslationKey, variables?: Record<string, string | number>): string {
    let result = dictionaries[locale][key] ?? dictionaries.en[key];

    if (variables) {
      for (const [varName, varValue] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${varName}\\}`, "g"), String(varValue));
      }
    }

    return result;
  };
}

/** Documented. */
export function detectPreferredLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ko")) {
    return "ko";
  }

  return "en";
}
