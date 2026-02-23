export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-background text-foreground p-6 pb-24">
            <div className="max-w-3xl mx-auto prose prose-neutral dark:prose-invert">
                <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
                <p className="text-muted-foreground text-sm mb-8">Last updated: February 23, 2026</p>

                <p>
                    Central Reform Congregation ("CRC", "we", "us", or "our") operates the CRC Music web application
                    (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure
                    of personal data when you use our Service.
                </p>

                <h2>Information We Collect</h2>
                <p>We collect the following types of information:</p>
                <ul>
                    <li><strong>Account Information:</strong> Your name, email address, and profile photo when you create an account or sign in.</li>
                    <li><strong>Phone Number:</strong> If you choose to provide your phone number for SMS scheduling notifications.</li>
                    <li><strong>Musician Profile Data:</strong> Your instrument preference, transposition settings, and scheduling availability.</li>
                    <li><strong>Usage Data:</strong> Information about how you use the Service, including pages visited and features used.</li>
                </ul>

                <h2>How We Use Your Information</h2>
                <p>We use collected information to:</p>
                <ul>
                    <li>Provide and maintain the Service</li>
                    <li>Send scheduling notifications via email, SMS, and push notifications</li>
                    <li>Facilitate musician coordination and setlist management</li>
                    <li>Improve the Service</li>
                </ul>

                <h2>SMS/Mobile Messaging</h2>
                <p>
                    If you opt in to receive SMS notifications, we will send you text messages related to your
                    scheduling assignments, reminders, and cancellations at Central Reform Congregation.
                </p>
                <p className="font-semibold">
                    Mobile information, including phone numbers, will not be shared with third parties
                    for marketing or promotional purposes. Mobile information will only be shared with
                    third parties as necessary to deliver the SMS messaging service (i.e., our SMS
                    delivery provider, Twilio).
                </p>
                <p>
                    Message frequency varies based on your scheduling activity. Message and data rates may apply.
                    You may opt out of SMS notifications at any time through your profile settings or by replying
                    STOP to any message.
                </p>

                <h2>Data Sharing</h2>
                <p>
                    We do not sell, trade, or rent your personal information to third parties. We share information
                    only in the following circumstances:
                </p>
                <ul>
                    <li><strong>Service Providers:</strong> We use trusted third-party services (Firebase, Resend, Twilio) to operate the Service. These providers only have access to information necessary to perform their functions.</li>
                    <li><strong>Within CRC:</strong> Band leaders and administrators may see your scheduling availability and contact information to coordinate services.</li>
                    <li><strong>Legal Requirements:</strong> We may disclose information if required by law.</li>
                </ul>

                <h2>Data Security</h2>
                <p>
                    We use industry-standard security measures to protect your data, including encrypted connections
                    (HTTPS), Firebase Authentication, and role-based access controls. However, no method of
                    transmission over the Internet is 100% secure.
                </p>

                <h2>Data Retention</h2>
                <p>
                    We retain your personal data only for as long as you maintain an account with the Service.
                    You may request deletion of your account and associated data by contacting us.
                </p>

                <h2>Your Rights</h2>
                <p>You have the right to:</p>
                <ul>
                    <li>Access the personal information we hold about you</li>
                    <li>Request correction of inaccurate information</li>
                    <li>Request deletion of your account and data</li>
                    <li>Opt out of SMS notifications at any time</li>
                    <li>Opt out of email notifications at any time</li>
                </ul>

                <h2>Children's Privacy</h2>
                <p>
                    The Service is not intended for use by anyone under the age of 13. We do not knowingly
                    collect personal information from children under 13.
                </p>

                <h2>Changes to This Policy</h2>
                <p>
                    We may update this Privacy Policy from time to time. We will notify you of any changes by
                    posting the new Privacy Policy on this page and updating the "Last updated" date.
                </p>

                <h2>Contact Us</h2>
                <p>
                    If you have any questions about this Privacy Policy, please contact Central Reform Congregation
                    at <a href="mailto:music@centralreform.live" className="text-brand hover:underline">music@centralreform.live</a>.
                </p>
            </div>
        </div>
    )
}
