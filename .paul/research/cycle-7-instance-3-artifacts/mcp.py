#!/usr/bin/env python
"""MCP helper. Usage:
    BEARER=crl_live_... python mcp.py <tool> '<json_args>'
Apex->www gotcha: hits www.centralreform.live direct.
Prints extracted JSON payload from SSE response.
"""
import json, os, sys, urllib.request, random

def call(tool, args, bearer=None):
    bearer = bearer or os.environ.get("BEARER")
    if not bearer:
        sys.stderr.write("ERROR: BEARER env not set\n"); sys.exit(2)
    payload = {
        "jsonrpc": "2.0",
        "id": random.randint(1, 1_000_000),
        "method": "tools/call",
        "params": {"name": tool, "arguments": args if isinstance(args, dict) else json.loads(args or "{}")},
    }
    req = urllib.request.Request(
        "https://www.centralreform.live/api/mcp",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
    # extract data: lines
    lines = [ln[6:] for ln in raw.splitlines() if ln.startswith("data: ")]
    out = "\n".join(lines)
    return out or raw

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: mcp.py <tool> '<json_args>'\n"); sys.exit(2)
    tool = sys.argv[1]
    args = sys.argv[2] if len(sys.argv) > 2 else "{}"
    print(call(tool, args))
