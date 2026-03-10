import enCommon from "../locales/en/common.json";
import koCommon from "../locales/ko/common.json";

export type Locale = "en" | "ko";

const dictionaries = {
  en: enCommon,
  ko: koCommon
} as const;

export function createTranslator(locale: Locale = "en") {
  return function t(key: keyof typeof enCommon): string {
    return dictionaries[locale][key] ?? dictionaries.en[key];
  };
}
