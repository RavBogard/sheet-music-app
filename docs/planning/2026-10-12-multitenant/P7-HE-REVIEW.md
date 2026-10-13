# P7: independent review of the Hebrew UI translation

Reviewer: independent second pass. I did not write the translation. Branch `mt-p7-he`, catalogue at `792062a5`.

Scope: every Hebrew string in `src/i18n/he/*.json` (53 namespaces plus `org`). Each string was read against its English source, its note (`where` / `who` / `maxLength` / `context`), `GLOSSARY-he.md` and `TRANSLATING.md`.

Method:
- One reviewer per namespace group (legal, policy pages, Perform, setlists, library, admin/settings, shell). Each reviewer read every entry in full.
- A lead pass then checked consistency across namespaces (same English UI word → same Hebrew) and made the rulings.

This file is only a report. No Hebrew file was edited.

## Summary

- **Strings reviewed:** 2,310. That is about 2,270 keys, with the plural variants `_one` / `_two` / `_other` counted separately.
- **`node scripts/i18n-he-missing.mjs`:** 0 missing, 0 placeholder mismatches, 6 LONG warnings. All six are relative-time badges (see Systemic notes).
- **Findings: 108.** 5 wrong, 46 should, 57 could.
- **Clean checks:**
  - No broken placeholders.
  - No gendered imperatives.
  - No rejected glossary terms anywhere (סט, צ׳ארט, הופעה, טרנספוזיציה, תרשים, or מוביל for Vocal Lead).
- **Overall:** a strong first pass.
  - The meaning is right almost everywhere.
  - The gender convention is applied consistently: verbal nouns on buttons, impersonal hints, slash forms only for people.
  - Placeholders and prefix hyphens are correct, and the musician vocabulary is natural.
- **What remains:**
  - Mostly consistency drift between namespaces that different translators handled.
  - A handful of calques.
  - One service-name decision.

| Group | Namespaces | Strings | wrong | should | could | Judgement |
|---|---|---|---|---|---|---|
| Legal (platform) | legal | 159 | 3 | 3 | 4 | Formal and complete, with exact placeholders. Fix the defined-terms list ("us" is dropped) and the accept/receive ambiguity. |
| Policy pages (CRC text) | privacy, terms, smsConsent, accessibility | 162 | 1 | 6 | 11 | Accurate and formal. The opt-out wording drifts from the glossary, and the same text is worded differently from `legal.*`. Accessibility is clean. |
| Perform | perform, performSetlist, music, audio, offline, appSync, hooks | 383 | 0 | 16 | 5 | Natural for musicians. Issues: progress toasts phrased like buttons; masculine agreement with the (feminine) setlist; "bind" as קישור instead of חיבור; a wake-lock calque. audio, offline and appSync are clean. |
| Setlists | setlistGrid, setlist, setlistModals, setlistWizard, setlistPrint, schedule, calendar | ~500 | 0 | 6 | 10 | Strong. Glossary terms are held throughout (שורה, חיבור תווים, שירה ראשית, בהובלת, רב/ה). The main change is the Friday-evening service name. setlistPrint is clean. |
| Library | library, libraryHealth, libraryScraper, libraryUpload, importer, manage-library-review, admin-library, api-library, api-charts, api-ai, api-recordings | ~440 | 0 | 5 | 11 | Consistent and accurate. Issues: busy-state labels identical to their idle button; the Google sharing label; bidi problems with "60+" and ".csv". |
| Admin & settings | settings, admin-people, admin-sound, admin-templates, manage-templates, manage, people, invite, auth, api-auth, api-admin, api-scheduling | ~430 | 1 | 1 | 8 | Very clean: admin-people, admin-sound, invite and the api-* namespaces have no findings. Issues: the fret term is wrong, the Gig Mode title is unclear, and the interval notes use calqued word order. |
| Shell | dashboard, nav, home, shell, ui, common, changelog, language, v2, org, api-setlist, api-setlists | ~240 | 0 | 9 | 8 | Clean. Issues: Retry wording drift, one דוא״ל in the UI, a double slash form, and the service-name change carried into `org`. |

## Findings

Severity levels:
- **wrong:** a meaning error, a legal inaccuracy, or something broken.
- **should:** register, convention, consistency or length.
- **could:** style.

Keys I agree with are not listed. Each proposed Hebrew value is the full replacement string.

