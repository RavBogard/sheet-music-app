import { NextResponse } from "next/server";
import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import { createApiHandler } from "@/lib/api-wrapper";

const apiKey = process.env.GEMINI_API_KEY;

export const maxDuration = 60;

export const POST = createApiHandler(
    async (ctx) => {
        if (!apiKey) {
            return NextResponse.json(
                { error: "GEMINI_API_KEY environment variable is missing" },
                { status: 500 }
            );
        }

        const body = await ctx.req.json();
        const { base64Image } = body;

        if (!base64Image) {
            return NextResponse.json(
                { error: "Missing base64Image in request body" },
                { status: 400 }
            );
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
        });

        const responseSchema: Schema = {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    text: {
                        type: SchemaType.STRING,
                        description: "The music chord symbol, e.g., C, F#m, Bbmaj7, C(add9)"
                    },
                    x: {
                        type: SchemaType.NUMBER,
                        description: "The x-coordinate of the top-left corner as a percentage of the image width (0-100)"
                    },
                    y: {
                        type: SchemaType.NUMBER,
                        description: "The y-coordinate of the top-left corner as a percentage of the image height (0-100)"
                    },
                    w: {
                        type: SchemaType.NUMBER,
                        description: "The width of the chord text bounding box as a percentage of the image width (0-100)"
                    },
                    h: {
                        type: SchemaType.NUMBER,
                        description: "The height of the chord text bounding box as a percentage of the image height (0-100)"
                    }
                },
                required: ["text", "x", "y", "w", "h"]
            }
        };

        const prompt = `
      You are an expert musician and sheet music transcriber with perfect spatial awareness.
      I am providing you with an image of a single page of sheet music.

      Your task is to identify EVERY musical chord symbol written on this page (e.g., C, G7, F#m, Bdim, etc.).

      For every chord you find, provide its exact bounding box coordinates.
      CRITICAL: All coordinates (x, y, w, h) MUST be calculated as a PERCENTAGE (from 0 to 100) relative to the total width and height of the provided image.
      - "x" and "y" represent the top-left corner of the chord text.
      - "w" and "h" represent the width and height of the chord text.

      If there are no chords on the page, return an empty array [].
    `;

        // Strip the data:image prefix if it exists before sending to Gemini
        const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp);base64,/, "");
        // Determine mimeType (defaulting to jpeg if unknown)
        const mimeType = base64Image.match(/^data:(image\/[a-zA-Z]+);base64,/)
            ? base64Image.match(/^data:(image\/[a-zA-Z]+);base64,/)[1]
            : "image/jpeg";

        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType
            },
        };

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        const responseText = result.response.text();
        const chords = JSON.parse(responseText);

        return NextResponse.json({ chords });
    }
)
