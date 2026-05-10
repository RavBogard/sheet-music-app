import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.5-flash",
  tools: [
    { googleSearch: {} }
  ]
});

async function run() {
  const prompt = `Use your Google Search tool to extract the chords from this exact URL: https://tabs.ultimate-guitar.com/tab/bruce-springsteen/dancing-in-the-dark-chords-1361511. Return the lyrics and chords.`;

  try {
    const result = await model.generateContent(prompt);
    console.log(result.response.text());
    
    // Also check grounding metadata
    if (result.response.candidates?.[0]?.groundingMetadata?.searchEntryPoint) {
      console.log("Grounding info:", result.response.candidates[0].groundingMetadata);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