| ns.key | English | current Hebrew | proposed Hebrew | severity | reason |
|---|---|---|---|---|---|
| legal.privacy.intro | {operator} (“we”, “us”, or “our”) provides the {appName} web application (the “Service”). {platformLine} This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use the Service. | {operator} (״אנו״, ״אנחנו״ או ״שלנו״) מספקת את יישום הרשת {appName} (״השירות״). {platformLine} דף זה מפרט את המדיניות שלנו בנוגע לאיסוף, לשימוש ולגילוי של מידע אישי בעת השימוש בשירות. | {operator} (״אנו״, ״אותנו״ או ״שלנו״) מספקת את יישום הרשת {appName} (״השירות״). {platformLine} דף זה מפרט את המדיניות שלנו בנוגע לאיסוף, לשימוש ולגילוי של מידע אישי בעת השימוש בשירות. | wrong | Defined-terms list: אנו/אנחנו are both "we", so "us" is dropped; terms.intro (CRC) already uses ״אותנו״ |
| legal.terms.intro | Welcome to {appName}, a web application provided by {operator} (“we”, “us”, or “our”). {platformLine} By using this Service, you agree to these Terms & Conditions. | ברוכים הבאים ל-{appName}, יישום רשת המסופק על ידי {operator} (״אנו״, ״אנחנו״ או ״שלנו״). {platformLine} השימוש בשירות זה מהווה את הסכמתך לתנאי שימוש אלה. | ברוכים הבאים ל-{appName}, יישום רשת המסופק על ידי {operator} (״אנו״, ״אותנו״ או ״שלנו״). {platformLine} השימוש בשירות זה מהווה את הסכמתך לתנאי שימוש אלה. | wrong | Same: "us" missing from the defined terms |
| legal.privacy.sms.optIn | If you opt in to receive SMS notifications, we will send you text messages related to your scheduling assignments, reminders, and cancellations at {operator}. | אם בחרת להצטרף לקבלת התראות SMS, נשלח אליך הודעות טקסט הקשורות לשיבוצים שלך, תזכורות וביטולים ב-{operator}. | אם בחרת להצטרף לקבלת התראות SMS, נשלח אליך הודעות טקסט הקשורות לשיבוצים שלך, לתזכורות ולביטולים ב-{operator}. | should | Broken list parallelism: reads as if reminders and cancellations are sent alongside the messages rather than being what the messages relate to |
| legal.terms.description.notifications | Notification services (email, SMS, push) | שירותי התראות (דוא״ל, SMS, Push) | שירותי התראות (דוא״ל, SMS, התראות דחיפה) | should | Glossary: push = התראות דחיפה in UI and legal; matches terms.descriptionService.notificationServicesEmail |
| legal.sms.optOut.heading | Opt-Out | ביטול הצטרפות | ביטול ההצטרפות | should | Glossary opt-out = ביטול ההצטרפות; used so in every other legal key and in smsConsent.optOut.heading |
| legal.sms.program.confirmations | {term} Confirmation when you accept or decline an assignment | {term} אישור כאשר קיבלת או דחית שיבוץ | {term} אישור כאשר הסכמת לשיבוץ או דחית אותו | wrong | "קיבלת שיבוץ" reads as "you received an assignment", not "accepted" |
| legal.terms.warranties.body | The Service is provided “as is” without warranties of any kind, either express or implied. {operator} does not guarantee that the Service will be uninterrupted, secure, or error-free. | השירות מסופק ״כמות שהוא״ (AS IS), ללא אחריות מכל סוג שהוא, מפורשת או משתמעת. {operator} אינה מתחייבת שהשירות יפעל ללא הפרעות, באופן מאובטח או ללא שגיאות. | השירות מסופק ״כמות שהוא״, ללא אחריות מכל סוג שהוא, מפורשת או משתמעת. {operator} אינה מתחייבת שהשירות יפעל ללא הפרעות, באופן מאובטח או ללא שגיאות. | could | "(AS IS)" is an addition not in the source; ״כמות שהוא״ is the established Hebrew legal term |
| legal.terms.warranties.heading | 7. Disclaimer of Warranties | 7. הסרת אחריות | 7. שלילת אחריות | could | Cross-namespace consistency: terms.disclaimerWarranties.heading uses שלילת אחריות; pick one |
| legal.sms.highlight.voluntary | voluntary | וולונטרית | מרצון | could | Loanword in formal legal text; "ההצטרפות היא מרצון" is the natural formal phrasing (if changed, change smsConsent.highlight.voluntary too) |
| legal.accessibility.report.body | If you encounter a part of the app you can't use with your assistive technology, please email {email}. Include the page URL and a short description; we'll respond within a week. | אם נתקלת בחלק ביישום שאינך יכול/ה להשתמש בו באמצעות הטכנולוגיה המסייעת שלך, נא לשלוח דוא״ל אל {email}. יש לציין את כתובת ה-URL של הדף ותיאור קצר; נשיב תוך שבוע. | אם נתקלת בחלק ביישום שלא ניתן להשתמש בו באמצעות הטכנולוגיה המסייעת שלך, נא לשלוח דוא״ל אל {email}. יש לציין את כתובת ה-URL של הדף ותיאור קצר; נשיב תוך שבוע. | could | Avoidable slash form; impersonal "לא ניתן" keeps the meaning |
| privacy.smsMobileMessaging.messageFrequencyVaries | Message frequency varies based on your scheduling activity. Message and data rates may apply. You may opt out of SMS notifications at any time through your profile settings or by replying STOP to any message. | תדירות ההודעות משתנה בהתאם לפעילות השיבוץ שלך. ייתכן שיחולו תעריפי הודעות ונתונים. באפשרותך להפסיק לקבל התראות SMS בכל עת דרך הגדרות הפרופיל שלך או על ידי מענה STOP לכל הודעה. | תדירות ההודעות משתנה בהתאם לפעילות השיבוץ שלך. ייתכן שיחולו תעריפי הודעות ונתונים. באפשרותך לבטל את ההצטרפות להתראות SMS בכל עת דרך הגדרות הפרופיל שלך, או על ידי שליחת STOP בתשובה לכל הודעה. | should | Glossary: opt out = ביטול ההצטרפות in legal pages (legal.privacy.sms.frequencyAndOptOut already does this); "שליחת STOP בתשובה" states the carrier keyword action unambiguously. STOP kept literal. |
| privacy.rights.optOutSms | Opt out of SMS notifications at any time | להפסיק לקבל התראות SMS בכל עת | לבטל את ההצטרפות להתראות SMS בכל עת | should | Glossary opt-out term; matches legal.privacy.rights.optOutSms. |
| privacy.rights.optOutEmail | Opt out of email notifications at any time | להפסיק לקבל התראות בדוא״ל בכל עת | לבטל את ההצטרפות להתראות בדוא״ל בכל עת | should | Same English verb as the SMS line above; matches legal.privacy.rights.optOutEmail. |
| privacy.smsMobileMessaging.optReceiveSms | If you opt in to receive SMS notifications, we will send you text messages related to your scheduling assignments, reminders, and cancellations at Central Reform Congregation. | אם בחרת להצטרף לקבלת התראות SMS, נשלח אליך הודעות טקסט הקשורות לשיבוצים שלך בלוח הזמנים, לתזכורות ולביטולים ב-Central Reform Congregation. | אם בחרת להצטרף לקבלת התראות SMS, אנו נשלח אליך הודעות טקסט הקשורות לשיבוצים שלך בלוח הזמנים, לתזכורות ולביטולים ב-Central Reform Congregation. | could | Unvocalised "נשלח" also reads as past passive ("was sent"); "אנו נשלח" fixes it as the binding future "we will send". |
| privacy.changesPolicy.updatePrivacyPolicy | We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the “Last updated” date. | אנו עשויים לעדכן את מדיניות הפרטיות מעת לעת. נודיע לך על כל שינוי באמצעות פרסום מדיניות הפרטיות החדשה בדף זה ועדכון התאריך שליד ״עדכון אחרון״. | אנו עשויים לעדכן מדיניות פרטיות זו מעת לעת. נודיע לך על כל שינוי באמצעות פרסום מדיניות הפרטיות החדשה בדף זה ועדכון התאריך שליד ״עדכון אחרון״. | could | "this" dropped; legal text should keep it (legal.privacy.changes.body has "מדיניות פרטיות זו"). |
| privacy.rights.haveRight | You have the right to: | יש לך זכות: | יש לך הזכות: | could | Lead-in to a list of specific rights; definite form reads as the formal "you have the right to". |
| terms.smsMessagingTerms.optOutSms | You may opt out of SMS messages at any time by replying {term1} to any message or by disabling SMS notifications in your profile settings. For help, reply {term2} to any message or contact us at {link}. | באפשרותך להפסיק לקבל הודעות SMS בכל עת על ידי מענה {term1} לכל הודעה או על ידי השבתת התראות ה-SMS בהגדרות הפרופיל שלך. לקבלת עזרה, ניתן להשיב {term2} לכל הודעה או לפנות אלינו בכתובת {link}. | באפשרותך לבטל את ההצטרפות להודעות SMS בכל עת על ידי שליחת {term1} בתשובה לכל הודעה, או על ידי השבתת התראות ה-SMS בהגדרות הפרופיל שלך. לקבלת עזרה, ניתן לשלוח {term2} בתשובה לכל הודעה או לפנות אלינו בכתובת {link}. | should | Glossary opt-out term; one phrasing for both keyword replies (STOP/HELP stay literal via placeholders); matches legal.terms.sms.optOutAndHelp. |
| terms.acceptanceTerms.accessingUsingCrc | By accessing or using the CRC Music application, you agree to be bound by these Terms. If you do not agree to these Terms, you may not use the Service. | הגישה לאפליקציית CRC Music או השימוש בה מהווים הסכמה מצדך לכך שתנאים אלה יחייבו אותך. אם אין לך הסכמה לתנאים אלה, אין להשתמש בשירות. | הגישה לאפליקציית CRC Music או השימוש בה מהווים הסכמה מצדך לכך שתנאים אלה יחייבו אותך. אם אינך מסכים/ה לתנאים אלה, אין להשתמש בשירות. | could | "אם אין לך הסכמה" is stilted; the slash form is already used on this page (הנך מסכים/ה). |
| terms.smsMessagingTerms.messageTypesInclude | Message types include: assignment notifications, reminders, confirmations, and cancellations | סוגי ההודעות כוללים: הודעות על שיבוץ, תזכורות, אישורים וביטולים | לכך שסוגי ההודעות כוללים: הודעות על שיבוץ, תזכורות, אישורים וביטולים | could | List item continues "הנך מסכים/ה:"; as-is it is a free-standing sentence that does not attach to the lead-in. Same fix as legal.terms.sms.types. |
| terms.smsMessagingTerms.messageFrequencyVaries | Message frequency varies based on your scheduling activity | תדירות ההודעות משתנה בהתאם לפעילות השיבוץ שלך | לכך שתדירות ההודעות משתנה בהתאם לפעילות השיבוץ שלך | could | Same as above (legal.terms.sms.frequency). |
| terms.smsMessagingTerms.messageDataRates | Message and data rates may apply depending on your mobile carrier | ייתכן שיחולו תעריפי הודעות ונתונים, בהתאם לספק הסלולר שלך | לכך שייתכן שיחולו תעריפי הודעות ונתונים, בהתאם לספק הסלולר שלך | could | Same as above (legal.terms.sms.rates). |
| smsConsent.optOut.optOutSms | You may opt out of SMS messages at any time by: | באפשרותך להפסיק לקבל הודעות SMS בכל עת באמצעות: | באפשרותך לבטל את ההצטרפות להודעות SMS בכל עת באמצעות: | should | Glossary opt-out term; the section heading directly above is already "ביטול ההצטרפות". |
| smsConsent.programDescription.confirmations | {term} Confirmation when you accept or decline an assignment | {term} אישור כאשר קיבלת שיבוץ או דחית אותו | {term} אישור כאשר הסכמת לשיבוץ או דחית אותו | wrong | "קיבלת שיבוץ" reads as "you received an assignment", not "accepted"; the meaning changes. (legal.sms.program.confirmations "קיבלת או דחית שיבוץ" has the same ambiguity; suggest "{term} אישור כאשר הסכמת לשיבוץ או דחית אותו" there too.) |
| smsConsent.relatedPolicies.privacyPolicy | Privacy Policy | מדיניות הפרטיות | מדיניות פרטיות | should | Policy title as a list heading, next to "תנאי שימוש"; glossary says one form everywhere (legal.sms.related.privacyTitle = מדיניות פרטיות). The in-sentence link smsConsent.dataPrivacy.privacyPolicy may keep the article. |
| smsConsent.optOut.replyingMessageReceived | Replying {term} to any message received from CRC Music | מענה {term} לכל הודעה שהתקבלה מ-CRC Music | שליחת {term} בתשובה לכל הודעה שהתקבלה מ-CRC Music | could | Same keyword-reply phrasing as the other legal pages; clearer that the user texts the literal keyword. |
| smsConsent.programDescription.operatorAndPurpose | Central Reform Congregation operates the CRC Music application, which includes an optional SMS notification service for musician scheduling. When musicians opt in, they receive text messages about: | Central Reform Congregation מפעילה את אפליקציית CRC Music, הכוללת שירות רשות של התראות SMS לצורך שיבוץ נגנים. נגנים שהצטרפו מקבלים הודעות טקסט בנושאים הבאים: | Central Reform Congregation מפעילה את אפליקציית CRC Music, הכוללת שירות אופציונלי של התראות SMS לצורך שיבוץ נגנים. נגנים שהצטרפו מקבלים הודעות טקסט בנושאים הבאים: | could | "שירות רשות" is awkward; matches legal.sms.program.lead. |
| smsConsent.consentProcess.completingTheseSteps | By completing these steps, the musician affirmatively consents to receive SMS messages from CRC Music at the phone number provided. | השלמת שלבים אלה מהווה הסכמה אקטיבית ומפורשת מצד הנגן/ית לקבלת הודעות SMS מ-CRC Music במספר הטלפון שנמסר. | השלמת שלבים אלה מהווה הסכמה מפורשת מצד הנגן/ית לקבלת הודעות SMS מ-CRC Music במספר הטלפון שנמסר. | could | One adverb rendered as a doublet; "הסכמה מפורשת" is the Israeli statutory term for SMS consent and matches legal.sms.consent.affirm. |
| accessibility.whatWeAreDoing.heading | What we're doing | מה אנחנו עושים | מה אנו עושים | could | Every other "we" on the legal pages is the formal "אנו". |
| perform.keepAwake.osWarningBody | iPadOS before 18.4 ignores the screen wake lock in installed web apps. Set Settings → Display & Brightness → Auto-Lock → Never for the service. | גרסאות iPadOS שלפני 18.4 מתעלמות מנעילת ההשכמה של המסך באפליקציות רשת מותקנות. לזמן התפילה יש להגדיר: הגדרות ← תצוגה ובהירות ← נעילה אוטומטית ← אף פעם. | גרסאות iPadOS שלפני 18.4 לא מאפשרות לאפליקציות רשת מותקנות להשאיר את המסך דלוק. לזמן התפילה יש להגדיר: הגדרות ← תצוגה ובהירות ← נעילה אוטומטית ← אף פעם. | should | "נעילת ההשכמה" is a literal calque of "wake lock". It reads as "the lock of waking" and sits right next to "נעילה אוטומטית", which means the opposite. The settings path is correct (see ruling 3). The new text is about 150 characters (max 200). |
| perform.keepAwake.osWarningTitle | This iPad can't be kept awake from the Home-Screen app. | לא ניתן להשאיר את ה-iPad הזה ער מתוך האפליקציה שבמסך הבית. | לא ניתן להשאיר את המסך של ה-iPad הזה דלוק מתוך האפליקציה שבמסך הבית. | could | "ער" for a device is a calque. Every other keepAwake string says "המסך דלוק". About 68 characters (max 80). |
| perform.offline.offlineChartsReady | OFFLINE — {ready}/{total} CHARTS READY | לא מקוון — {ready}/{total} תווים מוכנים | לא מקוון — {ready}/{total} קובצי תווים מוכנים | should | The glossary's countable form is "קובצי תווים". "5/8 תווים" reads as musical notes. Rendered at about 35 characters (max 40). |
| perform.liveDirector.swapChartDescription | Bond this row to a different chart | קישור השורה הזו לקובץ תווים אחר | חיבור השורה הזו לקובץ תווים אחר | should | The glossary uses חיבור / לחבר for binding a chart, as in setlistGrid.bindChart* ("חיבור תווים"). This string uses קישור instead. |
| perform.overlay.unknownBody | The chart bonded to {songName} isn't a recognized format. Try re-binding it from the library, or open the original file directly. | התווים המקושרים ל-{songName} אינם בפורמט מוכר. אפשר לקשר אותם מחדש מהספרייה, או לפתוח ישירות את הקובץ המקורי. | התווים המחוברים ל-{songName} אינם בפורמט מוכר. אפשר לחבר אותם מחדש מהספרייה, או לפתוח ישירות את הקובץ המקורי. | should | Glossary term for bind (חיבור / לחבר), same as above. |
| music.viewer.retryWithCount | Retry ({attempt}/{max}) | שוב ({attempt}/{max}) | ניסיון חוזר ({attempt}/{max}) | should | Retry is "ניסיון חוזר" everywhere else, including music.viewer.retry on the same screen. "שוב" alone is a fragment. Rendered at 17 characters (max 20). |
| music.transposer.playAs | Play As (with capo) | תנוחת נגינה (עם Capo) | לנגן בתנוחות (עם Capo) | should | "תנוחת נגינה" means "playing posture" (body or hand position), not chord shapes. The fix matches playInShapes "לנגן בתנוחות {key}" (22 characters, max 25). |
| performSetlist.upcoming | Upcoming | בקרוב | התפילות הקרובות | should | As a section heading, "בקרוב" reads as "coming soon" (a feature teaser). The fix matches org.upcomingSection "התפילות הקרובות" (15 characters, max 20). home.upcoming has the same issue, outside Group B. |
| hooks.urgencyInHours_other | In {count}h | בעוד {count} שע׳ | בעוד {count} שעות | should | The glossary says to use full words when they fit. The count is at most 4 here, so "בעוד 3 שעות" is 11 characters (max 12). "שע׳" is a needless abbreviation on a badge read mid-service. |
| hooks.savedAsDefault | Saved as default for {serviceType} | נשמר כברירת מחדל עבור {serviceType} | נשמרה כברירת מחדל עבור {serviceType} | should | The implied subject is the setlist (רשימת השירים, feminine). Sibling toasts already use feminine: clonedNextWeek "שוכפלה", setlistCreated "נוצרה". |
| hooks.clonedFrom_one | Cloned from {setlistName} — {count} track | שוכפל מ-{setlistName} — שורה אחת | שוכפלה מ-{setlistName} — שורה אחת | should | Gender agreement with the implied setlist, as above. |
| hooks.clonedFrom_other | Cloned from {setlistName} — {count} tracks | שוכפל מ-{setlistName} — {count} שורות | שוכפלה מ-{setlistName} — {count} שורות | should | Gender agreement, as above. |
| hooks.savingTemplate | Saving template… | שמירת התבנית… | התבנית נשמרת… | should | This is a progress toast, but a bare verbal noun reads as a button label. Elsewhere the app uses a state form ("בשמירה…" in setlistGrid.saving and settings.profile.saving). |
| hooks.savingDefault | Saving default… | שמירת ברירת המחדל… | ברירת המחדל נשמרת… | should | Progress-toast form, as above. |
| hooks.cloningNextWeek | Creating next week’s setlist… | יצירת רשימת השירים לשבוע הבא… | רשימת השירים לשבוע הבא נוצרת… | should | Progress-toast form, as above. |
| hooks.buildingFromTemplate | Building setlist from template... | בניית רשימת שירים מתבנית... | רשימת השירים נבנית מהתבנית... | should | Progress-toast form, as above. |
| hooks.cloningFrom | Cloning from {setlistName}… | שכפול מ-{setlistName}… | בשכפול מ-{setlistName}… | should | Progress-toast form. Parallels "ביצירה…" and "בשמירה…". |
| music.viewer.writtenKey | Written: | כתוב: | בתווים: | could | "כתוב:" on its own is opaque. "בתווים:" matches music.transposer.chartKey "(בתווים: {key})". 7 characters (max 12). |
| music.viewer.labeledKey | Labeled: | מסומן: | ברשימה: | could | The value is the key set on the setlist row. "ברשימה:" says where the key comes from (7 characters, max 12). |
| hooks.alreadyOffline | Already available offline | כבר זמין במצב לא מקוון | הכול כבר זמין במצב לא מקוון | could | The toast refers to the setlist's files. The masculine adjective has no subject; "הכול" supplies one. |
| perform.saveOffline.partialAria | {ready} of {total} charts saved offline — tap to save the rest | {ready} מתוך {total} קובצי תווים נשמרו — הקשה לשמירת השאר | {ready} מתוך {total} קובצי תווים נשמרו לשימוש לא מקוון — הקשה לשמירת השאר | could | "offline" was dropped. This is a screen-reader label, so the context matters. About 70 characters (max 80). |
| setlistWizard.serviceType.friday_night | Erev Shabbat | תפילת ערב שבת | תפילת קבלת שבת | should | Ruling 1: the Friday-evening service is "קבלת שבת" in Israeli usage (and Nava Tehila's own name for it). "ערב שבת" names the day, not the prayer. The glossary itself gives "תפילת קבלת שבת" as its example. |
| setlist.serviceTypeFridayNight | Friday Night | ערב שבת | קבלת שבת | should | Ruling 1: service-type name; matches library.addSheet.newNamePlaceholder, which already uses קבלת שבת |
| setlistGrid.serviceTypeFridayNight | Friday Night | ערב שבת | קבלת שבת | should | Ruling 1; same option in the details sheet |
| calendar.createFridayEvening | Friday Eve | ערב שבת | קבלת שבת | should | Ruling 1: the button creates the service, not "Friday"; 8 chars, within max 12 |
| setlistModals.namePromptPlaceholder | e.g., Shabbat Morning, Friday Night... | למשל: שבת בבוקר, ערב שבת… | למשל: שבת בבוקר, קבלת שבת… | should | Example names follow Ruling 1 (fits max 45) |
| setlist.tryAgain | Try Again | לנסות שוב | ניסיון חוזר | should | Same English button as ui.tryAgain / ui.retry / performSetlist.retry ("ניסיון חוזר"); one Hebrew per UI word |
| setlistGrid.dateTbd | Date TBD | התאריך ייקבע | התאריך טרם נקבע | could | The same English is schedule.cardDateTbd ("תאריך טרם נקבע") and schedule.dateTbd ("טרם נקבע"); align. 15 chars, fits both max 20 and max 15 |
| schedule.cardDateTbd | Date TBD | תאריך טרם נקבע | התאריך טרם נקבע | could | Pair with setlistGrid.dateTbd; definite reads more naturally; 15 chars = max |
| setlistGrid.syncFailed | Failed — retry | נכשל — לנסות שוב | נכשל — ניסיון חוזר | could | Retry button; align with ui.retry (18 chars ≤20) |
| calendar.loading | Loading calendar... | לוח השנה נטען... | לוח השנה נטען… | could | Convention says to use the ellipsis character "…"; this is the only "..." in the group |
| calendar.legendNeedsAttention | Needs attention | דורש תשומת לב | נדרשת תשומת לב | could | "דורש" is masculine, but the subject (a service, תפילה) is feminine. The impersonal form avoids the clash. |
| setlistGrid.otherSitesOff | Include other sites | כולל קהילות אחרות | הכללת קהילות אחרות | could | Toggle label; "כולל" reads as "including…". The glossary asks for a verbal noun. |
| setlistGrid.otherSitesOn | Include other sites · on | כולל קהילות אחרות · פעיל | הכללת קהילות אחרות · פעיל | could | Pair with otherSitesOff (25 chars ≤34) |
| setlistGrid.resolveAllAndSave | Resolve all and save | פתרון הכול ושמירה | פתרון כל ההתנגשויות ושמירה | could | "פתרון הכול" is vague and awkward; names what is resolved (26 ≤30) |
| setlistGrid.errorHintAuth | Your session may have expired. Sign out and back in, then retry. | ייתכן שתוקף ההתחברות פג. יש להתנתק, להתחבר שוב ולנסות שוב. | ייתכן שתוקף ההתחברות פג. יש להתנתק ולהתחבר מחדש, ואז לנסות שוב. | could | Removes the repeated "שוב", and the order of steps is clearer |
| setlistGrid.syncOfflineQueued_one | Offline — {count} queued | לא מקוון: שינוי 1 בתור | לא מקוון: שינוי אחד בתור | could | _one forms elsewhere spell out "אחד" (see the announce/tooltip variants); exactly 24 = max |
| importer.sheetsSharingHint | Make sure the sharing settings are set to "Anyone with the link can view". | יש לוודא שהגדרות השיתוף הן ״כל מי שיש לו את הקישור יכול לצפות״. | יש לוודא שהגיליון משותף עם ״כל מי שקיבל או קיבלה את הקישור״ (Anyone with the link) לצפייה. | should | Google's current Hebrew option label (see ruling 1); masculine-only "יש לו"; must match api-setlists.sheetFetchFailed. 90 chars ≤100 |
| api-setlists.sheetFetchFailed | Could not retrieve spreadsheet data. Make sure the Google Sheet is set to "Anyone with the link can view". ({detail}) | לא ניתן לקבל את נתוני הגיליון. יש לוודא שהגישה ל-Google Sheet מוגדרת ל״כל מי שקיבל את הקישור״ עם הרשאת צפייה. ({detail}) | לא ניתן לקבל את נתוני הגיליון. יש לוודא שהגיליון משותף עם ״כל מי שקיבל או קיבלה את הקישור״ (Anyone with the link) לצפייה. ({detail}) | should | Same label, word for word, as importer.sheetsSharingHint. 132 chars ≤200 |
| libraryUpload.uploading | Uploading... | העלאה... | בהעלאה... | should | Matches setlistGrid.uploading "בהעלאה…". Also, the idle button is "העלאה", so the busy state is now told apart only by "..." |
| admin-library.syncing | Syncing... | סנכרון... | בסנכרון... | should | Same "ב…" busy pattern (בטעינה/בשמירה/ביצירה). Without it, it can't be told apart from the idle "סנכרון עכשיו" |
| importer.readingDocumentHeading | Reading your document | המסמך נקרא | קריאת המסמך… | should | "המסמך נקרא" first reads as "the document is called" |
| importer.readingDocumentBody | Reading your file and building the setlist — this can take a minute… | הקובץ נקרא ורשימת השירים נבנית — זה יכול לקחת דקה… | קוראים את הקובץ ובונים את רשימת השירים — זה עשוי להימשך כדקה… | could | Same "נקרא" ambiguity; "לקחת דקה" is a calque |
| library.filters.optionRecent | Last 30 days | 30 יום אחרונים | 30 ימים אחרונים | could | Singular noun with plural adjective; "30 הימים האחרונים" is 17 chars, over the 16 max |
| library.filters.stale | 60+ days | 60+ ימים | מעל 60 יום | could | In RTL, "60+" renders as "+60". 10 chars |
| library.filters.optionStale | 60+ days ago | לפני 60+ ימים | מעל 60 יום | could | Same bidi issue; inside the last-played menu the "ago" is implied. The fuller "לפני יותר מ-60 יום" is 18 chars, over the 16 max |
| libraryUpload.browse | browse | לבחור קובץ | לבחור מהמכשיר | could | dropPrompt then reads "…לגרור לכאן קובץ או לבחור קובץ", saying "קובץ" twice. 13 chars |
| libraryHealth.dup.groupSize_one | {count} charts | קובץ אחד | קובץ תווים אחד | could | Glossary uses the countable form "קובץ תווים". 14 chars |
| libraryHealth.dup.groupSize_other | {count} charts | {count} קבצים | {count} קובצי תווים | could | Glossary uses the countable form. Fits 16 for up to 2 digits |
| importer.matchesLibrary | Matches library: {name} | תואם לספרייה: {name} | נמצא בספרייה: {name} | could | "תואם לספרייה" is unidiomatic; what's meant is "matches a library chart" |
| manage-library-review.calibrationBody | {flagName} is {flagValue} — every enrichment lands here for human review. Confidence threshold: {threshold}. Flip the flag in Firebase Console (or via the admin MCP tool) once you trust the model. | {flagName} מוגדר ל-{flagValue} — כל העשרת נתונים מגיעה לכאן לסקירה אנושית. סף ודאות: {threshold}. כשיש אמון במודל, אפשר להפוך את הדגל ב-Firebase Console (או דרך כלי ה-MCP לניהול). | {flagName} מוגדר ל-{flagValue} — כל העשרת נתונים מגיעה לכאן לסקירה אנושית. סף ודאות: {threshold}. כשיש אמון במודל, אפשר לשנות את הדגל ב-Firebase Console (או דרך כלי ה-MCP לניהול). | could | "להפוך את הדגל" is a literal calque of "flip" |
| libraryScraper.chatPlaceholder | Describe a song or type a title... | תיאור של שיר או שם השיר... | אפשר לתאר שיר או לכתוב את שמו... | could | A placeholder should invite the action; the noun phrase reads like a field label |
| libraryScraper.chatLabel | Describe a song or type a title | תיאור של שיר או שם השיר | אפשר לתאר שיר או לכתוב את שמו | could | Keep in step with the placeholder |
| settings.gigMode.title | Live Gig Mode | מצב יציבות בנגינה | מצב במה | should | Current is a clunky calque ("stability mode in playing") and leans on "נגינה", the glossary word for Perform mode (perform.toolbar.exitTitle already renders "Gig Mode" as מצב נגינה). "מצב במה" is short, says when to switch it on, stays separate from Perform mode, and matches settings.performDarkHint ("על הבמה"). See ruling 1. |
| settings.gigMode.description | Disables background syncing and analytics for bulletproof stability on stage. | מבטל סנכרון ברקע ואיסוף נתוני שימוש, ליציבות מרבית בזמן הנגינה. | מבטל סנכרון ברקע ואיסוף נתוני שימוש, ליציבות מרבית על הבמה. | could | Matches the English "on stage" and the new title. |
| settings.profile.defaultCapoFret | Default capo fret | שריג Capo כברירת מחדל | סריג Capo כברירת מחדל | wrong | The guitar fret is "סריג". "שריג" means a vine tendril. |
| settings.instrumentNotes.major6thLower | Sounds a major 6th lower | נשמע סקסטה גדולה נמוך יותר | נשמע נמוך בסקסטה גדולה | could | Natural Hebrew order for an interval ("נמוך ב-…"). The current text is an English calque. |
| settings.instrumentNotes.major9thLower | Sounds a major 9th lower | נשמע נונה גדולה נמוך יותר | נשמע נמוך בנונה גדולה | could | Same as above. |
| settings.instrumentNotes.wholeStepLower | Sounds a whole step lower | נשמע טון שלם נמוך יותר | נשמע נמוך בטון שלם | could | Same as above. |
| settings.instrumentNotes.fifthLower | Sounds a 5th lower | נשמע קווינטה נמוך יותר | נשמע נמוך בקווינטה | could | Same as above. |
| settings.mcp.revoke | Revoke {tokenLabel} | ביטול {tokenLabel} | ביטול האסימון {tokenLabel} | could | Screen-reader name. The token label is free text, so "ביטול X" alone can be ambiguous. |
| manage-templates.fieldOnlyFor | Only For (comma-sep) | רק עבור (בפסיקים) | רק עבור (מופרד בפסיקים) | could | "(בפסיקים)" alone is cryptic. The full form is 23 characters, within max 24. |
| auth.approveChecking | Checking session… | בדיקת ההתחברות… | בודקים את ההתחברות… | could | This is a loading message, not a button. The verbal noun reads like an action label. Matches invite.checking ("בודקים את ההזמנה…"). |
| api-setlist.noEmailRecipients | No email recipients found for this setlist | לא נמצאו כתובות דוא״ל לנגנים ברשימת השירים הזו | לא נמצאו כתובות אימייל של הנגנים ברשימת השירים הזו | should | Glossary: אימייל in UI, דוא״ל only on legal pages; this is the only UI string using דוא״ל |
| api-setlist.atLeastOneMusician | At least one musician must be assigned | יש לשבץ לפחות נגן/ית אחד/ת | יש לשבץ לפחות אחד מהנגנים | should | Double slash form is avoidable; "אחד מהנגנים" is gender-free |
| api-setlist.resendFailed | Failed to resend emails | השליחה החוזרת של המיילים נכשלה | השליחה החוזרת של האימיילים נכשלה | could | Glossary term אימייל (not the colloquial מייל) |
| shell.tryAgain | Try again | ניסיון נוסף | ניסיון חוזר | should | Retry / Try again is ניסיון חוזר in ui.retry, ui.tryAgain and 5 other keys; one form everywhere |
| dashboard.errorRetry | Retry | ניסיון נוסף | ניסיון חוזר | should | Same Retry consistency |
| dashboard.onboardingInstrumentQuestion | What do you play? | על איזה כלי נגינה מנגנים? | על איזה כלי מנגנים? | could | Shorter and more natural; "כלי" alone is unambiguous after "מנגנים" (glossary short form) |
| org.page.v2TitleTemplate | %s \| {shortName} · v2 Beta | %s \| {shortName} · בטא v2 | %s \| {shortName} · v2 בטא | could | Same order as v2.footerBeta ("v2 בטא") |
| org.page.v2TitleDefault | {shortName} · v2 Beta | {shortName} · בטא v2 | {shortName} · v2 בטא | could | Same as above |
| org.matrixTitle | Liturgical Matrix | מטריצה ליטורגית | טבלת שירים ותפילות | could | "מטריצה ליטורגית" is academic; the view is a songs × services grid, and the glossary reserves תפילה for service |
| home.recent | Recent | לאחרונה | האחרונה | could | Badge on the card of the most recent past service; an adjective ("the last one") reads better than the adverb "recently" |
| auth.qrTryAgain | Try again | ניסיון נוסף | ניסיון חוזר | should | Retry / Try again button = ניסיון חוזר everywhere (11 chars, max 15) |
| importer.serviceType.friday_night | Friday Night | ערב שבת | קבלת שבת | should | Service-name ruling: Friday-evening service = קבלת שבת (same option as setlist/setlistGrid) |
| org.wizardNamePlaceholder | e.g., Shabbat Morning, Friday Night... | לדוגמה: שבת בבוקר, ערב שבת… | למשל: שבת בבוקר, קבלת שבת… | should | Service-name ruling; "למשל:" is the majority form for "e.g." (8 keys vs 2); matches setlistModals.namePromptPlaceholder |
| org.namePlaceholder | e.g., Shabbat Morning | לדוגמה: שבת בבוקר | למשל: שבת בבוקר | could | One form for "e.g." (למשל:) |
| setlistWizard.regularServices | Regular services | תפילות רגילות | תפילות קבועות | should | Same group heading is "תפילות קבועות" in admin-templates.regularServices; "רגילות" also reads as "ordinary" |
| setlistWizard.holidayServices | Holiday services | תפילות חג | תפילות חגים | should | Same heading is "תפילות חגים" in admin-templates.holidayServices; one form |
| settings.instrumentNotes.concertPitchOctaveLower | Concert pitch (octave lower) | בסולם קונצרט (אוקטבה נמוכה יותר) | בסולם קונצרט (נשמע נמוך באוקטבה) | could | Keeps the glossary term but says what is an octave lower (the sound), removing the "key with an octave" oddity; same word order as the interval notes (נשמע נמוך ב…) |

## Rulings on the translator's unsure list

1. **Friday evening: "קבלת שבת", not "ערב שבת".**
   - "ערב שבת" names the day (Friday). "קבלת שבת" is what Israelis, and Nava Tehila in particular, call the Friday-evening service. The glossary's own example is "תפילת קבלת שבת".
   - `library.addSheet.newNamePlaceholder` already uses "קבלת שבת", so the app is inconsistent today.
   - Apply it to these keys (all have rows above):
     - setlist.serviceTypeFridayNight
     - setlistGrid.serviceTypeFridayNight
     - importer.serviceType.friday_night
     - calendar.createFridayEvening
     - setlistWizard.serviceType.friday_night ("תפילת קבלת שבת")
     - setlistModals.namePromptPlaceholder
     - org.wizardNamePlaceholder
   - Update the glossary row.
2. **Shabbat morning: keep "שבת בבוקר", not "שחרית שבת".**
   - "שחרית שבת" is not idiomatic on its own.
   - The liturgical form "שחרית של שבת" is 13 characters, over the 12-character max of calendar.createShabbatMorning.
   - If Nava later wants the liturgical pair, use "שחרית של שבת" only in the 24–25-character fields.
3. **setlistWizard.serviceType.\* "תפילת …" prefixes: keep them.**
   - These values are only inserted into "שכפול {service} הקודמת", "מחפשים את {service} הקודמת…" and "אין עדיין {service} קודמת…".
   - The feminine head "תפילת" keeps הקודמת/קודמת agreeing for every holiday. Without it, "שבועות הקודמת" and "יום כיפור הקודמת" break.
   - Final set:
     - תפילת קבלת שבת
     - תפילת שבת בבוקר
     - תפילת ראש השנה
     - תפילת יום כיפור
     - תפילת סוכות
     - תפילת שמחת תורה
     - תפילת שבת חנוכה
     - תפילת פורים
     - תפילת פסח
     - תפילת שבועות
     - regular: "תפילה"
   - The bare forms in the details-sheet option lists stay without the prefix.
   - Caveat: if `regular` ("תפילה") were ever shown, it would produce "את תפילה הקודמת". The note says it is not shown. If that changes, make lookingForLast "מחפשים {service} קודמת…".
4. **settings.gigMode.title: change "מצב יציבות בנגינה" to "מצב במה".**
   - The current title is a calque a musician won't decode.
   - Its "נגינה" makes it look like Perform mode (מצב נגינה). That is also how perform.toolbar.exitTitle renders "Gig Mode".
   - "מצב במה" says when to switch the setting on and stays distinct from Perform mode.
   - Description: "מבטל סנכרון ברקע ואיסוף נתוני שימוש, ליציבות מרבית על הבמה."
   - Fallback if "stability" must stay in the name: "מצב יציב לבמה".
5. **Concert pitch "סולם קונצרט": keep** (glossary term).
   - It is what Israeli band musicians say for a C / concert chart ("תווים בסולם קונצרט").
   - It reads correctly in setlistPrint.modeGeneric and settings.instrumentNotes.concertPitch.
   - One reviewer proposed "צליל קונצרט", because "key (octave lower)" is odd. The narrower fix is to say what is lower: concertPitchOctaveLower → "בסולם קונצרט (נשמע נמוך באוקטבה)".
6. **Chord shapes "תנוחות": keep.** It is the Israeli guitarists' word; "אצבוע" means fingering. One exception: music.transposer.playAs "תנוחת נגינה" means playing posture, so it becomes "לנגן בתנוחות (עם Capo)" (row above).
7. **Buses "יציאות" / "יציאות מוניטור": keep.**
   - "ערוצי מוניטור" is wrong on an X32, where ערוץ means an input channel.
   - "מיקס" collides with the personal mix, and "באס" with bass.
   - The "(Mix Bus)" gloss in the admin-sound hints is the right bridge to the console labels.
   - "יציאה" also means Exit in Perform, but the two never share a screen.
8. **perform.keepAwake.osWarningBody iPadOS path: correct as it stands.**
   - Apple's Hebrew iPad guide (iPadOS 18) reads הגדרות > תצוגה ובהירות > נעילה אוטומטית. The label is "תצוגה ובהירות", not "מסך ובהירות".
   - "אף פעם" is the usual Never label, though that page does not confirm it.
   - The ← separators are right for RTL.
   - Only the "נעילת ההשכמה" (wake-lock) calque needs rewording (row above).
9. **"Anyone with the link" (importer.sheetsSharingHint, api-setlists.sheetFetchFailed).**
   - The two keys disagree, and neither matches Google's current Hebrew label. That label is "כל מי שקיבל או קיבלה את הקישור הזה", under "גישה כללית". Older UIs say "כל מי שיש לו את הקישור".
   - Use one phrase in both keys, with the English for users on an English or older Google UI: `משותף עם ״כל מי שקיבל או קיבלה את הקישור״ (Anyone with the link) לצפייה`.
10. **Legal {operator} agreement: feminine, never a slash form.**
    - 17 legal keys use {operator}.
      - 10 need no agreement: אל / עבור / מטעם / ב-{operator}, and construct state.
      - 7 agree in the feminine: מספקת (twice), מחויבת, אינה מתחייבת, לא תישא, אינה גובה, שלה.
    - Hebrew legal drafting treats an organisation's name as feminine, with an implied קהילה / עמותה / להקה.
    - A slash form next to an organisation reads as an error. Rephrasing binding text into passives weakens it.
    - Optional: in legal.terms.content.body, change "…ובאירועים שלה" to "…ובאירועים של {operator}".
    - Tenant-config guard (not a catalogue change): if a Hebrew tenant's legal.operatorName is grammatically masculine or plural, enter it with a feminine head ("קהילת …", "להקת …"; the exact Hebrew name to be confirmed by the tenant).
11. **hooks.undo: keep "ביטול".**
    - It is the only Undo in the catalogue, and it appears only as a toast action, where no Cancel competes.
    - It is the standard Hebrew snackbar label.
    - "ביטול פעולה" (11 characters) exceeds the max of 10.
    - If Undo ever sits next to Cancel (for example in an editor toolbar), use "ביטול פעולה" there and add it to the glossary.
12. **v2.eyebrow "v2 · עיצוב במה מקצועי" and v2.heroTitle "CRC Music — במה מקצועית": keep.** Both carry the design-language name faithfully, both fit, and both keep "CRC Music" as written. These are beta-page strings.

## Systemic notes

- **Retry / Try again drift (should).**
  - The button text varies:
    - "ניסיון חוזר" in 7 keys.
    - "ניסיון נוסף" in 3: shell.tryAgain, dashboard.errorRetry, auth.qrTryAgain.
    - "לנסות שוב" in 2: setlist.tryAgain, setlistGrid.syncFailed.
    - "שוב" in 1: music.viewer.retryWithCount.
  - Ruling: **"ניסיון חוזר"** for every Retry / Try again button. "יש לנסות שוב" / "אפשר לנסות שוב" stays in sentences.
  - Length exception: manage-library-review.retryButton keeps "לנסות שוב (y)" (max 14).
  - Add a glossary row.
- **Busy states vs. buttons (should).**
  - The app's pattern is "ב + verbal noun + …" (בטעינה, בשמירה, ביצירה, בהעלאה) or a present passive ("התבנית נשמרת…").
  - A bare verbal noun ("העלאה...", "סנכרון...", "שמירת התבנית…", "שכפול מ-…") reads like the idle button.
  - In libraryUpload.uploading and admin-library.syncing it is literally the idle label plus dots.
  - These are fixed per key above. The library.actions.* toasts (העברה לארכיון..., שינוי השם...) are acceptable but could follow the same pattern.
- **Agreement with the implied setlist (should).** When a toast's subject is the setlist, the verb must be feminine (שוכפלה, נשמרה, נוצרה). hooks.savedAsDefault and hooks.clonedFrom_* are masculine.
- **Glossary terms not held everywhere (should):**
  - Bind is חיבור / לחבר, but perform.* uses קישור.
  - A countable chart is קובץ / קובצי תווים, but perform.offline.offlineChartsReady and libraryHealth.dup.groupSize_* don't use it.
  - Email in the UI is אימייל, but api-setlist.noEmailRecipients uses דוא״ל.
  - Opt out is ביטול ההצטרפות, but privacy, terms and smsConsent use "להפסיק לקבל".
  - Push is התראות דחיפה, but legal.terms.description.notifications uses "Push".
- **The two copies of the legal text drift apart.**
  - The platform pages (`legal.*`, with {operator}) and the CRC pages (privacy / terms / smsConsent) translate the same English differently:
    - עדכון אחרון vs עודכן לאחרונה
    - יישום רשת vs אפליקציית אינטרנט
    - דרישות הדין vs דרישות החוק
    - שלילת אחריות vs הסרת אחריות
    - ביטול הצטרפות vs ביטול ההצטרפות
    - לחצנים vs כפתורים
    - "טקסט ממלא מקום" vs "טקסט placeholder"
    - three phrasings of "reply STOP" (recommend "שליחת X בתשובה לכל הודעה")
  - Each wording is fine alone, but binding text should use one wording.
  - Recommendation: the third pass adopts the `legal.*` wording as canonical (it is what new tenants see), except where flagged above.
- **Same English, different Hebrew (should/could):**
  - Regular / Holiday services differ between admin-templates and setlistWizard.
  - Date TBD has 3 forms.
  - "e.g." is "למשל:" 8 times and "לדוגמה:" twice. Use "למשל:".
  - Edit setlist details has 3 forms. "עריכת פרטי הרשימה" would work for all three; not listed as findings.
  - Play is "הפעלה" in audio.play and "ניגון" in library.row.play. Both are acceptable, since they are different controls.
- **Ellipsis.**
  - The Hebrew mirrors the English source: 41 strings use "..." where the English has "...", and 60 use "…".
  - This follows the convention ("ellipsis … as in English"), so there are no per-key findings.
  - If the third pass wants typographic polish, normalising everything to "…" should be safe; confirm with the i18n test suite.
- **Relative-time LONG warnings (6).**
  - Affected keys: nav.minutesAgo / hoursAgo / daysAgo, dashboard.countdown*, hooks.urgencyInDays_other.
  - They exceed maxLength only because Hebrew needs "לפני" / "בעוד", and the script counts each placeholder as 3 characters. The rendered values fit or overflow by 1–2 characters.
  - Accept the warnings. Do **not** switch to "ימ׳", which readers rarely see and which reads poorly mid-prayer. Amend the glossary's relative-time line to write "ימים" in full.
  - Use full words where they fit (hooks.urgencyInHours_other → "בעוד {count} שעות").
- **Bidi (could; a markup fix, not a catalogue fix).**
  - "60+" renders as "+60" in RTL. Fixed per key with "מעל 60 יום".
  - File extensions with a leading dot (".csv", ".docx, .pdf או .txt", ".mp3, .m4a") render the dot on the wrong side.
  - The notes require keeping the extensions, so fix this in markup (`<bdi>` / `dir="ltr"`) rather than in the strings.
- **Source issues on the English side (not translation findings).**
  - settings.scheduling.calendarAddHint and calendarGenerateHint hard-code "CRC".
  - The privacy / terms / smsConsent namespaces hard-code "Central Reform Congregation" / "CRC Music".
  - Nava users will see CRC's name. These need tenant tokens in the English (or tenant-specific pages), outside this catalogue pass.
- **Liturgical / domain notes.**
  - "Prayer" as a row type is "תפילה", which overlaps the glossary's service = תפילה. It is natural in context, so it is not flagged. "קטע תפילה" fits if strict separation is wanted.
  - The rabbi field is faithfully "רב/ה". At Nava, services are often led by prayer leaders who are not rabbis. Relabelling the field "מוביל/ת תפילה" in the tenant vocabulary is a later product decision, not a translation error.
- **Glossary updates to make with the third pass:**
  - Friday evening → קבלת שבת
  - Retry → ניסיון חוזר
  - Undo → ביטול (ביטול פעולה when next to Cancel)
  - fret → סריג
  - Gig Mode (settings) → מצב במה
  - e.g. → למשל:
  - relative days → ימים
  - the Google "Anyone with the link" phrase

## Third pass

The third pass decided each finding, applied the systemic rulings across all namespaces, and updated `GLOSSARY-he.md`. English files and code were not changed, and every `{placeholder}` set is unchanged.

### Counts

| Severity | Findings | Applied as proposed | Applied, reworded | Kept translator / reversed | Skipped |
|---|---|---|---|---|---|
| wrong | 5 | 5 | 0 | 0 | 0 |
| should | 46 | 42 | 4 | 0 | 0 |
| could | 57 | 48 | 8 | 1 | 0 |
| **Total** | **108** | **95** | **12** | **1** | **0** |

"Applied, reworded" means the reviewer's point was taken but the final text differs. That happens for one of two reasons: the CRC legal copy now uses the `legal.*` wording, or the proposal conflicted with a ruling. These cases are in the log below.

Edits beyond the 108 rows, made under the systemic rulings:
- **Legal alignment (about 60 strings):** `privacy`, `terms` and `smsConsent` now use the `legal.*` wording wherever the English is the same. This covers:
  - עודכן לאחרונה; יישום; דרישות החוק; לבטל את ההצטרפות; "שליחת X בתשובה לכל הודעה".
  - מידע הקשור לטלפון הנייד; the consent steps as verbal nouns.
  - The intros (״אותנו״, יישום הרשת).
  - 67 strings already matched.
- **Retry:** perform.keepAwake.errorHidden and auth.qrConnectionIssue → "…לניסיון חוזר".
- **Busy states:**
  - music.suggestions.searching
  - library.actions.savingMusicXml / archiving / renaming
  - libraryScraper.extracting / generating
  - These now use impersonal progressive or passive forms (שומרים…, מועברים…, מחלצים…).
- **Bind = חיבור:**
  - setlistModals.linkChartFor / linkToMusicFile
  - api-setlist.needsLinkedChart
  - manage-templates.linkedFallback / fieldLinkedChart / removeLinkedChart
- **Glossary rows added or changed:**
  - Friday evening → קבלת שבת (wizard: תפילת קבלת שבת)
  - Retry → ניסיון חוזר
  - Undo → ביטול
  - fret → סריג
  - Gig Mode → מצב במה
  - e.g. → למשל:
  - The Google "Anyone with the link" phrase
  - Days written in full in relative times
  - Conventions for busy states and setlist agreement

### Kept-translator / disagreement log

| key | reviewer proposed | kept / applied | reason |
|---|---|---|---|
| legal.terms.warranties.heading (and terms.disclaimerWarranties.heading) | legal → "7. שלילת אחריות" | legal keeps "7. הסרת אחריות"; the CRC copy moved to it | The ruling makes `legal.*` canonical. "הסרת אחריות" is also the more common Israeli heading for a disclaimer. One wording either way. |
| importer.readingDocumentHeading | "קריאת המסמך…" | "קוראים את המסמך" | The proposal is a bare verbal noun, which is the busy-state form the review itself rules out. The English heading has no ellipsis. |
| legal.sms.frequency.body, legal.sms.consent.affirm, legal.sms.optOut.after | (not findings; the alignment ruling would copy legal → CRC) | Adopted the CRC copy's gender-free wording into `legal.*` | The `legal.*` text had avoidable slash forms (הנגן/ית משובץ/ת, נותן/ת, תצטרף/י). The glossary prefers impersonal wording, so both copies now use "בהתאם לתדירות השיבוץ לתפילות", "השלמת שלבים אלה מהווה הסכמה מפורשת מצד הנגן/ית", and "אלא אם תחודש ההצטרפות שלך". |
| hooks.alreadyOffline | "הכול כבר זמין במצב לא מקוון" | "כל התווים כבר זמינים במצב לא מקוון" | The note says the toast means every chart; naming the charts is clearer than "הכול". |
| privacy.rights.haveRight | "יש לך הזכות:" | "עומדת לך הזכות:" | Legal alignment (legal.privacy.rights.lead); same definite, formal reading. |
| terms.acceptanceTerms.accessingUsingCrc | Minimal fix ("אם אינך מסכים/ה…") | Full `legal.terms.acceptance.body` wording | Legal alignment. It includes the reviewer's fix. |
| smsConsent.programDescription.operatorAndPurpose, privacy.smsMobileMessaging.optReceiveSms, privacy.smsMobileMessaging.messageFrequencyVaries, privacy.changesPolicy.updatePrivacyPolicy, terms.smsMessagingTerms.messageTypesInclude, terms.smsMessagingTerms.messageFrequencyVaries, terms.smsMessagingTerms.optOutSms | As proposed | `legal.*` wording (יישום; "שיבוצים" without "בלוח הזמנים"; "פעילות השיבוצים"; ״עודכן לאחרונה״; "התראות על שיבוץ"; "יש לשלוח") | Legal alignment; each reviewer point is kept. |
| legal.privacy.sms.optIn | Parallelism fix only | Parallelism fix plus "אנו נשלח" | The reviewer's "אנו נשלח" fix for the CRC copy (a could) applies equally here; both copies stay identical. |

### Length warnings

`node scripts/i18n-he-missing.mjs --list`: 0 missing, 0 problems, 8 LONG warnings.
- The six relative-time badges are accepted per the review.
- hooks.urgencyInHours_other "בעוד {count} שעות": the script counts 13, but it renders as 11 for the at most 4 hours it shows (max 12).
- music.viewer.retryWithCount "ניסיון חוזר ({attempt}/{max})": the script counts 21, but it renders as 17 for single-digit attempts (max 20).

### Left open

- **accessibility vs legal.accessibility** (9 strings differ). These were not aligned because the ruling named privacy, terms and smsConsent. They differ on עדכון אחרון, לחצנים / כפתורים, "טקסט ממלא מקום" / "placeholder" and similar. The CRC wording is arguably the better Hebrew in places, so the lead should pick the canonical side.
- **legal.terms.content.body:** ruling 10's optional "…ובאירועים של {operator}" was not applied. "שלה" agrees with the feminine operator ruling.
- **Ellipsis:** not normalised; "..." and "…" still mirror the English.
- **Smaller variants left in place:**
  - schedule.dateTbd "טרם נקבע" (short field; the other two Date TBD keys are now "התאריך טרם נקבע").
  - home.upcoming "בקרוב": a date badge for an undated setlist, where "soon" fits.
  - The three "Edit setlist details" forms. setlistGrid has room for the full "רשימת השירים".
- **Out of scope (lead):** the "CRC" calendar hints in settings, file-extension bidi markup, and the CRC-named English on the CRC legal pages.

## Delta review (98 keys, commit 4d01a9b3)

Reviewer: independent; I did not write the batch. Scope: the 98 keys added in `4d01a9b3` (pdf 34, clientErrors 17, api-library 12, dashboard 12, api-setlists 10, api-charts 5, setlistModals 5, nav 2, perform 1). Each key was read against its English, its note, `GLOSSARY-he.md`, `TRANSLATING.md`, the rulings above and the wording already in the rest of `he/*.json`.

Extra check: every character in `he/pdf.json` has a glyph in the embedded Alef regular and bold faces (geresh ׳ and maqaf included), so nothing on the printed service sheet or gig packet falls back to `?`. The U+2066/U+2069 isolate check was skipped on the lead's instruction: the marks live on the integration branch and arrive with the merge.

### Counts

| Severity | Findings | Applied | Logged, not applied |
|---|---|---|---|
| wrong | 0 | 0 | 0 |
| should | 2 | 2 | 0 |
| could | 4 | 0 | 4 |
| **Total** | **6** | **2** | **4** |

The batch is clean. Placeholders and prefix hyphens (ב-{count}, ל-{appName}, כ-{minutes}, מ-Gemini) are correct, glossary terms hold (תווים / קובץ תווים, חיבור, שירה ראשית, בהובלת, סולם, העברת סולם, אוסף, חוברת), there is no gendered address, Capo and MIME types / option names stay Latin, the busy states follow the convention (מכינים…, בעיבוד:, יוצרים…), and no key is over its maxLength (`i18n-he-missing` LONG list unchanged at the 8 accepted badges).

### Applied

| key | was | now | reason |
|---|---|---|---|
| clientErrors.printScoreNotRendered | הצגת התווים עדיין לא הסתיימה. | הפרטיטורה עדיין בעיבוד. | should: the error fires while the MusicXML score is still drawing, and the status on the same viewer is music.viewer.renderingScore "הפרטיטורה בעיבוד…". Echoing it tells the musician the error is the same state, not a new failure. |
| setlistModals.suggestionStaple_one / _other | ברשימה אחת — {setlistName} / ב-{count} רשימות — {setlistName} | נוגן ברשימה אחת — {setlistName} / נוגן ב-{count} רשימות — {setlistName} | should: without a verb the grey reason reads as a bare location ("in 12 lists"). "נוגן" states the reason and parallels its siblings suggestionStale "לא נוגן כבר…" and suggestionNeverPlayed "עוד לא נוגן". 23 counted characters, max 40. |

### Logged, not applied

| key | current | alternative | why left |
|---|---|---|---|
| api-setlists.extractPdfPageLimit | קובץ ה-PDF חורג ממגבלת {maxPages} העמודים. | קובץ ה-PDF חורג מהמגבלה של {maxPages} עמודים. | could: the construct with a definite counted noun is grammatical, just slightly stiff. |
| dashboard.greetingChagUrimSameach | חנוכה שמח | חג אורים שמח | could: the English is the poetic "Chag Urim Sameach", but "חנוכה שמח" is what Israelis say most. Nava may prefer the poetic form; tenant choice, not an error. |
| clientErrors.notSignedIn | לא בוצעה התחברות | (align the older keys instead) | could: api-*.notAuthenticated / notSignedIn say "לא מחובר/ת". The new gender-free form is the better one under the glossary; a later pass could move the older keys to it. |
| clientErrors.printPrepareRenderFailed | …(הצגת העמוד נכשלה). | …(עיבוד העמוד נכשל). | could: "עיבוד" is the progress word for rendering, but the catalogue's render errors all say "הצגה" (music.viewer.pdfRenderError, renderTimedOut, performSetlist error body), so the current text is consistent. |

### Rulings on the translator's unsure items

1. **pdf.packet.columnTransposedKey "As" → לנגינה: keep.** It sits next to the "סולם" column and reads "(key) for playing", which is what the transposed key is. "בפועל" ("actual") suggests the written key is wrong. 6 characters = max.
2. **pdf.packet.transposed → כולל העברת סולם: keep.** In the footer it reads "12 שירים • כולל העברת סולם • …", which is right; glossary term; 15 = max.
3. **pdf.packet.preparedFor → חוברת אישית עבור {name}: keep.** Gender-free (no מוכן/ה), and it says what is special about the packet. Fine on the bold cover line.
4. **pdf.packet.ledBy → בהובלת {name}, no colon: keep.** "בהובלת" is a construct; a colon after it would split the phrase. Glossary term.
5. **pdf.packet.minutes → כ-{minutes} דק׳: keep.** "כ-" is the Hebrew "about", hyphenated before the placeholder per convention; geresh abbreviation as in the relative-time badges; 9 counted characters, max 10.
6. **pdf.serviceSheet.honors → כיבודים: keep.** The synagogue term for the people given a role in the service.
7. **pdf.serviceSheet.sectionMusic → שירים בלבד: keep.** The section lists only the band's songs; "מוזיקה בלבד" is no clearer.
8. **dashboard holiday greetings: keep** (שבת שלום, שנה טובה, גמר חתימה טובה, חג שמח, חנוכה שמח, פורים שמח, פסח שמח). All are the everyday Israeli forms. Optional alternative logged for Hanukkah.
9. **nav.saveLabelNotification(s) → סימון ההתראה כנקראה / סימון ההתראות כנקראו: keep.** In appSync.saveFailed it reads "לא ניתן היה לשמור את סימון ההתראה כנקראה — אפשר לנסות שוב", which says what failed. A bare "ההתראה" would read "couldn't save the notification". Definite, so it takes "את". 19 / 20 characters, max 25.
10. **setlistModals.suggestionStaple "ב-{count} רשימות — {setlistName}": keep the structure, add the verb** (applied above: "נוגן ב-{count} רשימות — {setlistName}"). Counting setlists rather than "times" is accurate (the note says count = setlists).
11. **api-charts.scrapeNoChart keeping "(rawText)": keep.** The English names the field too, the Hebrew sentence already says "להדביק את הטקסט ישירות", and the parenthesis points API / MCP callers to the field.

Checks: `node scripts/i18n-he-missing.mjs --list` → 0 missing, 0 problems (8 accepted LONG warnings, unchanged); `npx vitest run src/__tests__/i18n src/__tests__/mt-p7` passes.
