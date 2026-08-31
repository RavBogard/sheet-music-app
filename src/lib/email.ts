/**
 * Email Service (Resend)
 *
 * Sends setlist notification emails to band members.
 * Gracefully degrades when RESEND_API_KEY is not configured.
 */

import { Resend } from 'resend'
import { logger } from '@/lib/logger'
import { getEmailBranding, getOrgBranding } from '@/lib/org/branding'
import { DEFAULT_ORG_ID } from '@/lib/org/registry'
import type { OrgId } from '@/lib/org/types'

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

/**
 * v11.4-02 (D8 item 4): per-org "from" address. CRC is unchanged
 * (`RESEND_FROM_EMAIL` || the verified centralreform.live sender). Brothers
 * Lazaroff prefers `RESEND_FROM_EMAIL_BROSLAZ` when set, but FALLS BACK to the
 * shared verified sender — so sends never break before brotherslazaroff.live
 * is verified in Resend (verifying it is an ops follow-up; flipping the env is
 * a zero-code change). Only the display name (from-name) always differs.
 */
function getFromEmail(org: OrgId = DEFAULT_ORG_ID): string {
  const shared = process.env.RESEND_FROM_EMAIL || 'noreply@centralreform.live'
  if (org === 'brotherslazaroff') {
    return process.env.RESEND_FROM_EMAIL_BROSLAZ || shared
  }
  return shared
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
  note?: string
  subject?: string
  /** v11.4-02: publishing org → branded from-name/header/footer/wordmark. Default crc (byte-identical). */
  org?: OrgId
}

/**
 * Send a setlist notification email to a single recipient.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
export async function sendSetlistEmail(params: SetlistEmailParams): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  const client = getResend()
  if (!client) return { ok: false, reason: 'RESEND_API_KEY not configured' }

  try {
    const html = buildSetlistEmailHtml(params)
    const org = params.org ?? DEFAULT_ORG_ID
    const fromName = getEmailBranding(org).fromName

    const { data, error } = await client.emails.send({
      from: `${fromName} <${getFromEmail(org)}>`,
      to: params.to,
      subject: params.subject || `🎵 ${params.setlistName} — Setlist Published`,
      html,
    })

    if (error) {
      const msg = error.message || JSON.stringify(error)
      logger.error(`[Email] Resend error for ${params.to}: ${msg}`)
      return { ok: false, reason: msg }
    }

    logger.info(`[Email] Sent setlist notification to ${params.to}`)
    return { ok: true, messageId: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[Email] Failed to send to ${params.to}: ${msg}`)
    return { ok: false, reason: msg }
  }
}

/**
 * S02 — Alert the admin on every bridge setup-code redemption.
 * Graceful-degrades if RESEND_API_KEY or BRIDGE_ALERT_EMAIL is unset.
 * Callers must ignore the result — failures here must not block redemption.
 */
export async function sendBridgeRedemptionAlert(params: {
  code: string
  redeemedAt: Date
  redeemerIp: string
  redeemerUserAgent: string
}): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  const client = getResend()
  if (!client) return { ok: false, reason: 'no_api_key' }

  const to = process.env.BRIDGE_ALERT_EMAIL
  if (!to) return { ok: false, reason: 'no_recipient' }

  const iso = params.redeemedAt.toISOString()
  const subject = 'Bridge credentials redeemed — centralreform.live'
  const text = [
    'A bridge setup code was just redeemed.',
    '',
    `Time: ${iso}`,
    `IP:   ${params.redeemerIp}`,
    `UA:   ${params.redeemerUserAgent}`,
    `Code: ${params.code}`,
    '',
    'If you did not install a bridge in the last few minutes, rotate',
    'FIREBASE_PRIVATE_KEY in the Firebase Console immediately.',
  ].join('\n')
  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</pre>`

  try {
    const { data, error } = await client.emails.send({
      from: `CRC Security <${getFromEmail()}>`,
      to,
      subject,
      text,
      html,
    })
    if (error) {
      const msg = error.message || JSON.stringify(error)
      logger.error(`[Email] Bridge alert error: ${msg}`)
      return { ok: false, reason: msg }
    }
    logger.info(`[Email] Sent bridge redemption alert to ${to}`)
    return { ok: true, messageId: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[Email] Bridge alert threw: ${msg}`)
    return { ok: false, reason: msg }
  }
}

