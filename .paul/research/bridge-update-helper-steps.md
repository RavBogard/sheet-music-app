# Updating the CentralReform Bridge to v10.0.1 — Office Helper Steps

**Who this is for:** the person physically at the studio computer. You do **not**
need any technical knowledge. Just follow the steps below, one at a time.

**What you're doing:** replacing the small "CentralReform Bridge" program that runs in
the background with its newest version (**v10.0.1**). It takes about 3–5 minutes. You
will **not** lose anything — your saved login/credentials carry over automatically.

**When to do it:** any time the sound system / mixer is **not** in use for a live
service or rehearsal. (Installing restarts the program for a few seconds.)

> ⚠️ **Why we're doing it this way (the direct-installer way) instead of the old
> "Check for Updates" button:** last time, the built-in updater button got stuck and
> took the program offline. So this time we install the new version **directly from a
> file** — it's more reliable. Please follow these steps rather than the tray
> "Check for Updates" item.

---

## Step 1 — Get the installer file

We will send you a file named:

```
CentralReform-Bridge-Setup-10.0.1.exe
```

(about 100 MB). It will come by **email or a Google Drive link** from us. Save it
somewhere easy to find, like the **Desktop**.

- If you'd rather download it yourself, it lives here:
  **https://github.com/RavBogard/sheet-music-app/releases/tag/v10.0.1**
  → under **"Assets"**, click `CentralReform-Bridge-Setup-10.0.1.exe`. (If the page
  asks you to sign in, use the file we email you instead.)

> 🛑 **If you can't find or open the file, STOP and tell us.** Don't continue.

---

## Step 2 — Quit the Bridge that's currently running

So the new version can replace the old one cleanly, first close the running program:

1. Look at the **bottom-right corner** of the screen, next to the clock (the "system
   tray"). The Bridge is a small **purple/violet dot**. If you don't see it, click the
   small **`^` arrow** ("Show hidden icons") just to the left of that row.
2. Hover the dot to confirm it says **"CentralReform Bridge"**.
3. **Right-click** the purple dot → click **"Quit Bridge"**.
4. The purple dot disappears. Good — that's what we want.

> ℹ️ If there's no purple dot at all, the Bridge may already be closed. That's fine —
> just go to Step 3.

---

## Step 3 — Run the installer

1. **Double-click** the `CentralReform-Bridge-Setup-10.0.1.exe` file you saved.
2. Windows may show a blue **"Windows protected your PC"** box. If it does:
   click **"More info"**, then **"Run anyway"**. (This is normal for our program.)
3. The installer runs on its own — a small window appears for a few seconds and then
   closes. **It installs over the old version automatically;** you don't have to pick a
   folder or answer questions.
4. When it finishes, the Bridge **reopens by itself** and the **purple dot reappears**
   in the system tray within a few seconds.

---

## Step 4 — Confirm it's running

- Hover the purple dot — it should still say **"CentralReform Bridge"**.
- Right-click it → **"Show Dashboard"**. The window should show the bridge starting up
  and (within a minute) **"X32 Connected"** if the mixer is powered on.

> ✅ **You're done.** **Tell us when you've finished** so we can confirm on our side
> that the new version is live and talking to the mixer.

---

## Backstop — only if it asks for a "Setup Code" (it shouldn't)

With this version, your saved credentials are kept in a safe place that survives the
update, so the Bridge should start **without** asking for anything.

**If** the dashboard shows a **"Bridge Setup"** screen asking for a Setup Code:

1. Don't type anything yet — **tell us first.**
2. As a quick fix, we may ask you to copy a file named **`service-account-key.json`**
   (we'll tell you where it is) into the Bridge's installation folder, then quit and
   reopen the Bridge. That restores it immediately.
3. If we instead give you a **Setup Code**, note it is **10 characters** (letters and
   numbers, e.g. `ABCD234XYZ`) — type the whole thing, and for "App URL" use
   `https://www.centralreform.live`.

---

## Notes (for us, not the helper)

- **Primary path is the direct installer**, NOT the tray "Check for Updates" → "Install
  update" flow. The 2026-05-21 outage involved the tray/auto-update path stalling
  (and a separate cred-orphan bug); v10.0.1 fixes the cred bug but we still drive the
  install by hand-running the signed installer for predictability.
- **Bug#1 (durable creds) is in this build:** `main.ts` now reads/writes
  `service-account-key.json` at `app.getPath('userData')`
  (`%APPDATA%\CentralReform Bridge`) first, with the exe folder as a fallback, and
  **self-migrates** an exe-folder key into userData on first run. So this is the last
  install that can orphan creds — after v10.0.1 runs once, future reinstalls are
  non-destructive. The manual JSON-drop into the exe folder still works as a backstop.
- **Bug#2 (setup-code length) is in this build:** the setup overlay input is now
  `maxlength=10` (was 6) and the copy says "10-character"; the appUrl default is
  `https://www.centralreform.live` (was the wrong `centralreform.firebaseapp.com`).
- **The installer is signed** (signtool, this build) — SmartScreen may still show
  "More info → Run anyway" on a low-reputation cert; that's expected, not an error.
- **Confirm remotely after update:** Firestore `config/monitor.bridge.version` reads
  **`10.0.1`** once the new build's heartbeat fires (`app.getVersion()` wiring), with a
  fresh `lastSeen` and `x32Connected: true`. That's our proof the update landed.
- **The new version also carries the P1-A state-write root-fix** (full-state writes →
  fixes the array→map corruption; query-after-command → fixes read-of-own-write;
  2-tier heartbeat → fixes idle-freeze). The first full-state write after install
  **heals** the currently MAP-corrupted `monitor-live/state`.
