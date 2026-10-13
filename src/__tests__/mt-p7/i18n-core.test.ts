import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createTranslator, directionOf, flattenNamespace, htmlLangOf, interpolateVars } from "@/i18n/core"
import { catalogues, clientMessagesFor, messagesFor, SERVER_ONLY_KEY_PREFIXES } from "@/i18n/catalogues"
import { formatTimeZoneOf, pickerLanguages, resolveDirection, resolveUiLanguage } from "@/i18n/language"
import { isPseudoWrapped, pseudoize } from "@/i18n/pseudo"
import { clientI18nProps, i18nStateFor, tForOrg } from "@/i18n/server"
import { BL_FROZEN_CRC_KEYS, codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { orgString, STRING_BASE, type StringKey } from "@/lib/org/strings"
import { label } from "@/lib/org/vocab"
import { makeTestOrgConfig, primeTestOrg } from "@/lib/org/__tests__/test-org-config"

const TOKENS = { id: "crc", name: "Central Reform Congregation", shortName: "CRC Music", abbreviation: "CRC", host: "centralreform.live" }

describe("t(): lookup, interpolation, plurals", () => {
    const en = {
        "x.hello": "Hello {who}",
        "x.brand": "{shortName} rocks",
        "x.files_one": "{count} file",
        "x.files_other": "{count} files",
        "x.songs_one": "שיר אחד",
        "x.songs_two": "שני שירים",
        "x.songs_other": "{count} שירים",
        "x.empty_zero": "No files",
        "x.empty_other": "{count} files",
        "x.onlyEn": "Only English",
        "org.setlist": "setlist",
    }

    it("interpolates vars, then tenant tokens; unknown placeholders stay", () => {
        const t = createTranslator({ lang: "en", messages: en, tokens: TOKENS })
        expect(t("x.hello", { who: "band" })).toBe("Hello band")
        expect(t("x.brand")).toBe("CRC Music rocks")
        expect(interpolateVars("{a} {b} %s", { a: 1 })).toBe("1 {b} %s")
        expect(interpolateVars("{a}", { a: null })).toBe("")
    })

    it("English plurals: one / other; explicit _zero", () => {
        const t = createTranslator({ lang: "en", messages: en })
        expect(t("x.files", { count: 1 })).toBe("1 file")
        expect(t("x.files", { count: 2 })).toBe("2 files")
        expect(t("x.empty", { count: 0 })).toBe("No files")
        expect(t("x.empty", { count: 3 })).toBe("3 files")
    })

    it("Hebrew plurals: one / two / other", () => {
        const t = createTranslator({ lang: "he", messages: en })
        expect(t("x.songs", { count: 1 })).toBe("שיר אחד")
        expect(t("x.songs", { count: 2 })).toBe("שני שירים")
        expect(t("x.songs", { count: 7 })).toBe("7 שירים")
    })

    it("falls back to English, then to the key, and reports misses", () => {
        const missing: string[] = []
        const t = createTranslator({ lang: "he", messages: { "x.hello": "שלום {who}" }, fallback: en, onMissing: (k) => missing.push(k) })
        expect(t("x.hello", { who: "להקה" })).toBe("שלום להקה")
        expect(t("x.onlyEn")).toBe("Only English")
        expect(t("x.nope")).toBe("x.nope")
        expect(missing).toEqual(["x.onlyEn", "x.nope"])
    })

    it("tenant overrides win, by full key or (org namespace) by the phase 1 key", () => {
        const t = createTranslator({ lang: "en", messages: en, overrides: { setlist: "set", "x.hello": "Hey {who}" } })
        expect(t("org.setlist")).toBe("set")
        expect(t("x.hello", { who: "you" })).toBe("Hey you")
    })

    it("flattens nested namespace files and skips $-keys", () => {
        expect(flattenNamespace("ns", { a: "A", $comment: "x", g: { b: "B", c: { d: "D" } } })).toEqual({ "ns.a": "A", "ns.g.b": "B", "ns.g.c.d": "D" })
    })
})

describe("catalogues", () => {
    it("the org namespace is STRING_BASE in English", () => {
        const { en } = catalogues()
        for (const [k, v] of Object.entries(STRING_BASE)) expect(en[`org.${k}`]).toBe(v)
    })

    it("Hebrew messages are merged over English; pseudo wraps every English string", () => {
        const he = messagesFor("he")
        const en = messagesFor("en")
        for (const k of Object.keys(en)) expect(he[k]).toBeDefined()
        expect(he["common.skipToMain"]).toBe(catalogues().he["common.skipToMain"])
        const qps = messagesFor("qps")
        for (const [k, v] of Object.entries(en)) expect(qps[k]).toBe(pseudoize(v))
    })

    it("client messages leave out the server-only keys", () => {
        const client = clientMessagesFor("en")
        for (const k of Object.keys(client)) expect(SERVER_ONLY_KEY_PREFIXES.some((p) => k.startsWith(p))).toBe(false)
        expect(client["org.setlist"]).toBe("setlist")
        expect(client["common.skipToMain"]).toBe("Skip to main content")
    })
})

describe("orgString / label stay identical (thin wrappers over the org namespace)", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("t('org.<key>') for CRC and BL equals orgString for every key, BL frozen keys included", () => {
        for (const org of ["crc", "brotherslazaroff"]) {
            const t = tForOrg(org)
            for (const key of Object.keys(STRING_BASE) as StringKey[]) {
                expect(t(`org.${key}`), `${org} ${key}`).toBe(orgString(org, key))
            }
        }
        const crc = tForOrg("crc")
        const bl = tForOrg("brotherslazaroff")
        for (const key of BL_FROZEN_CRC_KEYS) expect(bl(`org.${key}`)).toBe(crc(`org.${key}`))
        expect(label("brotherslazaroff", "setlist")).toBe("set")
        expect(label("crc", "setlist")).toBe("setlist")
    })

    it("a Hebrew tenant gets the Hebrew org text when the catalogue has it, English otherwise", () => {
        primeTestOrg()
        const heSetlist = catalogues().he["org.setlist"]
        expect(orgString("testshul", "setlist")).toBe(heSetlist ?? "setlist")
        // An override still wins in any language.
        primeTestOrg({ vocabulary: { mode: "shul", overrides: { setlist: "רשימה" } } })
        expect(orgString("testshul", "setlist")).toBe("רשימה")
    })
})

