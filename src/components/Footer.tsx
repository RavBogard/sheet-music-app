"use client"

import Link from "next/link"
import buildInfo from "@/build-info.json"
import { V2BetaOptInLink } from "@/components/v2/v2-beta-toggle"
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
        <footer className="py-6 border-t border-border mt-auto bg-background text-center text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
                <p>
                    {creditBefore}<a href="https://danielbogard.com" target="_blank" rel="noopener noreferrer" className="text-foreground/70 hover:text-foreground transition-colors underline decoration-border underline-offset-4">{AUTHOR}</a>{creditAfter}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span title={t("shell.commitTitle", { commit: buildInfo.commit })}>{t("shell.version", { version: buildInfo.version })}</span>
                    <span aria-hidden="true">•</span>
                    <Link href="/changelog" className="hover:text-foreground transition-colors">
                        {t("shell.changelog")}
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/privacy" className="hover:text-foreground transition-colors">
                        {t("shell.privacy")}
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/terms" className="hover:text-foreground transition-colors">
                        {t("shell.terms")}
                    </Link>
                    <span aria-hidden="true">•</span>
                    <Link href="/accessibility" className="hover:text-foreground transition-colors">
                        {t("shell.accessibility")}
                    </Link>
                </div>
                <V2BetaOptInLink className="mt-1" />
            </div>
        </footer>
    )
}
