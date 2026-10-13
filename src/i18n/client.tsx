"use client"

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react"
import { DirectionProvider } from "@radix-ui/react-direction"
import { createTranslator, isPseudo, type Direction, type T, type TenantTokens, type UiLanguage } from "@/i18n/core"
import { tenantTokensOf } from "@/i18n/language"
import { peekCompleteMessages, peekMessages, primeMessages, setActiveUiLanguage } from "@/i18n/message-cache"
import { pseudoize } from "@/i18n/pseudo"
import { peekOrgConfig } from "@/lib/org/config-cache"
import { useOrg } from "@/lib/org/org-context"

/**
 * Multi-tenant phase 7 — `t()` in client components.
 *
 *   const t = useT()
 *   <Button aria-label={t("common.close")}>{t("setlists.newSetlist")}</Button>
 *   t("library.files", { count: n })      // plural: library.files_one / _two / _other
 *
 *   const fmt = useFormat()
 *   fmt.date(setlist.eventDate, { weekday: "short", month: "short", day: "numeric" })
 *
 *   const { dir, isRtl } = useI18n()       // layout decisions
 *   const { forwardKey, backKey } = useReadingDirection()   // Perform next/previous
 *
 * The browser bundles no catalogue: the root layout passes the active
 * language's messages (Hebrew already merged over English) to <I18nProvider>.
 * Outside a provider (unit tests rendering a component alone) the hooks fall
 * back to English from the message cache, which src/test-setup.ts primes.
 */

interface I18nValue {
    lang: UiLanguage
    dir: Direction
    isRtl: boolean
    t: T
    /** The tenant zone; useFormat() builds the formatter from it on demand. */
    timeZone: string | undefined
}

const I18nContext = createContext<I18nValue | null>(null)

export interface I18nProviderProps {
    lang: UiLanguage
    dir: Direction
    /** IANA zone, or null for the runtime zone (CRC/BL, as today). */
    timeZone: string | null
    messages: Record<string, string>
    /** The tenant's `vocabulary.overrides` and identity tokens (server-resolved). */
    overrides?: Record<string, string>
    tokens?: TenantTokens | null
    children: ReactNode
}

export function I18nProvider({ lang, dir, timeZone, messages, overrides, tokens, children }: I18nProviderProps) {
    // Prime during render (idempotent) so plain functions (orgString) see the
    // language too, exactly as OrgProvider primes the tenant config.
    primeMessages(lang, messages)
    // Browser only: lets orgString()/label() wrap tenant vocabulary under the
    // pseudo-locale (the server serves many requests from one module).
    if (typeof window !== "undefined") setActiveUiLanguage(lang)
    useEffect(() => () => setActiveUiLanguage(null), [])
    const value = useMemo<I18nValue>(() => {
        const t = createTranslator({
            lang,
            messages,
            overrides,
            tokens: tokens ?? null,
            transformOverride: isPseudo(lang) ? pseudoize : undefined,
        })
        return { lang, dir, isRtl: dir === "rtl", t, timeZone: timeZone ?? undefined }
    }, [lang, dir, timeZone, messages, overrides, tokens])
    // Radix menus, selects and scroll areas read direction from their own
    // context, not from <html dir>: without this, submenus open and arrow keys
    // move left to right on a Hebrew tenant.
    return (
        <I18nContext.Provider value={value}>
            <DirectionProvider dir={dir}>{children}</DirectionProvider>
        </I18nContext.Provider>
    )
}

/** English fallback when no provider is mounted (tests, isolated renders). */
function useFallback(): I18nValue {
    // No config-code import here: this module mounts on every page (incl.
    // /login), so it reads only the primed config (OrgProvider primes it).
    const cfg = peekOrgConfig(useOrg()) ?? null
    return useMemo<I18nValue>(() => {
        const t = createTranslator({
            lang: "en",
            messages: peekCompleteMessages("en") ?? peekMessages("en") ?? {},
            overrides: cfg?.vocabulary.overrides,
            tokens: tenantTokensOf(cfg),
        })
        return { lang: "en", dir: "ltr", isRtl: false, t, timeZone: undefined }
    }, [cfg])
}

export function useI18n(): I18nValue {
    const ctx = useContext(I18nContext)
    const fallback = useFallback()
    return ctx ?? fallback
}

export function useT(): T {
    return useI18n().t
}


export interface ReadingDirection {
    dir: Direction
    isRtl: boolean
    /** Key that moves forward (next page / next song) in reading order. */
    forwardKey: "ArrowRight" | "ArrowLeft"
    backKey: "ArrowRight" | "ArrowLeft"
    /** Horizontal swipe sign meaning "forward": -1 = swipe left (ltr), +1 = swipe right (rtl). */
    forwardSwipeSign: -1 | 1
    /** Map a physical side to a logical step: "right" is +1 (next) in ltr, -1 in rtl. */
    stepFor(side: "left" | "right"): 1 | -1
}

export function readingDirection(dir: Direction): ReadingDirection {
    const rtl = dir === "rtl"
    return {
        dir,
        isRtl: rtl,
        forwardKey: rtl ? "ArrowLeft" : "ArrowRight",
        backKey: rtl ? "ArrowRight" : "ArrowLeft",
        forwardSwipeSign: rtl ? 1 : -1,
        stepFor: (side) => ((side === "right") !== rtl ? 1 : -1),
    }
}

/**
 * Next/previous in reading order for Perform. Note: chart PAGES (a PDF) are
 * left-to-right content; whether page turns follow the UI or the chart is the
 * perform lane's call (see P7-I18N-GUIDE.md).
 */
export function useReadingDirection(): ReadingDirection {
    const { dir } = useI18n()
    return useMemo(() => readingDirection(dir), [dir])
}
