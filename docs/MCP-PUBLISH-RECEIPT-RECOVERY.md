# MCP publish receipt recovery

Use this procedure only when `publish_setlist` with the same `idempotencyKey`
keeps returning `operation_in_progress`. That state deliberately fails closed:
the process may have stopped after one or more notification channels ran, so a
new key or deleted receipt could notify people twice.

## Inspect before acting

1. Stop automated retries and record the setlist id, caller uid, org,
   idempotency key, request payload, approximate start time, and receipt id (if
   the response supplied one).
2. In Firestore, query `mcp_write_receipts` for
   `tool == publish_setlist`, `uid == <caller>`, `orgId == <org>`, and
   `idempotencyKey == <key>`. Confirm there is exactly one receipt, its
   `inputHash` belongs to the original unchanged payload, and its state is
   `in_progress`.
3. Inspect `setlists/<setlistId>` for the version increment,
   `publishedSnapshot`, `publishedAt`, and `lastNotifiedAt`. These prove the
   publish claim committed, but do not prove which delivery channels finished.
4. Reconcile every intended recipient and channel using durable evidence:
   `users/<uid>/notifications` for in-app rows, Resend delivery/message logs for
   email, the SMS provider log for text messages, and application/Vercel logs
   for push dispatch. Record confirmed sent, confirmed not sent, and unknown
   separately. A missing history row is not proof that nothing was sent.

## Safe outcomes

- If any channel is sent or unknown, keep the receipt in progress and do not
  call `publish_setlist` with a new key. Contact only confirmed-missed
  recipients through a separately reviewed, channel-specific action; do not
  fan out the setlist again.
- Delete the stranded receipt and retry the original payload with the same key
  only when logs prove the process stopped before every notification channel
  and no recipient received anything. Have a second admin review that evidence
  before deletion.
- If evidence is incomplete, leave the receipt untouched and escalate with the
  inspection record. At-most-once notification is safer than an unverified
  resend.

Never change `state` to `complete` by hand or invent a result payload. The
receipt result is also the caller's replay response and must reflect an actual
completed operation.
