import { describe, it, expect } from "vitest";

/**
 * Pure-state tests for `bridge/src/update-panel-state.ts`. The renderer-side
 * IPC wiring + DOM apply is hard to test in-process (no Electron host in
 * Vitest); this module is the testable seam covering all branch logic.
 *
 * Closes bridge-analysis FINDINGS §4 Lane #5 + R-A2 — Phase 2 of the
 * `bridge-dashboard-update-ui` dispatch.
 */

import {
    applyUpdateInfo,
    initialUpdatePanelState,
    type UpdatePanelState,
} from "../update-panel-state";

describe("applyUpdateInfo — initial state", () => {
    it("is hidden by default with no version", () => {
        expect(initialUpdatePanelState).toEqual({
            visible: false,
            version: null,
            releaseNotes: null,
            dismissedForVersion: null,
        });
    });
});

describe("applyUpdateInfo — update-pending event", () => {
    it("surfaces the panel + captures version when first fired", () => {
        const next = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        expect(next.visible).toBe(true);
        expect(next.version).toBe("10.0.6");
        expect(next.releaseNotes).toBeNull();
        expect(next.dismissedForVersion).toBeNull();
    });

    it("carries releaseNotes through when provided", () => {
        const next = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6", releaseNotes: "Bug fixes + perf wins" },
        });
        expect(next.releaseNotes).toBe("Bug fixes + perf wins");
    });

    it("normalizes undefined releaseNotes to null", () => {
        const next = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        expect(next.releaseNotes).toBeNull();
    });

    it("is a no-op when the same version re-fires while panel already visible", () => {
        const shown = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        const again = applyUpdateInfo(shown, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        // Strict reference equality — applyUpdateInfo returns the existing state
        // object unchanged so the renderer's repaint can short-circuit if it
        // memoizes on identity.
        expect(again).toBe(shown);
    });

    it("re-surfaces the panel when a NEW version arrives after dismissal", () => {
        let state: UpdatePanelState = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        state = applyUpdateInfo(state, { kind: "dismiss" });
        expect(state.visible).toBe(false);
        expect(state.dismissedForVersion).toBe("10.0.6");

        // A NEW version (e.g. 10.0.7 published mid-session) MUST re-surface —
        // the prior dismissal applied to the older bytes only.
        state = applyUpdateInfo(state, {
            kind: "update-pending",
            info: { version: "10.0.7" },
        });
        expect(state.visible).toBe(true);
        expect(state.version).toBe("10.0.7");
        expect(state.dismissedForVersion).toBeNull();
    });

    it("stays hidden when the SAME dismissed version re-fires (no flicker)", () => {
        let state: UpdatePanelState = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        state = applyUpdateInfo(state, { kind: "dismiss" });
        expect(state.visible).toBe(false);

        // main.ts's `refreshTrayMenu()` doesn't re-fire `update-pending`, but
        // defensively: if the same version comes through again, we honor the
        // dismissal but still capture the latest releaseNotes for the next
        // surface.
        const reFired = applyUpdateInfo(state, {
            kind: "update-pending",
            info: { version: "10.0.6", releaseNotes: "now with notes" },
        });
        expect(reFired.visible).toBe(false);
        expect(reFired.dismissedForVersion).toBe("10.0.6");
        expect(reFired.releaseNotes).toBe("now with notes");
        expect(reFired.version).toBe("10.0.6");
    });
});

describe("applyUpdateInfo — dismiss event", () => {
    it("hides the panel + remembers the dismissed version", () => {
        const shown = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        const dismissed = applyUpdateInfo(shown, { kind: "dismiss" });
        expect(dismissed.visible).toBe(false);
        expect(dismissed.dismissedForVersion).toBe("10.0.6");
        // version is preserved so a re-fire with the same version can detect "we dismissed THIS".
        expect(dismissed.version).toBe("10.0.6");
    });

    it("is safe to fire from the initial (hidden) state", () => {
        const dismissed = applyUpdateInfo(initialUpdatePanelState, { kind: "dismiss" });
        expect(dismissed.visible).toBe(false);
        expect(dismissed.dismissedForVersion).toBeNull();
    });
});

describe("applyUpdateInfo — install-clicked event", () => {
    it("hides the panel optimistically (process is about to relaunch)", () => {
        const shown = applyUpdateInfo(initialUpdatePanelState, {
            kind: "update-pending",
            info: { version: "10.0.6" },
        });
        const installing = applyUpdateInfo(shown, { kind: "install-clicked" });
        expect(installing.visible).toBe(false);
        // version is preserved so if the install fails we still know what was pending.
        expect(installing.version).toBe("10.0.6");
        // Install-clicked is NOT a dismissal — the user CHOSE to install. If the
        // relaunch somehow fails and main.ts re-fires `update-pending` for the
        // same version, the panel SHOULD re-surface.
        expect(installing.dismissedForVersion).toBeNull();
    });
});
