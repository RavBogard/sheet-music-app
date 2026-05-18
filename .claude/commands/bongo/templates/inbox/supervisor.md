# Inbox — supervisor

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

Senders APPEND new message blocks. Supervisor edits the STATUS
field inline as messages are handled (NEW → ACK → RESOLVED). Move
RESOLVED messages to `archive/YYYY-MM-DD/supervisor.md` when this
file grows past ~3KB.

---

_(No messages yet.)_
