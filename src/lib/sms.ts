/**
 * Twilio SMS Integration
 *
 * Sends scheduling-related SMS messages to musicians.
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
 * Send a scheduling assignment SMS.
 */
export async function sendSchedulingAssignmentSMS(params: {
    to: string
    musicianName: string
    setlistName: string
    eventDate: string
    instrument?: string
    status: 'pending' | 'confirmed'
    scheduleUrl: string
}): Promise<{ ok: boolean; error?: string }> {
    const { musicianName, setlistName, eventDate, instrument, status, scheduleUrl } = params
    const firstName = musicianName.split(' ')[0]

    const instrumentText = instrument ? ` on ${instrument}` : ''
    const body = status === 'confirmed'
        ? `Hi ${firstName}! You're confirmed to play${instrumentText} at CRC on ${eventDate} for "${setlistName}". View schedule: ${scheduleUrl}`
        : `Hi ${firstName}, you're scheduled to play${instrumentText} at CRC on ${eventDate} for "${setlistName}". Please confirm: ${scheduleUrl}`

    return sendSMS(params.to, body)
}

/**
 * Send a scheduling reminder SMS.
 */
export async function sendSchedulingReminderSMS(params: {
    to: string
    musicianName: string
    setlistName: string
    eventDate: string
    instrument?: string
    scheduleUrl: string
}): Promise<{ ok: boolean; error?: string }> {
    const firstName = params.musicianName.split(' ')[0]
    const instrumentText = params.instrument ? ` on ${params.instrument}` : ''

    const body = `Reminder: CRC service "${params.setlistName}" on ${params.eventDate}. You're playing${instrumentText}. Setlist: ${params.scheduleUrl}`

    return sendSMS(params.to, body)
}

/**
 * Send a cancellation SMS.
 */
export async function sendSchedulingCancellationSMS(params: {
    to: string
    musicianName: string
    setlistName: string
    eventDate: string
}): Promise<{ ok: boolean; error?: string }> {
    const firstName = params.musicianName.split(' ')[0]
    const body = `Hi ${firstName}, your CRC service assignment for "${params.setlistName}" on ${params.eventDate} has been cancelled.`

    return sendSMS(params.to, body)
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
