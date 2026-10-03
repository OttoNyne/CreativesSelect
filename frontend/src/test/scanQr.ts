import jsQR from "jsqr";
import { PNG } from "pngjs";

/** Reads a QR code from a PNG data address, the way a phone camera would. Returns what it says, or null if it can't be read. */
export function scanQr(dataUrl: string): string | null {
  const png = PNG.sync.read(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}
