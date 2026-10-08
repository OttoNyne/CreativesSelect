import type { Key } from "../i18n";
// How a post's picture is framed: its shape, how far it is zoomed in, and which part stays in view.
export type ImageAspect = "original" | "1:1" | "4:3" | "16:9";

export interface ImageFraming {
  aspect: ImageAspect;
  /** 1 (whole picture) to 3 times. */
  zoom: number;
  /** "x% y%", each 0-100: the point of the picture that stays put as it zooms. */
  position: string;
}

export const DEFAULT_FRAMING: ImageFraming = { aspect: "original", zoom: 1, position: "50% 50%" };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** The shapes to choose from; `labelKey` is the name of the text to show for each. */
export const ASPECT_OPTIONS: { value: ImageAspect; labelKey: Key }[] = [
  { value: "original", labelKey: "adjust.original" },
  { value: "1:1", labelKey: "adjust.square" },
  { value: "4:3", labelKey: "adjust.fourThree" },
  { value: "16:9", labelKey: "adjust.wide" },
];

export const aspectRatioCss = (aspect: ImageAspect) => (aspect === "original" ? undefined : aspect.replace(":", " / "));

export const clampPercent = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
export const clampZoom = (n: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(n * 100) / 100));

export function parsePosition(position: string): [number, number] {
  const m = /^(\d{1,3})% (\d{1,3})%$/.exec(position);
  return m ? [clampPercent(Number(m[1])), clampPercent(Number(m[2]))] : [50, 50];
}

export const formatPosition = (x: number, y: number) => `${clampPercent(x)}% ${clampPercent(y)}%`;

export const isDefaultFraming = (f: ImageFraming) => f.aspect === "original" && f.zoom === 1 && f.position === "50% 50%";
