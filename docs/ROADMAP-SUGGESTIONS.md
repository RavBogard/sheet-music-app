# CRC Music — Feature Roadmap Suggestions

*Based on codebase analysis and observed workflow patterns. February 2026.*

---

## 1. Default Band Roster

You assign roughly the same musicians every week. Right now you're tapping 5–7 names individually on every setlist, every time.

**What it does:** A "Default Band" button in the MusicianPicker that applies your saved roster in one tap. Editable from Settings. When you tap it, all default members get toggled on — you just deselect whoever's sitting out this week. The data model is trivial: a `defaultMusicians` array on the congregation config doc.

**Why it matters:** Cuts the most repetitive part of your weekly publish workflow from 30 seconds of tapping to one tap + one deselect.

---

## 2. "Clone for Next Week" Action

Your most common workflow is: open last Friday's setlist → duplicate → change the date → swap a few songs → publish. The duplicate feature exists, but it drops the date and musicians, and lands you on a generic copy.

**What it does:** A dedicated "Clone for Next Week" option (in the overflow menu or the setlist dashboard) that duplicates the setlist with: the date auto-bumped to the next occurrence of the same weekday, the same musician roster carried over, and the name updated (e.g., "Shabbat Terumah" → "Shabbat Tetzaveh" using the parasha lookup you already have). Opens directly in the editor, ready to tweak.

**Why it matters:** Eliminates 4–5 manual steps from the most common weekly task.

---

## 3. Save Setlist as Reusable Template

Your data model already has `isTemplate` and `templateType` fields on the Setlist interface. The liturgical template engine builds setlists from hard-coded slot definitions. But there's no way for you to save a curated, battle-tested setlist as a template from the UI.

**What it does:** "Save as Template" in the overflow menu. Strips the date and musicians but preserves the track order, section headers, readings, and flow items. Shows up in the "New Setlist" flow alongside the existing Friday Night / Shabbat Morning options. You could build a High Holiday template once and reuse it every year.

**Why it matters:** Your hard-coded templates are good starting points, but your actual services have been refined over dozens of iterations. Let those refinements persist.

---

## 4. Service-Level Notes for Performers

Per-track notes exist and show in the perform view, but there's no place for service-wide instructions — things like "We're starting 15 minutes early tonight," "New arrangement for Lecha Dodi — listen to the recording," or "Karen is leading the first half, Daniel the second."

**What it does:** A `serviceNotes` field on the Setlist model, editable from the editor (a collapsible text area near the top), rendered as a prominent banner at the top of the perform view. Could also be included in the publish email alongside your custom note.

**Why it matters:** Right now these instructions live in a separate text thread or verbal announcement. Putting them where the musicians are already looking means they actually get read.

---

## 5. Smart Song Suggestions When Building

When you tap "Add Song," you get the full library with a search box. But you already have rich usage data — songs played recently, songs played frequently, songs that haven't been used in months.

**What it does:** The Add Songs modal gets a "Suggested" section at the top showing: songs from last week's equivalent service that aren't already in this setlist (easy swaps), frequently used songs for this service type (Friday night staples), and songs not played in 3+ months (rotation candidates). All powered by the `songUsage` collection you're already populating.

**Why it matters:** Turns setlist building from "search and remember" to "review and confirm." Especially valuable when someone else needs to build a setlist in your absence.

---

## 6. Library Key Filter

Your enrichment engine already extracts musical key from every chart via Gemini. But there's no way to filter the library by key in the UI.

**What it does:** A key filter chip in the library (alongside any existing filters) that lets you browse "all songs in Em" or "all songs in D." Useful when you're planning tonal flow for a service — you want Kabbalat Shabbat to stay in minor keys, or you need a song in G to bridge between two others.

**Why it matters:** The data is already there and indexed. This just surfaces it.

---

## 7. Song Rotation Awareness

You track song usage with dates and counts, but this information only shows as a small "Last: Jan 31" badge in the library. When you're actually building a setlist and adding songs, there's no warning that you played Mi Chamocha two weeks in a row.

