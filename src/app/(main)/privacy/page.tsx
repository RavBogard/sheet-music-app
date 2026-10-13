import { requestOrg } from "@/lib/org/request-org"
import { getT } from "@/i18n/server"
import type { Metadata } from "next"
import type { T } from "@/i18n/core"
import { rich } from "@/components/legal/rich"
import { PlatformPrivacyPolicy } from "@/components/legal/PlatformLegal"

// C5D-007: legal pages are explicitly indexable. Root layout sets a
// global noindex so authed surfaces stay out of search results; this
// per-page override flips it back for the public legal disclosure
// (matching robots.txt allow + sitemap listing).
export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return {
        title: t("privacy.title"),
        robots: { index: true, follow: true },
    }
}

export default async function PrivacyPolicyPage() {
    // Multi-tenant phase 1: CRC's text for tenants with legal.useCrcText (CRC and
    // Brothers Lazaroff); everyone else gets the platform-run version.
    const { config } = await requestOrg()
    const t = await getT()
    if (config && !config.legal.useCrcText) return <PlatformPrivacyPolicy config={config} t={t} />
    return <CrcPrivacyPolicy t={t} />
}

function CrcPrivacyPolicy({ t }: { t: T }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">{t("privacy.eyebrow")}</p>
                    <h1 className="text-title-large mb-2">{t("privacy.title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("privacy.lastUpdated")}</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">{t("privacy.intro")}</p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.informationCollect.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.informationCollect.collectFollowingTypes")}</p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.informationCollect.accountInformation"), {
                            term: <strong className="text-foreground">{t("privacy.informationCollect.accountInformationLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.informationCollect.phoneNumber"), {
                            term: <strong className="text-foreground">{t("privacy.informationCollect.phoneNumberLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.informationCollect.musicianProfileData"), {
                            term: <strong className="text-foreground">{t("privacy.informationCollect.musicianProfileDataLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.informationCollect.usageData"), {
                            term: <strong className="text-foreground">{t("privacy.informationCollect.usageDataLabel")}</strong>,
                        })}</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.howUseInformation.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.howUseInformation.useCollectedInformation")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.howUseInformation.provideMaintainService")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.howUseInformation.sendSchedulingNotifications")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.howUseInformation.facilitateMusicianCoordination")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.howUseInformation.improveService")}</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.smsMobileMessaging.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.smsMobileMessaging.optReceiveSms")}</p>
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">{t("privacy.smsMobileMessaging.mobileInformationIncluding")}</p>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.smsMobileMessaging.messageFrequencyVaries")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.dataSharing.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.dataSharing.doSellTrade")}</p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.dataSharing.serviceProviders"), {
                            term: <strong className="text-foreground">{t("privacy.dataSharing.serviceProvidersLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.dataSharing.withinCrc"), {
                            term: <strong className="text-foreground">{t("privacy.dataSharing.withinCrcLabel")}</strong>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("privacy.dataSharing.legalRequirements"), {
                            term: <strong className="text-foreground">{t("privacy.dataSharing.legalRequirementsLabel")}</strong>,
                        })}</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.dataSecurity.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.dataSecurity.useIndustryStandard")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.dataRetention.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.dataRetention.retainPersonalData")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.rights.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.rights.haveRight")}</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.rights.accessPersonalInformation")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.rights.requestCorrectionInaccurate")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.rights.requestDeletionAccount")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.rights.optOutSms")}</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">•</span>{t("privacy.rights.optOutEmail")}</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.childrensPrivacy.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.childrensPrivacy.serviceIntendedUse")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.changesPolicy.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("privacy.changesPolicy.updatePrivacyPolicy")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("privacy.contact.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("privacy.contact.haveQuestionsAbout"), {
                        // i18n-ignore: contact address / URL, not prose
                        link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2 transition-colors">music@centralreform.live</a>,
                    })}</p>
                </section>
            </div>
        </div>
    )
}
