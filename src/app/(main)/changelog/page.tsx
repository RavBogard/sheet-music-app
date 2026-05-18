// C5D-007: changelog is public and indexable. Root noindex applies to
// the authed app; legal/marketing pages override.
export const metadata = {
    title: "Changelog | CentralReform.live",
    robots: { index: true, follow: true },
}

const versions = [
    {
        version: "v1.7",
        date: "2026-03-11",
        description: "Critical bug fixes — mobile sign-in redirect fallback, service worker update banner, user avatar display, key signature positioning.",
    },
    {
        version: "v1.6",
        date: "2026-03-11",
        description: "Stability & regression audit — auth & CSP hardening, Firebase-only file serving, performance view overhaul, regression sweep.",
    },
    {
        version: "v1.5",
        date: "2026-03-10",
        description: "Codebase & UI/UX hardening — critical bug fixes, security & API consistency, architecture cleanup, quality & deps, UI/UX polish, performance & monitoring.",
    },
    {
        version: "v1.4",
        date: "2026-03-10",
        description: "Fixes & library management — song rename, chart unlinking, archive restore, print gig packet fixes, PDF health scanner.",
    },
    {
        version: "v1.3",
        date: "2026-03-10",
        description: "Bugsweep & backend hardening — codebase audit, security & data integrity fixes, error handling consistency, frontend robustness.",
    },
    {
        version: "v1.2",
        date: "2026-03-09",
        description: "Library, manage & monitor overhaul — archive & health, manage redesign, monitor stability & UX, templates relocation.",
    },
    {
        version: "v1.1",
        date: "2026-03-09",
        description: "UI/UX hardening — touch & accessibility, color contrast, component consistency, loading states, responsive polish, performance mode overhaul.",
    },
    {
        version: "v1.0",
        date: "2026-03-08",
        description: "Full launch — QA bug sweep, missing features audit, UI/UX polish, admin console redesign, launch prep.",
    },
    {
        version: "v0.1",
        date: "2026-03-08",
        description: "UI/UX redesign — design foundation, navigation & layout, dashboard, setlist & performance views, library & monitor mix, polish & accessibility.",
    },
]

export default function ChangelogPage() {
    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-6">Changelog</h1>
            <div className="space-y-6">
                {versions.map((v) => (
                    <div key={v.version} className="border-l-2 border-brand pl-4">
                        <div className="flex items-baseline gap-3">
                            <span className="text-lg font-semibold text-brand">{v.version}</span>
                            <span className="text-sm text-muted-foreground">{v.date}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{v.description}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}
