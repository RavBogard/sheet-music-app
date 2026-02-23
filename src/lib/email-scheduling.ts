/**
 * Scheduling Email Templates (Resend)
 *
 * Sends musician scheduling notifications:
 * - Assignment notification (you're scheduled to play)
 * - Confirmation received (musician accepted)
 * - Decline notification (musician declined — find replacement)
 * - Reminder (upcoming service, still pending)
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

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

interface SchedulingEmailParams {
    to: string
    recipientName: string
    setlistName: string
    eventDate: string
    instrument?: string
    status: 'pending' | 'confirmed'
    scheduleUrl: string
    assignmentId: string
}

/**
 * Send a scheduling notification email to a musician.
 */
export async function sendSchedulingEmail(params: SchedulingEmailParams): Promise<{ ok: boolean; reason?: string }> {
    const client = getResend()
    if (!client) return { ok: false, reason: 'RESEND_API_KEY not configured' }

    try {
        const instrumentText = params.instrument ? ` on <strong>${escapeHtml(params.instrument)}</strong>` : ''
        const isAutoConfirmed = params.status === 'confirmed'

        const actionButtons = isAutoConfirmed
            ? `<a href="${escapeHtml(params.scheduleUrl)}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Schedule</a>`
            : `<a href="${escapeHtml(params.scheduleUrl)}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Accept or Decline</a>`

        const statusBadge = isAutoConfirmed
            ? '<span style="display:inline-block;padding:4px 12px;background:#10b981;color:#ffffff;border-radius:12px;font-size:12px;font-weight:600;">Confirmed</span>'
            : '<span style="display:inline-block;padding:4px 12px;background:#f59e0b;color:#ffffff;border-radius:12px;font-size:12px;font-weight:600;">Awaiting Response</span>'

        const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr>
    <td style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">🎵 You're Scheduled to Play</h1>
      <p style="margin:4px 0 0;color:#a0a0c0;font-size:14px;">${escapeHtml(params.setlistName)}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0 0 16px;color:#333;font-size:15px;">Hi ${escapeHtml(params.recipientName)},</p>
      <p style="margin:0 0 20px;color:#333;font-size:15px;">
        You've been scheduled${instrumentText} for an upcoming service at Central Reform Congregation.
      </p>

      <div style="margin:0 0 24px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;font-weight:600;">SERVICE</td>
            <td style="padding:4px 0;color:#1e293b;font-size:14px;">${escapeHtml(params.setlistName)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;font-weight:600;">DATE</td>
            <td style="padding:4px 0;color:#1e293b;font-size:14px;">${escapeHtml(params.eventDate)}</td>
          </tr>
          ${params.instrument ? `<tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;font-weight:600;">INSTRUMENT</td>
            <td style="padding:4px 0;color:#1e293b;font-size:14px;">${escapeHtml(params.instrument)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:4px 0;color:#64748b;font-size:13px;font-weight:600;">STATUS</td>
            <td style="padding:4px 0;">${statusBadge}</td>
          </tr>
        </table>
      </div>

      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 8px;">${actionButtons}</td>
        </tr>
      </table>

      ${!isAutoConfirmed ? '<p style="margin:16px 0 0;color:#94a3b8;font-size:13px;text-align:center;">Please confirm or decline as soon as possible.</p>' : ''}
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

        const { error } = await client.emails.send({
            from: `CRC Music <${getFromEmail()}>`,
            to: params.to,
            subject: isAutoConfirmed
                ? `You're confirmed: ${params.setlistName}`
                : `You're scheduled to play: ${params.setlistName}`,
            html,
        })

        if (error) {
            const msg = error.message || JSON.stringify(error)
            logger.error(`[Email] Scheduling email error for ${params.to}: ${msg}`)
            return { ok: false, reason: msg }
        }

        logger.info(`[Email] Sent scheduling notification to ${params.to}`)
        return { ok: true }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`[Email] Failed scheduling email to ${params.to}: ${msg}`)
        return { ok: false, reason: msg }
    }
}
