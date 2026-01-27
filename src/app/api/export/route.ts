import { NextResponse } from "next/server"
import { createSetlistService } from "@/lib/setlist-firebase"

// We can't actually access the "current user" easily in a server route without passing tokens.
// For simplicity in this "local-first" / "lightweight" app, we might need to rely on the client
// to fetch the data and bundle it, OR pass the User ID in the header if we trust it (we rely on Firebase rules anyway).
// Since we are using client-side Firebase Auth, the server doesn't inherently know the user unless we verify a token.

// EASIER APPROACH for "Export":
// Do it purely client-side!
// We already have `setlistService` on the client.
// Let's make the "Export" button on the client fetch all setlists and download a JSON file.
// No need for a server route unless we want to do heavy processing.
// A client-side export is perfectly fine for < 1MB of JSON.

// So skipping this file creation.
// I will create a Client Component "ExportButton" instead.
