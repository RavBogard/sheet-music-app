# Updating the CentralReform Bridge — Office Helper Steps

**Who this is for:** the person physically at the studio computer. You do **not**
need any technical knowledge. Just follow the pictures-in-words below, step by step.

**What you're doing:** telling the small "CentralReform Bridge" program that runs in
the background to download and install its latest version (v10.0.0). It takes about
2–3 minutes. You will **not** lose anything.

**When to do it:** any time the sound system / mixer is **not** in use for a live
service or rehearsal. (Installing restarts the program for a few seconds.)

---

## Step 1 — Find the Bridge icon in the system tray

Look at the **bottom-right corner** of the screen, next to the clock. There is a row
of tiny icons there (this is called the "system tray").

- The Bridge icon is a small **purple/violet dot (circle)**.
- Some icons are hidden. If you don't see the purple dot, click the small **`^`
  arrow** ("Show hidden icons") just to the **left** of that row — a little pop-up box
  of more icons appears. The purple dot may be in there.
- To confirm it's the right one: hover the mouse over the purple dot (don't click yet).
  A label saying **"CentralReform Bridge"** should appear.

> 🛑 **If you cannot find a purple dot labeled "CentralReform Bridge" anywhere** (not
> in the tray and not under the `^` arrow): **STOP and tell us.** Do not continue. The
> program may not be running, and we'll handle it remotely.

---

## Step 2 — Right-click the Bridge icon

**Right-click** (the right mouse button) directly on the purple "CentralReform Bridge"
dot. A small menu pops up. It will look roughly like this:

```
  Show Dashboard
  ──────────────
  Check for Updates
  ──────────────
  Quit Bridge
```

> 🛑 **If you do NOT see a line that says "Check for Updates"** in that menu: **STOP
> and tell us.** (This means the studio is running an older style of the program that
> can't update itself, and we'll send you different instructions.) Do **not** click
> "Quit Bridge".

---

## Step 3 — Click "Check for Updates"

Left-click the line that says **"Check for Updates"**.

- The menu closes. Nothing dramatic happens on screen — the program is quietly
  downloading the new version in the background.
- **Wait about 1–2 minutes.** You can keep working; just don't restart or shut down
  the computer.

---

## Step 4 — Right-click the icon again and install

After waiting ~1–2 minutes, **right-click the purple "CentralReform Bridge" dot
again**. The menu now has a **new line** near the middle that says something like:

```
  Show Dashboard
  ──────────────
  Check for Updates
  Install update v10.0.0 (restart now)   ← NEW line
  ──────────────
  Quit Bridge
```

Left-click **"Install update v10.0.0 (restart now)"**.

- The Bridge will close and reopen by itself within a few seconds. This is normal.
- The purple dot may briefly disappear and come back. That's the update finishing.

> ℹ️ **If the new "Install update…" line does NOT appear** after waiting a couple of
> minutes: the new version may not be ready yet, or the computer may be offline.
> Wait another 2–3 minutes and right-click once more to check. If it still never
> appears, tell us and we'll look into it.

---

## Step 5 — Done

That's it. The Bridge is now running the new version. You don't need to do anything
else, and you can leave the purple dot alone. **Tell us when you've finished** so we
can confirm on our side that the update landed.

---

## Notes (for us, not the helper)

- The tray menu is built in `bridge/src/main.ts › buildTrayMenu()`. The "Install
  update v{version} (restart now)" item only appears **after** a release has finished
  downloading (`update-downloaded` → `pendingUpdateVersion` set → `refreshTrayMenu()`).
  So the two-visit flow above (check, wait, re-open, install) is required by design.
- The **dashboard window does NOT have a working install button** — `ipcMain` exposes
  an `install-update` handler but `ui/index.html` never calls it. **The tray item is
  the only manual install path.** Don't send the helper to "Show Dashboard" to install.
- If the helper does nothing after "Check for Updates", the update still lands
  automatically later via BR-03 gating: after the X32 has been **idle 30 continuous
  minutes**, or on the **next time the computer/app restarts** (`autoInstallOnAppQuit`).
  So a missed click is self-healing — it just won't be immediate.
- Confirm-remotely after update: `config/monitor.bridge.version` in Firestore will read
  **`10.0.0`** once the new build's heartbeat fires (the version-sentinel fix in this
  release wires the heartbeat to `app.getVersion()`), instead of the old hardcoded
  `"2.0.0"`. That's our remote proof the update installed.
