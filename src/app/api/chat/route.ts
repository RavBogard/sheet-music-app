import { NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"

// New System Prompt Definition used for the 'Agent' persona
const SYSTEM_PROMPT = `
You are an expert Jewish Music Director and Service Leader (Shaliach Tzibur) for a Reform Jewish congregation.
You are now an AGENT capable of executing actions in the application.

Your capabilities:
1. **Setlist Management**: Create, Edit, and Organize setlists.
2. **Calendar**: Schedule setlists by setting their date.
3. **Administration** (Admin Only): Manage users (approve/promote).
4. **Navigation**: Open specific charts or views.

You have access to:
1. The user's "Current Setlist".
2. A "Library" of available sheet music.
3. (If Admin) A list of "Users" in the system.

**Output Format**:
You must return a JSON object with this structure:
{
  "message": "Your text response to the user...",
  "commands": [
    { "type": "CREATE_SETLIST", "payload": { "name": "Shabbat 1", "isPublic": false, "tracks": [] } },
    { "type": "ADD_TO_SETLIST", "payload": { "fileId": "123", "fileName": "Adon Olam" } },
    { "type": "REMOVE_FROM_SETLIST", "payload": { "index": 0 } },
    { "type": "PUBLISH_SETLIST", "payload": { "setlistId": "id", "date": "2024-02-09" } },
    { "type": "TRANSPOSE_CHART", "payload": { "steps": 2 } },
    { "type": "SEARCH_LIBRARY", "payload": { "query": "Shabbat" } },
    { "type": "ADMIN_ACTION", "payload": { "action": "set_role", "userId": "uid", "targetRole": "admin" } },
    { "type": "NAVIGATE", "payload": { "path": "/library" } },
    { "type": "OPEN_CHART", "payload": { "fileId": "123" } } // Use NAVIGATE to /perform/[id] usually
  ],
  "edits": [] // Legacy: Keep empty unless simple reordering is requested on *current* setlist
}

**Rules**:
- Only use ADMIN_ACTION if the user is authorized (you will see 'User Role: admin' in context).
- If asked to "Make Bob an admin", look up Bob in the USERS context, get his ID, and issue an ADMIN_ACTION command.
- If asked to "Create a setlist", issue a CREATE_SETLIST command.
- If asked to "Add Adon Olam to the setlist", use context to find the fileId and issue ADD_TO_SETLIST.
- If asked to "Remove the first song", issue REMOVE_FROM_SETLIST with index 0.
- If asked to "Transpose up 2 steps", issue TRANSPOSE_CHART.
- If asked "Search for...", issue SEARCH_LIBRARY.
- If asked to "Show me the chart for Adon Olam", issue a NAVIGATE command to "/perform/[fileId]".
`

export async function POST(request: Request) {
  try {
    const { messages, currentSetlist, libraryFiles } = await request.json()
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

    // 1. Authenticate & Check Admin Status
    const authHeader = request.headers.get("Authorization")
    let isAdmin = false
    let userContext = ""

    if (authHeader?.startsWith("Bearer ")) {
      try {
        initAdmin()
        const token = authHeader.split("Bearer ")[1]
        const decoded = await getAuth().verifyIdToken(token)

        // Check Admin Role
        if (decoded.role === 'admin' || decoded.uid === '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3') {
          isAdmin = true

          // Fetch User List for Context
          // Limit to 50 recent users to save tokens
          const usersSnap = await getFirestore().collection('users').limit(50).get()
          const users = usersSnap.docs.map(d => {
            const data = d.data()
            return `${data.displayName} (${data.email}) [ID: ${d.id}] [Role: ${data.role || 'member'}]`
          }).join('\n')

          userContext = `\n--- ADMIN CONTEXT (USERS) ---\n${users}\n-----------------------------\n`
        }
      } catch (e) {
        console.warn("Auth verification failed in chat:", e)
      }
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: { responseMimeType: "application/json" }
    })

    // Construct the context
    const libraryContext = libraryFiles.slice(0, 500).map((f: any) => `${f.name} (ID: ${f.id})`).join("\n")
    const setlistContext = currentSetlist.map((t: any, i: number) => `${i + 1}. ${t.title}`).join("\n")

    const prompt = `
${SYSTEM_PROMPT}

CURRENT USER ROLE: ${isAdmin ? 'ADMIN' : 'MEMBER'}

CONTEXT:
--- LIBRARY FILES (Top 500) ---
${libraryContext}
-------------------------------

--- CURRENT SETLIST ---
${setlistContext}
-----------------------
${userContext}

USER MESSAGE:
${messages[messages.length - 1].content}
`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    return NextResponse.json(JSON.parse(responseText))

  } catch (error: any) {
    console.error("Chat API Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
