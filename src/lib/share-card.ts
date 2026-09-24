// Canvas-rendered shareable cards -- no external image service, matching
// the same "render in the browser" approach used for every other photo
// touch in this app. Sized for a WhatsApp Status post (portrait, 1080x1920).
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

const NAVY = "#111F39";
const GOLD = "#D4AF37";
const CREAM = "#F8F4E9";

export type ShareCardSpec = {
  eyebrow: string;
  headline: string;
  subline?: string;
  storeName: string;
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy + lineHeight;
}

export function renderShareCard(canvas: HTMLCanvasElement, spec: ShareCardSpec) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(56, 56, CARD_WIDTH - 112, CARD_HEIGHT - 112);

  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.font = "700 30px Montserrat, sans-serif";
  ctx.fillText(spec.eyebrow.toUpperCase(), CARD_WIDTH / 2, 420);

  ctx.fillStyle = CREAM;
  ctx.font = "600 92px 'Playfair Display', Georgia, serif";
  const afterHeadline = wrapText(ctx, spec.headline, CARD_WIDTH / 2, 560, CARD_WIDTH - 220, 104);

  if (spec.subline) {
    ctx.fillStyle = "rgba(248, 244, 233, 0.75)";
    ctx.font = "400 38px Montserrat, sans-serif";
    wrapText(ctx, spec.subline, CARD_WIDTH / 2, afterHeadline + 30, CARD_WIDTH - 260, 50);
  }

  ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CARD_WIDTH / 2 - 80, CARD_HEIGHT - 220);
  ctx.lineTo(CARD_WIDTH / 2 + 80, CARD_HEIGHT - 220);
  ctx.stroke();

  ctx.fillStyle = GOLD;
  ctx.font = "600 40px 'Playfair Display', Georgia, serif";
  ctx.fillText(spec.storeName, CARD_WIDTH / 2, CARD_HEIGHT - 160);

  ctx.fillStyle = "rgba(248, 244, 233, 0.5)";
  ctx.font = "400 24px Montserrat, sans-serif";
  ctx.fillText("via Jaylor", CARD_WIDTH / 2, CARD_HEIGHT - 118);
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
