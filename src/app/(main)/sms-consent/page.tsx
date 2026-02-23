import Link from "next/link"

export default function SmsConsentPage() {
    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
                <h1 className="text-3xl font-bold mb-2">SMS Messaging Consent & Opt-In</h1>
                <p className="text-muted-foreground text-sm mb-8">Central Reform Congregation — CRC Music</p>

                <div className="not-prose p-6 rounded-2xl border border-brand/30 bg-brand/5 mb-8">
                    <h2 className="text-lg font-semibold text-foreground mb-3">How SMS Opt-In Works</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                        CRC Music musicians may opt in to receive SMS scheduling notifications by providing
                        their phone number and enabling SMS notifications in their profile settings within
                        the CRC Music application.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Opt-in is <strong>voluntary</strong> and <strong>not required</strong> to use the CRC Music
                        application. Musicians can use email and in-app notifications instead.
                    </p>
                </div>

                <h2>Program Description</h2>
                <p>
                    Central Reform Congregation operates the CRC Music application, which includes an
                    optional SMS notification service for musician scheduling. When musicians opt in,
                    they receive text messages about:
                </p>
                <ul>
                    <li><strong>Scheduling Assignments:</strong> Notification when you're assigned to play at a service</li>
                    <li><strong>Reminders:</strong> Service reminders 48 hours before your scheduled performance</li>
                    <li><strong>Confirmations:</strong> Confirmation when you accept or decline an assignment</li>
                    <li><strong>Cancellations:</strong> Notification if a service or your assignment is cancelled</li>
                    <li><strong>Schedule Changes:</strong> Updates to services you're assigned to</li>
                </ul>

                <h2>Consent Process</h2>
                <p>Musicians provide consent to receive SMS messages through the following process:</p>
                <ol>
                    <li>Sign in to the CRC Music application at <a href="https://www.centralreform.live" className="text-brand hover:underline">www.centralreform.live</a></li>
                    <li>Navigate to <strong>Settings &rarr; Musician Profile &rarr; Scheduling</strong></li>
                    <li>Enter your phone number in the Phone Number field</li>
                    <li>Toggle the <strong>SMS</strong> notification switch to ON</li>
                    <li>Save your profile settings</li>
                </ol>
                <p>
                    By completing these steps, the musician affirmatively consents to receive SMS messages
                    from CRC Music at the phone number provided.
                </p>

                <h2>Message Frequency</h2>
                <p>
                    Message frequency varies based on how often the musician is scheduled for services.
                    Typical musicians receive 2-8 messages per month. Messages are only sent in
                    relation to your specific scheduling activity.
                </p>

                <h2>Message and Data Rates</h2>
                <p>
                    Standard message and data rates may apply depending on your mobile carrier and plan.
                    CRC does not charge for SMS messages sent through the Service.
                </p>

                <h2>Opt-Out</h2>
                <p>You may opt out of SMS messages at any time by:</p>
                <ul>
                    <li>Replying <strong>STOP</strong> to any message received from CRC Music</li>
                    <li>Disabling the SMS toggle in your CRC Music profile settings</li>
                    <li>Removing your phone number from your profile settings</li>
                    <li>Contacting us at <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a></li>
                </ul>
                <p>
                    After opting out, you will receive one final confirmation message. You will no longer
                    receive SMS messages from CRC Music unless you opt in again.
                </p>

                <h2>Help</h2>
                <p>
                    For help with SMS notifications, reply <strong>HELP</strong> to any message or contact
                    us at <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a>.
                </p>

                <h2>Data Privacy</h2>
                <p className="font-semibold">
                    Mobile information, including phone numbers, will not be shared with third
                    parties for marketing or promotional purposes.
                </p>
                <p>
                    Phone numbers are stored securely and used solely for delivering scheduling-related
                    SMS messages through our messaging provider (Twilio). See our full{' '}
                    <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link> for
                    details on how we handle your data.
                </p>

                <h2>Contact Information</h2>
                <div className="not-prose p-4 rounded-xl bg-muted border border-border">
                    <p className="text-sm text-foreground font-medium">Central Reform Congregation</p>
                    <p className="text-sm text-muted-foreground mt-1">CRC Music Application</p>
                    <p className="text-sm text-muted-foreground">Email: <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a></p>
                    <p className="text-sm text-muted-foreground">Web: <a href="https://www.centralreform.live" className="text-brand hover:underline">www.centralreform.live</a></p>
                </div>

                <h2>Related Policies</h2>
                <ul>
                    <li><Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link></li>
                    <li><Link href="/terms" className="text-brand hover:underline">Terms & Conditions</Link></li>
                </ul>
            </div>
        </div>
    )
}
