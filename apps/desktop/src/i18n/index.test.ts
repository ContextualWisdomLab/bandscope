import { describe, it, expect, vi, afterEach } from "vitest";
import { createTranslator, detectPreferredLocale, translateSectionFormLabel } from "./index";
import koCommon from "../locales/ko/common.json";

describe("i18n", () => {
  describe("detectPreferredLocale", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns 'ko' when navigator.language is 'ko'", () => {
      vi.stubGlobal("navigator", { language: "ko" });
      expect(detectPreferredLocale()).toBe("ko");
    });

    it("returns 'ko' when navigator.language starts with 'ko'", () => {
      vi.stubGlobal("navigator", { language: "ko-KR" });
      expect(detectPreferredLocale()).toBe("ko");
    });

    it("returns 'en' for non-Korean locales", () => {
      vi.stubGlobal("navigator", { language: "en-US" });
      expect(detectPreferredLocale()).toBe("en");

      vi.stubGlobal("navigator", { language: "fr" });
      expect(detectPreferredLocale()).toBe("en");
    });

    it("returns 'en' when navigator is undefined", () => {
      const originalNavigator = globalThis.navigator;
      // @ts-expect-error - simulating missing navigator
      delete (globalThis as unknown as { navigator?: Navigator }).navigator;

      expect(detectPreferredLocale()).toBe("en");

      if (originalNavigator !== undefined) {
        // @ts-expect-error - restoring navigator
        globalThis.navigator = originalNavigator;
      }
    });

    it("returns 'en' when navigator.language is undefined", () => {
      vi.stubGlobal("navigator", {});
      expect(detectPreferredLocale()).toBe("en");
    });
  });

  describe("createTranslator", () => {
    it("translates to English by default", () => {
      const t = createTranslator();
      expect(t("appTitle")).toBe("BandScope");
    });

    it("translates to English explicitly", () => {
      const t = createTranslator("en");
      expect(t("appTitle")).toBe("BandScope");
    });

    it("translates to Korean explicitly", () => {
      const t = createTranslator("ko");
      expect(t("appTitle")).toBe("BandScope");
      expect(t("appSubtitle")).toBe("합주 준비를 위한 로컬-퍼스트 분석 도구");
    });

    it("falls back to English when a Korean translation is missing", () => {
      const t = createTranslator("ko");
      const koDictionary = koCommon as Record<string, string | undefined>;
      const originalSubtitle = koDictionary.appSubtitle;
      delete koDictionary.appSubtitle;

      try {
        expect(t("appSubtitle")).toBe("Local-first desktop analysis tool for rehearsal prep");
      } finally {
        koDictionary.appSubtitle = originalSubtitle;
      }
    });
  });

  describe("translateSectionFormLabel", () => {
    it("localizes Korean section form labels without treating inherited keys as labels", () => {
      expect(translateSectionFormLabel("ko", "verse")).toBe("벌스");
      expect(translateSectionFormLabel("ko", "pre-chorus")).toBe("프리코러스");
      expect(translateSectionFormLabel("en", "verse")).toBe("verse");
      const inheritedKey = "toString" as never;
      expect(translateSectionFormLabel("ko", inheritedKey)).toBe("toString");
    });

    it("keeps Korean first-approval next-action copy particle-safe", () => {
      const t = createTranslator("ko");
      expect(t("firstApprovalOpenAction")).toBe("{at} {section} 승인 위치 열기");
      expect(t("firstApprovalBody")).toBe("{owner}님이 {at} {section}의 {scope} 승인을 기다리고 있습니다.");
      expect(t("firstApprovalArmed")).toBe("{at} {section}에서 {scope} 승인을 이어서 하세요.");
    });
  });
});
