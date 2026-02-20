require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Papa = require('papaparse');

async function run() {
    console.log("Starting...");
    const url = "https://docs.google.com/spreadsheets/d/19pSctdr2Mi6KHO-LPlN6RcCAH8P1bMp8hyIWMoz0434/edit?pli=1&gid=1580772210#gid=1580772210"

    let fetchUrl = url
    if (url.includes("docs.google.com/spreadsheets")) {
        const docMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
        const gidMatch = url.match(/gid=([0-9]+)/)
        if (docMatch) {
            fetchUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/export?format=csv`
            if (gidMatch) {
                fetchUrl += `&gid=${gidMatch[1]}`
            }
        }
    }

    console.log("Fetching...", fetchUrl);
    const res = await fetch(fetchUrl);
    const rawCsv = await res.text();
    console.log("CSV length:", rawCsv.length);

    console.log("Parsing CSV...");
    const parsed = Papa.parse(rawCsv, { header: true, skipEmptyLines: true });
    console.log("Parsed rows:", parsed.data.length);

    const contextStr = JSON.stringify(parsed.data, null, 2);

    console.log("Calling Gemini...");
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const geminiFlash = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `You are an expert musical setlist parser. Your job is to take a raw JSON array representing rows from a spreadsheet and extract a clean list of setlist items.
                    
Return a JSON object with a single root key 'items' containing an array of objects.
Each item must have a 'type' of either "header" or "song".

Rules for "header" items:
- Represents a structural section (e.g. "Pre service", "Awakening", "Torah Service").
- Set 'title' to the header name. All other fields should be null.

Rules for "song" items:
- Identify if a row is a song/tune/prayer.
- Set 'title' to the primary name of the song.
- Set 'key' to the musical key if listed (e.g. Dm, E minor, F). Normalize capitalization if you can (e.g., "D minor" -> "Dm").
- Set 'chartUrl' to any Google Drive link or PDF URL found in the row.
- Set 'performer' to the lead vocalist/musician if indicated.
- Set 'referenceLink' to any YouTube/Spotify links found in the row.
- Ignore blank/empty rows.

Make educated guesses on column mapping based on standard terms.

Here is the JSON array:
${contextStr}`

    const resultObj = await geminiFlash.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
        }
    });

    console.log("Gemini responded!");
    const content = resultObj.response.text();
    console.log(content.substring(0, 500));
}

run().catch(console.error);
