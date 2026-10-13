import { createTranslator, type T, type UiLanguage } from "@/i18n/core"
import { peekCompleteMessages, peekMessages } from "@/i18n/message-cache"

/**
 * Phase 7: a translator for plain (non-React) client code such as the
 * save-error toast helper and the Firestore recovery toasts in firebase.ts.
 * In the browser the root <I18nProvider> primes exactly the active language's
 * messages into the message cache; on the server and in tests every language
 * is primed as a COMPLETE catalogue, and there is no user, so English is used.
 *
 * Server code that knows its request or tenant uses getT()/tForOrg() instead:
 * on the server this always answers in English.
 */
export function plainT(): T {
    for (const lang of ["he", "qps-rtl", "qps"] as const satisfies readonly UiLanguage[]) {
        const m = peekMessages(lang)
        if (m && !peekCompleteMessages(lang)) return createTranslator({ lang, messages: m })
    }
    return createTranslator({ lang: "en", messages: peekCompleteMessages("en") ?? peekMessages("en") ?? {} })
}

/** The language plainT() answers in (same rule). */
export function plainLang(): UiLanguage {
    for (const lang of ["he", "qps-rtl", "qps"] as const satisfies readonly UiLanguage[]) {
        if (peekMessages(lang) && !peekCompleteMessages(lang)) return lang
    }
    return "en"
}
