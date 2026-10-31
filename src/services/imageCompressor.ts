/**
 * Compression d'image 100% côté client via Canvas HTML5.
 * - Côté le plus long ≤ 1024 px
 * - JPEG qualité 0.75 (réduite progressivement si besoin)
 * - Taille finale garantie < 200 Ko
 */
export interface CompressedImage {
  dataUrl: string; // data:image/jpeg;base64,...
  base64: string; // sans préfixe
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  sizeBytes: number;
}

const MAX_DIMENSION = 1024;
const INITIAL_QUALITY = 0.75;
const MAX_BYTES = 200 * 1024;

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation respecte l'orientation EXIF des photos Android.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fallback */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire l'image."));
    };
    img.src = url;
  });
}

function base64Bytes(b64: string) {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export async function compressImage(file: Blob, maxDim = MAX_DIMENSION): Promise<CompressedImage> {
  const src = await loadBitmap(file);
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height;

  let dim = maxDim;
  let quality = INITIAL_QUALITY;

  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = Math.min(1, dim / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non supporté.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const sizeBytes = base64Bytes(base64);
    if (sizeBytes < MAX_BYTES) {
      if ('close' in src) src.close();
      return { dataUrl, base64, mimeType: 'image/jpeg', width: w, height: h, sizeBytes };
    }
    // On réduit d'abord la qualité, puis les dimensions.
    if (quality > 0.5) quality = Math.max(0.5, quality - 0.08);
    else dim = Math.round(dim * 0.85);
  }
  throw new Error("Impossible de compresser l'image sous 200 Ko.");
}

export function dataUrlToBase64(dataUrl: string) {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
