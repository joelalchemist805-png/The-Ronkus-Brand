import { safeProductImageFilename } from './helpers';

export async function resizeProductPhoto(file: File): Promise<File> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let bitmap: ImageBitmap | null = null;

  if (typeof createImageBitmap === 'function') {
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = null;
    }
  }

  if (bitmap) {
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } else {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = objectUrl;
      await image.decode();
      source = image;
      width = image.naturalWidth;
      height = image.naturalHeight;
    } catch {
      throw new Error('This image could not be opened. Choose a different photo.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (width <= 0 || height <= 0) {
    bitmap?.close();
    throw new Error('This image has invalid dimensions. Choose a different photo.');
  }

  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap?.close();
    throw new Error('This photo could not be processed on your device.');
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close();

  const toBlob = (type: string): Promise<Blob | null> => new Promise((resolve) => {
    canvas.toBlob(resolve, type, 0.85);
  });
  let blob = await toBlob('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  if (!blob || blob.type !== 'image/jpeg' && blob.type !== 'image/webp') {
    throw new Error('This photo could not be converted to a supported format.');
  }
  if (blob.size >= 5 * 1024 * 1024) {
    throw new Error('The resized photo is still too large. Choose a smaller image.');
  }

  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const filenameBase = safeProductImageFilename(file.name).replace(/\.[^.]+$/, '');
  return new File([blob], `${filenameBase}.${extension}`, { type: blob.type, lastModified: Date.now() });
}
