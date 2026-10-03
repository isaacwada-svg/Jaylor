import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'

// Server-only: sends through the Resend connector gateway. Never import from client components.

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'
const FROM = 'Jaylor <info@jaylor.com.ng>'

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send. */
  idempotencyKey?: string
  replyTo?: string
}

export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const lovableKey = process.env['LOVABLE_API_KEY']
  const resendKey = process.env['RESEND_API_KEY']
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured')
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  const recipient = template.to || to
  if (!recipient) throw new Error('Recipient is required')

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(templateData) : template.subject

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': resendKey,
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: FROM,
      to: [recipient],
      subject,
      html,
      text,
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    console.error(`Resend send failed [${response.status}]: ${body}`)
    throw new Error(`Resend send failed [${response.status}]: ${body}`)
  }

  return { sent: true }
}
