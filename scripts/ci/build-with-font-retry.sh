#!/usr/bin/env bash
# CI build with a narrow retry. next/font fetches Google Fonts at build time,
# and on GitHub runners that fetch intermittently fails ("Cannot read
# properties of null (reading '1')" in next/font's google loader). The build
# is otherwise deterministic, so retry only when the failure came from
# next/font; any other failure fails at once.
set -uo pipefail
for attempt in 1 2 3; do
    npm run build 2>&1 | tee build.log
    status=${PIPESTATUS[0]}
    [ "$status" -eq 0 ] && exit 0
    if ! grep -q "next/font" build.log; then
        exit "$status"
    fi
    echo "::warning::Google Fonts fetch failed during build (attempt $attempt of 3); retrying"
    sleep 20
done
exit 1
