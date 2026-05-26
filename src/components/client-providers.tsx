"use client"

import { ReactNode, useEffect } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { useCongregationStore } from "@/lib/congregation-store"

/**
 * Root client-side providers loaded by every route (authed or not).
 *
 * `QueryClientProvider` was hoisted OUT of this file 2026-05-26 into
 * `<AuthedQueryProvider>` mounted in `(main)/layout.tsx` and
 * `perform/layout.tsx` — see `src/components/authed-query-provider.tsx`.
 * react-query is post-auth only; keeping it at the root cost ~30-50 KB
 * of `/login`/`/auth-error`/`/unauthorized`/`/perform` rootMainFiles JS
 * for zero benefit. See FINDINGS.md + login-bundle-size.test.ts.
 */
export function ClientProviders({ children }: { children: ReactNode }) {
    // We intentionally removed the aggressive SW controllerchange reload
    // to prevent infinite reloading loops and mid-performance refreshes.

    useEffect(() => {
        const unsub = useCongregationStore.getState().init()
        return unsub
    }, [])

    return <AuthProvider>{children}</AuthProvider>
}
