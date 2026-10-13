"use client"

import Link from "next/link"
import * as React from "react"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

const COOKIE_NAME = "v2_beta_optin"
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

function setOptInCookie() {
  if (typeof document === "undefined") return
  document.cookie = `${COOKIE_NAME}=1; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
}

function clearOptInCookie() {
  if (typeof document === "undefined") return
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

/**
 * V2BetaOptInLink — drop into the v1 footer / settings page so users can
 * try the v2 beta. Sets the v2_beta_optin cookie and navigates to /v2.
 * Read by RSCs via next/headers.cookies() — never used to rewrite v1 URLs.
 */
export function V2BetaOptInLink({ className, label }: { className?: string; label?: string }) {
  const t = useT()
  return (
    <Link
      href="/v2"
      onClick={setOptInCookie}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      {label ?? t("v2.tryBeta")}
    </Link>
  )
}

/**
 * V2BetaOptOutLink — used in v2 surfaces (e.g. v2 footer) to return to v1.
 * Clears the cookie and routes back to "/".
 */
export function V2BetaOptOutLink({ className, label }: { className?: string; label?: string }) {
  const t = useT()
  return (
    <Link
      href="/"
      onClick={clearOptInCookie}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      {label ?? t("v2.backToClassic")}
    </Link>
  )
}

export const V2_BETA_OPTIN_COOKIE = COOKIE_NAME
