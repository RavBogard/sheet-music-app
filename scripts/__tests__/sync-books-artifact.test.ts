import { describe, it, expect } from "vitest"
import { momentsDrift } from "../ops/sync-books.mjs"
import {
    ARTIFACT_NAME,
    apiBase,
    artifactToken,
    extractWanted,
    pickArtifact,
    resolveZipUrl,
} from "../ops/lib/fetch-dist-app.mjs"

/**
 * (m) reading the producer's PUBLISHED artifact, and (l) the agreement check
 * that runs on it in CI.
 *
 * Everything here is the decision surface: which artifact gets downloaded,
 * what counts as drift, and what happens when the token is missing or the
 * machine has no unzip. The download and the unpack themselves are injected,
 * so no test reaches the network or a zip file.
 */

const listing = (rows: unknown[]) => ({ artifacts: rows })
const artifact = (over: Record<string, unknown> = {}) => ({
    name: ARTIFACT_NAME,
    expired: false,
    created_at: "2026-09-20T15:24:51Z",
    archive_download_url: "https://api.github.com/zip/1",
    ...over,
})

describe("momentsDrift — a moved page is drift, a new timestamp is not", () => {
    const withMoments = (moments: unknown, builtAt: string, sha: string) =>
        JSON.stringify({ builtAt, sources: [{ book: "crc-kol-nidre", gitSha: sha }], moments }, null, 4) + "\n"

    const MOMENTS = [{ id: "barchu", occurrences: [{ book: "crc-machzor-2008", unitId: "u1", folios: [100] }] }]

    it("identical content is none", () => {
        const a = withMoments(MOMENTS, "2026-09-16T00:00:00Z", "e5a87e3")
        expect(momentsDrift(a, a)).toBe("none")
    })

    it("a new builtAt and a moved sha, same moments, is provenance — not a failed build", () => {
        expect(
            momentsDrift(
                withMoments(MOMENTS, "2026-09-16T16:17:10Z", "e5a87e3-LICENSED"),
                withMoments(MOMENTS, "2026-09-20T15:24:51Z", "80de868-LICENSED"),
            ),
        ).toBe("provenance")
    })

    it("a moment that moved to another page is DIFFERS", () => {
        const moved = [{ id: "barchu", occurrences: [{ book: "crc-machzor-2008", unitId: "u1", folios: [101] }] }]
        expect(
            momentsDrift(withMoments(MOMENTS, "t", "sha"), withMoments(moved, "t", "sha")),
        ).toBe("DIFFERS")
    })

    it("a dropped occurrence is DIFFERS", () => {
        const dropped = [{ id: "barchu", occurrences: [] }]
        expect(momentsDrift(withMoments(MOMENTS, "t", "sha"), withMoments(dropped, "t", "sha"))).toBe("DIFFERS")
    })

    it("CRLF in the working copy is not drift", () => {
        const a = withMoments(MOMENTS, "t", "sha")
        expect(momentsDrift(a.replace(/\n/g, "\r\n"), a)).toBe("none")
    })

    it("no committed file yet is 'new', and unparseable content is DIFFERS rather than quietly equal", () => {
        expect(momentsDrift(null, withMoments(MOMENTS, "t", "sha"))).toBe("new")
        expect(momentsDrift("{not json", withMoments(MOMENTS, "t", "sha"))).toBe("DIFFERS")
    })
})

describe("pickArtifact — newest live dist-app, and a refusal that says what to do", () => {
    it("takes the newest non-expired one", () => {
        const chosen = pickArtifact(
            listing([
                artifact({ created_at: "2026-09-18T00:00:00Z", archive_download_url: "old" }),
                artifact({ created_at: "2026-09-20T15:24:51Z", archive_download_url: "new" }),
            ]),
        )
        expect(chosen.archive_download_url).toBe("new")
    })

    it("ignores other artifacts in the same run", () => {
        const chosen = pickArtifact(
            listing([artifact({ name: "shabbat-shacharit-80de868", archive_download_url: "wrong" }), artifact()]),
        )
        expect(chosen.archive_download_url).toBe("https://api.github.com/zip/1")
    })

    it("refuses an empty listing", () => {
        expect(() => pickArtifact(listing([]))).toThrow(/No 'dist-app' artifact/)
    })

    it("refuses an all-expired listing by name, instead of downloading a 410", () => {
        expect(() => pickArtifact(listing([artifact({ expired: true })]))).toThrow(
            /expired[\s\S]*publish-app-surface/,
        )
    })
})

