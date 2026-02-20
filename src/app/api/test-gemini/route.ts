export const maxDuration = 60

import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function GET() {
    try {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ error: "No API key found in Vercel env" }, { status: 500 })
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const geminiFlash = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" })

        const start = Date.now()
        const result = await geminiFlash.generateContent("Reply with the word SUCCESS")
        const duration = Date.now() - start

        return NextResponse.json({
            status: "SUCCESS",
            apiKeyLength: apiKey.length,
            durationMs: duration,
            reply: result.response.text(),
        })

    } catch (e: any) {
        return NextResponse.json({
            error: "Gemini fetch failed",
            message: e.message,
            stack: e.stack
        }, { status: 500 })
    }
}
