import { NextResponse } from "next/server"
import buildInfo from "@/build-info.json"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
    return NextResponse.json({
        sha: process.env.VERCEL_GIT_COMMIT_SHA || buildInfo.commit || "unknown",
        builtAt: buildInfo.buildDate || "unknown",
        version: buildInfo.version || "unknown",
    })
}
