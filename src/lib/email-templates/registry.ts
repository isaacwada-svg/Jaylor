import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
import { template as dailyDigest } from './daily-digest'
import { template as weeklyDigest } from './weekly-digest'
import { template as transferAlert } from './transfer-alert'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'daily-digest': dailyDigest,
  'weekly-digest': weeklyDigest,
  'transfer-alert': transferAlert,
}
