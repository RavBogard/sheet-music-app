import type { BrowserContext, Page } from '@playwright/test'

/**
 * Test-only trace of what a page's Firestore connection receives and what the
 * page then shows. Injected with addInitScript; ships nothing in the app.
 *
 * Records, with Date.now() stamps comparable to the test's own clock:
 * - Firestore XHR/fetch traffic: open, end, error, abort. Listen chunks are
 *   summarized to the overrides doc revs and file ids they carry, target
 *   changes, existence filters and noops. Commit bodies are summarized to the
 *   overrides revs they write.
 * - online/offline and visibility events, and the auth user (present or not).
 * - Every change of a perform row's data-file-id (50 ms poll).
 *
 * Never records URLs, headers or raw bodies: Firestore puts the Authorization
 * header in the channel URL ($httpHeaders), so only derived fields leave the
 * page.
 */
const INIT = () => {
    type Ev = Record<string, unknown> & { at?: number }
    const w = window as unknown as { __tonightTrace?: { events: Ev[]; seq: number } }
    if (w.__tonightTrace) return
    const T = (w.__tonightTrace = { events: [] as Ev[], seq: 0 })
    const push = (e: Ev) => {
        e.at = Date.now()
        T.events.push(e)
        if (T.events.length > 4000) T.events.shift()
    }
    push({ k: 'init', online: navigator.onLine })
    addEventListener('online', () => push({ k: 'online' }))
    addEventListener('offline', () => push({ k: 'offline' }))
    document.addEventListener('visibilitychange', () => push({ k: 'visibility', v: document.visibilityState }))

    const OVERRIDES = /performance\/overrides/
    const summarize = (id: number, kind: string, text: string) => {
        const ov: { rev: number | null; fileIds: string[]; del?: boolean }[] = []
        // Split on document boundaries so each overrides doc keeps its own rev.
        for (const part of text.split(/"(?:documentChange|documentDelete|documentRemove)"/).slice(1)) {
            const name = /"(?:name|document)"\s*:\s*"([^"]+)"/.exec(part)?.[1] ?? ''
            if (!OVERRIDES.test(name) && !OVERRIDES.test(part.slice(0, 400))) continue
            const rev = /"rev"\s*:\s*\{\s*"integerValue"\s*:\s*"(\d+)"/.exec(part)?.[1]
            const fileIds = Array.from(part.matchAll(/"fileId"\s*:\s*\{\s*"stringValue"\s*:\s*"([^"]{1,80})"/g)).map((m) => m[1])
            ov.push({ rev: rev ? Number(rev) : null, fileIds, del: !/"documentChange"/.test(part) && !rev ? true : undefined })
        }
        const tc = Array.from(text.matchAll(/"targetChangeType"\s*:\s*"([A-Z_]+)"/g)).map((m) => m[1])
        const causes = Array.from(text.matchAll(/"cause"\s*:\s*\{[^}]*"code"\s*:\s*(\d+)/g)).map((m) => m[1])
        const bareCurrent = (text.match(/"targetChange"\s*:\s*\{\s*"resumeToken"/g) ?? []).length
        const filters = (text.match(/"filter"\s*:/g) ?? []).length
        const noops = (text.match(/"noop"/g) ?? []).length
        const docs = (text.match(/"documentChange"/g) ?? []).length
        push({ k: 'chunk', id, kind, len: text.length, ov, tc, causes, bareCurrent, filters, noops, docs })
    }
    const kindOf = (u: string) =>
        /\/Listen\/channel/.test(u) ? 'listen'
            : /\/Write\/channel/.test(u) ? 'write'
                : /:commit\b/.test(u) ? 'commit'
                    : /:beginTransaction\b/.test(u) ? 'begin'
                        : /:batchGet\b/.test(u) ? 'batchGet'
                            : /:rollback\b/.test(u) ? 'rollback'
                                : 'other'
    const bodyRevs = (body: unknown) => {
        if (typeof body !== 'string' || !OVERRIDES.test(body)) return undefined
        return Array.from(body.matchAll(/"rev"\s*:\s*\{\s*"integerValue"\s*:\s*"(\d+)"/g)).map((m) => Number(m[1]))
    }

    const XO = XMLHttpRequest.prototype.open
    const XS = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __tt?: { m: string; u: string } }, m: string, u: string | URL) {
        this.__tt = { m, u: String(u) }
        // eslint-disable-next-line prefer-rest-params
        return (XO as (...a: unknown[]) => void).apply(this, arguments as unknown as unknown[])
    } as typeof XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __tt?: { m: string; u: string } }, body?: Document | XMLHttpRequestBodyInit | null) {
        const info = this.__tt
        if (info && /firestore\.googleapis\.com/.test(info.u)) {
            const kind = kindOf(info.u)
            const id = ++T.seq
            let seen = 0
            const back = /[?&]TYPE=xmlhttp/.test(info.u) || info.m === 'GET'
            push({ k: 'req', via: 'xhr', id, kind, m: info.m, back, revs: bodyRevs(body) })
            const scan = () => {
                let txt = ''
                try { txt = this.responseText || '' } catch { return }
                if (txt.length > seen) {
                    const chunk = txt.slice(seen)
                    seen = txt.length
                    summarize(id, kind, chunk)
                }
            }
            this.addEventListener('progress', scan)
            this.addEventListener('readystatechange', () => { if (this.readyState === 3) scan() })
            this.addEventListener('load', () => { scan(); push({ k: 'end', id, kind, status: this.status }) })
            this.addEventListener('error', () => push({ k: 'error', id, kind }))
            this.addEventListener('abort', () => push({ k: 'abort', id, kind }))
            this.addEventListener('timeout', () => push({ k: 'timeout', id, kind }))
        }
        return XS.call(this, body)
    }

    const F = window.fetch
    window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
        const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const p = F.call(this, input, init)
        if (/firestore\.googleapis\.com/.test(u)) {
            const kind = kindOf(u)
            const id = ++T.seq
            push({ k: 'req', via: 'fetch', id, kind, m: init?.method ?? 'GET', revs: bodyRevs(init?.body) })
            p.then(async (r) => {
                push({ k: 'headers', id, kind, status: r.status })
                if (!r.body) return
                const reader = r.clone().body!.getReader()
                const dec = new TextDecoder()
                for (;;) {
                    const { done, value } = await reader.read()
                    if (done) break
                    summarize(id, kind, dec.decode(value, { stream: true }))
                }
                push({ k: 'end', id, kind, status: r.status })
            }).catch((e: unknown) => push({ k: 'error', id, kind, name: (e as Error)?.name ?? 'error' }))
        }
        return p
    } as typeof window.fetch

    // Auth user presence (never the token).
    const hookAuth = () => {
        const probe = (window as unknown as { __c7_auth_for_probes__?: { auth?: { onIdTokenChanged?: (cb: (u: { uid?: string } | null) => void) => void } } }).__c7_auth_for_probes__
        if (!probe?.auth?.onIdTokenChanged) return false
        probe.auth.onIdTokenChanged((u) => push({ k: 'auth', user: u?.uid ? u.uid.slice(0, 6) : null }))
        return true
    }
    const authTimer = setInterval(() => { if (hookAuth()) clearInterval(authTimer) }, 200)

    // What each row shows.
    const shown = new Map<string, string | null>()
    setInterval(() => {
        document.querySelectorAll<HTMLElement>('[data-testid="perform-row"][data-row-id]').forEach((el) => {
            const row = el.dataset.rowId!
            const f = el.dataset.fileId ?? null
            if (shown.get(row) !== f) {
                shown.set(row, f)
                push({ k: 'ui', row, fileId: f })
            }
        })
    }, 50)
}

export async function installListenTrace(ctx: BrowserContext): Promise<void> {
    await ctx.addInitScript(INIT)
}

export type TraceEvent = { k: string; at: number } & Record<string, unknown>

export async function readTrace(page: Page): Promise<TraceEvent[]> {
    return page
        .evaluate(() => (window as unknown as { __tonightTrace?: { events: unknown[] } }).__tonightTrace?.events ?? [])
        .catch(() => []) as Promise<TraceEvent[]>
}
