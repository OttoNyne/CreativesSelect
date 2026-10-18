import { CHAIN_EDGE_HEIGHT, CHAIN_SECTION_HEIGHT, CHAIN_SECTION_WIDTH } from "../api/chains.api";

// The pictures a chain is made of: the drawing as a PNG, the strip along its bottom that the next person carries on from, and (to keep a
// finished chain) all the parts joined into one picture.

const toPng = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

/** The whole drawing as a PNG. */
export const partPicture = (canvas: HTMLCanvasElement) => toPng(canvas);

/** The strip along the bottom of the drawing, as its own PNG. */
export function edgePicture(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const strip = document.createElement("canvas");
  strip.width = CHAIN_SECTION_WIDTH;
  strip.height = CHAIN_EDGE_HEIGHT;
  const ctx = strip.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(canvas, 0, CHAIN_SECTION_HEIGHT - CHAIN_EDGE_HEIGHT, CHAIN_SECTION_WIDTH, CHAIN_EDGE_HEIGHT, 0, 0, CHAIN_SECTION_WIDTH, CHAIN_EDGE_HEIGHT);
  return toPng(strip);
}

const load = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("picture didn't load"));
    image.src = url;
  });

/** The parts of a finished chain, one above the other, as one picture. */
export async function joinParts(urls: string[]): Promise<Blob | null> {
  const images = await Promise.all(urls.map(load));
  const canvas = document.createElement("canvas");
  canvas.width = CHAIN_SECTION_WIDTH;
  canvas.height = CHAIN_SECTION_HEIGHT * images.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  images.forEach((image, i) => ctx.drawImage(image, 0, i * CHAIN_SECTION_HEIGHT, CHAIN_SECTION_WIDTH, CHAIN_SECTION_HEIGHT));
  return toPng(canvas);
}
