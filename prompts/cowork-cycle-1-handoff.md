# Cycle 1 cowork handoff (paste into Claude Desktop autonomous session at launch)

Paste this block into Claude Desktop's autonomous cowork session AT
THE VERY START, before the marathon stress-test prompt. It tells
cowork about the closed-loop architecture so it writes outputs to
the path the orchestrator will poll.

---

Hi cowork. You're cycle 1 of an autonomous closed loop. Here's the
shape:

1. You're about to receive a marathon stress-test prompt for the
   CRC Music product (centralreform.live). Run it as instructed.
2. When you finish, write your report to **`C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-1\cowork-report.md`**.
   This is an absolute Windows path; use it exactly. The directory
   already exists. Do not put the report anywhere else.
3. As the VERY LAST thing you do (after the report is written and
   you've verified it's on disk), write a sentinel flag file at
   **`C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-1\COWORK-DONE.flag`**.
   The contents can be a single line with the current ISO timestamp.
   This flag triggers the next stage of the loop, so the report
   MUST be complete + on disk BEFORE the flag is written.
4. After writing the flag, you can exit cleanly. Don't loop, don't
   restart, don't try to apply your own findings. Another Claude
   session (a "processor" running in Claude Code with the repo
   working directory open) is polling the flag every ~15 minutes.
   It will read your report, ship fixes autonomously, then spawn a
   cycle 2 cowork to verify those fixes.
5. The processor uses your report as the authoritative source of
   truth for what's broken. Be specific in your findings, with
   actual repros, observed-vs-expected, suggested-fix-direction.
   The processor can't ask you clarifying questions — your report
   IS the spec it builds against.
6. If you encounter a CRIT during your run that's so severe it
   should interrupt Daniel's sleep (production data corruption,
   the band's iPad surface completely dark, anything that breaks
   tomorrow's service), write a separate file at
   **`C:\Users\dsbog\CentralReform.live\sheet-music-app-mcp\outputs\autonomous-run\cycle-1\CRIT-WAKE-DANIEL.flag`**
   in addition to the normal flag. The processor will see that and
   page Daniel via PushNotification.
7. Standing rules from the marathon prompt apply. No bridge/, no
   real publish notifications to the band, no SMS/email/push to
   non-bugstomp recipients, BUGSTOMP-tag any test setlists you
   create, cleanup at the end. The chart-access policy is
   intentional (chart bytes are public by design) — don't flag it
   as a vulnerability.

After this preamble, your actual marathon prompt is at
`.paul/research/mcp-stress-test-2026-05-17-marathon-PROMPT.md` in
the repo — but you might not have direct access to read it from
your sandbox cwd. If you don't, Daniel will paste it for you after
this preamble. Confirm you've understood this handoff, then proceed.

— bugstomp processor (the Claude Code session that will pick up
your report; this message was written by it on 2026-05-16)
