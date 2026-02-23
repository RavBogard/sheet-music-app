import { GoogleGenerativeAI } from "@google/generative-ai";

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
    if (_genAI) return _genAI;
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set. AI features require a valid Gemini API key.");
    }
    _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
}

export function geminiFlash() {
    return getGenAI().getGenerativeModel({ model: "gemini-3-flash-preview" });
}

export function geminiProVision() {
    // Using Flash Preview (Pro returning 404)
    return getGenAI().getGenerativeModel({ model: "gemini-3-flash-preview" });
}
