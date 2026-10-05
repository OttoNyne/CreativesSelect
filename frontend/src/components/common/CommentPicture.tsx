import { assetUrl } from "../../api/client";

/** A picture (or GIF) in a comment: shown at a modest size, and opens full size in a new tab. */
export function CommentPicture({ url }: { url: string }) {
  const src = assetUrl(url);
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block">
      <img src={src} alt="Picture in a comment" loading="lazy" className="max-h-64 max-w-full rounded-md border border-white/10 object-contain" />
    </a>
  );
}
