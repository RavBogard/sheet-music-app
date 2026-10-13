import Link from "next/link"
import type { ReactNode } from "react"
import type { T, TVars } from "@/i18n/core"
import type { OrgConfig } from "@/lib/org/config-schema"
import { rich } from "@/components/legal/rich"

/**
 * Multi-tenant phase 1: the legal pages for a tenant whose config has
 * `legal.useCrcText: false`. CRC and Brothers Lazaroff keep CRC's exact pages
 * (src/app/(main)/{privacy,terms,sms-consent,accessibility}/page.tsx).
 *
 * Each page is adapted section by section from the CRC text: the tenant
 * (`legal.operatorName`) takes CRC's place, and the pages say the Service runs
 * on the centralreform.live platform operated by Rabbi Daniel Bogard. Nothing
 * here promises more than the CRC text does.
 *
 * Phase 7: every sentence comes from the `legal` catalogue namespace, so a
 * Hebrew tenant reads its legal pages in Hebrew (R-1012-mt-7). The operator,
 * app name, platform host, platform operator and contact address are config
 * values passed in as `{vars}`, never translated. Elements inside a sentence
 * (bold lead-ins, links) are `{placeholders}` filled by `rich()`.
 */

export const PLATFORM_HOST = "centralreform.live"
export const PLATFORM_OPERATOR = "Rabbi Daniel Bogard"
/** Used when a tenant has no `legal.contactEmail`. */
export const PLATFORM_CONTACT_EMAIL = "music@centralreform.live"

interface LegalTenant {
    operator: string
    appName: string
    email: string
    host: string
}

function legalTenant(config: OrgConfig): LegalTenant {
    return {
        operator: config.legal.operatorName || config.name,
        appName: config.branding.shortName,
        email: config.legal.contactEmail || PLATFORM_CONTACT_EMAIL,
        host: config.domains.primary,
    }
}

/** The `{vars}` every legal string may use (names avoid the tenant tokens). */
function legalVars(lt: LegalTenant): TVars {
    return { operator: lt.operator, appName: lt.appName, platformHost: PLATFORM_HOST, platformOperator: PLATFORM_OPERATOR }
}

interface LegalProps {
    config: OrgConfig
    t: T
}

function Page({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">{eyebrow}</p>
                    <h1 className="text-title-large mb-2">{title}</h1>
                    <p className="text-muted-foreground text-sm">{subtitle}</p>
                </div>
            </div>
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">{children}</div>
        </div>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">{title}</h2>
            <div className="h-px bg-border/50" />
            {children}
        </section>
    )
}

