/**
 * Email Service (Resend)
 *
 * Sends setlist notification emails to band members.
 * Gracefully degrades when RESEND_API_KEY is not configured.
 */

import { Resend } from 'resend'
import { logger } from '@/lib/logger'

let resend: Resend | null = null

function getResend(): Resend | null {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
        logger.warn('[Email] RESEND_API_KEY not configured — email disabled')
        return null
    }
    if (!resend) {
        resend = new Resend(apiKey)
    }
    return resend
}

function getFromEmail(): string {
    return process.env.RESEND_FROM_EMAIL || 'noreply@centralreform.live'
}

interface SetlistEmailParams {
    to: string
    recipientName: string
    setlistName: string
    eventDate: string
    setlistUrl: string
    packetUrl?: string
    songs: string[]
    publisherName: string
}

/**
 * Send a setlist notification email to a single recipient.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export async function sendSetlistEmail(params: SetlistEmailParams): Promise<{ ok: boolean; reason?: string }> {
    const client = getResend()
    if (!client) return { ok: false, reason: 'RESEND_API_KEY not configured' }

    try {
        const html = buildSetlistEmailHtml(params)

        const { error } = await client.emails.send({
            from: `CRC Music <${getFromEmail()}>`,
            to: params.to,
            subject: `🎵 ${params.setlistName} — Setlist Published`,
            html,
        })

        if (error) {
            const msg = error.message || JSON.stringify(error)
            logger.error(`[Email] Resend error for ${params.to}: ${msg}`)
            return { ok: false, reason: msg }
        }

        logger.info(`[Email] Sent setlist notification to ${params.to}`)
        return { ok: true }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`[Email] Failed to send to ${params.to}: ${msg}`)
        return { ok: false, reason: msg }
    }
}

/**
 * Send setlist email notifications to all active members with emails.
 * Returns structured result with count and any error details.
 */
export async function emailAllMembers(
    members: Array<{ email: string; displayName: string }>,
    setlistId: string,
    setlistName: string,
    eventDate: string,
    publisherName: string,
    songs: string[],
    baseUrl: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const member of members) {
        if (!member.email) continue
        const result = await sendSetlistEmail({
            to: member.email,
            recipientName: member.displayName,
            setlistName,
            eventDate,
            setlistUrl: `${baseUrl}/perform/setlist/${setlistId}`,
            packetUrl: `${baseUrl}/api/setlist/print/public?setlistId=${setlistId}`,
            songs,
            publisherName,
        })
        if (result.ok) {
            sent++
        } else {
            failed++
            errors.push(`${member.email}: ${result.reason || 'unknown error'}`)
        }
    }

    return { sent, failed, errors }
}

/**
 * Build clean HTML email for setlist notification.
 */
export function buildSetlistEmailHtml(params: SetlistEmailParams): string {
    const songList = params.songs.length > 0
        ? params.songs.map((s, i) => `<tr><td style="padding:4px 8px;color:#666;font-size:13px;">${i + 1}.</td><td style="padding:4px 8px;font-size:14px;">${escapeHtml(s)}</td></tr>`).join('')
        : '<tr><td style="padding:8px;color:#999;font-style:italic;">No songs yet</td></tr>'

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
  <tr>
    <td style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">🎵 ${escapeHtml(params.setlistName)}</h1>
      <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">${escapeHtml(params.eventDate)}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0 0 16px;color:#333;font-size:15px;">
        Hi ${escapeHtml(params.recipientName)},
      </p>
      <p style="margin:0 0 20px;color:#333;font-size:15px;">
        ${escapeHtml(params.publisherName)} just published a setlist. Here's what's on the program:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #eee;border-radius:6px;overflow:hidden;">
        <tr><td style="background:#fafafa;padding:8px 12px;font-weight:600;font-size:12px;text-transform:uppercase;color:#888;letter-spacing:0.5px;">Songs</td></tr>
        <tr><td><table width="100%" cellpadding="0" cellspacing="0">${songList}</table></td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 8px;">
            <a href="${escapeHtml(params.setlistUrl)}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Setlist</a>
          </td>
          ${params.packetUrl ? `<td style="padding:0 8px;">
            <a href="${escapeHtml(params.packetUrl)}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Download My Packet</a>
          </td>` : ''}
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;">
      <p style="margin:0;color:#999;font-size:12px;text-align:center;">CRC Music — Central Reform Congregation</p>
    </td>
  </tr>
</table>
</body>
</html>`
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
