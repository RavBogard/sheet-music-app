/**
 * Sentry capture-verification endpoint.
 *
 * Tier-2 sentry-wiring lane: this route exists so the auditor (and any
 * future on-call) can confirm Sentry is actually receiving events after a
 * deploy.  GET-only, refuses without `?confirm=yes`, throws an Error that
 * the runtime forwards to `onRequestError` → Sentry.
 *
 * 🚨  **DELETE THIS ROUTE BEFORE MERGE.**  An always-throwable production
 * endpoint is a foot-gun — only kept around long enough for the deployed
 * verification step.  The auditor's accept message will note the deletion
 * follow-up.
 */
import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
    const confirm = new URL(request.url).searchParams.get("confirm")
    if (confirm !== "yes") {
        return NextResponse.json(
            {
                ok: false,
                error: "confirm_required",
                message:
                    "This route deliberately throws to verify Sentry capture. Pass ?confirm=yes to fire.",
            },
            { status: 400 },
        )
    }
    throw new Error(
        "sentry-wiring deploy-verify throw — if you see this in Sentry the wiring works",
    )
}
