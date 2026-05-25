import { describe, expect, it } from "vitest"

// vitest + the project's tsconfig resolve `.mjs` imports natively.
import {
    EXIT_CODES,
    main,
    parseEnvText,
    parseMcpResponse,
    probeBearer,
    readBearerFromEnv,
} from "../supervisor-prod-bearer.mjs"

type FetchOpts = {
    status: number
    contentType?: string
    body?: string
    throwErr?: Error
}

function stubFetch({ status, contentType, body, throwErr }: FetchOpts) {
    return async (_url: string, _init: unknown) => {
        if (throwErr) throw throwErr
        return {
            status,
            headers: { get: (h: string) => (h === "content-type" ? contentType ?? "application/json" : null) },
            text: async () => body ?? "",
        } as unknown as Response
    }
}

function stubReader(text: string) {
    return async (_path: string, _enc: string) => text
}

function stubStream() {
    let buf = ""
    return {
        stream: { write: (s: string) => { buf += s; return true } },
        get: () => buf,
    }
}

// ─── parseEnvText ────────────────────────────────────────────────────────────

describe("parseEnvText", () => {
    it("parses simple KEY=VALUE pairs", () => {
        expect(parseEnvText("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" })
    })
    it("ignores comments and blank lines", () => {
        expect(parseEnvText("# comment\n\nFOO=bar\n   \n# another")).toEqual({
            FOO: "bar",
        })
    })
    it("strips paired double + single quotes", () => {
        expect(parseEnvText(`FOO="bar"\nBAZ='qux'`)).toEqual({
            FOO: "bar",
            BAZ: "qux",
        })
    })
    it("preserves unpaired quotes (no half-strip)", () => {
        expect(parseEnvText(`FOO="bar`)).toEqual({ FOO: '"bar' })
    })
    it("ignores lines without `=`", () => {
        expect(parseEnvText("NOEQUALSHERE\nFOO=bar")).toEqual({ FOO: "bar" })
    })
})

// ─── parseMcpResponse ────────────────────────────────────────────────────────

describe("parseMcpResponse", () => {
    it("parses application/json", () => {
        expect(parseMcpResponse("application/json", '{"a":1}')).toEqual({ a: 1 })
    })
    it("returns null on unparseable JSON", () => {
        expect(parseMcpResponse("application/json", "garbage")).toBeNull()
    })
    it("parses text/event-stream (last data: line wins)", () => {
        const sse =
            'event: message\ndata: {"a":1}\n\nevent: message\ndata: {"a":2}\n\n'
        expect(parseMcpResponse("text/event-stream", sse)).toEqual({ a: 2 })
    })
    it("returns null on empty SSE body", () => {
        expect(parseMcpResponse("text/event-stream", "")).toBeNull()
    })
})

// ─── readBearerFromEnv ───────────────────────────────────────────────────────

describe("readBearerFromEnv", () => {
    it("returns bearer when .env.local has SUPERVISOR_PROD_BEARER=crl_live_*", async () => {
        const r = await readBearerFromEnv("/fake.env", {
            readFile: stubReader("SUPERVISOR_PROD_BEARER=crl_live_abcdef\n"),
        })
        expect(r).toEqual({ bearer: "crl_live_abcdef" })
    })
    it("exits 2 when SUPERVISOR_PROD_BEARER is missing", async () => {
        const r = await readBearerFromEnv("/fake.env", {
            readFile: stubReader("OTHER_KEY=value\n"),
        })
        expect(r.exitCode).toBe(EXIT_CODES.MISSING_ENV)
        expect(r.error).toMatch(/No SUPERVISOR_PROD_BEARER/)
    })
    it("exits 2 when value does not start with `crl_live_` (silent-guard)", async () => {
        const r = await readBearerFromEnv("/fake.env", {
            readFile: stubReader("SUPERVISOR_PROD_BEARER=garbage_no_prefix\n"),
        })
        expect(r.exitCode).toBe(EXIT_CODES.MISSING_ENV)
    })
    it("exits 2 when the file is unreadable (ENOENT)", async () => {
        const r = await readBearerFromEnv("/missing.env", {
            readFile: async () => {
                const e: NodeJS.ErrnoException = new Error("ENOENT") as NodeJS.ErrnoException
                e.code = "ENOENT"
                throw e
            },
        })
        expect(r.exitCode).toBe(EXIT_CODES.MISSING_ENV)
        expect(r.error).toMatch(/Cannot read/)
    })
})

// ─── probeBearer ─────────────────────────────────────────────────────────────

