export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">Legal</p>
                    <h1 className="text-title-large mb-2">Privacy Policy</h1>
                    <p className="text-muted-foreground text-sm">Last updated: February 23, 2026</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">
                    Central Reform Congregation (&ldquo;CRC&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the CRC Music web application
                    (the &ldquo;Service&rdquo;). This page informs you of our policies regarding the collection, use, and disclosure
                    of personal data when you use our Service.
                </p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Information We Collect</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">We collect the following types of information:</p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Account Information:</strong> Your name, email address, and profile photo when you create an account or sign in.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Phone Number:</strong> If you choose to provide your phone number for SMS scheduling notifications.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Musician Profile Data:</strong> Your instrument preference, transposition settings, and scheduling availability.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Usage Data:</strong> Information about how you use the Service, including pages visited and features used.</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">How We Use Your Information</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">We use collected information to:</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Provide and maintain the Service</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Send scheduling notifications via email, SMS, and push notifications</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Facilitate musician coordination and setlist management</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Improve the Service</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">SMS / Mobile Messaging</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        If you opt in to receive SMS notifications, we will send you text messages related to your
                        scheduling assignments, reminders, and cancellations at Central Reform Congregation.
                    </p>
                    <div className="p-4 rounded-xl bg-brand/5 border border-brand/15">
                        <p className="text-sm font-medium text-foreground leading-relaxed">
                            Mobile information, including phone numbers, will not be shared with third parties
                            for marketing or promotional purposes. Mobile information will only be shared with
                            third parties as necessary to deliver the SMS messaging service (i.e., our SMS
                            delivery provider, Twilio).
                        </p>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Message frequency varies based on your scheduling activity. Message and data rates may apply.
                        You may opt out of SMS notifications at any time through your profile settings or by replying
                        STOP to any message.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Data Sharing</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We do not sell, trade, or rent your personal information to third parties. We share information
                        only in the following circumstances:
                    </p>
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Service Providers:</strong> We use trusted third-party services (Firebase, Resend, Twilio) to operate the Service. These providers only have access to information necessary to perform their functions.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Within CRC:</strong> Band leaders and administrators may see your scheduling availability and contact information to coordinate services.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span><strong className="text-foreground">Legal Requirements:</strong> We may disclose information if required by law.</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Data Security</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We use industry-standard security measures to protect your data, including encrypted connections
                        (HTTPS), Firebase Authentication, and role-based access controls. However, no method of
                        transmission over the Internet is 100% secure.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Data Retention</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We retain your personal data only for as long as you maintain an account with the Service.
                        You may request deletion of your account and associated data by contacting us.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Your Rights</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">You have the right to:</p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Access the personal information we hold about you</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Request correction of inaccurate information</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Request deletion of your account and data</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Opt out of SMS notifications at any time</li>
                        <li className="flex gap-2"><span className="text-brand shrink-0">&#x2022;</span>Opt out of email notifications at any time</li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Children&apos;s Privacy</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        The Service is not intended for use by anyone under the age of 13. We do not knowingly
                        collect personal information from children under 13.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Changes to This Policy</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We may update this Privacy Policy from time to time. We will notify you of any changes by
                        posting the new Privacy Policy on this page and updating the &ldquo;Last updated&rdquo; date.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Contact Us</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        If you have any questions about this Privacy Policy, please contact Central Reform Congregation
                        at <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2 transition-colors">music@centralreform.live</a>.
                    </p>
                </section>
            </div>
        </div>
    )
}
