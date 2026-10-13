/**
 * Save-error reporting helper — wired into user-initiated write paths
 * that were previously `.catch(() => {})`. Surfaces failures as toasts
 * so musicians know their change didn't land, and logs for telemetry.
 *
 * v4.3 B01.
 */
import { toast } from "sonner"
import { createTranslator, type T, type UiLanguage } from "@/i18n/core"
import { peekCompleteMessages, peekMessages } from "@/i18n/message-cache"
import { logger } from "@/lib/logger"

export interface ReportSaveErrorOpts {
    /** Skip the toast; logger.warn still fires. Use for background paths. */
    silent?: boolean
    /**
     * Phase 7: the thing that failed to save, already translated (from the
     * caller's `t()`), for the toast. Defaults to `action`, which is also the
     * English log label.
     */
    label?: string
}

/**
 * Phase 7: a translator for plain (non-React) client code such as this
 * helper and the Firestore recovery toasts in firebase.ts. In the browser the
 * root <I18nProvider> primes exactly the active language's messages into the
 * message cache; on the server and in tests every language is primed as a
 * COMPLETE catalogue, and there is no user, so English is used.
 */
export function plainT(): T {
    for (const lang of ["he", "qps-rtl", "qps"] as const satisfies readonly UiLanguage[]) {
        const m = peekMessages(lang)
        if (m && !peekCompleteMessages(lang)) return createTranslator({ lang, messages: m })
    }
    return createTranslator({ lang: "en", messages: peekCompleteMessages("en") ?? peekMessages("en") ?? {} })
}

export function reportSaveError(
    err: unknown,
    action: string,
    opts?: ReportSaveErrorOpts,
): void {
    logger.warn(`[save] ${action} failed:`, err)
    if (!opts?.silent) {
        toast.error(plainT()("appSync.saveFailed", { action: opts?.label ?? action }))
    }
}
