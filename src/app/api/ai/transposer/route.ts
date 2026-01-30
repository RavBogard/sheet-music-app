import { NextRequest, NextResponse } from "next/server";
import { geminiFlash } from "@/lib/gemini"; // Already configured as 'gemini-3-flash-preview'
import { getAuth } from "firebase-admin/auth";
import { initAdmin } from "@/lib/firebase-admin";

initAdmin();

export const maxDuration = 60; // Shorter than OMR, we expect this to be fast-ish

interface TransposeRequestChunk {
    id: string;
    image: string; // base64
}

export async function POST(req: NextRequest) {
    try {
        // 1. Auth
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        await getAuth().verifyIdToken(token);

        // 2. Parse Body
        const { strips } = await req.json() as { strips: TransposeRequestChunk[] };
        if (!strips || !Array.isArray(strips) || strips.length === 0) {
            return NextResponse.json({ error: "No strips provided" }, { status: 400 });
        }

        // 3. Construct Multimodal Prompt
        // We will send all strips in one go to save latency/cost
        // Format: [Intro Text, "Strip ID 1:", Image1, "Strip ID 2:", Image2, ..., "Output JSON rules"]

        const parts: any[] = [
            `You are a specialized Optical Music Recognition (OMR) system. 
            Your task is to identify MUSICAL CHORD SYMBOLS (e.g., C, Am7, G/B, Bbmaj7) visually present in the provided image slices.
            
            Attached are ${strips.length} image strips cropped from a music chart.
            For each strip, identify the chords and their approximate horizontal position (0-100%).
            
            Ignore lyrics. Ignore instruction text (e.g., "Chorus"). ONLY chords.
            If a strip contains NO chords, return an empty array for it.
            
            RETURN ONLY VALID JSON matching this schema:
            [
                {
                    "id": "strip_id_string",
                    "chords": [
                        { "text": "Am", "x": 15 }, 
                        { "text": "G", "x": 50 }
                    ]
                }
            ]
            
            Do not include markdown formatting like \`\`\`json. Just the raw JSON array.
            `
        ];

        // Interleave images
        strips.forEach(strip => {
            parts.push(`Strip ID: "${strip.id}"`);
            parts.push({
                inlineData: {
                    data: strip.image,
                    mimeType: "image/jpeg"
                }
            });
        });

        parts.push("Begin analysis:");

        // 4. Call Gemini
        console.log(`[AI Transposer] Sending ${strips.length} strips to Gemini 3 Flash Preview...`);
        const result = await geminiFlash.generateContent(parts);
        const responseText = result.response.text();

        console.log("[AI Transposer] Raw Response:", responseText.substring(0, 100) + "...");

        // 5. Parse JSON
        let cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        // Sometimes LLMs add text before/after. Try to find the array [ ... ]
        const start = cleanJson.indexOf('[');
        const end = cleanJson.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
            cleanJson = cleanJson.substring(start, end + 1);
        }

        const data = JSON.parse(cleanJson);

        return NextResponse.json({ results: data });

    } catch (error: any) {
        console.error("[AI Transposer] Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to transpose" },
            { status: 500 }
        );
    }
}
