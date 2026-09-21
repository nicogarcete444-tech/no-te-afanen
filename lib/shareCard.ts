import { ChosenEntry } from './cartStats';
import { fmt } from './products';
import { lowestKnownPrice } from './types';

// Tarjeta prolija del carrito para compartir (función premium — el free
// comparte solo texto plano, ver buildShoppingListText en CompareSection).
// Se dibuja a mano con Canvas 2D (sin sumar ninguna librería nueva al
// proyecto) y se entrega como PNG, listo para compartir o descargar.

const WIDTH = 720;
const PADDING = 40;
const MAX_ITEMS_SHOWN = 8;
const PURPLE_1 = '#8C7DFB';
const PURPLE_3 = '#4E3FC9';
const INK = '#211A3D';
const INK_SOFT = '#6C6390';

function wrapToFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
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

export function buildShareCardCanvas(
  chosenEntries: ChosenEntry[],
  bestStoreLabel: string | null,
  bestStoreTotal: number | null,
  savingAmount: number
): HTMLCanvasElement {
  const shown = chosenEntries.slice(0, MAX_ITEMS_SHOWN);
  const extra = chosenEntries.length - shown.length;
  const rowH = 46;
  const headerH = 118;
  const footerH = bestStoreLabel ? 90 : 0;
  const savingH = savingAmount > 0 ? 46 : 0;
  const listH = shown.length * rowH + (extra > 0 ? 30 : 0);
  const height = headerH + listH + savingH + footerH + PADDING * 2;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Fondo
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, height);

  // Header con degradé de marca
  const grad = ctx.createLinearGradient(0, 0, WIDTH, 0);
  grad.addColorStop(0, PURPLE_1);
  grad.addColorStop(1, PURPLE_3);
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, WIDTH, headerH, 0);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 26px Inter, Arial, sans-serif';
  ctx.fillText('🛒 No Te Afanen', PADDING, 52);
  ctx.font = '600 15px Inter, Arial, sans-serif';
  ctx.globalAlpha = 0.9;
  ctx.fillText('Mi lista de compras', PADDING, 80);
  ctx.globalAlpha = 1;

  let y = headerH + 36;

  shown.forEach((p) => {
    const precioMin = lowestKnownPrice(p.prices);
    const cantidad = p.qty > 1 ? `x${p.qty} ` : '';

    ctx.fillStyle = INK;
    ctx.font = '600 16px Inter, Arial, sans-serif';
    const label = wrapToFit(ctx, cantidad + p.name, WIDTH - PADDING * 2 - 140);
    ctx.fillText(label, PADDING, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = precioMin !== null ? PURPLE_3 : INK_SOFT;
    ctx.font = '700 16px Inter, Arial, sans-serif';
    ctx.fillText(precioMin !== null ? fmt(precioMin) : 'sin precio', WIDTH - PADDING, y);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#EAE6F7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y + 14);
    ctx.lineTo(WIDTH - PADDING, y + 14);
    ctx.stroke();

    y += rowH;
  });

  if (extra > 0) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = '600 14px Inter, Arial, sans-serif';
    ctx.fillText(`+ ${extra} producto${extra > 1 ? 's' : ''} más`, PADDING, y + 6);
    y += 30;
  }

  if (savingAmount > 0) {
    ctx.fillStyle = '#16A34A';
    ctx.font = '700 16px Inter, Arial, sans-serif';
    ctx.fillText(`💸 Ahorro estimado: ${fmt(savingAmount)}`, PADDING, y + 10);
    y += savingH;
  }

  if (bestStoreLabel && bestStoreTotal !== null) {
    roundRect(ctx, PADDING, y + 6, WIDTH - PADDING * 2, footerH - 20, 14);
    ctx.fillStyle = '#EDEAFC';
    ctx.fill();
    ctx.fillStyle = PURPLE_3;
    ctx.font = '700 15px Inter, Arial, sans-serif';
    ctx.fillText(`Más conveniente en ${bestStoreLabel}`, PADDING + 18, y + 32);
    ctx.font = '800 20px Inter, Arial, sans-serif';
    ctx.fillText(fmt(bestStoreTotal), PADDING + 18, y + 58);
  }

  ctx.fillStyle = '#B6AEDA';
  ctx.font = '500 12px Inter, Arial, sans-serif';
  ctx.fillText('Comparado con No Te Afanen', PADDING, height - 16);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

// Comparte el PNG con la Web Share API (si el navegador soporta compartir
// archivos) o, si no, lo descarga directo — en cualquier caso el usuario
// termina con la imagen en la mano para mandarla por donde quiera.
export async function shareOrDownloadCard(canvas: HTMLCanvasElement): Promise<'shared' | 'downloaded' | 'error'> {
  const blob = await canvasToBlob(canvas);
  if (!blob) return 'error';

  const file = new File([blob], 'mi-lista-no-te-afanen.png', { type: 'image/png' });

  try {
    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: { files: File[]; title?: string; text?: string }) => Promise<void>;
    };
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: 'Mi lista de compras', text: 'Comparado con No Te Afanen' });
      return 'shared';
    }
  } catch {
    // si el usuario cancela el share nativo, caemos a la descarga
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mi-lista-no-te-afanen.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  } catch {
    return 'error';
  }
}
