import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderToString } from "react-dom/server"
import type { ReactElement } from "react"

import { tenantState } from "../mt-p1-lane2/tenant-mocks"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 7 (lane C) golden — the English legal text did not change
 * when the legal pages moved into the catalogue.
 *
 * Two independent proofs, for CRC and Brothers Lazaroff:
 *  1. The page's visible text is found verbatim in the production capture
 *     taken before multi-tenant work began
 *     (docs/planning/2026-10-12-multitenant/golden/http-before/<host>/page_<page>.txt,
 *     the "--- body text ---" line: the whole page's textContent).
 *  2. The server-rendered HTML hashes to the value pinned on the unchanged
 *     code (386aac9a, before lane C's edits). Never regenerate these.
 */
vi.mock("next/headers", async () => (await import("../mt-p1-lane2/tenant-mocks")).headersMock())
vi.mock("@/lib/org/registry", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).registryMock(orig))
vi.mock("@/lib/org/get-org-config", async (orig) => (await import("../mt-p1-lane2/tenant-mocks")).getOrgConfigMock(orig))
vi.mock("@/lib/firebase-admin", async () => (await import("../mt-p1-lane2/tenant-mocks")).firebaseAdminMock())

type PageModule = { default: () => ReactElement | Promise<ReactElement> }

const PAGES: Record<string, () => Promise<PageModule>> = {
    privacy: () => import("@/app/(main)/privacy/page"),
    terms: () => import("@/app/(main)/terms/page"),
    "sms-consent": () => import("@/app/(main)/sms-consent/page"),
    accessibility: () => import("@/app/(main)/accessibility/page"),
}

const GOLDEN_DIR = join(__dirname, "..", "..", "..", "docs", "planning", "2026-10-12-multitenant", "golden", "http-before")

/** sha256 of renderToString(page) on the unchanged code (386aac9a). Same for CRC and BL. */
const PINNED_HTML_SHA256: Record<string, string> = {
    privacy: "367059ff5fd53ace050107388d19b18477462b6510db3244288d38e3a8aff8de",
    terms: "893913e3fa73505d80dce28adfb26008ae10313073b330b280755e988713773b",
    "sms-consent": "9a12ebd5a4e88bd5ae30073aa2245f60f7634c6735c927454f0f2f8c934cb7b3",
    accessibility: "aad015c5640dfa981afcefd8d170ef1d704f7c9909b25a9d05d103a675cf9788",
}

function goldenBodyText(host: string, page: string): string {
    const raw = readFileSync(join(GOLDEN_DIR, host, `page_${page}.txt`), "utf8")
    const lines = raw.split(/\r?\n/)
    const at = lines.indexOf("--- body text ---")
    expect(at, `${host}/${page} capture has a body text section`).toBeGreaterThan(-1)
    return lines[at + 1]
}

async function render(page: string, org: string): Promise<string> {
    tenantState.org = org
    tenantState.cookies = undefined
    const mod = await PAGES[page]()
    return renderToString(await mod.default())
}

function textOf(html: string): string {
    const el = document.createElement("div")
    el.innerHTML = html
    return el.textContent ?? ""
}

describe("phase 7 lane C golden: CRC and BL legal text is byte-identical to the production capture", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    for (const page of Object.keys(PAGES)) {
        for (const [org, host] of [["crc", "crc"], ["brotherslazaroff", "brotherslazaroff"]] as const) {
            it(`${host} /${page}: visible text appears verbatim in the before-capture`, async () => {
                const text = textOf(await render(page, org))
                expect(text.length).toBeGreaterThan(500)
                expect(goldenBodyText(host, page)).toContain(text)
            })

            it(`${host} /${page}: server HTML matches the hash pinned before extraction`, async () => {
                const html = await render(page, org)
                const sha = createHash("sha256").update(html, "utf8").digest("hex")
                expect(sha).toBe(PINNED_HTML_SHA256[page])
            })
        }
    }
})

/**
 * The platform-run text (tenants without `legal.useCrcText`) in English: its
 * visible text is pinned on the unchanged code too, so extracting it into the
 * catalogue provably kept the English. (The HTML may differ: one t() call per
 * sentence merges what were several adjacent text nodes.)
 */
const PINNED_PLATFORM_TEXT_SHA256: Record<string, string> = {
    privacy: "ba19986469c059a8e9f59629c1a0a8a0690bc73d556c2a0f1ca0241425e39ff6",
    terms: "a2a37d151ae7ae5055e4da88340d43a72c0e4a612f449e89ccc01ced5fb85437",
    "sms-consent": "6f2eb77e260b311c8296d286463e8799a59e78f7f26208c4c7501a5d8266020d",
    accessibility: "2af44bc2c060195dbd4ada35f0a86851dc34425f104116231d5cb4f99da8b865",
}

describe("phase 7 lane C golden: the platform legal text in English is unchanged", () => {
    beforeEach(() => clearPrimedOrgConfigs())
    for (const page of Object.keys(PAGES)) {
        it(`testshul (English) /${page}: visible text matches the pinned hash`, async () => {
            tenantState.configOverride = (cfg) => ({ ...cfg, locale: { ...cfg.locale, language: "en", direction: "ltr" } })
            try {
                const text = textOf(await render(page, "testshul"))
                expect(text).toContain("Test Shul Tehila")
                const sha = createHash("sha256").update(text, "utf8").digest("hex")
                expect(sha).toBe(PINNED_PLATFORM_TEXT_SHA256[page])
            } finally {
                tenantState.configOverride = undefined
            }
        })
    }
})
