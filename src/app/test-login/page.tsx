import type { Metadata } from "next"
import TestLoginClient from "./TestLoginClient"

/**
 * /test-login — harness-only persona sign-in.
 *
 * NOT advertised from the public /login or nav. A loginable test account
 * (`create_test_account({ loginable: true })`) returns a one-time
 * `/test-login?code=…` link; this page consumes the code via the existing
 * `GET /api/auth/qr` custom-token path, signs in with real Firebase Web SDK
 * auth, mints the normal app session cookie, then redirects. Single-use +
 * 5-min expiry are enforced server-side; this page only drives the consume.
 */
export const metadata: Metadata = {
    title: "Test Login",
    robots: { index: false, follow: false },
}

export default function TestLoginPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <main id="main-content" className="w-full max-w-sm text-center">
                <TestLoginClient />
            </main>
        </div>
    )
}