/**
 * R8 — pre-service bridge tripwire.
 *
 * Sibling of `sendBridgeRedemptionAlert` (same Resend client, same
 * `BRIDGE_ALERT_EMAIL` recipient, same graceful degradation), for the one thing
 * nobody was ever told: the monitor bridge is down, and there is a service in a
 * couple of hours. Sent ONLY when something is wrong — a green check sends
 * nothing, because an alert that arrives every Friday whether or not it matters
 * is an alert nobody reads by the third week.
 *
 * `remedy` is the whole point of the message: the owner cannot fix anything
 * mid-service, so the mail has to say what to do NOW, while there is still time.
 */
export async function sendBridgeHealthAlert(params: {
  subject: string
  problems: string[]
  remedy: string
  detail: Record<string, unknown>
  checkedAt: Date
}): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  const client = getResend()
  if (!client) return { ok: false, reason: 'no_api_key' }

  const to = process.env.BRIDGE_ALERT_EMAIL
  if (!to) return { ok: false, reason: 'no_recipient' }

  const text = [
    'Monitor bridge pre-service check FAILED.',
    '',
    ...params.problems.map(p => `  • ${p}`),
    '',
    `What to do: ${params.remedy}`,
    '',
    `Checked: ${params.checkedAt.toISOString()}`,
    '',
    'Detail:',
    JSON.stringify(params.detail, null, 2),
  ].join('\n')

  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')}</pre>`

  try {
    const { data, error } = await client.emails.send({
      from: `CRC Monitor <${getFromEmail()}>`,
      to,
      subject: params.subject,
      text,
      html,
    })
    if (error) {
      const msg = error.message || JSON.stringify(error)
      logger.error(`[Email] Bridge health alert error: ${msg}`)
      return { ok: false, reason: msg }
    }
    logger.info(`[Email] Sent bridge health alert to ${to}`)
    return { ok: true, messageId: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[Email] Bridge health alert threw: ${msg}`)
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
  baseUrl: string,
  note?: string,
  subject?: string,
  org: OrgId = DEFAULT_ORG_ID
): Promise<{ sent: number; failed: number; errors: string[]; messageIds: Array<{ email: string; messageId: string }> }> {
  let sent = 0
  let failed = 0
  const errors: string[] = []
  const messageIds: Array<{ email: string; messageId: string }> = []

  for (let i = 0; i < members.length; i++) {
    const member = members[i]
    if (!member.email) continue

    // Resend free tier: 2 requests/second. Space them out.
    if (i > 0) await new Promise(r => setTimeout(r, 600))

    const result = await sendSetlistEmail({
      to: member.email,
      recipientName: member.displayName,
      setlistName,
      eventDate,
      setlistUrl: `${baseUrl}/perform/setlist/${setlistId}`,
      packetUrl: `${baseUrl}/api/setlist/print/public?setlistId=${setlistId}`,
      songs,
      publisherName,
      note,
      subject,
      org,
    })
    if (result.ok) {
      sent++
      if (result.messageId) {
        messageIds.push({ email: member.email, messageId: result.messageId })
      }
    } else {
      failed++
      errors.push(`${member.email}: ${result.reason || 'unknown error'}`)
    }
  }

  return { sent, failed, errors, messageIds }
}

/**
 * Build clean HTML email for setlist notification.
 */
export function buildSetlistEmailHtml(params: SetlistEmailParams): string {
  const org = params.org ?? DEFAULT_ORG_ID
  const brand = getEmailBranding(org)
  // Absolute URL (emails can't use relative paths). Leading "\n      " is part
  // of the string ONLY when an image exists, so the empty (crc) case yields
  // byte-identical markup to the prior hardcoded header.
  const headerImage = brand.headerImagePath
    ? `\n      <img src="${getOrgBranding(org).baseUrl}${brand.headerImagePath}" height="${brand.headerImageHeightPx}" alt="${escapeHtml(brand.fromName)}" style="display:block;border:0;margin:0 0 8px;">`
    : ''
  const songList = params.songs.length > 0
    ? params.songs.map((s, i) => `<tr><td style="padding:4px 8px;color:#666;font-size:13px;">${i + 1}.</td><td style="padding:4px 8px;font-size:14px;">${escapeHtml(s)}</td></tr>`).join('')
    : '<tr><td style="padding:8px;color:#999;font-style:italic;">No songs yet</td></tr>'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;margin-top:20px;">
  <tr>
    <td style="background:${brand.headerBg};padding:24px 32px;">${headerImage}
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
      ${params.note ? `<div style="margin:0 0 20px;padding:12px 16px;background:#f0f7ff;border-left:3px solid #3b82f6;border-radius:4px;">
        <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.5;">${escapeHtml(params.note).replace(/\n/g, '<br>')}</p>
      </div>` : ''}
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
      <p style="margin:0;color:#999;font-size:12px;text-align:center;">${escapeHtml(brand.footerText)}</p>
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

/**
 * Send an email notifying a user that a task has been assigned to them.
 */
export async function sendTaskAssignmentEmail(params: {
  to: string
  cc?: string[]
  recipientName: string
  assignerName: string
  setlistName: string
  taskTitle: string
  taskDescription?: string
  taskUrl: string
}): Promise<{ ok: boolean; reason?: string }> {
  const client = getResend()
  if (!client) return { ok: false, reason: 'RESEND_API_KEY not configured' }

  try {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr>
    <td style="background:#1a1a2e;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">You've been assigned a task</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0 0 16px;color:#333;font-size:15px;">Hi ${escapeHtml(params.recipientName)},</p>
      <p style="margin:0 0 20px;color:#333;font-size:15px;">
        <strong>${escapeHtml(params.assignerName)}</strong> assigned you a task for the upcoming service: 
        <strong style="color: #3b82f6;">${escapeHtml(params.setlistName)}</strong>
      </p>
      
      <div style="margin:0 0 24px;padding:16px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:4px;">
        <h2 style="margin:0 0 8px;font-size:16px;color:#1e293b;">${escapeHtml(params.taskTitle)}</h2>
        ${params.taskDescription ? `<p style="margin:0;color:#475569;font-size:14px;white-space:pre-wrap;">${escapeHtml(params.taskDescription)}</p>` : ''}
      </div>

      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 8px;">
            <a href="${escapeHtml(params.taskUrl)}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Setlist & Tasks</a>
          </td>
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

    const sendPayload: any = {
      from: `CRC Music <${getFromEmail()}>`,
      to: params.to,
      subject: `Task Assigned: ${params.taskTitle}`,
      html,
    }

    if (params.cc && params.cc.length > 0) {
      sendPayload.cc = params.cc
    }

    const { error } = await client.emails.send(sendPayload)

    if (error) {
      const msg = error.message || JSON.stringify(error)
      logger.error(`[Email] Assignment Resend error for ${params.to}: ${msg}`)
      return { ok: false, reason: msg }
    }

    logger.info(`[Email] Sent task assignment to ${params.to}`)
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[Email] Failed task assignment email to ${params.to}: ${msg}`)
    return { ok: false, reason: msg }
  }
}

