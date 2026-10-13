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
| liturgy rows (fixed prayer-text rows in a setlist) | שורות נוסח | נוסח התפילה | "תפילה" is already "service". |
| rabbi (setlist field) | רב/ה | chip: הרב/ה {name} | Gender-neutral slash form. |
| chord / chord shapes | אקורד / תנוחות | — | Guitarists' terms; chord symbols stay Latin. |
| semitone; flat / sharp | חצי טון; במול / דיאז | חצאי טונים | Standard. |
| concert pitch | סולם קונצרט | — | One term everywhere. |
| backing track / recording | רצועת ליווי / הקלטה | — | — |
| bind a chart to a row | חיבור תווים | לחבר תווים | — |
| clone (setlist) | שכפול | — | "יצירת עותק" only where English says "duplicate". |
| archive / restore | העברה לארכיון / שחזור | — | Standard. |
| import | ייבוא | — | Standard. |
| mix bus (sound) | יציאה | יציאות מוניטור | "באס" collides with bass. |
| sound engineer | טכנאי/ת סאונד | — | Role, slash form. |
| bridge (program on the sound PC) | גשר | — | — |
| push notifications | התראות דחיפה | toggle: דחיפה | One term in UI and legal pages. |
| email | אימייל (UI) / דוא״ל (legal pages) | — | Register difference, deliberate. |
| AI | AI | importer title: בינה מלאכותית | Short form common in Israeli software. |
| opt in / opt out (SMS) | הצטרפות / ביטול ההצטרפות | — | Legal pages. |
| Terms & Conditions / Privacy Policy / Accessibility Statement | תנאי שימוש / מדיניות פרטיות / הצהרת נגישות | — | Standard Israeli titles; one form everywhere. |
| Musician Profile (settings section) | פרופיל נגינה | — | Same words in the settings page and the legal "Settings → …" paths. |
| Friday evening / Shabbat morning (service-type options) | קבלת שבת / שבת בבוקר | wizard (fills "{service} הקודמת"): תפילת קבלת שבת / תפילת שבת בבוקר | "ערב שבת" names the day, not the prayer. "שחרית שבת" is not idiomatic; "שחרית של שבת" only where 13+ characters fit. |
| Retry / Try again (button) | ניסיון חוזר | in sentences: "יש לנסות שוב" / "אפשר לנסות שוב" | One button label everywhere. Exception: manage-library-review.retryButton "לנסות שוב (y)" (max 14). |
| Undo (toast action) | ביטול | next to Cancel: ביטול פעולה | — |
| fret (guitar) | סריג | סריגים | "שריג" is a vine tendril. |
| Gig Mode (settings: stability toggle) | מצב במה | — | Kept apart from Perform mode (מצב נגינה). |
| e.g. | למשל: | — | One form; not "לדוגמה:". |
| Google "Anyone with the link" | ״כל מי שקיבל או קיבלה את הקישור״ (Anyone with the link) | — | Google's current Hebrew label, with the English for older or English UIs. |

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
- **Relative times**: "לפני {minutes} דק׳", "לפני {hours} שע׳" in tight spots; days always in full
  ("לפני {days} ימים"); full words otherwise. The checker's LONG warnings on these badges are accepted.
- **Busy states** differ from their idle button: "ב" + verbal noun ("בשמירה…", "בהעלאה…"), a present
  passive ("התבנית נשמרת…") or an impersonal plural ("בודקים…", "שומרים…"); never the bare button noun.
- **Setlist agreement**: when a message's implied subject is the setlist, the verb is feminine
  ("נוצרה", "נשמרה", "שוכפלה").
- **Uppercase** in English badges means nothing in Hebrew; translate the meaning.
