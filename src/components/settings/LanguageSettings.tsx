"use client"

import { Languages } from "lucide-react"
import { useI18n } from "@/i18n/client"
import { baseLanguageOf } from "@/i18n/core"
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE_S, LANGUAGE_ENDONYMS, pickerLanguages } from "@/i18n/language"
import { useOrgConfig } from "@/lib/org/org-context"
import { cn } from "@/lib/utils"
import type { TenantLanguage } from "@/i18n/core"

/**
 * Phase 7: the per-user language choice, shown only on a tenant whose
 * language is not English (so CRC's and BL's Settings page is unchanged). It
 * sets the host-only `ui-lang` cookie the root layout reads, then reloads so
 * the whole page — direction included — re-renders in the new language.
 * Options are the tenant's language and English, each named in itself.
 */
export function setLanguageCookie(lang: TenantLanguage): void {
    const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`
}

export function LanguageSettings({ onChange }: { onChange?: (lang: TenantLanguage) => void }) {
    const cfg = useOrgConfig()
    const { t, lang } = useI18n()
    const options = pickerLanguages(cfg?.locale.language ?? "en")
    if (options.length === 0) return null
    const current = baseLanguageOf(lang)

    const choose = (next: TenantLanguage) => {
        if (next === current) return
        setLanguageCookie(next)
        if (onChange) onChange(next)
        else window.location.reload()
    }

    return (
        <div className="bg-card border border-border p-5 rounded-2xl">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Languages className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                {t("language.title")}
            </h3>
            <div className="flex gap-2" role="radiogroup" aria-label={t("language.title")}>
                {options.map((value) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={current === value}
                        lang={value}
                        dir={value === "he" ? "rtl" : "ltr"}
                        onClick={() => choose(value)}
                        className={cn(
                            "min-h-11 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            current === value
                                ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border",
                        )}
                    >
                        {LANGUAGE_ENDONYMS[value]}
                    </button>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">{t("language.hint")}</p>
        </div>
    )
}
