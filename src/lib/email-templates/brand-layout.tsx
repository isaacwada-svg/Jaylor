import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { SUPPORT_EMAIL } from "@/lib/jaylor";

const LOGO_URL = "https://jaylor.com.ng/logo-mark.png";
const NAVY = "#111f39";
const GOLD = "#c9a24b";

const styles = {
  body: {
    backgroundColor: "#f2eee3",
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    margin: 0,
    padding: "32px 16px",
  },
  card: {
    maxWidth: "560px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    overflow: "hidden",
    border: `1px solid ${GOLD}33`,
  },
  header: { backgroundColor: NAVY, padding: "22px 28px" },
  logo: { width: "40px", height: "40px", borderRadius: "8px", display: "block" },
  wordmark: { fontSize: "19px", fontWeight: 700, color: "#faf7ef", margin: 0, lineHeight: "22px" },
  tagline: { fontSize: "11px", color: `${GOLD}`, margin: "2px 0 0", letterSpacing: "0.04em" },
  accent: { height: "3px", backgroundColor: GOLD, margin: 0 },
  content: { padding: "28px 28px 8px" },
  heading: { fontSize: "19px", fontWeight: 700, color: NAVY, margin: "0 0 14px" },
  line: { fontSize: "14px", lineHeight: "23px", color: "#333333", margin: "0 0 6px" },
  footer: { padding: "18px 28px 26px" },
  footerDivider: { borderColor: "#ece6d6", margin: "8px 0 16px" },
  footerText: { fontSize: "12px", lineHeight: "19px", color: "#9a9280", margin: "0 0 4px" },
};

export function Lines({ text }: { text?: string | undefined }) {
  const lines = (text ?? "").split("\n");
  return (
    <>
      {lines.map((l, i) => (
        <Text key={i} style={styles.line}>
          {l.trim() === "" ? " " : l}
        </Text>
      ))}
    </>
  );
}

/** Shared chrome for every transactional email -- logo + "Jaylor" header on
 *  navy, a gold accent line, the message body, then a muted footer. Pass
 *  either `body` (plain text, split on \n) or `children` for custom content. */
export function BrandedEmail({
  previewText,
  heading,
  body,
  storeName,
  children,
}: {
  previewText: string;
  heading: string;
  body?: string | undefined;
  storeName?: string | undefined;
  children?: React.ReactNode | undefined;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Section style={styles.header}>
            <Row>
              <Column style={{ width: "48px" }}>
                <Img src={LOGO_URL} width={40} height={40} alt="Jaylor" style={styles.logo} />
              </Column>
              <Column>
                <Text style={styles.wordmark}>Jaylor</Text>
                <Text style={styles.tagline}>CRAFTED FOR YOU</Text>
              </Column>
            </Row>
          </Section>
          <Section style={styles.accent} />
          <Section style={styles.content}>
            <Heading style={styles.heading}>{heading}</Heading>
            {children ?? <Lines text={body} />}
          </Section>
          <Section style={styles.footer}>
            <Hr style={styles.footerDivider} />
            <Text style={styles.footerText}>Sent by Jaylor for {storeName ?? "your shop"}</Text>
            <Text style={styles.footerText}>Questions? {SUPPORT_EMAIL} · jaylor.com.ng</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
