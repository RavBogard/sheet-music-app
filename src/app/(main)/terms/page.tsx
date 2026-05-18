// C5D-007: legal pages are explicitly indexable; root noindex applies
// to the authed app, this override exempts public legal disclosure.
export const metadata = {
    title: "Terms & Conditions",
    robots: { index: true, follow: true },
}

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">Legal</p>
                    <h1 className="text-title-large mb-2">Terms &amp; Conditions</h1>
                    <p className="text-muted-foreground text-sm">Last updated: February 23, 2026</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">
                    Welcome to CRC Music, a web application operated by Central Reform Congregation (&ldquo;CRC&rdquo;, &ldquo;we&rdquo;,
                    &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By using this Service, you agree to these Terms &amp; Conditions.
                </p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">1. Acceptance of Terms</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        By accessing or using the CRC Music application, you agree to be bound by these Terms.
                        If you do not agree to these Terms, you may not use the Service.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">2. Description of Service</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        CRC Music is a musician coordination tool for Central Reform Congregation that provides:
                    </p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Setlist creation and management</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Sheet music library and transposition</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Musician scheduling and assignment</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Notification services (email, SMS, push)</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Calendar synchronization</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">3. User Accounts</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        You are responsible for maintaining the confidentiality of your account. You agree to
                        provide accurate information when creating your account. CRC administrators manage
                        user roles and access levels.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">4. SMS Messaging Terms</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">By opting in to SMS notifications through the Service, you agree to:</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Receive text messages related to your scheduling assignments at CRC</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Message types include: assignment notifications, reminders, confirmations, and cancellations</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Message frequency varies based on your scheduling activity</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Message and data rates may apply depending on your mobile carrier</li>
                    </ul>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        You may opt out of SMS messages at any time by replying <strong className="text-foreground">STOP</strong> to any
                        message or by disabling SMS notifications in your profile settings.
                        For help, reply <strong className="text-foreground">HELP</strong> to any message or contact us at{' '}
                        <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>.
                    </p>
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">
                            Mobile information will not be shared with third parties for marketing or
                            promotional purposes.
                        </p>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">5. Acceptable Use</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">You agree not to:</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Use the Service for any unlawful purpose</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Share your account credentials with others</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Attempt to access other users&apos; data without authorization</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Upload malicious content or interfere with the Service&apos;s operation</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">6. Content</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Sheet music and other content in the Service is managed by CRC for use in
                        CRC services and events. Users must respect copyright and intellectual property rights.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">7. Disclaimer of Warranties</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        The Service is provided &ldquo;as is&rdquo; without warranties of any kind, either express or implied.
                        CRC does not guarantee that the Service will be uninterrupted, secure, or error-free.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">8. Limitation of Liability</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        CRC shall not be liable for any indirect, incidental, special, consequential, or punitive
                        damages arising from your use of the Service.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">9. Changes to Terms</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We reserve the right to modify these Terms at any time. Continued use of the Service
                        after changes constitutes acceptance of the new Terms.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">10. Contact</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        For questions about these Terms, contact Central Reform Congregation at{' '}
                        <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>.
                    </p>
                </section>
            </div>
        </div>
    )
}
