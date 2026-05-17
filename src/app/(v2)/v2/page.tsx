import Link from "next/link"
import { GlassCard } from "@/components/v2/glass-card"
import { DenseList, DenseRow } from "@/components/v2/dense-list"
import { V2Footer } from "@/components/v2/v2-footer"

export default function V2LandingPage() {
  return (
    <>
      <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 md:py-20">
        <header className="mb-10 flex flex-col gap-3">
          <span className="text-eyebrow text-v2-accent">v2 · Pro Performance Aesthetic</span>
          <h1 className="text-title-large">CRC Music — concert‑stage pro</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            You&rsquo;re in the v2 beta. New shell, dense rows, no album art. Routes
            migrate over here one at a time. Your existing setlists, library, and
            performance views still live in the classic UI.
          </p>
        </header>

        <section className="mb-10">
          <GlassCard className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl tracking-tight">Welcome back</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This is a primitive showcase. Production pages are not migrated yet.
                </p>
              </div>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                Beta
              </span>
            </div>
          </GlassCard>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-eyebrow text-muted-foreground">Recent setlists (demo)</h2>
          <GlassCard className="overflow-hidden p-0">
            <DenseList aria-label="Demo dense list of setlists">
              {DEMO_ROWS.map((row) => (
                <DenseRow key={row.id} interactive>
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {row.date}
                  </span>
                  <span className="flex-1 truncate font-medium">{row.title}</span>
                  <span className="hidden w-24 shrink-0 text-xs text-muted-foreground md:inline">
                    {row.service}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {row.tracks}
                  </span>
                </DenseRow>
              ))}
            </DenseList>
          </GlassCard>
        </section>

        <section className="mb-10 flex flex-wrap gap-3">
          <Link
            href="/setlists"
            className="rounded-full border border-border bg-card/40 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition hover:bg-card/60"
          >
            Open classic setlists
          </Link>
          <Link
            href="/library"
            className="rounded-full border border-border bg-card/40 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition hover:bg-card/60"
          >
            Open classic library
          </Link>
        </section>
      </main>
      <V2Footer />
    </>
  )
}

const DEMO_ROWS: Array<{ id: string; date: string; title: string; service: string; tracks: number }> = [
  { id: "1", date: "05/16", title: "Friday Night Shabbat", service: "Erev Shabbat", tracks: 12 },
  { id: "2", date: "05/17", title: "Shabbat Morning", service: "Shacharit", tracks: 18 },
  { id: "3", date: "05/09", title: "Friday Night Shabbat", service: "Erev Shabbat", tracks: 11 },
  { id: "4", date: "05/02", title: "Lag Ba'omer Sing-Along", service: "Festival", tracks: 22 },
  { id: "5", date: "04/25", title: "Friday Night Shabbat", service: "Erev Shabbat", tracks: 13 },
]
