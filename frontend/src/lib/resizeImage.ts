/** Longest side, in pixels, of the reference photo sent to the AI: plenty for it to work from, and a small upload. */
export const REFERENCE_MAX_SIDE = 1024;

/**
 * Shrinks a photo to a JPEG no larger than `maxSide` on its longest side before it is sent. This keeps phone photos (often
 * several megabytes) under the upload limit, and as a side effect drops the photo's hidden location and camera details.
 * If the browser can't decode or redraw it, the original is returned and the server decides.
 */
export async function shrinkForUpload(file: File, maxSide = REFERENCE_MAX_SIDE): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
