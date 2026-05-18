# Cold-boot — how to start the entire parallel-agent setup

This directory contains the **paste-ready startup prompts** for every
role in the parallel-agent system. Use these after a context clear
or a fresh terminal session to wake each role up with the right
context.

## The role map

| Role | Count | File to paste | Sign-off | Persistent home |
|---|---|---|---|---|
| Supervisor | 1 | `SUPERVISOR-startup.md` | `from supervisor` | `.coord/SUPERVISOR.md` |
| Auditor | 1 | `AUDITOR-startup.md` | `from auditor` | `.coord/AUDITOR.md` |
| Coder-1..N | up to N | `CODER-startup.md` (substitute `<N>`) | `from coder-<N>` | `.coord/CODER.md` (generic) + `.coord/inbox/coder-<N>.md` (lane-specific) |

Supervisor + Auditor are **standing meta roles** — same instance
lives across multiple waves. Coders are **transient implementation
roles** — same numeric identity (e.g. `coder-3`) gets reused across
waves, but their lane assignment changes per wave (lives in the
inbox).

## Full cold-boot procedure

After a complete restart (e.g., the user's machine rebooted; they
want to resume the parallel-agent system from scratch):

### Step 1 — Open supervisor tab

In a fresh Claude Code session:

```
[paste the content of .coord/cold-boot/SUPERVISOR-startup.md]
```

Supervisor reads `.coord/SUPERVISOR.md`, verifies git state, reports
situational ACK.

### Step 2 — Open auditor tab

In another fresh Claude Code session:

```
[paste the content of .coord/cold-boot/AUDITOR-startup.md]
```

Auditor reads `.coord/AUDITOR.md`, verifies git state, reports its
own situational ACK (open validation queue, etc.).

### Step 3 — If a wave is dispatched, open coder tabs

For each lane in the dispatched wave:

1. Open a fresh Claude Code session per coder.
2. Tell the session its number: "you are coder-3."
3. Paste the content of `.coord/cold-boot/CODER-startup.md` (with
   `<N>` substituted to 3).

The coder reads `.coord/CODER.md` + `.coord/inbox/coder-3.md` and
picks up its lane.

**Pre-requisite for Step 3:** supervisor must have written lane
assignments into `.coord/inbox/coder-<N>.md` files. If no inbox file
exists, ask supervisor to scaffold the lane first.

## Quick reference — typical wave dispatch

Supervisor's workflow when the user asks "spin up coders 1-N for
wave X":

1. For each lane, supervisor writes a msg-001 into
   `.coord/inbox/coder-<N>.md` pointing at the lane's bootstrap
   prompt (project-specific path).
2. The user opens N tabs, runs the `CODER-startup.md` paste in each
   (with the appropriate `<N>` substituted).
3. Each coder ACKs in its inbox, then in supervisor's inbox.
4. Coders work in parallel.

## Slash-command packaging — `/bongo:`

If `/bongo:` is installed at `~/.claude/commands/bongo/` (or
checked into `.claude/commands/bongo/` at the project), prefer:

- `/bongo:resume <boss|auditor|N>` — cold-boot or warm-resume any
  role. Resolves coord-root via walk-up-from-cwd, or accepts
  `--repo <path>` override.
- `/bongo:pause` (optionally `/bongo:pause <role>`) — write a pickup
  pointer for the current role; auto-detects from in-session
  persona.

"boss" is the slash-command keyword for supervisor. The supervisor
role stays named `supervisor` internally and signs `from supervisor`
— the keyword does not rename anything.

The paste path (the `*-startup.md` files in this directory) remains
the **canonical source of truth and the fallback** when `/bongo:`
is unavailable in a given session. The slash commands are thin
pointers that read from these files.
