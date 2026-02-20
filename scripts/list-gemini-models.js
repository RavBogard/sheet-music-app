require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
        // The Node.js SDK doesn't have a direct `listModels` exported in the standard interface in older versions,
        // but we can try fetching models. Wait, `listModels` is typically available on the REST API or `GoogleAIFileManager` (no, that's for files).
        // Let's use fetch directly to the REST API to get the list of models.

        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await res.json();

        data.models.forEach(m => {
            console.log(`Model: ${m.name} | Display: ${m.displayName} | Supports: ${m.supportedGenerationMethods.join(', ')}`);
        });
    } catch (e) {
        console.error(e);
    }
}
run();
