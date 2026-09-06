# iPad Keep Awake — Real-Use Acceptance

Status: **outstanding hardware verification**. Automated tests exercise the browser API contract; they do not prove that a physical iPad screen remains awake.

Record the iPad model, iPadOS version, whether the site is running in Safari or from the Home Screen, and the production revision from `/api/version`.

1. Use iPadOS 18.4 or newer. Set Auto-Lock to a short interval such as 2 minutes so the result is observable.
2. Open a normal chart or setlist in performance mode. Do not edit the setlist. Confirm the Keep Awake indicator reports active.
3. Leave the chart untouched for longer than the Auto-Lock interval. Pass: the screen stays awake.
4. Switch to another app for at least 30 seconds, then return. Confirm Keep Awake becomes active again and repeat the untouched wait. Pass: the screen stays awake after returning.
5. Turn Keep Awake off. Leave the chart untouched. Pass: the iPad follows its normal Auto-Lock setting.
6. Turn Keep Awake on again. If the browser reports a refusal, tap the retry control once. Pass: the indicator either becomes active or clearly reports that the browser/system denied the request; it must not claim an active lock when none exists.
7. Repeat in each production mode the congregation actually uses: Safari tab and Home Screen app.

If any step fails, capture the displayed Keep Awake state, exact iPadOS version, mode, Low Power Mode state, and approximate time of the failure. Do not change a real setlist as part of this test.
