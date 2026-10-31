"use client"

import Link from "next/link"
import buildInfo from "@/build-info.json"
import { useT } from "@/i18n/client"

// The author's name is a proper name: it stays as written in every language.
const AUTHOR = "Rabbi Daniel Bogard"
const AUTHOR_SLOT = "\u0000"

export function Footer() {
    const t = useT()
    // One sentence with the author link inside: split the translated sentence
    // at the {author} slot so the word order stays the translator's.
    const [creditBefore, creditAfter = ""] = t("shell.footerCredit", { author: AUTHOR_SLOT }).split(AUTHOR_SLOT)
    return (
        <footer className="py-5 border-t border-rule mt-auto bg-card text-sm text-muted-foreground">
            <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center sm:justify-between gap-2">
                <p>
                    {creditBefore}<a href="https://danielbogard.com" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-brand transition-colors underline decoration-rule decoration-1 underline-offset-4">{AUTHOR}</a>{creditAfter}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="tnum" title={t("shell.commitTitle", { commit: buildInfo.commit })}>{t("shell.version", { version: buildInfo.version })}</span>
                    <span aria-hidden="true">•</span>
                    <Link href="/privacy" className="inline-flex items-center min-h-11 hover:text-foreground transition-colors">
                        {t("shell.privacy")}
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/terms" className="inline-flex items-center min-h-11 hover:text-foreground transition-colors">
                        {t("shell.terms")}
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/accessibility" className="inline-flex items-center min-h-11 hover:text-foreground transition-colors">
                        {t("shell.accessibility")}
                    </Link>
                </div>
            </div>
        </footer>
    )
}
