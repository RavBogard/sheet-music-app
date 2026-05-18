export const metadata = {
    title: 'Accessibility Statement | CRC Music',
    robots: { index: true, follow: true },
}

export default function AccessibilityPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Hero header */}
            <div className="border-b border-border/40 bg-card/30">
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                    <p className="text-eyebrow mb-3">Legal</p>
                    <h1 className="text-title-large mb-2">Accessibility Statement</h1>
                    <p className="text-muted-foreground text-sm">Last updated: May 19, 2026</p>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-24 space-y-10">
                <p className="text-base leading-relaxed text-muted-foreground">
                    Central Reform Congregation is committed to making the CRC Music web application
                    accessible to musicians, congregants, and clergy of all abilities. We aim to meet
                    or exceed the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA across the app.
                </p>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">What we&apos;re doing</h2>
                    <div className="h-px bg-border/50" />
                    <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground list-none pl-0">
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Semantic HTML landmarks (<code>&lt;main&gt;</code>, <code>&lt;nav&gt;</code>, headings) on every route.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Accessible names on all icon-only buttons (<code>aria-label</code>) and form fields (<code>&lt;label&gt;</code> or <code>aria-label</code>, never placeholder-as-label).</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>WCAG 2.1 AA contrast on body text and interactive surfaces.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Pinch-zoom and user-scaling preserved on mobile (no <code>maximum-scale=1</code> viewport lock).</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Skip-link to main content on app-shell routes.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Keyboard support in Perform mode (chart navigation, transpose, metronome) and live regions for setlist mutations.</span></li>
                        <li className="flex gap-2"><span className="text-brand mt-1 shrink-0">&#x2022;</span><span>Automated axe-core sweeps run as part of our cowork audit cadence.</span></li>
                    </ul>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Known limitations</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        We track open accessibility findings on every release cycle. The PDF-render
                        surface inside Perform mode is the area where assistive-technology support is
                        most limited today; we&apos;re working to surface chart structure (sections, key,
                        capo) outside the rendered image where possible.
                    </p>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-foreground tracking-tight">Report a barrier</h2>
                    <div className="h-px bg-border/50" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        If you encounter a part of the app you can&apos;t use with your assistive
                        technology, please email <a href="mailto:music@centralreform.live" className="text-brand font-medium hover:underline underline-offset-2 transition-colors">music@centralreform.live</a>.
                        Include the page URL and a short description; we&apos;ll respond within a week.
                    </p>
                </section>
            </div>
        </div>
    )
}
