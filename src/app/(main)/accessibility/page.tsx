import { requestOrg } from "@/lib/org/request-org"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/core"
import { rich } from "@/components/legal/rich"
import { PlatformAccessibility } from "@/components/legal/PlatformLegal"
import type { Metadata } from "next"

// Multi-tenant phase 1: CRC's title for legal.useCrcText tenants (CRC and BL);
// otherwise the root template adds the tenant's own name.
export async function generateMetadata(): Promise<Metadata> {
    const { config } = await requestOrg()
    const t = await getT()
    return {
        title: config && !config.legal.useCrcText ? t("accessibility.title") : t("accessibility.metaTitleCrc"),
        robots: { index: true, follow: true },
    }
}

export default async function AccessibilityPage() {
    // Multi-tenant phase 1: CRC's text for tenants with legal.useCrcText (CRC and
    // Brothers Lazaroff); everyone else gets the platform-run version.
    const { config } = await requestOrg()
    const t = await getT()
    if (config && !config.legal.useCrcText) return <PlatformAccessibility config={config} t={t} />
    return <CrcAccessibility t={t} />
}

function CrcAccessibility({ t }: { t: T }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">{t("accessibility.eyebrow")}</p>
                    <h1 className="text-title-large mb-2">{t("accessibility.title")}</h1>
                    <p className="text-muted-foreground text-sm">{t("accessibility.lastUpdated")}</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">{t("accessibility.intro")}</p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("accessibility.whatWeAreDoing.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("accessibility.whatWeAreDoing.semanticHtmlLandmarks"), {
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code1: <code>&lt;main&gt;</code>,
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code2: <code>&lt;nav&gt;</code>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("accessibility.whatWeAreDoing.accessibleNamesIcon"), {
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code1: <code>aria-label</code>,
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code2: <code>&lt;label&gt;</code>,
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code3: <code>aria-label</code>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{t("accessibility.whatWeAreDoing.wcagContrast")}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{rich(t("accessibility.whatWeAreDoing.pinchZoomUser"), {
                            // i18n-ignore: code sample (HTML/ARIA names), not prose
                            code: <code>maximum-scale=1</code>,
                        })}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{t("accessibility.whatWeAreDoing.skipLinkMain")}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{t("accessibility.whatWeAreDoing.keyboardSupportPerform")}</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">•</span><span>{t("accessibility.whatWeAreDoing.automatedAxeCore")}</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("accessibility.knownLimitations.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{t("accessibility.knownLimitations.trackOpenAccessibility")}</p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">{t("accessibility.reportBarrier.heading")}</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">{rich(t("accessibility.reportBarrier.encounterPartApp"), {
                        // i18n-ignore: contact address / URL, not prose
                        link: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2 transition-colors">music@centralreform.live</a>,
                    })}</p>
                </section>
            </div>
        </div>
    )
}
