import Link from "next/link"
import buildInfo from "@/build-info.json"
import { V2BetaOptOutLink } from "./v2-beta-toggle"

/**
 * V2Footer — the v2 footer surface.
 * Mirrors the v1 footer's information density but adopts v2 typography +
 * surfaces the "Back to classic" reverse-toggle. No marketing copy.
 */
export function V2Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/30 px-6 py-5 text-center text-xs text-muted-foreground backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2">
        <V2BetaOptOutLink />
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span title={`Commit: ${buildInfo.commit}`}>v{buildInfo.version}</span>
          <span aria-hidden="true">·</span>
          <Link href="/changelog" className="transition-colors hover:text-foreground">
            Changelog
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/accessibility" className="transition-colors hover:text-foreground">
            Accessibility
          </Link>
          <span aria-hidden="true">·</span>
          <span>v2 beta</span>
        </div>
      </div>
    </footer>
  )
}
