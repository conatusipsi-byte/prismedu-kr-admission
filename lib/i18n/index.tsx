"use client";

/**
 * 경량 i18n — next-intl/i18next 대신 의존성 없이 구현.
 *
 * 설계:
 *  - ko를 source-of-truth로 두고, en은 동일한 키를 요구(타입으로 강제).
 *  - Locale은 localStorage("prism_locale") + navigator.language로 결정, default "ko".
 *  - t("ns.key") 형태. 중첩 키는 dot-path로 lookup, 미발견 시 ko fallback.
 *  - 번역 미완성 키는 자동으로 ko 원문을 반환 → 영어 UI에서 한국어가 섞여 보일 수 있으나
 *    빈 문자열/[missing] 플레이스홀더보다 나음(점진 번역 전략).
 *
 * 사용:
 *   const { t, locale, setLocale } = useI18n();
 *   t("common.cancel") → "취소" / "Cancel"
 */

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import ko from "./messages/ko";
import en from "./messages/en";

export type Locale = "ko" | "en";

const LOCALES: Record<Locale, typeof ko> = { ko, en };
const STORAGE_KEY = "prism_locale";

function detectLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch { /* quota/private mode */ }
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "ko";
  return nav.startsWith("ko") ? "ko" : "en";
}

function lookup(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR과 CSR hydration 불일치를 피하기 위해 initial은 "ko"로 고정.
  // 클라이언트에서 mount 후 localStorage/navigator를 보고 스위칭.
  const [locale, setLocaleState] = useState<Locale>("ko");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
    // <html lang> 업데이트 — SEO/a11y.
    if (typeof document !== "undefined") {
      document.documentElement.lang = l;
    }
  };

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key: string) => {
      const primary = lookup(LOCALES[locale], key);
      if (primary) return primary;
      // en 번역 누락 시 ko로 fallback
      if (locale !== "ko") {
        const fallback = lookup(LOCALES.ko, key);
        if (fallback) return fallback;
      }
      // 마지막 수단: 키 자체를 반환 — dev에서 누락 발견 용이
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${key} (${locale})`);
      }
      return key;
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Provider 밖에서 쓰여도 fail hard하지 않음 — default locale로 동작.
    return {
      locale: "ko",
      setLocale: () => { /* noop */ },
      t: (key) => lookup(LOCALES.ko, key) ?? key,
    };
  }
  return ctx;
}
