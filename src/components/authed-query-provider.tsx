"use client"

import { ReactNode, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

/**
 * QueryClient + QueryClientProvider mount for authed surfaces only.
 *
 * Was previously mounted at the root in `client-providers.tsx`, which
 * bundled `@tanstack/react-query` (~30-50 KB) into rootMainFiles — every
 * page paid for it including the unauth `/login`, `/auth-error`,
 * `/unauthorized` surfaces that never call `useQuery`/`useMutation`.
 *
 * react-query's only production consumers are
 *   - `src/hooks/use-library.ts` (re-exported across (main) + perform deep routes)
 *   - `src/components/library/UploadDialog.tsx`
 *   - `src/components/library/ScraperModal.tsx`
 * all of which live under either `(main)/*` or `perform/[fileId]` +
 * `perform/setlist/[id]` — i.e. the two route-group layouts where this
 * provider is now mounted. Public `/perform` and the unauth root routes
 * do not import this module and therefore do not load the chunk.
 *
 * Each mount creates its own QueryClient — that's the canonical Next.js
 * App Router pattern when two route groups don't share a deeper authed
 * parent layout. Navigations between (main) and perform create a fresh
 * cache (acceptable: today's `useLibrary` calls re-fetch on mount and the
 * authoring surfaces don't share queryKeys with the performance surface).
 *
 * See `.paul/research/react-query-lazy-import/FINDINGS.md` (Phase 0 map)
 * and `src/__tests__/login-bundle-size.test.ts` for the regression guard.
 */
export function AuthedQueryProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
                        refetchOnWindowFocus: false, // Don't refetch on window focus
                        retry: 1, // Let Queries fail fast after 1 retry
                    },
                },
            }),
    )

    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
