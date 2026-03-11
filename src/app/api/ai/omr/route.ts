import { NextResponse } from "next/server";
import { geminiProVision } from "@/lib/gemini";
import { DriveClient } from "@/lib/google-drive";
import { createApiHandler } from "@/lib/api-wrapper";
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const maxDuration = 300; // Allow 5 minutes for AI processing (Vercel Pro)

export const POST = createApiHandler(
    async (ctx) => {
        // Rate limit: 20 AI requests/min
        const limited = await checkRateLimit(ctx.req, 'ai')
        if (limited) return limited

        const { fileId, mimeType } = await ctx.req.json();
        if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

        // Fetch File from Drive (Use centralized Client)
        const driveClient = new DriveClient();
        const fileData = await driveClient.getFile(fileId);

        // Convert to Base64 (getFile returns ArrayBuffer)
        const pdfBuffer = Buffer.from(fileData as ArrayBuffer);
        const base64Data = pdfBuffer.toString("base64");

        const prompt = `
        You are an expert music engraver.
        Analyze the attached sheet music PDF.
        Convert the musical content (notes, chords, lyrics) into a valid MusicXML 4.0 file.

        Rules:
        - Output ONLY the raw XML string. Do not wrap in markdown code blocks.
        - Ensure strict MusicXML validity (headers, part-list).
        - If the PDF has multiple pages, process the first page only for this MVP (or attempt all).
        - If you cannot transcribe it, return "ERROR: Unreadable".
        `;

        const result = await geminiProVision().generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType || "application/pdf",
                },
            },
        ]);

        const text = result.response.text();

        // Clean up markdown if Gemini ignores instructions
        const cleanXml = text.replace(/```xml/g, "").replace(/```/g, "").trim();

        return NextResponse.json({ xml: cleanXml });
    }
)