const OK_RPC_BODY = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: '{"ok":true,"bearers":[]}' }] },
})

describe("probeBearer", () => {
    it("returns { healthy: true } on HTTP 200 + tools/call ok", async () => {
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({ status: 200, body: OK_RPC_BODY }),
        })
        expect(r).toEqual({ healthy: true })
    })
    it("exits 3 on HTTP 401 (revoked / wrong token)", async () => {
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({ status: 401, body: "" }),
        })
        expect(r.exitCode).toBe(EXIT_CODES.REVOKED)
        expect(r.error).toMatch(/rejected/)
    })
    it("exits 3 on result.isError === true (rich envelope refusal)", async () => {
        const errBody = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: '{"ok":false,"error":{"machine_code":"forbidden_role"}}',
                    },
                ],
            },
        })
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({ status: 200, body: errBody }),
        })
        expect(r.exitCode).toBe(EXIT_CODES.REVOKED)
    })
    it("exits 4 on network throw", async () => {
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({
                status: 0,
                throwErr: new Error("ENOTFOUND www.centralreform.live"),
            }),
        })
        expect(r.exitCode).toBe(EXIT_CODES.NETWORK)
        expect(r.error).toMatch(/Network error/)
    })
    it("exits 4 on unexpected HTTP (e.g. 500)", async () => {
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({ status: 500, body: "internal" }),
        })
        expect(r.exitCode).toBe(EXIT_CODES.NETWORK)
    })
    it("exits 4 on JSON-RPC `error` field at the envelope level", async () => {
        const rpcErr = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "Method not found" },
        })
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({ status: 200, body: rpcErr }),
        })
        expect(r.exitCode).toBe(EXIT_CODES.NETWORK)
    })
    it("parses SSE response bodies", async () => {
        const sseBody = `event: message\ndata: ${OK_RPC_BODY}\n\n`
        const r = await probeBearer("crl_live_x", {
            fetch: stubFetch({
                status: 200,
                contentType: "text/event-stream",
                body: sseBody,
            }),
        })
        expect(r).toEqual({ healthy: true })
    })
})

// ─── main (integration) ──────────────────────────────────────────────────────

describe("main", () => {
    it("writes the bearer to stdout and exits 0 when everything is healthy", async () => {
        const out = stubStream()
        const err = stubStream()
        const code = await main({
            envPath: "/fake.env",
            readFile: stubReader("SUPERVISOR_PROD_BEARER=crl_live_okfoo\n"),
            fetch: stubFetch({ status: 200, body: OK_RPC_BODY }),
            stdout: out.stream,
            stderr: err.stream,
        })
        expect(code).toBe(EXIT_CODES.OK)
        expect(out.get()).toBe("crl_live_okfoo")
        expect(err.get()).toBe("")
    })
    it("writes the error message to stderr and exits 3 when bearer is revoked", async () => {
        const out = stubStream()
        const err = stubStream()
        const code = await main({
            envPath: "/fake.env",
            readFile: stubReader("SUPERVISOR_PROD_BEARER=crl_live_dead\n"),
            fetch: stubFetch({ status: 401, body: "" }),
            stdout: out.stream,
            stderr: err.stream,
        })
        expect(code).toBe(EXIT_CODES.REVOKED)
        expect(out.get()).toBe("")
        expect(err.get()).toMatch(/rejected/)
    })
    it("never leaks the bearer to stderr on revoked path", async () => {
        const out = stubStream()
        const err = stubStream()
        await main({
            envPath: "/fake.env",
            readFile: stubReader(
                "SUPERVISOR_PROD_BEARER=crl_live_NEVERSHOWMESECRET\n",
            ),
            fetch: stubFetch({ status: 401, body: "" }),
            stdout: out.stream,
            stderr: err.stream,
        })
        expect(err.get()).not.toContain("crl_live_NEVERSHOWMESECRET")
        expect(out.get()).not.toContain("crl_live_NEVERSHOWMESECRET")
    })
    it("exits 2 with a clear ask when SUPERVISOR_PROD_BEARER is absent", async () => {
        const out = stubStream()
        const err = stubStream()
        const code = await main({
            envPath: "/fake.env",
            readFile: stubReader("OTHER=value\n"),
            stdout: out.stream,
            stderr: err.stream,
        })
        expect(code).toBe(EXIT_CODES.MISSING_ENV)
        expect(out.get()).toBe("")
        expect(err.get()).toMatch(/ask Daniel to mint/)
    })
})
