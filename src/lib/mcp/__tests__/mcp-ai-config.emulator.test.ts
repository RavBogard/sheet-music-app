import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    getAiConfig,
    setAiAutoApply,
    setAiThreshold,
} from "../tools/ai-config"

/**
 * Cycle-3 c2 — admin MCP tools managing `aiConfig/autoApplyEnabled`.
 *
 * Covers:
 *  - admin gate refusal (rich `forbidden_role` envelope on non-admin caller)
 *  - get_ai_config returns the stored shape (and the documented defaults
 *    when the doc is missing)
 *  - set_ai_auto_apply: dryRun-default, real-run-without-force refused,
 *    force-write, idempotent re-run, rich envelope on bad input
 *  - set_ai_threshold: same dryRun/force contract + zod-validation rejection
 *    for out-of-range values
 *
 * Mirrors the test posture of mcp-backfill-setlist-test-flag and
 * mcp-reconcile-library — emulator-backed, no MCP wire involved.
 */
describe("MCP aiConfig tools — cycle-3 c2 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-band-leader"
    const MUSICIAN = "test-musician-1"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }

    async function seedConfig(data: Record<string, unknown>) {
        await db().collection("aiConfig").doc("autoApplyEnabled").set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-ai-config" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["aiConfig", "users"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(BAND_LEADER, "band_leader")
        await seedUser(MUSICIAN, "musician")
    })

    // ─── admin gate ────────────────────────────────────────────────────────

    it("get_ai_config: refuses non-admin callers with rich forbidden_role envelope", async () => {
        const r = await getAiConfig(MUSICIAN)
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            callerRole: "musician",
            requiredRoles: ["admin"],
        })
        expect("hint" in r && r.hint).toBeTruthy()
    })

    it("set_ai_auto_apply: refuses band_leader (admin-only — broader than write-tools)", async () => {
        const r = await setAiAutoApply(BAND_LEADER, { enabled: true })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role" },
            callerRole: "band_leader",
        })
    })

    it("set_ai_threshold: refuses non-admin", async () => {
        const r = await setAiThreshold(MUSICIAN, { value: 0.5 })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    // ─── get_ai_config ─────────────────────────────────────────────────────

    it("get_ai_config: returns documented defaults when the doc is missing", async () => {
        const r = await getAiConfig(ADMIN)
        expect(r).toEqual({
            ok: true,
            autoApplyEnabled: false,
            threshold: 0.7,
            // AI-002: GEMINI_API_KEY is unset in the emulator test env.
            subscriberActive: false,
        })
    })

    it("get_ai_config: returns the stored shape", async () => {
        await seedConfig({ enabled: true, threshold: 0.55 })
        const r = await getAiConfig(ADMIN)
        expect(r).toEqual({
            ok: true,
            autoApplyEnabled: true,
            threshold: 0.55,
            subscriberActive: false,
        })
    })

    it("get_ai_config: clamps malformed threshold to default 0.7", async () => {
        await seedConfig({ enabled: false, threshold: 5.0 })
        const r = await getAiConfig(ADMIN)
        expect(r).toMatchObject({
            ok: true,
            autoApplyEnabled: false,
            threshold: 0.7,
        })
    })

    // ─── AI-002: subscriberActive observability ───────────────────────────
    //
    // The boolean disambiguates "dormant by config" (GEMINI_API_KEY unset
    // — the queue sits at status:'pending') from "broken in code"
    // (subscriberActive: true but rows never flip). Re-evaluated per call
    // so a Vercel env update flips it without a process restart.

    it("get_ai_config: subscriberActive reads false when GEMINI_API_KEY is unset", async () => {
        const prior = process.env.GEMINI_API_KEY
        delete process.env.GEMINI_API_KEY
        try {
            const r = await getAiConfig(ADMIN)
            expect(r).toMatchObject({ ok: true, subscriberActive: false })
        } finally {
            if (prior !== undefined) process.env.GEMINI_API_KEY = prior
        }
    })

    it("get_ai_config: subscriberActive reads true when GEMINI_API_KEY is set non-empty", async () => {
        const prior = process.env.GEMINI_API_KEY
        process.env.GEMINI_API_KEY = "test-key-not-a-real-credential"
        try {
            const r = await getAiConfig(ADMIN)
            expect(r).toMatchObject({ ok: true, subscriberActive: true })
        } finally {
            if (prior === undefined) delete process.env.GEMINI_API_KEY
            else process.env.GEMINI_API_KEY = prior
        }
    })

    it("get_ai_config: subscriberActive reads false when GEMINI_API_KEY is set empty", async () => {
        const prior = process.env.GEMINI_API_KEY
        process.env.GEMINI_API_KEY = ""
        try {
            const r = await getAiConfig(ADMIN)
            expect(r).toMatchObject({ ok: true, subscriberActive: false })
        } finally {
            if (prior === undefined) delete process.env.GEMINI_API_KEY
            else process.env.GEMINI_API_KEY = prior
        }
    })

    // ─── set_ai_auto_apply ─────────────────────────────────────────────────

    it("set_ai_auto_apply: rejects non-boolean enabled with invalid_argument", async () => {
        const r = await setAiAutoApply(ADMIN, {
            // @ts-expect-error — bad input shape on purpose
            enabled: "yes",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("set_ai_auto_apply: dryRun (default) returns plan without writing", async () => {
        await seedConfig({ enabled: false, threshold: 0.7 })
        const r = await setAiAutoApply(ADMIN, { enabled: true })
        expect(r).toEqual({
            ok: true,
            previous: false,
            new: true,
            changed: true,
            dryRun: true,
        })

        const reread = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(reread.data()?.enabled).toBe(false)
    })

    it("set_ai_auto_apply: real-run without force → rich force_required, no write", async () => {
        const r = await setAiAutoApply(ADMIN, {
            enabled: true,
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            dryRunPlan: {
                previous: false,
                new: true,
                changed: true,
            },
        })

        const reread = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        // Doc still doesn't exist — refused write didn't touch Firestore.
        expect(reread.exists).toBe(false)
    })

    it("set_ai_auto_apply: force:true writes and is idempotent on a second run", async () => {
        const first = await setAiAutoApply(ADMIN, {
            enabled: true,
            dryRun: false,
            force: true,
        })
        expect(first).toMatchObject({
            ok: true,
            previous: false,
            new: true,
            changed: true,
            dryRun: false,
        })
        if (first.ok !== true) {
            throw new Error("force:true should not be refused")
        }

        const after = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(after.data()?.enabled).toBe(true)
        expect(typeof after.data()?.updatedAt).toBe("string")

        // Re-flip to the SAME value → changed:false, doc still updated touch
        // is acceptable but value unchanged. Also confirms idempotent path
        // doesn't blow up.
        const second = await setAiAutoApply(ADMIN, {
            enabled: true,
            dryRun: false,
            force: true,
        })
        expect(second).toMatchObject({
            ok: true,
            previous: true,
            new: true,
            changed: false,
            dryRun: false,
        })
    })

    it("set_ai_auto_apply: preserves the threshold field via merge (does not clobber)", async () => {
        await seedConfig({ enabled: false, threshold: 0.42 })
        await setAiAutoApply(ADMIN, {
            enabled: true,
            dryRun: false,
            force: true,
        })
        const after = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(after.data()?.enabled).toBe(true)
        expect(after.data()?.threshold).toBe(0.42)
    })

    // ─── set_ai_threshold ─────────────────────────────────────────────────

    it("set_ai_threshold: rejects out-of-range high value", async () => {
        const r = await setAiThreshold(ADMIN, { value: 1.5 })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
            value: 1.5,
        })
    })

    it("set_ai_threshold: rejects out-of-range negative value", async () => {
        const r = await setAiThreshold(ADMIN, { value: -0.1 })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("set_ai_threshold: rejects non-numeric value", async () => {
        const r = await setAiThreshold(ADMIN, {
            // @ts-expect-error — bad input shape on purpose
            value: "0.5",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("set_ai_threshold: dryRun returns plan without writing", async () => {
        await seedConfig({ enabled: false, threshold: 0.7 })
        const r = await setAiThreshold(ADMIN, { value: 0.55 })
        expect(r).toEqual({
            ok: true,
            previous: 0.7,
            new: 0.55,
            changed: true,
            dryRun: true,
        })

        const reread = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(reread.data()?.threshold).toBe(0.7)
    })

    it("set_ai_threshold: real-run without force → rich force_required envelope", async () => {
        const r = await setAiThreshold(ADMIN, {
            value: 0.5,
            dryRun: false,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
            dryRunPlan: {
                new: 0.5,
            },
        })
    })

    it("set_ai_threshold: force:true writes and is idempotent", async () => {
        const first = await setAiThreshold(ADMIN, {
            value: 0.85,
            dryRun: false,
            force: true,
        })
        expect(first).toMatchObject({
            ok: true,
            previous: 0.7,
            new: 0.85,
            changed: true,
            dryRun: false,
        })

        const after = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(after.data()?.threshold).toBe(0.85)

        const second = await setAiThreshold(ADMIN, {
            value: 0.85,
            dryRun: false,
            force: true,
        })
        expect(second).toMatchObject({
            ok: true,
            previous: 0.85,
            new: 0.85,
            changed: false,
            dryRun: false,
        })
    })

    it("set_ai_threshold: preserves the enabled field via merge", async () => {
        await seedConfig({ enabled: true, threshold: 0.7 })
        await setAiThreshold(ADMIN, {
            value: 0.6,
            dryRun: false,
            force: true,
        })
        const after = await db()
            .collection("aiConfig")
            .doc("autoApplyEnabled")
            .get()
        expect(after.data()?.enabled).toBe(true)
        expect(after.data()?.threshold).toBe(0.6)
    })

    // ─── round-trip ───────────────────────────────────────────────────────

    it("end-to-end: set both fields then get_ai_config surfaces both", async () => {
        await setAiAutoApply(ADMIN, {
            enabled: true,
            dryRun: false,
            force: true,
        })
        await setAiThreshold(ADMIN, {
            value: 0.6,
            dryRun: false,
            force: true,
        })
        const r = await getAiConfig(ADMIN)
        expect(r).toEqual({
            ok: true,
            autoApplyEnabled: true,
            threshold: 0.6,
            subscriberActive: false,
        })
    })
})