**What it does:** When adding a song to a setlist, show a subtle inline indicator: "Played 2 weeks ago" (amber) or "Played last week" (red) or "Not played in 2+ months" (green, encouraging). Same indicators visible in the editor track list. Optional: a rotation report accessible from admin that flags songs played 3+ times in the last month.

**Why it matters:** Congregation members notice repetition even if musicians don't. This keeps the repertoire fresh without requiring you to remember what you played when.

---

## 8. Musician Prep Self-View

You have BandPrepSection in the admin panel showing which musicians have viewed which charts. But the musicians themselves can't see their own progress.

**What it does:** A "My Prep" section on the dashboard (for members) showing upcoming setlists with a progress ring: "You've reviewed 8/15 charts." Tapping it opens the perform view. The data infrastructure already exists — `songPreferences` tracks `lastViewedAt` per file per user.

**Why it matters:** Creates gentle accountability without nagging. Musicians who see "60% prepared" are motivated to close the gap before Friday.

---

## 9. Email Delivery Tracking

You just dealt with email failures and had no visibility into what happened. Resend supports webhooks that report delivery status (sent → delivered → opened → clicked).

**What it does:** Register a Resend webhook endpoint. Store delivery events per setlist per musician. Show status in the editor: a small indicator next to each musician's name after publishing (envelope icon: gray = pending, green = delivered, blue = opened, red = bounced). Accessible from the MusicianPicker after publish.

**Why it matters:** "Did Karen get the email?" is a question you shouldn't have to wonder about.

---

## 10. Instant Personalized Load

You noticed the dashboard takes too long to feel "alive." The Firebase Auth SDK takes 1–2 seconds to restore the session from IndexedDB, and until then the greeting says "Welcome to CRC Music" instead of your name.

**What it does:** Cache `displayName`, `role`, and `photoURL` in `localStorage` on every successful auth. On mount, read from localStorage immediately so the greeting says "Good evening, Daniel" on the very first frame, before Firebase Auth even initializes. When auth resolves, silently reconcile if anything changed.

**Why it matters:** Perceived load time drops to near-zero. The page feels like it "knows you" instantly instead of loading for 2 seconds then recognizing you. Small touch, big feel.

---

## 11. PWA Install Prompt

The manifest.json exists and the app runs in standalone mode, but there's no prompt encouraging musicians to install it. Many of your musicians probably visit via Chrome every week without realizing they can add it to their home screen for a native-app experience.

**What it does:** Intercept the `beforeinstallprompt` event. Show a dismissible banner (once per device, not every visit) on the dashboard: "Add CRC Music to your home screen for quick access." Store dismissal in localStorage. Musicians who install get faster launch, no browser chrome, and offline chart access via the service worker you already have.

**Why it matters:** The difference between "open Chrome, type URL" and "tap icon" is the difference between a website and an app. Your musicians will use it more if it's on their home screen.

---

## 12. Multi-Week Planning Calendar

The calendar view exists but is focused on individual dates. For planning rotation and avoiding repetition, you need to see 3–4 weeks at once with the songs listed.

**What it does:** A planning view (accessible from the setlist dashboard) showing a 4-week grid. Each week shows the setlist name and a compact song list. Songs that appear in multiple weeks are highlighted. Click any week to open its setlist. Could also show empty slots for weeks with no setlist yet, with a "Create" button.

**Why it matters:** The single biggest tool for maintaining variety. "Oh, we did Yedid Nefesh three of the last four weeks" is immediately visible instead of requiring you to open each setlist individually.

---

## 13. Song Favorites / Quick-Access List

Some songs are evergreens — your go-to Shalom Aleichem, your default L'cha Dodi, your staple Mi Chamocha. Right now they live in a mental list.

**What it does:** A star/heart toggle on any song in the library. Starred songs appear in a "Favorites" section in the Add Songs modal and optionally as a filter in the library. Stored per-user in Firestore (under `songPreferences`). Leaders could also mark congregation-wide favorites visible to everyone.

**Why it matters:** Your library has hundreds of charts. Your working repertoire is probably 40–60 songs. Favorites surfaces the ones you actually use without losing access to the rest.
