export default function TermsPage() {
    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
                <h1 className="text-3xl font-bold mb-2">Terms & Conditions</h1>
                <p className="text-muted-foreground text-sm mb-8">Last updated: February 23, 2026</p>

                <p>
                    Welcome to CRC Music, a web application operated by Central Reform Congregation ("CRC", "we",
                    "us", or "our"). By using this Service, you agree to these Terms & Conditions.
                </p>

                <h2>1. Acceptance of Terms</h2>
                <p>
                    By accessing or using the CRC Music application, you agree to be bound by these Terms.
                    If you do not agree to these Terms, you may not use the Service.
                </p>

                <h2>2. Description of Service</h2>
                <p>
                    CRC Music is a musician coordination tool for Central Reform Congregation that provides:
                </p>
                <ul>
                    <li>Setlist creation and management</li>
                    <li>Sheet music library and transposition</li>
                    <li>Musician scheduling and assignment</li>
                    <li>Notification services (email, SMS, push)</li>
                    <li>Calendar synchronization</li>
                </ul>

                <h2>3. User Accounts</h2>
                <p>
                    You are responsible for maintaining the confidentiality of your account. You agree to
                    provide accurate information when creating your account. CRC administrators manage
                    user roles and access levels.
                </p>

                <h2>4. SMS Messaging Terms</h2>
                <p>By opting in to SMS notifications through the Service, you agree to:</p>
                <ul>
                    <li>Receive text messages related to your scheduling assignments at CRC</li>
                    <li>Message types include: assignment notifications, reminders, confirmations, and cancellations</li>
                    <li>Message frequency varies based on your scheduling activity</li>
                    <li>Message and data rates may apply depending on your mobile carrier</li>
                </ul>
                <p>
                    You may opt out of SMS messages at any time by replying <strong>STOP</strong> to any
                    message or by disabling SMS notifications in your profile settings.
                    For help, reply <strong>HELP</strong> to any message or contact us at{' '}
                    <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a>.
                </p>
                <p className="font-semibold">
                    Mobile information will not be shared with third parties for marketing or
                    promotional purposes.
                </p>

                <h2>5. Acceptable Use</h2>
                <p>You agree not to:</p>
                <ul>
                    <li>Use the Service for any unlawful purpose</li>
                    <li>Share your account credentials with others</li>
                    <li>Attempt to access other users' data without authorization</li>
                    <li>Upload malicious content or interfere with the Service's operation</li>
                </ul>

                <h2>6. Content</h2>
                <p>
                    Sheet music and other content in the Service is managed by CRC for use in
                    CRC services and events. Users must respect copyright and intellectual property rights.
                </p>

                <h2>7. Disclaimer of Warranties</h2>
                <p>
                    The Service is provided "as is" without warranties of any kind, either express or implied.
                    CRC does not guarantee that the Service will be uninterrupted, secure, or error-free.
                </p>

                <h2>8. Limitation of Liability</h2>
                <p>
                    CRC shall not be liable for any indirect, incidental, special, consequential, or punitive
                    damages arising from your use of the Service.
                </p>

                <h2>9. Changes to Terms</h2>
                <p>
                    We reserve the right to modify these Terms at any time. Continued use of the Service
                    after changes constitutes acceptance of the new Terms.
                </p>

                <h2>10. Contact</h2>
                <p>
                    For questions about these Terms, contact Central Reform Congregation at{' '}
                    <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a>.
                </p>
            </div>
        </div>
    )
}