describe("artifactToken — the refusal names the variable to set", () => {
    it("prefers the cross-repo PAT", () => {
        expect(artifactToken({ SHIREISHABBAT_ARTIFACT_TOKEN: "pat", GITHUB_TOKEN: "ci" })).toBe("pat")
    })

    it("falls back to GITHUB_TOKEN", () => {
        expect(artifactToken({ GITHUB_TOKEN: "ci" })).toBe("ci")
    })

    it("refuses with the name and the scope, not a bare 401 later", () => {
        expect(() => artifactToken({})).toThrow(/SHIREISHABBAT_ARTIFACT_TOKEN[\s\S]*actions:read/)
    })
})

describe("resolveZipUrl — which endpoint each flag asks", () => {
    const fakeFetch = (body: unknown) => async () =>
        ({ ok: true, status: 200, statusText: "OK", json: async () => body }) as unknown as Response

    it("--from-url is used verbatim and asks GitHub nothing", async () => {
        let called = false
        const url = await resolveZipUrl({ fromUrl: "https://example/zip" }, "t", (async () => {
            called = true
            return {} as Response
        }) as typeof fetch)
        expect(url).toBe("https://example/zip")
        expect(called).toBe(false)
    })

    it("--from-run reads that run's artifacts", async () => {
        let seen = ""
        const f = (async (u: string) => {
            seen = u
            return (await fakeFetch(listing([artifact()]))()) as Response
        }) as unknown as typeof fetch
        await resolveZipUrl({ fromRun: "35518946924" }, "t", f)
        expect(seen).toBe(`${apiBase("RavBogard/ShireiShabbat")}/runs/35518946924/artifacts`)
    })

    it("--from-latest reads the repo's dist-app artifacts", async () => {
        let seen = ""
        const f = (async (u: string) => {
            seen = u
            return (await fakeFetch(listing([artifact()]))()) as Response
        }) as unknown as typeof fetch
        const url = await resolveZipUrl({}, "t", f)
        expect(seen).toContain("/artifacts?name=dist-app")
        expect(url).toBe("https://api.github.com/zip/1")
    })

    it("a repo slug override is honoured, so a fork can be pointed at", async () => {
        let seen = ""
        const f = (async (u: string) => {
            seen = u
            return (await fakeFetch(listing([artifact()]))()) as Response
        }) as unknown as typeof fetch
        await resolveZipUrl({ fromRun: "1", slug: "someone/else" }, "t", f)
        expect(seen).toContain("/repos/someone/else/actions/runs/1/")
    })
})

describe("extractWanted — unzip, then tar, then a refusal naming both", () => {
    const ok = () => ({ status: 0 })
    const fail = (why: string) => ({ status: 1, error: { message: why } })

    it("uses unzip when it works, and takes only the JSON this repo consumes", () => {
        const calls: string[][] = []
        extractWanted("a.zip", "out", ((cmd: string, args: string[]) => {
            calls.push([cmd, ...args])
            return ok()
        }) as never)
        expect(calls).toHaveLength(1)
        expect(calls[0][0]).toBe("unzip")
        expect(calls[0]).toContain("*-feed.json")
        expect(calls[0]).toContain("moments.json")
        // The artifact is ~22MB of licensed PDFs; none of it is asked for.
        expect(calls[0].some((a) => a.includes(".pdf"))).toBe(false)
    })

    it("falls back to tar where tar is bsdtar and unzip is absent", () => {
        const cmds: string[] = []
        extractWanted("a.zip", "out", ((cmd: string) => {
            cmds.push(cmd)
            return cmd === "unzip" ? fail("ENOENT") : ok()
        }) as never)
        expect(cmds).toEqual(["unzip", "tar"])
    })

    it("names both when neither exists, instead of failing as 'command not found'", () => {
        expect(() =>
            extractWanted("a.zip", "out", (((cmd: string) => fail(`${cmd} ENOENT`)) as never)),
        ).toThrow(/unzip[\s\S]*tar/)
    })
})
