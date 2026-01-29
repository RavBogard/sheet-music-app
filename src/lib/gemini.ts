import { GoogleGenerativeAI } from "@google/generative-ai";

// Access your API key as an environment variable (see "Set up your API key" above)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export const geminiFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
export const geminiProVision = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Better for complex OMR logic if flash fails
