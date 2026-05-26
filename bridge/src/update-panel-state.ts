/**
 * Bridge dashboard "Update available" panel — pure state machine.
 *
 * Closes bridge-analysis FINDINGS §4 Lane #5 + R-A2: before this lane, the
 * only operator-visible "install now" path was the system-tray context menu,
 * which is easy to miss for days. After this lane, the renderer subscribes to
 * the `update-pending` IPC (already fired by `bridge/src/main.ts` L331 inside
 * electron-updater's `update-downloaded` callback, BR-03 deferred-install
 * flow) and surfaces a banner in the dashboard window with version + an
 * "Install & Restart" button → `install-update` IPC → `installPendingUpdate()`
 * → `autoUpdater.quitAndInstall(true, true)`.
 *
 * This module is the testable seam. The renderer is hard to unit-test in
 * Vitest (no Electron host), so all the decision logic lives here as a pure
 * `(state, event) -> newState` function and the renderer is a thin DOM-apply
 * shim. The Electron renderer pulls this via `require('../dist/update-panel-state.js')`
 * after `tsc` compiles `bridge/src/*.ts` to `bridge/dist/`.
 */

/** Renderer-side view of "is there an update waiting + what version". */
export interface UpdatePanelState {
    /** When true, the panel is visible in the DOM. */
    visible: boolean;
    /** Semver of the downloaded-and-pending update, e.g. "10.0.6". `null` when no update is pending. */
    version: string | null;
    /** Optional release notes from electron-updater (HTML or plain text). `null` if not provided. */
    releaseNotes: string | null;
    /** When the user has clicked "Remind me later" we suppress the panel for THIS pending version only. */
    dismissedForVersion: string | null;
}

/** Payload shape sent by `mainWindow.webContents.send('update-pending', ...)` in `bridge/src/main.ts`. */
export interface UpdatePendingInfo {
    version: string;
    /** electron-updater MAY include releaseNotes on the `update-downloaded` event; today main.ts doesn't forward it, but we accept it defensively. */
    releaseNotes?: string | null;
}

/** Discriminated union of events the panel reacts to. */
export type UpdatePanelEvent =
    | { kind: "update-pending"; info: UpdatePendingInfo }
    | { kind: "dismiss" }
    | { kind: "install-clicked" };

export const initialUpdatePanelState: UpdatePanelState = {
    visible: false,
    version: null,
    releaseNotes: null,
    dismissedForVersion: null,
};

/**
 * Pure (state, event) → newState. No DOM access, no IPC. The renderer threads
 * this through a `let state = applyUpdateInfo(state, event)` and re-paints
 * after every call.
 */
export function applyUpdateInfo(
    state: UpdatePanelState,
    event: UpdatePanelEvent,
): UpdatePanelState {
    switch (event.kind) {
        case "update-pending": {
            const version = event.info.version;
            // No-op if main.ts re-fires with the same version we're already showing
            // (e.g. checkForUpdates() resolves a fresh poll but the bytes haven't
            // changed); keeps the panel from flickering.
            if (state.visible && state.version === version) {
                return state;
            }
            // If the user dismissed THIS exact version, stay hidden. A NEW version
            // (e.g. 10.0.6 → 10.0.7 published while bridge ran) re-surfaces the
            // panel — the prior dismissal applied to the older bytes only.
            if (state.dismissedForVersion === version) {
                return {
                    ...state,
                    version,
                    releaseNotes: event.info.releaseNotes ?? null,
                };
            }
            return {
                visible: true,
                version,
                releaseNotes: event.info.releaseNotes ?? null,
                dismissedForVersion: null,
            };
        }
        case "dismiss": {
            // Hide the panel + remember the dismissal for this version so the
            // tray's `refreshTrayMenu()` doesn't cause a re-surface on the next
            // status tick (no separate IPC, but defensive — same-version repaints
            // stay suppressed).
            return {
                ...state,
                visible: false,
                dismissedForVersion: state.version,
            };
        }
        case "install-clicked": {
            // The renderer fires the `install-update` IPC AND closes the panel
            // optimistically — installPendingUpdate() relaunches the process so
            // the DOM is about to be torn down anyway, but if the install
            // somehow fails we don't want a stuck "Installing..." panel.
            return {
                ...state,
                visible: false,
            };
        }
    }
}
