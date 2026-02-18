import { NextResponse, NextRequest } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

import { getFullServiceContext, getNextFriday, getNextSaturday } from "@/lib/liturgical-calendar"
import { getUsageSummaries } from "@/lib/song-usage"

// New System Prompt Definition used for the 'Agent' persona
const SYSTEM_PROMPT = `
You are an expert Jewish Music Director and Service Leader (Shaliach Tzibur) for a Reform Jewish congregation.
You are now an AGENT capable of executing actions in the application.

Your capabilities:
1. **Setlist Management**: Create, Edit, and Organize setlists.
2. **Calendar**: Schedule setlists by setting their date.
3. **Administration** (Admin Only): Manage users (approve/promote).
4. **Navigation**: Open specific charts or views.
5. **Liturgical Knowledge**: You know the Reform Jewish liturgical order and can build service-appropriate setlists.
6. **Cross-Setlist Operations**: You can see ALL existing setlists and copy songs between them.

You have access to:
1. The user's "Current Setlist" (the one open in the editor right now).
2. "All Setlists" — every setlist in the system with their full track listings. You can reference these by name to copy songs, compare, or build new setlists from existing ones.
3. A "Library" of available sheet music.
4. (If Admin) A list of "Users" in the system.
5. The current Jewish calendar context (parasha, holidays, upcoming Shabbat).

**Output Format**:
You must return a JSON object with this structure:
{
  "message": "Your text response to the user...",
  "commands": [
    { "type": "CREATE_SETLIST", "payload": { "name": "Shabbat 1", "isPublic": false, "tracks": [] } },
    { "type": "ADD_TO_SETLIST", "payload": { "fileId": "123", "title": "Adon Olam" } },
    { "type": "REMOVE_FROM_SETLIST", "payload": { "index": 0 } },
    { "type": "REMOVE_FROM_SETLIST", "payload": { "all": true } },
    { "type": "PUBLISH_SETLIST", "payload": { "setlistId": "id", "date": "2024-02-09" } },
    { "type": "TRANSPOSE_CHART", "payload": { "steps": 2 } },
    { "type": "SEARCH_LIBRARY", "payload": { "query": "Shabbat" } },
    { "type": "ADMIN_ACTION", "payload": { "action": "set_role", "userId": "uid", "targetRole": "admin" } },
    { "type": "NAVIGATE", "payload": { "path": "/library" } },
    { "type": "OPEN_CHART", "payload": { "fileId": "123" } }
  ],
  "edits": []
}

**Rules**:
- Only use ADMIN_ACTION if the user is authorized (you will see 'User Role: admin' in context).
- If asked to "Make Bob an admin", look up Bob in the USERS context, get his ID, and issue an ADMIN_ACTION command.
- If asked to "Create a setlist", issue a CREATE_SETLIST command.
- **Cross-setlist operations**: If asked to "add everything from [setlist name]" or "copy songs from [setlist name]", look up that setlist in the ALL SETLISTS context, find matching tracks, and issue ADD_TO_SETLIST commands for each song. When referencing another setlist, match by name (case-insensitive, partial match OK).
- If asked to build a setlist for a specific service (e.g., "Build me a setlist for this Friday", "Shabbat morning setlist"), create a CREATE_SETLIST with pre-populated tracks matched from the library. Follow the standard Reform liturgical order. Include section headers as tracks with type "header".
- When building liturgical setlists, generate a FULL SERVICE FLOW — not just songs. Include non-song liturgical moments as tracks with these types:
  * 'song': A musical piece linked to a chart in the library (must include fileId if found)
  * 'header': A section divider (e.g., "Kabbalat Shabbat", "T'filah")
  * 'reading': Torah reading, Haftarah, responsive reading (include performer + estimatedMinutes)
  * 'prayer': Silent prayer, Mourner's Kaddish, congregational prayer (include performer + estimatedMinutes)
  * 'transition': Musical interlude, procession, moment of silence (include estimatedMinutes)
  * 'note': Stage direction, timing cue, reminder (include performer if applicable)
- Non-song tracks format: { "title": "Silent Prayer", "type": "prayer", "performer": "Congregation", "estimatedMinutes": 2 }
- When building liturgical setlists, follow this order for Friday night: Welcome → Candle Lighting → Kabbalat Shabbat header → Hinei Mah Tov → Shalom Aleichem → L'cha Dodi → Bar'chu → Shema → V'ahavta → Mi Chamocha → Hashkiveinu → T'filah header → Silent Prayer → Oseh Shalom → Torah Service header → Torah Reading → Aleinu → Mourner's Kaddish → Closing Song → Kiddush.
- When building Shabbat morning setlists: Birchot HaShachar header → Morning Blessings → P'sukei D'zimra header → Ashrei → Nishmat → Bar'chu → Shema → V'ahavta → Mi Chamocha → T'filah header → Silent Prayer → Torah Service header → Torah Processional → Torah Reading → Haftarah → Returning the Torah → Sermon → Aleinu → Mourner's Kaddish → Adon Olam/Ein Keloheinu → Kiddush.
- Search the library context to find matching files for each liturgical slot.
- When SONG USAGE HISTORY is available, use it to rotate repertoire: prefer songs not used recently over ones used last week. Mention rotation reasoning if asked.
- **Rabbi-Specific Preferences**: Each rabbi has their own style and preferences. The "ALL SETLISTS" context shows which rabbi led each past service. When building or suggesting setlists, study past setlists tagged with the same rabbi to learn their patterns — typical song choices, service flow ordering, liturgical emphasis, and preferred musicians. If the current setlist has a rabbi assigned, tailor your suggestions to match that rabbi's established patterns. If asked about differences between rabbis, compare their past setlists.
- If asked to "Add Adon Olam to the setlist", use context to find the fileId and issue ADD_TO_SETLIST with both "title" and "fileId".
- ADD_TO_SETLIST payload uses "title" (not "fileName") for the display name. Include "fileId" if found in the library. For non-song items, include "type", "performer", "estimatedMinutes".
- If asked to "Remove the first song", issue REMOVE_FROM_SETLIST with index 0.
- If asked to "Delete everything", "Clear the setlist", or "Start over", issue REMOVE_FROM_SETLIST with { "all": true }. Then add new tracks.
- When combining "delete everything and rebuild", ALWAYS issue the REMOVE_FROM_SETLIST { "all": true } command FIRST, then ADD_TO_SETLIST commands for the new tracks.
- If asked to "Transpose up 2 steps", issue TRANSPOSE_CHART.
- If asked "Search for...", issue SEARCH_LIBRARY.
- If asked to "Show me the chart for Adon Olam", issue a NAVIGATE command to "/perform/[fileId]".
`

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 AI requests/min
    const limited = await checkRateLimit(request, 'ai')
    if (limited) return limited

    // 1. Authenticate first (reject before parsing body)
    const auth = await withAuth(request)
    if (auth instanceof NextResponse) return auth // 401 — reject unauthenticated

    const { messages, currentSetlist, libraryFiles, setlistName, rabbi } = await request.json()
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY

    // 2. Check Admin Status
    let isAdmin = false
    let userContext = ""

    try {
        if (auth.isAdmin) {
          isAdmin = true
          const usersSnap = await getFirestore().collection('users').limit(50).get()
          const users = usersSnap.docs.map(d => {
            const data = d.data()
            return `${data.displayName} (${data.email}) [ID: ${d.id}] [Role: ${data.role || 'member'}]`
          }).join('\n')
          userContext = `\n--- ADMIN CONTEXT (USERS) ---\n${users}\n-----------------------------\n`
        }
    } catch (e) {
      logger.warn("Admin context fetch failed:", e)
    }

    if (!apiKey) {
      return NextResponse.json({ error: "Missing API Key" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { responseMimeType: "application/json" }
    })

    // Construct the context
    const libraryContext = libraryFiles.slice(0, 500).map((f: { name: string; id: string }) => `${f.name} (ID: ${f.id})`).join("\n")
    const setlistContext = currentSetlist.map((t: { title: string }, i: number) => `${i + 1}. ${t.title}`).join("\n")

    // Fetch ALL setlists so the AI can reference them by name
    let allSetlistsContext = ""
    try {
        const firestore = getFirestore()
        const setlistsSnap = await firestore.collection('setlists')
            .orderBy('date', 'desc')
            .limit(100)
            .get()

        if (!setlistsSnap.empty) {
            const setlistLines = setlistsSnap.docs.map(doc => {
                const data = doc.data()
                const rabbiTag = data.rabbi ? ` [Rabbi: ${data.rabbi}]` : ''
                const trackList = (data.tracks || [])
                    .filter((t: { type?: string }) => !t.type || t.type === 'song')
                    .map((t: { title: string; fileId?: string }, i: number) =>
                        `  ${i + 1}. ${t.title}${t.fileId ? ` (fileId: ${t.fileId})` : ''}`
                    )
                    .join('\n')
                return `📋 "${data.name}" (ID: ${doc.id}, ${data.isPublic ? 'public' : 'private'}, ${data.trackCount || 0} tracks${rabbiTag})\n${trackList}`
            }).join('\n\n')
            allSetlistsContext = `\n--- ALL SETLISTS ---\n${setlistLines}\n--------------------\n`
        }
    } catch (e) {
        logger.warn("Failed to fetch setlists for AI context:", e)
        // Best-effort — continue without setlist context
    }

    // Add liturgical calendar context
    let liturgicalContext = ""
    try {
        const nextFri = getNextFriday()
        const nextSat = getNextSaturday()
        const friCtx = await getFullServiceContext(nextFri)
        const satCtx = await getFullServiceContext(nextSat)
        const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

        liturgicalContext = `\n--- JEWISH CALENDAR CONTEXT ---
Today: ${todayStr}
Next Friday (${nextFri.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}): ${friCtx.holiday || 'Regular Shabbat'}${friCtx.parasha ? `, Parashat ${friCtx.parasha}` : ''}
Next Saturday (${nextSat.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}): ${satCtx.holiday || 'Regular Shabbat'}${satCtx.parasha ? `, Parashat ${satCtx.parasha}` : ''}
Hebrew Date: ${friCtx.hebrewDate.display}
-------------------------------\n`
    } catch {
        // Liturgical context is best-effort
    }

    // Song usage context — helps AI avoid repeating songs too often
    let usageContext = ""
    try {
        const setlistFileIds = currentSetlist
            .filter((t: { fileId?: string }) => t.fileId)
            .map((t: { fileId: string }) => t.fileId)
        if (setlistFileIds.length > 0) {
            const summaries = await getUsageSummaries(setlistFileIds)
            if (summaries.size > 0) {
                const lines: string[] = []
                for (const [fileId, summary] of summaries) {
                    const track = currentSetlist.find((t: { fileId?: string }) => t.fileId === fileId)
                    const dateStr = summary.lastUsedDate instanceof Date
                        ? summary.lastUsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : 'unknown'
                    lines.push(`${track?.title || fileId}: last used ${dateStr}, total ${summary.totalUses}×`)
                }
                usageContext = `\n--- SONG USAGE HISTORY ---\n${lines.join('\n')}\n--------------------------\n`
            }
        }
    } catch {
        // Usage context is best-effort
    }

    const prompt = `
${SYSTEM_PROMPT}

CURRENT USER ROLE: ${isAdmin ? 'ADMIN' : 'MEMBER'}

CONTEXT:
--- LIBRARY FILES (Top 500) ---
${libraryContext}
-------------------------------

--- CURRENT SETLIST${setlistName ? ` ("${setlistName}")` : ''}${rabbi ? ` [Rabbi: ${rabbi}]` : ''} ---
${setlistContext}
-----------------------
${allSetlistsContext}${liturgicalContext}${usageContext}${userContext}

USER MESSAGE:
${messages[messages.length - 1].content}
`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    return NextResponse.json(JSON.parse(responseText))

  } catch (error: unknown) {
    logger.error("Chat API Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
