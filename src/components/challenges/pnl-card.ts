/**
 * The PnL card: a shareable, downloadable image of a settled win.
 *
 * Drawn on an offscreen canvas rather than rendered server-side, for the same
 * reason the arcade draws its own sprites this way — it is real data already
 * on the page (the challenge, both players' looks) rendered with the exact
 * Archivo webfont this document already loaded, with no server route, no
 * bundled font binary, and no stored image to keep synced. Regenerated fresh
 * on every download, which is what makes "download this weeks later" free:
 * a settled challenge record never changes, so there is nothing to go stale.
 */
import { avatarGeometry, type AvatarGeometry } from '@/lib/profile/avatar-geometry';

const WIDTH = 1080;
const HEIGHT = 1350;

export interface PnlCardFace {
  address: string;
  handle: string;
  seed: number | null;
  photo: string | null;
}

export interface PnlCardData {
  formatName: string;
  currency: 'NIM' | 'USDT';
  potLabel: string;
  stakeLabel: string;
  settledAt: number;
  challengeId: string;
  winner: PnlCardFace;
  loser: PnlCardFace;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that image.'));
    img.src = src;
  });
}

/** The same four shapes `Avatar` draws as SVG, redrawn as canvas paths so a
 *  player with no chosen photo still gets their real generated face here. */
function drawGeneratedFace(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, geo: AvatarGeometry) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = geo.bg;
  ctx.fill();
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.rotate((geo.rotation * 90 * Math.PI) / 180);
  const scale = (r * 2) / 40;
  ctx.scale(scale, scale);
  ctx.translate(-20, -20);

  ctx.fillStyle = geo.fg;
  if (geo.variant === 0) {
    ctx.beginPath();
    ctx.arc(14, 14, 13, 0, Math.PI * 2);
    ctx.fill();
  } else if (geo.variant === 1) {
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(40, 40);
    ctx.lineTo(40, 0);
    ctx.closePath();
    ctx.fill();
  } else if (geo.variant === 2) {
    ctx.fillRect(0, 0, 20, 20);
    ctx.fillRect(20, 20, 20, 20);
  } else {
    ctx.beginPath();
    ctx.moveTo(20, 2);
    ctx.lineTo(38, 20);
    ctx.lineTo(20, 38);
    ctx.lineTo(2, 20);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

async function drawFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  face: PnlCardFace,
) {
  if (face.photo) {
    try {
      const img = await loadImage(face.photo);
      const side = Math.min(img.width, img.height);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        img,
        (img.width - side) / 2, (img.height - side) / 2, side, side,
        cx - r, cy - r, r * 2, r * 2,
      );
      ctx.restore();
      return;
    } catch {
      // Falls through to the generated face below.
    }
  }
  drawGeneratedFace(ctx, cx, cy, r, avatarGeometry(face.address, face.seed));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Waits for the weights this card actually uses, so a card built moments
 *  after page load never falls back to a system font mid-draw. */
async function ensureFonts() {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.all([
      document.fonts.load('900 64px Archivo'),
      document.fonts.load('800 32px Archivo'),
      document.fonts.load('700 28px Archivo'),
      document.fonts.ready,
    ]);
  } catch {
    // A missing font is a worse-looking card, never a broken one.
  }
}

export async function renderPnlCard(data: PnlCardData): Promise<Blob> {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device cannot draw the card.');

  const FONT = 'Archivo, system-ui, sans-serif';
  const cx = WIDTH / 2;

  // ---- background -----------------------------------------------------
  ctx.fillStyle = '#17120e';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(cx, 430, 40, cx, 430, 620);
  glow.addColorStop(0, 'rgba(255,106,26,0.22)');
  glow.addColorStop(1, 'rgba(255,106,26,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ---- header ------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff6a1a';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('TeTe', cx, 108);

  ctx.fillStyle = 'rgba(247,242,237,0.55)';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(data.formatName.toUpperCase(), cx, 152);

  // ---- headline ------------------------------------------------------------
  ctx.fillStyle = '#f7f2ed';
  ctx.font = `900 92px ${FONT}`;
  ctx.fillText('YOU WON', cx, 268);

  ctx.fillStyle = '#ff6a1a';
  ctx.font = `900 130px ${FONT}`;
  ctx.fillText(data.potLabel, cx, 400);
  ctx.fillStyle = 'rgba(247,242,237,0.6)';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(data.currency, cx, 448);

  // ---- faces --------------------------------------------------------------
  const faceY = 660;
  const r = 130;
  const gap = 190;
  const winnerX = cx - gap;
  const loserX = cx + gap;

  await drawFace(ctx, winnerX, faceY, r, data.winner);
  await drawFace(ctx, loserX, faceY, r, data.loser);

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#ff6a1a';
  ctx.beginPath();
  ctx.arc(winnerX, faceY, r + 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(247,242,237,0.25)';
  ctx.beginPath();
  ctx.arc(loserX, faceY, r + 6, 0, Math.PI * 2);
  ctx.stroke();

  // A small crown over the winner, echoing the crown used everywhere else in
  // the app for "best" — not redrawn from scratch, just a simple mark.
  ctx.fillStyle = '#17120e';
  ctx.beginPath();
  ctx.arc(winnerX, faceY - r - 6, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff6a1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(winnerX, faceY - r - 6, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ff6a1a';
  ctx.beginPath();
  const crownY = faceY - r - 18;
  ctx.moveTo(winnerX - 14, crownY + 10);
  ctx.lineTo(winnerX - 14, crownY);
  ctx.lineTo(winnerX - 7, crownY + 7);
  ctx.lineTo(winnerX, crownY - 4);
  ctx.lineTo(winnerX + 7, crownY + 7);
  ctx.lineTo(winnerX + 14, crownY);
  ctx.lineTo(winnerX + 14, crownY + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f7f2ed';
  ctx.font = `800 32px ${FONT}`;
  ctx.fillText(data.winner.handle, winnerX, faceY + r + 54);
  ctx.fillStyle = 'rgba(247,242,237,0.55)';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(data.loser.handle, loserX, faceY + r + 54);

  ctx.fillStyle = 'rgba(247,242,237,0.35)';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('VS', cx, faceY + 12);

  // ---- stake strip --------------------------------------------------------
  const stripY = 1000;
  roundRect(ctx, 80, stripY, WIDTH - 160, 96, 24);
  ctx.fillStyle = 'rgba(247,242,237,0.06)';
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(247,242,237,0.5)';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('STAKE PER PLAYER', 116, stripY + 38);
  ctx.fillStyle = '#f7f2ed';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(`${data.stakeLabel} ${data.currency}`, 116, stripY + 74);

  const settled = new Date(data.settledAt);
  const dateLabel = settled.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeLabel = settled.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(247,242,237,0.5)';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText('SETTLED', WIDTH - 116, stripY + 38);
  ctx.fillStyle = '#f7f2ed';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(`${dateLabel} · ${timeLabel}`, WIDTH - 116, stripY + 74);

  // ---- footer ---------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(247,242,237,0.4)';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('teteonnimiq.site', cx, 1160);
  ctx.fillStyle = 'rgba(247,242,237,0.22)';
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText(`Challenge ${data.challengeId.slice(0, 10)}`, cx, 1192);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not export the card.'));
    }, 'image/png');
  });
}
