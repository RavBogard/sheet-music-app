# Hebrew glossary (UI catalogue)

Every Hebrew catalogue file (`src/i18n/he/*.json`) uses these terms. If a string needs a term that is
not here, pick one, use it everywhere, and add a row. Audience: Nava Tehila (Jewish Renewal prayer and
music community, Jerusalem): musicians and prayer leaders on iPads during prayer, leaders who plan,
admins who manage people and the library.

## Terms

| English | Hebrew | Plural / short form | Why |
|---|---|---|---|
| service (prayer service) | תפילה | תפילות | What the community calls a gathering for prayer ("תפילת קבלת שבת"); "שירות"/"טקס" would be wrong. |
| setlist (BL: "set") | רשימת שירים | רשימות שירים; short: רשימה | Plain and clear to musicians and non-musicians; "סט" is band slang, "סדר" collides with siddur/seder. Use the short form only where the context already says "songs". |
| chart (the sheet-music file) | תווים | countable: קובץ תווים / קובצי תווים | What Israeli musicians call sheet music, lead sheets and chord charts alike. Never "תרשים" (a diagram). |
| band leader (role) | ראש להקה | ראשי להקה | Gender-neutral noun form for a role; short enough for a badge. |
| Vocal Lead (singer who leads a song) | שירה ראשית | — | Names the part, not the person, so it is gender-free; never "מוביל/ה" (that is the rabbi's "Led by"). |
| Led by (the rabbi / prayer leader) | בהובלת | מוביל/ת תפילה | Distinct from Vocal Lead. |
| wedge (stage floor monitor) | מוניטור רצפה | short: מוניטור | Israeli sound jargon; "רמקול" alone is too generic. |
| Monitor (the personal-mix page) | מוניטור | — | Same word sound engineers use. |
| Perform mode | מצב נגינה | button/tab: נגינה | "הופעה" (show) is wrong for prayer; musicians play from it during prayer. |
| library | ספרייה | — | Standard. |
| template | תבנית | תבניות | Standard UI term. |
| musician | נגן/ית | plural: נגנים | Slash form for a single person's role label; masculine plural is the standard generic plural. |
| member (congregant role) | חבר/ה | plural: חברים | Same convention as musician. |
| admin | מנהל/ת | area: ניהול | Role label with slash form; "Manage" screens are "ניהול". |
| song | שיר | שירים | — |
| track / row (an item in a setlist) | שורה | שורות | The setlist grid is rows; "רצועה" (audio track) would mislead. |
| key (musical) | סולם | — | Israeli musicians say "סולם" ("בסולם G"). Key names stay Latin: C, F#m. |
| transpose | העברת סולם | verb: להעביר סולם | Common musicians' phrase; clearer than "טרנספוזיציה". |
| capo, BPM, chord symbols | Capo, BPM, C, Am7 … | — | Stay in Latin letters (rule). |
| metronome | מטרונום | — | Standard. |
| upload | העלאה | verb: להעלות | Standard UI term. |
| download | הורדה | — | Standard. |
| pending (awaiting approval) | בהמתנה | — | Gender- and number-free status. |
| invite | הזמנה | verb: להזמין | Standard. |
| schedule (who plays when) | לוח זמנים | short: לו״ז | Standard; short form only in tight badges. |
| assign / assignment (musician to a service) | שיבוץ | לשבץ | Standard Hebrew for rostering. |
| rehearsal | חזרה | חזרות | Standard musicians' term. |
| offline | לא מקוון | — | Standard Israeli UI. |
| sync | סנכרון | לסנכרן | Standard. |
| tenant / site (the community's own space) | קהילה | site (web site): אתר | For Nava the tenant is a community; `{tenantName}` stays a placeholder. |
| sign in / sign out | התחברות / התנתקות | להתחבר / להתנתק | Standard Israeli UI. |
| dashboard | לוח בקרה | — | Standard. |
| settings | הגדרות | — | Standard. |
| print | הדפסה | — | — |
| gig packet (printed bundle of charts) | חוברת להדפסה | — | Describes what it is; "גיג" is slang. |
| profile | פרופיל | — | Standard. |
| notification | התראה | התראות | Standard. |
| setlist notes | הערות | — | — |
| instrument | כלי נגינה | short: כלי | — |
| section (library collection: core / supplemental / uploads) | אוסף | אוספים | "קטגוריה" is for tags. |
| tag | תגית | תגיות | Standard. |
| Changelog | יומן שינויים | — | Heading only; changelog entries stay English. |

## Conventions

- **No gendered address where avoidable.** Buttons, menu items, tabs and labels use the verbal noun
  ("שמירה", "ביטול", "מחיקה") or the infinitive ("להוסיף שיר"). Instructions and hints are impersonal:
  "יש ל…", "אפשר ל…", "צריך ל…", "לא ניתן ל…". Past-tense 2nd person singular ("הצטרפת", "שמרת") is
  identical for both genders in unvocalised writing and is fine. Where a gendered form cannot be
  avoided, use the slash form for the person ("מחובר/ת", "נגן/ית"); never pick one gender.
- **Questions in confirm dialogs**: "למחוק את {name}?" (infinitive), not "האם את/ה בטוח/ה".
- **Placeholders** `{name}` etc. are copied verbatim. A Hebrew prefix letter before a placeholder or a
  Latin word takes a hyphen: "ל-{tenantName}", "ב-{date}", "מ-{name}".
- **Counts**: `_one` / `_two` / `_other` exist for Hebrew. `_one` is usually "שיר אחד" (no `{count}`
  needed); `_two` is optional ("שני שירים"); `_other` is "{count} שירים". Keys that embed "{count} songs"
  without plural variants are translated with the plural form (reads right for 0 and ≥2).
- **Punctuation**: ellipsis "…" as in English; gershayim "״" and geresh "׳" in abbreviations (לו״ז, דק׳).
  Quote marks inside strings: "״…״" or the English quotes the source uses.
- **Register**: modern Israeli Hebrew, warm and clear; legal pages formal and exact.
- **Names stay names**: prayer and song names, people, brands (Google, Behringer X32, Firebase, Drive,
  Claude), URLs, emails, units and chord symbols stay as written.
- **Relative times**: "לפני {minutes} דק׳", "לפני {hours} שע׳", "לפני {days} ימ׳" in tight spots; full
  words otherwise.
- **Uppercase** in English badges means nothing in Hebrew; translate the meaning.
