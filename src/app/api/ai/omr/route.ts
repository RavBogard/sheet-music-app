import { NextRequest, NextResponse } from "next/server";
import { geminiFlash, geminiProVision } from "@/lib/gemini";
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";
import { DriveClient } from "@/lib/google-drive";

// Ensure Firebase Admin is initialized
initAdmin();

export const maxDuration = 60; // Allow 60 seconds for AI processing

export async function POST(req: NextRequest) {
    try {
        // 1. Admin Verification (Strict)
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        await getAuth().verifyIdToken(token);

        // 2. Body Parsing
        const { fileId, mimeType } = await req.json();
        if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

        // 3. Fetch File from Drive (Use centralized Client)
        const driveClient = new DriveClient();
        const fileData = await driveClient.getFile(fileId);

        // Convert to Base64 (getFile returns ArrayBuffer)
        const pdfBuffer = Buffer.from(fileData as ArrayBuffer);
        const base64Data = pdfBuffer.toString("base64");



        // 4. Prompt Gemini
        // We'll use Flash for speed, or Pro Vision for better OCR. "Sheet Music" is complex.
        // Let's try Flash first, it's very capable with docs.

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

        const result = await geminiProVision.generateContent([
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

    } catch (error: any) {
        console.error("OMR Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to digitize music" },
            { status: 500 }
        );
    }
}
