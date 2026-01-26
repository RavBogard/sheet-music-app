import { ImageAnnotatorClient } from "@google-cloud/vision"
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Load .env.local manually since we are running via tsx
dotenv.config({ path: '.env.local' })

const getCredentials = () => {
    try {
        console.log("Checking credentials...")
        if (process.env.GOOGLE_CREDENTIALS_JSON) {
            console.log("Found GOOGLE_CREDENTIALS_JSON")
            let jsonString = process.env.GOOGLE_CREDENTIALS_JSON
            if (jsonString.startsWith('"') && jsonString.endsWith('"')) {
                jsonString = JSON.parse(jsonString)
            }
            return typeof jsonString === 'object' ? jsonString : JSON.parse(jsonString as string)
        }

        console.log("Using separate GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY")
        const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
        let key = process.env.GOOGLE_PRIVATE_KEY

        console.log("Email present:", !!email)
        console.log("Key present:", !!key)

        if (key) {
            const hasRealNewlines = key.includes('\n')
            const hasEscapedNewlines = key.includes('\\n')
            console.log("Key has real newlines:", hasRealNewlines)
            console.log("Key has escaped newlines:", hasEscapedNewlines)

            // Apply the fix logic
            key = key.replace(/\\n/g, '\n')
            console.log("Key start after fix:", key.substring(0, 30) + "...")
        }

        return {
            client_email: email,
            private_key: key,
        }
    } catch (e) {
        console.error("Credential Parsing Error:", e)
        throw e
    }
}

async function test() {
    try {
        const client = new ImageAnnotatorClient({
            credentials: getCredentials()
        })
        console.log("Client initialized. Testing API call...")
        // Send a dummy request (empty image will fail validation, but we check if AUTH passes)
        // Actually, let's send a minimal valid request to check auth.
        // We can't send empty, so we expect a validation error, NOT an auth error.
        await client.textDetection({
            image: { content: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } // 1x1 pixel gif
        })
        console.log("Success! Auth worked.")
    } catch (e: any) {
        console.log("API Call Failed.")
        console.log("Error Message:", e.message)
        console.log("Error Code:", e.code) // 16 = UNAUTHENTICATED?
        if (e.message.includes("invalid_grant") || e.message.includes("signing")) {
            console.error("CRITICAL: Authentication failed. Check Private Key.")
        }
    }
}

test()
