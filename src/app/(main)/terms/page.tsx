import { requestOrg } from "@/lib/org/request-org"
import { getT } from "@/i18n/server"
import type { Metadata } from "next"
import type { T } from "@/i18n/core"
import { rich } from "@/components/legal/rich"
import { PlatformTerms } from "@/components/legal/PlatformLegal"

// C5D-007: legal pages are explicitly indexable; root noindex applies
// to the authed app, this override exempts public legal disclosure.
export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return {
        title: t("terms.title"),
        robots: { index: true, follow: true },
    }
}

export default async function TermsPage() {
    // Multi-tenant phase 1: CRC's text for tenants with legal.useCrcText (CRC and
    // Brothers Lazaroff); everyone else gets the platform-run version.
    const { config } = await requestOrg()
    const t = await getT()
    if (config && !config.legal.useCrcText) return <PlatformTerms config={config} t={t} />
    return <CrcTerms t={t} />
}

function CrcTerms({ t }: { t: T }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">{t("terms.eyebrow")}</p>
                    <h1 className="text-title-large mb-2">{t("terms.title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("terms.lastUpdated")}</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">{t("terms.intro")}</p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.acceptanceTerms.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.acceptanceTerms.accessingUsingCrc")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.descriptionService.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.descriptionService.crcMusicMusician")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.descriptionService.setlistCreationManagement")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.descriptionService.sheetMusicLibrary")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.descriptionService.musicianSchedulingAssignment")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.descriptionService.notificationServicesEmail")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.descriptionService.calendarSynchronization")}</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.userAccounts.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.userAccounts.responsibleMaintainingConfidentiality")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.smsMessagingTerms.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.smsMessagingTerms.optingSmsNotifications")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.smsMessagingTerms.receiveTextMessages")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.smsMessagingTerms.messageTypesInclude")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.smsMessagingTerms.messageFrequencyVaries")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.smsMessagingTerms.messageDataRates")}</li>
                    </ul>
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("terms.smsMessagingTerms.optOutSms"), {
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        term1: <strong className="text-foreground">STOP</strong>,
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        term2: <strong className="text-foreground">HELP</strong>,
                        // i18n-ignore: contact address / URL, not prose
                        link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>,
                    }, { splitSpaceBefore: ["link"] })}</p>
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">{t("terms.smsMessagingTerms.mobileInformationShared")}</p>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.acceptableUse.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.acceptableUse.agree")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.acceptableUse.useServiceUnlawful")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.acceptableUse.shareAccountCredentials")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.acceptableUse.attemptAccessOther")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("terms.acceptableUse.uploadMaliciousContent")}</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.content.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.content.sheetMusicOther")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.disclaimerWarranties.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.disclaimerWarranties.serviceProvidedWithout")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.limitationLiability.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.limitationLiability.crcShallLiable")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.changesTerms.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("terms.changesTerms.reserveRightModify")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("terms.contact.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("terms.contact.questionsAboutThese"), {
                        // i18n-ignore: contact address / URL, not prose
                        link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>,
                    }, { splitSpaceBefore: ["link"] })}</p>
                </section>
            </div>
        </div>
    )
}
