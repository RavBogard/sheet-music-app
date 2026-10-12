import Link from "next/link"
import type { ReactNode } from "react"
import type { OrgConfig } from "@/lib/org/config-schema"

/**
 * Multi-tenant phase 1: the legal pages for a tenant whose config has
 * `legal.useCrcText: false`. CRC and Brothers Lazaroff keep CRC's exact pages
 * (src/app/(main)/{privacy,terms,sms-consent,accessibility}/page.tsx).
 *
 * Each page is adapted section by section from the CRC text: the tenant
 * (`legal.operatorName`) takes CRC's place, and the pages say the Service runs
 * on the centralreform.live platform operated by Rabbi Daniel Bogard. Nothing
 * here promises more than the CRC text does.
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

function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">Legal</p>
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
        <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
            {items.map((item, i) => (
                <li key={i} className="flex gap-2">
                    <span className="text-brand shrink-0">&#x2022;</span>
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

function PlatformLine({ t }: { t: LegalTenant }) {
    return (
        <>
            The Service runs on the {PLATFORM_HOST} platform, operated by {PLATFORM_OPERATOR}, on behalf of {t.operator}.
        </>
    )
}

export function PlatformPrivacyPolicy({ config }: { config: OrgConfig }) {
    const t = legalTenant(config)
    return (
        <Page title="Privacy Policy" subtitle="Last updated: February 23, 2026">
            <Intro>
                {t.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) provides the {t.appName} web
                application (the &ldquo;Service&rdquo;). <PlatformLine t={t} /> This page informs you of our policies
                regarding the collection, use, and disclosure of personal data when you use the Service.
            </Intro>

            <Section title="Information We Collect">
                <P>We collect the following types of information:</P>
                <Bullets
                    items={[
                        <><strong className="text-foreground">Account Information:</strong> Your name, email address, and profile photo when you create an account or sign in.</>,
                        <><strong className="text-foreground">Phone Number:</strong> If you choose to provide your phone number for SMS scheduling notifications.</>,
                        <><strong className="text-foreground">Musician Profile Data:</strong> Your instrument preference, transposition settings, and scheduling availability.</>,
                        <><strong className="text-foreground">Usage Data:</strong> Information about how you use the Service, including pages visited and features used.</>,
                    ]}
                />
            </Section>

            <Section title="How We Use Your Information">
                <P>We use collected information to:</P>
                <Bullets
                    items={[
                        "Provide and maintain the Service",
                        "Send scheduling notifications via email, SMS, and push notifications",
                        "Facilitate musician coordination and setlist management",
                        "Improve the Service",
                    ]}
                />
            </Section>

            <Section title="SMS / Mobile Messaging">
                <P>
                    If you opt in to receive SMS notifications, we will send you text messages related to your scheduling
                    assignments, reminders, and cancellations at {t.operator}.
                </P>
                <Callout>
                    Mobile information, including phone numbers, will not be shared with third parties for marketing or
                    promotional purposes. Mobile information will only be shared with third parties as necessary to deliver
                    the SMS messaging service (i.e., our SMS delivery provider, Twilio).
                </Callout>
                <P>
                    Message frequency varies based on your scheduling activity. Message and data rates may apply. You may opt
                    out of SMS notifications at any time through your profile settings or by replying STOP to any message.
                </P>
            </Section>

            <Section title="Data Sharing">
                <P>
                    We do not sell, trade, or rent your personal information to third parties. We share information only in
                    the following circumstances:
                </P>
                <Bullets
                    items={[
                        <><strong className="text-foreground">Service Providers:</strong> We use trusted third-party services (Firebase, Resend, Twilio) to operate the Service. These providers only have access to information necessary to perform their functions.</>,
                        <><strong className="text-foreground">Within {t.operator}:</strong> Band leaders and administrators may see your scheduling availability and contact information to coordinate services.</>,
                        <><strong className="text-foreground">Legal Requirements:</strong> We may disclose information if required by law.</>,
                    ]}
                />
            </Section>

            <Section title="Data Security">
                <P>
                    We use industry-standard security measures to protect your data, including encrypted connections (HTTPS),
                    Firebase Authentication, and role-based access controls. However, no method of transmission over the
                    Internet is 100% secure.
                </P>
            </Section>

            <Section title="Data Retention">
                <P>
                    We retain your personal data only for as long as you maintain an account with the Service. You may request
                    deletion of your account and associated data by contacting us.
                </P>
            </Section>

            <Section title="Your Rights">
                <P>You have the right to:</P>
                <Bullets
                    items={[
                        "Access the personal information we hold about you",
                        "Request correction of inaccurate information",
                        "Request deletion of your account and data",
                        "Opt out of SMS notifications at any time",
                        "Opt out of email notifications at any time",
                    ]}
                />
            </Section>

            <Section title={"Children's Privacy"}>
                <P>
                    The Service is not intended for use by anyone under the age of 13. We do not knowingly collect personal
                    information from children under 13.
                </P>
            </Section>

            <Section title="Changes to This Policy">
                <P>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
                    Privacy Policy on this page and updating the &ldquo;Last updated&rdquo; date.
                </P>
            </Section>

            <Section title="Contact Us">
                <P>
                    If you have any questions about this Privacy Policy, please contact {t.operator} at <Mail email={t.email} />.
                </P>
            </Section>
        </Page>
    )
}

export function PlatformTerms({ config }: { config: OrgConfig }) {
    const t = legalTenant(config)
    return (
        <Page title="Terms & Conditions" subtitle="Last updated: February 23, 2026">
            <Intro>
                Welcome to {t.appName}, a web application provided by {t.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
                &ldquo;our&rdquo;). <PlatformLine t={t} /> By using this Service, you agree to these Terms &amp; Conditions.
            </Intro>

            <Section title="1. Acceptance of Terms">
                <P>
                    By accessing or using the {t.appName} application, you agree to be bound by these Terms. If you do not
                    agree to these Terms, you may not use the Service.
                </P>
            </Section>

            <Section title="2. Description of Service">
                <P>{t.appName} is a musician coordination tool for {t.operator} that provides:</P>
                <Bullets
                    items={[
                        "Setlist creation and management",
                        "Sheet music library and transposition",
                        "Musician scheduling and assignment",
                        "Notification services (email, SMS, push)",
                        "Calendar synchronization",
                    ]}
                />
            </Section>

            <Section title="3. User Accounts">
                <P>
                    You are responsible for maintaining the confidentiality of your account. You agree to provide accurate
                    information when creating your account. {t.operator} administrators manage user roles and access levels.
                </P>
            </Section>

            <Section title="4. SMS Messaging Terms">
                <P>By opting in to SMS notifications through the Service, you agree to:</P>
                <Bullets
                    items={[
                        `Receive text messages related to your scheduling assignments at ${t.operator}`,
                        "Message types include: assignment notifications, reminders, confirmations, and cancellations",
                        "Message frequency varies based on your scheduling activity",
                        "Message and data rates may apply depending on your mobile carrier",
                    ]}
                />
                <P>
                    You may opt out of SMS messages at any time by replying <strong className="text-foreground">STOP</strong> to
                    any message or by disabling SMS notifications in your profile settings. For help, reply{" "}
                    <strong className="text-foreground">HELP</strong> to any message or contact us at <Mail email={t.email} />.
                </P>
                <Callout>Mobile information will not be shared with third parties for marketing or promotional purposes.</Callout>
            </Section>

            <Section title="5. Acceptable Use">
                <P>You agree not to:</P>
                <Bullets
                    items={[
                        "Use the Service for any unlawful purpose",
                        "Share your account credentials with others",
                        "Attempt to access other users' data without authorization",
                        "Upload malicious content or interfere with the Service's operation",
                    ]}
                />
            </Section>

            <Section title="6. Content">
                <P>
                    Sheet music and other content in the Service is managed by {t.operator} for use in its services and
                    events. Users must respect copyright and intellectual property rights.
                </P>
            </Section>

            <Section title="7. Disclaimer of Warranties">
                <P>
                    The Service is provided &ldquo;as is&rdquo; without warranties of any kind, either express or implied.
                    {" "}{t.operator} does not guarantee that the Service will be uninterrupted, secure, or error-free.
                </P>
            </Section>

            <Section title="8. Limitation of Liability">
                <P>
                    {t.operator} shall not be liable for any indirect, incidental, special, consequential, or punitive
                    damages arising from your use of the Service.
                </P>
            </Section>

            <Section title="9. Changes to Terms">
                <P>
                    We reserve the right to modify these Terms at any time. Continued use of the Service after changes
                    constitutes acceptance of the new Terms.
                </P>
            </Section>

            <Section title="10. Contact">
                <P>
                    For questions about these Terms, contact {t.operator} at <Mail email={t.email} />.
                </P>
            </Section>
        </Page>
    )
}

export function PlatformSmsConsent({ config }: { config: OrgConfig }) {
    const t = legalTenant(config)
    const web = <a href={`https://${t.host}`} className="text-brand font-medium hover:underline underline-offset-2">{t.host}</a>
    return (
        <Page title="SMS Messaging Consent & Opt-In" subtitle={`${t.operator} — ${t.appName}`}>
            <div className="p-5 sm:p-6 rounded-xl border border-brand/20 bg-brand/5">
                <h2 className="text-lg font-semibold text-foreground mb-3">How SMS Opt-In Works</h2>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                    {t.appName} musicians may opt in to receive SMS scheduling notifications by providing their phone number
                    and enabling SMS notifications in their profile settings within the {t.appName} application.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    Opt-in is <strong className="text-foreground">voluntary</strong> and{" "}
                    <strong className="text-foreground">not required</strong> to use the {t.appName} application. Musicians
                    can use email and in-app notifications instead.
                </p>
            </div>

            <Section title="Program Description">
                <P>
                    {t.operator} provides the {t.appName} application, which includes an optional SMS notification service
                    for musician scheduling. <PlatformLine t={t} /> When musicians opt in, they receive text messages about:
                </P>
                <Bullets
                    items={[
                        <><strong className="text-foreground">Scheduling Assignments:</strong> Notification when you&apos;re assigned to play at a service</>,
                        <><strong className="text-foreground">Reminders:</strong> Service reminders 48 hours before your scheduled performance</>,
                        <><strong className="text-foreground">Confirmations:</strong> Confirmation when you accept or decline an assignment</>,
                        <><strong className="text-foreground">Cancellations:</strong> Notification if a service or your assignment is cancelled</>,
                        <><strong className="text-foreground">Schedule Changes:</strong> Updates to services you&apos;re assigned to</>,
                    ]}
                />
            </Section>

            <Section title="Consent Process">
                <P>Musicians provide consent to receive SMS messages through the following process:</P>
                <ol className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                    {[
                        <>Sign in to the {t.appName} application at {web}</>,
                        <>Navigate to <strong className="text-foreground">Settings &rarr; Musician Profile &rarr; Scheduling</strong></>,
                        <>Enter your phone number in the Phone Number field</>,
                        <>Toggle the <strong className="text-foreground">SMS</strong> notification switch to ON</>,
                        <>Save your profile settings</>,
                    ].map((step, i) => (
                        <li key={i} className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>
                <P>
                    By completing these steps, the musician affirmatively consents to receive SMS messages from {t.appName} at
                    the phone number provided.
                </P>
            </Section>

            <Section title="Message Frequency">
                <P>
                    Message frequency varies based on how often the musician is scheduled for services. Typical musicians
                    receive 2-8 messages per month. Messages are only sent in relation to your specific scheduling activity.
                </P>
            </Section>

            <Section title="Message and Data Rates">
                <P>
                    Standard message and data rates may apply depending on your mobile carrier and plan. {t.operator} does
                    not charge for SMS messages sent through the Service.
                </P>
            </Section>

            <Section title="Opt-Out">
                <P>You may opt out of SMS messages at any time by:</P>
                <Bullets
                    items={[
                        <>Replying <strong className="text-foreground">STOP</strong> to any message received from {t.appName}</>,
                        `Disabling the SMS toggle in your ${t.appName} profile settings`,
                        "Removing your phone number from your profile settings",
                        <>Contacting us at <Mail email={t.email} /></>,
                    ]}
                />
                <P>
                    After opting out, you will receive one final confirmation message. You will no longer receive SMS
                    messages from {t.appName} unless you opt in again.
                </P>
            </Section>

            <Section title="Help">
                <P>
                    For help with SMS notifications, reply <strong className="text-foreground">HELP</strong> to any message or
                    contact us at <Mail email={t.email} />.
                </P>
            </Section>

            <Section title="Data Privacy">
                <Callout>
                    Mobile information, including phone numbers, will not be shared with third parties for marketing or
                    promotional purposes.
                </Callout>
                <P>
                    Phone numbers are stored securely and used solely for delivering scheduling-related SMS messages through
                    our messaging provider (Twilio). See our full{" "}
                    <Link href="/privacy" className="text-brand font-medium hover:underline underline-offset-2">Privacy Policy</Link>{" "}
                    for details on how we handle your data.
                </P>
            </Section>

            <Section title="Contact Information">
                <div className="p-5 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 shadow-sm">
                    <p className="text-sm text-foreground font-semibold">{t.operator}</p>
                    <p className="text-sm text-muted-foreground mt-1">{t.appName} Application</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        On the {PLATFORM_HOST} platform, operated by {PLATFORM_OPERATOR}
                    </p>
                    <div className="h-px bg-border/40 my-3" />
                    <p className="text-sm text-muted-foreground">Email: <Mail email={t.email} /></p>
                    <p className="text-sm text-muted-foreground mt-1">Web: {web}</p>
                </div>
            </Section>

            <Section title="Related Policies">
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href="/privacy" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                        <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">Privacy Policy</p>
                        <p className="text-xs text-muted-foreground mt-0.5">How we handle your data</p>
                    </Link>
                    <Link href="/terms" className="flex-1 p-4 rounded-xl border border-border/60 bg-card/50 hover:bg-card/80 hover:border-brand/30 transition-all duration-200 group">
                        <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors">Terms &amp; Conditions</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Service usage terms</p>
                    </Link>
                </div>
            </Section>
        </Page>
    )
}

export function PlatformAccessibility({ config }: { config: OrgConfig }) {
    const t = legalTenant(config)
    return (
        <Page title="Accessibility Statement" subtitle="Last updated: May 19, 2026">
            <Intro>
                {t.operator} is committed to making the {t.appName} web application accessible to everyone who uses it.{" "}
                <PlatformLine t={t} /> We aim to meet or exceed the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA
                across the app.
            </Intro>

            <Section title={"What we're doing"}>
                <Bullets
                    items={[
                        <>Semantic HTML landmarks (<code>&lt;main&gt;</code>, <code>&lt;nav&gt;</code>, headings) on every route.</>,
                        <>Accessible names on all icon-only buttons (<code>aria-label</code>) and form fields (<code>&lt;label&gt;</code> or <code>aria-label</code>, never placeholder-as-label).</>,
                        "WCAG 2.1 AA contrast on body text and interactive surfaces.",
                        <>Pinch-zoom and user-scaling preserved on mobile (no <code>maximum-scale=1</code> viewport lock).</>,
                        "Skip-link to main content on app-shell routes.",
                        "Keyboard support in Perform mode (chart navigation, transpose, metronome) and live regions for setlist mutations.",
                        "Automated axe-core sweeps run as part of our audit cadence.",
                    ]}
                />
            </Section>

            <Section title="Known limitations">
                <P>
                    We track open accessibility findings on every release cycle. The PDF-render surface inside Perform mode is
                    the area where assistive-technology support is most limited today; we&apos;re working to surface chart
                    structure (sections, key, capo) outside the rendered image where possible.
                </P>
            </Section>

            <Section title="Report a barrier">
                <P>
                    If you encounter a part of the app you can&apos;t use with your assistive technology, please email{" "}
                    <Mail email={t.email} />. Include the page URL and a short description; we&apos;ll respond within a week.
                </P>
            </Section>
        </Page>
    )
}
