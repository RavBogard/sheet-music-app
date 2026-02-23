import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set. AI features require a valid Gemini API key.");
}

const genAI = new GoogleGenerativeAI(apiKey);

export const geminiFlash = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
export const geminiProVision = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }); // Using Flash Preview as user requested (Pro returning 404)