/**
 * Send an email notifying the assigner that a task has been completed.
 */
export async function sendTaskCompletionEmail(params: {
  to: string
  assignerName: string
  assigneeName: string
  setlistName: string
  taskTitle: string
  taskUrl: string
}): Promise<{ ok: boolean; reason?: string }> {
  const client = getResend()
  if (!client) return { ok: false, reason: 'RESEND_API_KEY not configured' }

  try {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr>
    <td style="background:#10b981;padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">✅ Task Completed</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0 0 16px;color:#333;font-size:15px;">Hi ${escapeHtml(params.assignerName)},</p>
      <p style="margin:0 0 20px;color:#333;font-size:15px;">
        <strong>${escapeHtml(params.assigneeName)}</strong> just completed a task you assigned for <strong>${escapeHtml(params.setlistName)}</strong>:
      </p>
      
      <div style="margin:0 0 24px;padding:16px;background:#f8fafc;border-left:4px solid #10b981;border-radius:4px;">
        <h2 style="margin:0;font-size:16px;color:#1e293b;text-decoration:line-through;">${escapeHtml(params.taskTitle)}</h2>
      </div>

      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 8px;">
            <a href="${escapeHtml(params.taskUrl)}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View Setlist</a>
          </td>
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

    const { error } = await client.emails.send({
      from: `CRC Music <${getFromEmail()}>`,
      to: params.to,
      subject: `Task Completed: ${params.taskTitle}`,
      html,
    })

    if (error) {
      const msg = error.message || JSON.stringify(error)
      logger.error(`[Email] Completion Resend error for ${params.to}: ${msg}`)
      return { ok: false, reason: msg }
    }

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: msg }
  }
}
