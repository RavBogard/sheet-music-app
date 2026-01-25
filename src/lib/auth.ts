import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"


if (!process.env.GOOGLE_CLIENT_ID) {
    console.error("CRITICAL ERROR: GOOGLE_CLIENT_ID is missing from environment variables.")
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
    console.error("CRITICAL ERROR: GOOGLE_CLIENT_SECRET is missing from environment variables.")
}
if (!process.env.NEXTAUTH_SECRET) {
    console.error("CRITICAL ERROR: NEXTAUTH_SECRET is missing. This will cause 500 errors in production.")
}

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || "",
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // Persist the OAuth access_token to the token right after signin
            if (account) {
                token.accessToken = account.access_token
            }
            return token
        },
        async session({ session, token }) {
            // Send properties to the client, like an access_token from a provider.
            // @ts-ignore
            session.accessToken = token.accessToken
            return session
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
}