function P({ children }: { children: ReactNode }) {
    return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

function Bullets({ items }: { items: ReactNode[] }) {
    return (
        <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none ps-0">
            {items.map((item, i) => (
                <li key={i} className="flex gap-2">
                    <span className="text-brand shrink-0">•</span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    )
}

function Callout({ children }: { children: ReactNode }) {
    return (
        <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
            <p className="text-sm font-medium text-foreground leading-relaxed">{children}</p>
        </div>
    )
}

function Mail({ email }: { email: string }) {
    return (
        <a href={`mailto:${email}`} className="text-brand font-medium hover:underline underline-offset-2">
            {email}
        </a>
    )
}

function Intro({ children }: { children: ReactNode }) {
    return <p className="text-base leading-relaxed text-muted-foreground">{children}</p>
}

const Strong = ({ children }: { children: ReactNode }) => <strong className="text-foreground">{children}</strong>

/** A bullet with a bold lead-in: "{term} rest of the sentence". */
function labelled(t: T, key: string, labelKey: string, v: TVars): ReactNode {
    return rich(t(key, v), { term: <Strong>{t(labelKey, v)}</Strong> })
}

export function PlatformPrivacyPolicy({ config, t }: LegalProps) {
    const lt = legalTenant(config)
    const v = legalVars(lt)
    return (
        <Page eyebrow={t("legal.eyebrow")} title={t("legal.privacy.title")} subtitle={t("legal.privacy.lastUpdated")}>
            <Intro>{t("legal.privacy.intro", { ...v, platformLine: t("legal.platformLine", v) })}</Intro>

            <Section title={t("legal.privacy.collect.heading")}>
                <P>{t("legal.privacy.collect.lead")}</P>
                <Bullets
                    items={[
                        labelled(t, "legal.privacy.collect.account", "legal.privacy.collect.accountLabel", v),
                        labelled(t, "legal.privacy.collect.phone", "legal.privacy.collect.phoneLabel", v),
                        labelled(t, "legal.privacy.collect.musicianProfile", "legal.privacy.collect.musicianProfileLabel", v),
                        labelled(t, "legal.privacy.collect.usage", "legal.privacy.collect.usageLabel", v),
                    ]}
                />
            </Section>

            <Section title={t("legal.privacy.use.heading")}>
                <P>{t("legal.privacy.use.lead")}</P>
                <Bullets
                    items={[
                        t("legal.privacy.use.provide"),
                        t("legal.privacy.use.notifications"),
                        t("legal.privacy.use.coordination"),
                        t("legal.privacy.use.improve"),
                    ]}
                />
            </Section>

            <Section title={t("legal.privacy.sms.heading")}>
                <P>{t("legal.privacy.sms.optIn", v)}</P>
                <Callout>{t("legal.privacy.sms.mobileInfoNotShared")}</Callout>
                <P>{t("legal.privacy.sms.frequencyAndOptOut")}</P>
            </Section>

            <Section title={t("legal.privacy.sharing.heading")}>
                <P>{t("legal.privacy.sharing.lead")}</P>
                <Bullets
                    items={[
                        labelled(t, "legal.privacy.sharing.providers", "legal.privacy.sharing.providersLabel", v),
                        labelled(t, "legal.privacy.sharing.withinOperator", "legal.privacy.sharing.withinOperatorLabel", v),
                        labelled(t, "legal.privacy.sharing.legal", "legal.privacy.sharing.legalLabel", v),
                    ]}
                />
            </Section>

            <Section title={t("legal.privacy.security.heading")}>
                <P>{t("legal.privacy.security.body")}</P>
            </Section>

            <Section title={t("legal.privacy.retention.heading")}>
                <P>{t("legal.privacy.retention.body")}</P>
            </Section>

            <Section title={t("legal.privacy.rights.heading")}>
                <P>{t("legal.privacy.rights.lead")}</P>
                <Bullets
                    items={[
                        t("legal.privacy.rights.access"),
                        t("legal.privacy.rights.correction"),
                        t("legal.privacy.rights.deletion"),
                        t("legal.privacy.rights.optOutSms"),
                        t("legal.privacy.rights.optOutEmail"),
                    ]}
                />
            </Section>

            <Section title={t("legal.privacy.children.heading")}>
                <P>{t("legal.privacy.children.body")}</P>
            </Section>

            <Section title={t("legal.privacy.changes.heading")}>
                <P>{t("legal.privacy.changes.body")}</P>
            </Section>

            <Section title={t("legal.privacy.contact.heading")}>
                <P>{rich(t("legal.privacy.contact.body", v), { email: <Mail email={lt.email} /> })}</P>
            </Section>
        </Page>
    )
}

export function PlatformTerms({ config, t }: LegalProps) {
    const lt = legalTenant(config)
    const v = legalVars(lt)
    return (
        <Page eyebrow={t("legal.eyebrow")} title={t("legal.terms.title")} subtitle={t("legal.terms.lastUpdated")}>
            <Intro>{t("legal.terms.intro", { ...v, platformLine: t("legal.platformLine", v) })}</Intro>

            <Section title={t("legal.terms.acceptance.heading")}>
                <P>{t("legal.terms.acceptance.body", v)}</P>
            </Section>

            <Section title={t("legal.terms.description.heading")}>
                <P>{t("legal.terms.description.lead", v)}</P>
                <Bullets
                    items={[
                        t("legal.terms.description.setlists"),
                        t("legal.terms.description.library"),
                        t("legal.terms.description.scheduling"),
                        t("legal.terms.description.notifications"),
                        t("legal.terms.description.calendar"),
                    ]}
                />
            </Section>

            <Section title={t("legal.terms.accounts.heading")}>
                <P>{t("legal.terms.accounts.body", v)}</P>
            </Section>

            <Section title={t("legal.terms.sms.heading")}>
                <P>{t("legal.terms.sms.lead")}</P>
                <Bullets
                    items={[
                        t("legal.terms.sms.receive", v),
                        t("legal.terms.sms.types"),
                        t("legal.terms.sms.frequency"),
                        t("legal.terms.sms.rates"),
                    ]}
                />
                <P>
                    {rich(t("legal.terms.sms.optOutAndHelp", v), {
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        stopKeyword: <Strong>STOP</Strong>,
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        helpKeyword: <Strong>HELP</Strong>,
                        email: <Mail email={lt.email} />,
                    })}
                </P>
                <Callout>{t("legal.terms.sms.mobileInfoNotShared")}</Callout>
            </Section>

            <Section title={t("legal.terms.acceptableUse.heading")}>
                <P>{t("legal.terms.acceptableUse.lead")}</P>
                <Bullets
                    items={[
                        t("legal.terms.acceptableUse.unlawful"),
                        t("legal.terms.acceptableUse.shareCredentials"),
                        t("legal.terms.acceptableUse.othersData"),
                        t("legal.terms.acceptableUse.malicious"),
                    ]}
                />
            </Section>

            <Section title={t("legal.terms.content.heading")}>
                <P>{t("legal.terms.content.body", v)}</P>
            </Section>

            <Section title={t("legal.terms.warranties.heading")}>
                <P>{t("legal.terms.warranties.body", v)}</P>
            </Section>

            <Section title={t("legal.terms.liability.heading")}>
                <P>{t("legal.terms.liability.body", v)}</P>
            </Section>

            <Section title={t("legal.terms.changes.heading")}>
                <P>{t("legal.terms.changes.body")}</P>
            </Section>

            <Section title={t("legal.terms.contact.heading")}>
                <P>{rich(t("legal.terms.contact.body", v), { email: <Mail email={lt.email} /> })}</P>
            </Section>
        </Page>
    )
}

export function PlatformSmsConsent({ config, t }: LegalProps) {
    const lt = legalTenant(config)
    const v = legalVars(lt)
    const web = (
        <a href={`https://${lt.host}`} className="text-brand font-medium hover:underline underline-offset-2">
            {lt.host}
        </a>
    )
    const steps: ReactNode[] = [
        rich(t("legal.sms.consent.stepSignIn", v), { web }),
        rich(t("legal.sms.consent.stepNavigate"), { settingsPath: <Strong>{t("legal.sms.consent.settingsPath")}</Strong> }),
        t("legal.sms.consent.stepPhone"),
        rich(t("legal.sms.consent.stepToggle"), { switchLabel: <Strong>{t("legal.sms.consent.smsSwitchLabel")}</Strong> }),
        t("legal.sms.consent.stepSave"),
    ]
    return (
        <Page eyebrow={t("legal.eyebrow")} title={t("legal.sms.title")} subtitle={t("legal.sms.subtitle", v)}>
            <div className="p-5 sm:p-6 rounded-xl border border-brand/20 bg-brand/5">
                <h2 className="text-lg font-semibold text-foreground mb-3">{t("legal.sms.highlight.heading")}</h2>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{t("legal.sms.highlight.intro", v)}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {rich(t("legal.sms.highlight.optInVoluntary", v), {
                        voluntary: <Strong>{t("legal.sms.highlight.voluntary")}</Strong>,
                        notRequired: <Strong>{t("legal.sms.highlight.notRequired")}</Strong>,
                    })}
                </p>
            </div>

            <Section title={t("legal.sms.program.heading")}>
                <P>{t("legal.sms.program.lead", { ...v, platformLine: t("legal.platformLine", v) })}</P>
                <Bullets
                    items={[
                        labelled(t, "legal.sms.program.assignments", "legal.sms.program.assignmentsLabel", v),
                        labelled(t, "legal.sms.program.reminders", "legal.sms.program.remindersLabel", v),
                        labelled(t, "legal.sms.program.confirmations", "legal.sms.program.confirmationsLabel", v),
                        labelled(t, "legal.sms.program.cancellations", "legal.sms.program.cancellationsLabel", v),
                        labelled(t, "legal.sms.program.changes", "legal.sms.program.changesLabel", v),
                    ]}
                />
            </Section>

            <Section title={t("legal.sms.consent.heading")}>
                <P>{t("legal.sms.consent.lead")}</P>
                <ol className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none ps-0">
                    {steps.map((step, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
                <P>{t("legal.sms.consent.affirm", v)}</P>
            </Section>

            <Section title={t("legal.sms.frequency.heading")}>
                <P>{t("legal.sms.frequency.body")}</P>
            </Section>

            <Section title={t("legal.sms.rates.heading")}>
                <P>{t("legal.sms.rates.body", v)}</P>
            </Section>

            <Section title={t("legal.sms.optOut.heading")}>
                <P>{t("legal.sms.optOut.lead")}</P>
                <Bullets
                    items={[
                        rich(t("legal.sms.optOut.replyStop", v), {
                            // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                            stopKeyword: <Strong>STOP</Strong>,
                        }),
                        t("legal.sms.optOut.disableToggle", v),
                        t("legal.sms.optOut.removePhone"),
                        rich(t("legal.sms.optOut.contactUs"), { email: <Mail email={lt.email} /> }),
                    ]}
                />
                <P>{t("legal.sms.optOut.after", v)}</P>
            </Section>

            <Section title={t("legal.sms.help.heading")}>
                <P>
                    {rich(t("legal.sms.help.body"), {
                        // i18n-ignore: SMS keyword the carrier recognises; must stay verbatim
                        helpKeyword: <Strong>HELP</Strong>,
                        email: <Mail email={lt.email} />,
                    })}
                </P>
            </Section>

            <Section title={t("legal.sms.privacy.heading")}>
                <Callout>{t("legal.sms.privacy.mobileInfoNotShared")}</Callout>
                <P>
                    {rich(t("legal.sms.privacy.body"), {
                        privacyLink: (
                            <Link href="/privacy" className="text-brand font-medium hover:underline underline-offset-2">
                                {t("legal.sms.privacy.privacyPolicyLink")}
                            </Link>
                        ),
                    })}
                </P>
            </Section>

            <Section title={t("legal.sms.contact.heading")}>
                <div className="p-5 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 shadow-sm">
                    <p className="text-sm text-foreground font-semibold">{lt.operator}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("legal.sms.contact.application", v)}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t("legal.sms.contact.platform", v)}</p>
                    <div className="h-px bg-border/40 my-3" />
                    <p className="text-sm text-muted-foreground">{rich(t("legal.sms.contact.email"), { email: <Mail email={lt.email} /> })}</p>
                    <p className="text-sm text-muted-foreground mt-1">{rich(t("legal.sms.contact.web"), { web })}</p>
                </div>
            </Section>

            <Section title={t("legal.sms.related.heading")}>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/privacy" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                        <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">{t("legal.sms.related.privacyTitle")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("legal.sms.related.privacyBlurb")}</p>
                    </Link>
                    <Link href="/terms" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                        <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">{t("legal.sms.related.termsTitle")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("legal.sms.related.termsBlurb")}</p>
                    </Link>
                </div>
            </Section>
        </Page>
    )
}

export function PlatformAccessibility({ config, t }: LegalProps) {
    const lt = legalTenant(config)
    const v = legalVars(lt)
    return (
        <Page eyebrow={t("legal.eyebrow")} title={t("legal.accessibility.title")} subtitle={t("legal.accessibility.lastUpdated")}>
            <Intro>{t("legal.accessibility.intro", { ...v, platformLine: t("legal.platformLine", v) })}</Intro>

            <Section title={t("legal.accessibility.doing.heading")}>
                <Bullets
                    items={[
                        rich(t("legal.accessibility.doing.landmarks"), {
                            // i18n-ignore: HTML element name, code
                            mainTag: <code>&lt;main&gt;</code>,
                            // i18n-ignore: HTML element name, code
                            navTag: <code>&lt;nav&gt;</code>,
                        }),
                        rich(t("legal.accessibility.doing.accessibleNames"), {
                            // i18n-ignore: ARIA attribute name, code
                            ariaLabel: <code>aria-label</code>,
                            // i18n-ignore: HTML element name, code
                            labelTag: <code>&lt;label&gt;</code>,
                        }),
                        t("legal.accessibility.doing.contrast"),
                        rich(t("legal.accessibility.doing.pinchZoom"), {
                            // i18n-ignore: viewport setting, code
                            maxScale: <code>maximum-scale=1</code>,
                        }),
                        t("legal.accessibility.doing.skipLink"),
                        t("legal.accessibility.doing.keyboard"),
                        t("legal.accessibility.doing.axe"),
                    ]}
                />
            </Section>

            <Section title={t("legal.accessibility.limitations.heading")}>
                <P>{t("legal.accessibility.limitations.body")}</P>
            </Section>

            <Section title={t("legal.accessibility.report.heading")}>
                <P>{rich(t("legal.accessibility.report.body"), { email: <Mail email={lt.email} /> })}</P>
            </Section>
        </Page>
    )
}
