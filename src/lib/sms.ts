/**
 * Twilio SMS Integration
 *
 * Sends SMS messages (the band notification) via Twilio.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER env vars.
 */

import { logger } from '@/lib/logger'

interface TwilioMessageResponse {
    sid: string
    status: string
    error_code?: number
    error_message?: string
}

function getTwilioConfig() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !phoneNumber) {
        return null
    }

    return { accountSid, authToken, phoneNumber }
}

/**
 * Send an SMS message via Twilio REST API.
 * Uses fetch directly to avoid heavy SDK dependency.
 */
export async function sendSMS(
    to: string,
    body: string,
): Promise<{ ok: boolean; sid?: string; error?: string }> {
    const config = getTwilioConfig()
    if (!config) {
        logger.warn('[SMS] Twilio not configured — skipping SMS')
        return { ok: false, error: 'Twilio not configured' }
    }

    // Normalize phone number
    const normalizedTo = normalizePhone(to)
    if (!normalizedTo) {
        return { ok: false, error: 'Invalid phone number' }
    }

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`
        const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: normalizedTo,
                From: config.phoneNumber,
                Body: body,
            }).toString(),
        })

        const data: TwilioMessageResponse = await response.json()

        if (!response.ok || data.error_code) {
            const errMsg = data.error_message || `HTTP ${response.status}`
            logger.error(`[SMS] Twilio error: ${errMsg}`)
            return { ok: false, error: errMsg }
        }

        logger.info(`[SMS] Sent to ${normalizedTo} (SID: ${data.sid})`)
        return { ok: true, sid: data.sid }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`[SMS] Failed to send to ${to}: ${msg}`)
        return { ok: false, error: msg }
    }
}

/**
 * Normalize a phone number to E.164 format.
 * Handles common US formats.
 */
function normalizePhone(phone: string): string | null {
    // Strip everything except digits and leading +
    const cleaned = phone.replace(/[^\d+]/g, '')

    if (cleaned.startsWith('+') && cleaned.length >= 11) {
        return cleaned // Already E.164
    }

    // US number: 10 digits
    const digitsOnly = cleaned.replace(/\D/g, '')
    if (digitsOnly.length === 10) {
        return `+1${digitsOnly}`
    }

    // US number with country code: 11 digits starting with 1
    if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
        return `+${digitsOnly}`
    }

    // Can't normalize
    return null
}
