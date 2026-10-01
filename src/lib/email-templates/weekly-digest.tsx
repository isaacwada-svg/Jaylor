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
    <Preview>{subject ?? 'Your Jaylor weekly digest'}</Preview>
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
  subject: (data: Record<string, any>) => data['subject'] || 'Your Jaylor weekly digest',
  displayName: 'Weekly digest',
  previewData: {
    subject: 'Your week at the shop',
    body: '12 orders completed this week. 5 awaiting collection.',
    storeName: 'Demo Tailoring',
  },
} satisfies TemplateEntry
