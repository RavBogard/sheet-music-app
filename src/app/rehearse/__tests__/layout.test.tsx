import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/org/request-org', () => ({ requestOrg: async () => ({ orgId: 'brotherslazaroff' }) }))
vi.mock('@/components/nav/AppNavigation', () => ({ AppNavigation: () => null }))
vi.mock('@/components/authed-query-provider', () => ({
    AuthedQueryProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import { AuthedQueryProvider } from '@/components/authed-query-provider'
import { AppNavigation } from '@/components/nav/AppNavigation'
import { getOrgBranding } from '@/lib/org/branding'

import RehearseLayout from '../layout'

describe('Rehearse layout', () => {
    it('wraps the nav in the query provider (the nav crashes without one) and brands it for the host', async () => {
        const el = (await RehearseLayout({ children: null })) as React.ReactElement<{ children: React.ReactNode[] }>
        expect(el.type).toBe(AuthedQueryProvider)
        const nav = (el.props.children as React.ReactElement<{ serverOrgShortName: string }>[])[0]
        expect(nav.type).toBe(AppNavigation)
        expect(nav.props.serverOrgShortName).toBe(getOrgBranding('brotherslazaroff').shortName)
    })
})
