#!/bin/bash
# MCP helper. Usage: mcp.sh <tool_name> '<json_args>'
# Uses $BEARER env var. Apex→www gotcha: hits www.centralreform.live direct.
# Echoes raw extracted JSON (data: line) to stdout.
TOOL="$1"
ARGS="${2:-{}}"
ID="${MCP_ID:-$RANDOM}"
PAYLOAD=$(printf '{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"%s","arguments":%s}}' "$ID" "$TOOL" "$ARGS")
RAW=$(curl -sS -X POST "https://www.centralreform.live/api/mcp" \
  -H "Authorization: Bearer $BEARER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD")
echo "$RAW" | sed -n 's/^data: //p'
