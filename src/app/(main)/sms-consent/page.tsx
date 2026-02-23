import Link from "next/link"

export default function SmsConsentPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">Legal</p>
                    <h1 className="text-title-large mb-2">SMS Messaging Consent &amp; Opt-In</h1>
                    <p className="text-muted-foreground text-sm">Central Reform Congregation &mdash; CRC Music</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                {/* Highlight card */}
                <div className="p-5 sm:p-6 rounded-xl border border-brand/20 bg-brand/5">
                    <h2 className="text-lg font-semibold text-foreground mb-3">How SMS Opt-In Works</h2>
                    <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                        CRC Music musicians may opt in to receive SMS scheduling notifications by providing
                        their phone number and enabling SMS notifications in their profile settings within
                        the CRC Music application.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Opt-in is <strong className="text-foreground">voluntary</strong> and <strong className="text-foreground">not required</strong> to use the CRC Music
                        application. Musicians can use email and in-app notifications instead.
                    </p>
                </div>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Program Description</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Central Reform Congregation operates the CRC Music application, which includes an
                        optional SMS notification service for musician scheduling. When musicians opt in,
                        they receive text messages about:
                    </p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Scheduling Assignments:</strong> Notification when you&apos;re assigned to play at a service</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Reminders:</strong> Service reminders 48 hours before your scheduled performance</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Confirmations:</strong> Confirmation when you accept or decline an assignment</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Cancellations:</strong> Notification if a service or your assignment is cancelled</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Schedule Changes:</strong> Updates to services you&apos;re assigned to</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Consent Process</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">Musicians provide consent to receive SMS messages through the following process:</p>
                    <ol className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0 counter-reset-custom">
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">1</span><span>Sign in to the CRC Music application at <a href="https://www.centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">www.centralreform.live</a></span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">2</span><span>Navigate to <strong className="text-foreground">Settings &rarr; Musician Profile &rarr; Scheduling</strong></span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">3</span><span>Enter your phone number in the Phone Number field</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">4</span><span>Toggle the <strong className="text-foreground">SMS</strong> notification switch to ON</span></li>
                        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-semibold flex items-center justify-center shrink-0">5</span><span>Save your profile settings</span></li>
                    </ol>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        By completing these steps, the musician affirmatively consents to receive SMS messages
                        from CRC Music at the phone number provided.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Message Frequency</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Message frequency varies based on how often the musician is scheduled for services.
                        Typical musicians receive 2-8 messages per month. Messages are only sent in
                        relation to your specific scheduling activity.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Message and Data Rates</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Standard message and data rates may apply depending on your mobile carrier and plan.
                        CRC does not charge for SMS messages sent through the Service.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Opt-Out</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">You may opt out of SMS messages at any time by:</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Replying <strong className="text-foreground">STOP</strong> to any message received from CRC Music</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Disabling the SMS toggle in your CRC Music profile settings</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Removing your phone number from your profile settings</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Contacting us at <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a></li>
                    </ul>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        After opting out, you will receive one final confirmation message. You will no longer
                        receive SMS messages from CRC Music unless you opt in again.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Help</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        For help with SMS notifications, reply <strong className="text-foreground">HELP</strong> to any message or contact
                        us at <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a>.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Data Privacy</h2>
                    <div className="h-px bg-border/50" />
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">
                            Mobile information, including phone numbers, will not be shared with third
                            parties for marketing or promotional purposes.
                        </p>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Phone numbers are stored securely and used solely for delivering scheduling-related
                        SMS messages through our messaging provider (Twilio). See our full{' '}
                        <Link href="/privacy" className="text-brand font-medium hover:underline underline-offset-2">Privacy Policy</Link> for
                        details on how we handle your data.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Contact Information</h2>
                    <div className="h-px bg-border/50" />
                    <div className="p-5 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 shadow-sm">
                        <p className="text-sm text-foreground font-semibold">Central Reform Congregation</p>
                        <p className="text-sm text-muted-foreground mt-1">CRC Music Application</p>
                        <div className="h-px bg-border/40 my-3" />
                        <p className="text-sm text-muted-foreground">Email: <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">music@centralreform.live</a></p>
                        <p className="text-sm text-muted-foreground mt-1">Web: <a href="https://www.centralreform.live" className="text-brand font-medium hover:underline underline-offset-2">www.centralreform.live</a></p>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Related Policies</h2>
                    <div className="h-px bg-border/50" />
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
                </section>
            </div>
        </div>
    )
}
