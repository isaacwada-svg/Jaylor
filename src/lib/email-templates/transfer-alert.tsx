import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  subject?: string
  body?: string
  storeName?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px' }
const heading = { fontSize: '18px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }
const line = { fontSize: '14px', lineHeight: '22px', color: '#333333', margin: '0 0 6px' }
const footer = { fontSize: '12px', color: '#999999', marginTop: '24px' }

function Lines({ text }: { text?: string }) {
  const lines = (text ?? '').split('\n')
  return (
    <>
      {lines.map((l, i) => (
        <Text key={i} style={line}>
          {l.trim() === '' ? '\u00A0' : l}
        </Text>
      ))}
    </>
  )
}

const Email = ({ subject, body, storeName }: Props) => (
  <Html lang="en">
    <Head />
    <Preview>{subject ?? 'Bank transfer received'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>Jaylor</Heading>
        <Lines text={body ?? ''} />
        <Text style={footer}>Sent by Jaylor for {storeName ?? 'your shop'}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => data['subject'] || 'Bank transfer received',
  displayName: 'Transfer received alert',
  previewData: {
    subject: 'Transfer received — ₦15,000',
    body: '₦15,000 received from Ada for order #1042. Balance now ₦5,000.',
    storeName: 'Demo Tailoring',
  },
} satisfies TemplateEntry
