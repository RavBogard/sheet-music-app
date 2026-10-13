import { requestOrg } from "@/lib/org/request-org"
import { getT } from "@/i18n/server"
import type { Metadata } from "next"
import type { T } from "@/i18n/core"
import { rich } from "@/components/legal/rich"
import { PlatformSmsConsent } from "@/components/legal/PlatformLegal"
import Link from "next/link"

// C5D-007: SMS-consent must be carrier-discoverable (A2P review) and is
// explicitly indexable. Root noindex applies to authed surfaces.
export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return {
        title: t("smsConsent.title"),
        robots: { index: true, follow: true },
    }
}

export default async function SmsConsentPage() {
    // Multi-tenant phase 1: CRC's text for tenants with legal.useCrcText (CRC and
    // Brothers Lazaroff); everyone else gets the platform-run version.
    const { config } = await requestOrg()
    const t = await getT()
    if (config && !config.legal.useCrcText) return <PlatformSmsConsent config={config} t={t} />
    return <CrcSmsConsent t={t} />
}

function CrcSmsConsent({ t }: { t: T }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">{t("smsConsent.eyebrow")}</p>
                    <h1 className="text-title-large mb-2">{t("smsConsent.title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("smsConsent.subtitle")}</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                {/* Highlight card */}
                <div className="p-5 sm:p-6 rounded-xl border border-brand/20 bg-brand/5">
                    <h2 className="text-lg font-semibold text-foreground mb-3">{t("smsConsent.highlight.heading")}</h2>
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{t("smsConsent.highlight.intro")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{rich(t("smsConsent.highlight.optInVoluntary"), {
                        term1: <strong className="text-foreground">{t("smsConsent.highlight.voluntary")}</strong>,
                        term2: <strong className="text-foreground">{t("smsConsent.highlight.notRequired")}</strong>,
                    })}</p>
                </div>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.programDescription.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.programDescription.operatorAndPurpose")}</p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("smsConsent.programDescription.schedulingAssignments"), {
                            term: <strong className="text-foreground">{t("smsConsent.programDescription.schedulingAssignmentsLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("smsConsent.programDescription.reminders"), {
                            term: <strong className="text-foreground">{t("smsConsent.programDescription.remindersLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("smsConsent.programDescription.confirmations"), {
                            term: <strong className="text-foreground">{t("smsConsent.programDescription.confirmationsLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("smsConsent.programDescription.cancellations"), {
                            term: <strong className="text-foreground">{t("smsConsent.programDescription.cancellationsLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("smsConsent.programDescription.scheduleChanges"), {
                            term: <strong className="text-foreground">{t("smsConsent.programDescription.scheduleChangesLabel")}</strong>,
                        })}</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.consentProcess.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.consentProcess.musiciansProvideConsent")}</p>
                    <ol className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0 counter-reset-custom">
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">1</span><span>{rich(t("smsConsent.consentProcess.signCrcMusic"), {
                            // i18n-ignore: contact address / URL, not prose
                            link: <a href="https://www.centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">www.centralreform.live</a>,
                        })}</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">2</span><span>{rich(t("smsConsent.consentProcess.navigate"), {
                            term: <strong className="text-foreground">{t("smsConsent.consentProcess.settingsMusicianProfile")}</strong>,
                        })}</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">3</span><span>{t("smsConsent.consentProcess.enterPhoneNumber")}</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">4</span><span>{rich(t("smsConsent.consentProcess.toggleNotificationSwitch"), {
                            term: <strong className="text-foreground">{t("smsConsent.consentProcess.smsSwitchLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">5</span><span>{t("smsConsent.consentProcess.saveProfileSettings")}</span></li>
                    </ol>
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.consentProcess.completingTheseSteps")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.messageFrequency.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.messageFrequency.messageFrequencyVaries")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.messageDataRates.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.messageDataRates.standardMessageData")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.optOut.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.optOut.optOutSms")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{rich(t("smsConsent.optOut.replyingMessageReceived"), {
                            // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                            term: <strong className="text-foreground">STOP</strong>,
                        })}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("smsConsent.optOut.disablingSmsToggle")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("smsConsent.optOut.removingPhoneNumber")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{rich(t("smsConsent.optOut.contacting"), {
                            // i18n-ignore: contact address / URL, not prose
                            link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>,
                        })}</li>
                    </ul>
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("smsConsent.optOut.afterOptingOut")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.help.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("smsConsent.help.helpSmsNotifications"), {
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        term: <strong className="text-foreground">HELP</strong>,
                        // i18n-ignore: contact address / URL, not prose
                        link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>,
                    })}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.dataPrivacy.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">{t("smsConsent.dataPrivacy.mobileInformationIncluding")}</p>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("smsConsent.dataPrivacy.phoneNumbersStored"), {
                        link: <Link href="/privacy" className="text-brand font-medium hover:underline underline-offset-2">{t("smsConsent.dataPrivacy.privacyPolicy")}</Link>,
                    }, { splitSpaceBefore: ["link"] })}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.contactInformation.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <div className="p-5 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 shadow-sm">
                        <p className="text-sm text-foreground font-semibold">{t("smsConsent.contactInformation.organization")}</p>
                        <p className="text-sm text-muted-foreground mt-1">{t("smsConsent.contactInformation.crcMusicApplication")}</p>
                        <div className="h-px bg-border/40 my-3" />
                        <p className="text-sm text-muted-foreground">{rich(t("smsConsent.contactInformation.email"), {
                            // i18n-ignore: contact address / URL, not prose
                            link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>,
                        })}</p>
                        <p className="text-sm text-muted-foreground mt-1">{rich(t("smsConsent.contactInformation.web"), {
                            // i18n-ignore: contact address / URL, not prose
                            link: <a href="https://www.centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">www.centralreform.live</a>,
                        })}</p>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("smsConsent.relatedPolicies.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Link href="/privacy" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                            <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">{t("smsConsent.relatedPolicies.privacyPolicy")}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("smsConsent.relatedPolicies.howHandleData")}</p>
                        </Link>
                        <Link href="/terms" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                            <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">{t("smsConsent.relatedPolicies.termsConditions")}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("smsConsent.relatedPolicies.serviceUsageTerms")}</p>
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    )
}