describe("language selection", () => {
    const env = { ...process.env }
    afterEach(() => {
        process.env = { ...env }
    })

    it("an English tenant ignores the cookie (CRC/BL can never flip)", () => {
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: "he" })).toBe("en")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: null })).toBe("en")
        expect(pickerLanguages("en")).toEqual([])
    })

    it("a Hebrew tenant honours en / he; garbage is ignored", () => {
        expect(resolveUiLanguage({ tenantLanguage: "he", cookie: "en" })).toBe("en")
        expect(resolveUiLanguage({ tenantLanguage: "he", cookie: "fr" })).toBe("he")
        expect(pickerLanguages("he")).toEqual(["he", "en"])
    })

    it("pseudo-locales only outside production (or with I18N_PSEUDO=1); I18N_PSEUDO_LOCALE forces one", () => {
        vi.stubEnv("NODE_ENV", "test")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: "qps" })).toBe("qps")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: "qps-rtl" })).toBe("qps-rtl")
        vi.stubEnv("I18N_PSEUDO_LOCALE", "qps-rtl")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: null })).toBe("qps-rtl")
        vi.stubEnv("I18N_PSEUDO_LOCALE", "")
        vi.stubEnv("NODE_ENV", "production")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: "qps" })).toBe("en")
        vi.stubEnv("I18N_PSEUDO", "1")
        expect(resolveUiLanguage({ tenantLanguage: "en", cookie: "qps" })).toBe("qps")
        vi.unstubAllEnvs()
    })

    it("direction: tenant's configured direction for its own language, else the language's", () => {
        expect(resolveDirection("he", "he", "rtl")).toBe("rtl")
        expect(resolveDirection("en", "he", "rtl")).toBe("ltr")
        expect(resolveDirection("en", "en", "ltr")).toBe("ltr")
        expect(directionOf("qps-rtl")).toBe("rtl")
        expect(htmlLangOf("qps")).toBe("en-XA")
    })

    it("format zone: runtime for English tenants (today), the tenant zone otherwise, explicit setting wins", () => {
        expect(formatTimeZoneOf(codeOrgConfig("crc"))).toBeUndefined()
        expect(formatTimeZoneOf(codeOrgConfig("brotherslazaroff"))).toBeUndefined()
        const he = makeTestOrgConfig()
        expect(formatTimeZoneOf(he)).toBe("Asia/Jerusalem")
        expect(formatTimeZoneOf({ locale: { ...he.locale, formatTimeZone: "runtime" } })).toBeUndefined()
        const crc = codeOrgConfig("crc")!
        expect(formatTimeZoneOf({ locale: { ...crc.locale, formatTimeZone: "tenant" } })).toBe("America/Chicago")
    })

    it("the state the layout renders: CRC en/ltr; testshul he/rtl in Jerusalem; testshul + cookie en → en/ltr", () => {
        const crc = i18nStateFor("crc", codeOrgConfig("crc"), "he")
        expect([crc.lang, crc.dir, crc.htmlLang, crc.timeZone]).toEqual(["en", "ltr", "en", undefined])
        const ts = i18nStateFor("testshul", makeTestOrgConfig(), null)
        expect([ts.lang, ts.dir, ts.htmlLang, ts.timeZone]).toEqual(["he", "rtl", "he", "Asia/Jerusalem"])
        const tsEn = i18nStateFor("testshul", makeTestOrgConfig(), "en")
        expect([tsEn.lang, tsEn.dir]).toEqual(["en", "ltr"])
    })

    it("client props carry no server-only override (BL's frozen AI prompt stays on the server)", () => {
        const props = clientI18nProps(i18nStateFor("brotherslazaroff", codeOrgConfig("brotherslazaroff"), null))
        expect(props.overrides.setlist).toBe("set")
        expect(Object.keys(props.overrides).some((k) => k.startsWith("ai.") || k.startsWith("email.") || k.startsWith("feed."))).toBe(false)
        expect(props.tokens?.shortName).toBeDefined()
    })
})

describe("pseudo-locale", () => {
    it("accents, wraps, keeps placeholders", () => {
        expect(pseudoize("Settings")).toMatch(/^⟦Šéţţîñĝš·+⟧$/)
        expect(pseudoize("{count} files for %s")).toContain("{count}")
        expect(pseudoize("{count} files for %s")).toContain("%s")
    })

    it("isPseudoWrapped spots raw text, accepts nesting and letterless text", () => {
        expect(isPseudoWrapped(pseudoize("Save"))).toBe(true)
        expect(isPseudoWrapped(`⟦Áƀ ${pseudoize("inner")} ç⟧`)).toBe(true)
        expect(isPseudoWrapped("12 / 3 —")).toBe(true)
        expect(isPseudoWrapped("Save")).toBe(false)
        expect(isPseudoWrapped(`${pseudoize("Save")} now`)).toBe(false)
    })
})
