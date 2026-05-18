# Inbox — auditor

Message schema in `.coord/README.md` § "Message schema (inbox)":

```markdown
## msg-<short-id> | from <sender-id> | <iso-utc> | status:<NEW|ACK|RESOLVED>
**Subject:** one-line summary (<80 chars)
**Kind:** REQUEST | HEADS-UP | BLOCKER | SHIP-NOTICE | QUESTION
**Body:**
1-3 short paragraphs. NO chat-noise. Facts, asks, ETAs only.
**Action required:** none | specific ask | reply by <timestamp>
---
```

Supervisor relays SHIP-NOTICEs here for validation. Lanes may CC
directly with FINDING / SHIP-NOTICE messages. Auditor edits the
STATUS field inline as messages are handled.

Most VERIFICATION messages flow OUT to `inbox/supervisor.md` (per
the validation workflow in `.coord/AUDITOR.md`), not in.

---

_(No messages yet.)_
