import { splitLinks } from "../../lib/links";

/**
 * Text with its web addresses made into links. Everything is drawn as text by React (never as markup), a link shows the address it
 * goes to (shortened if long, the whole address in its title), and opens in a new tab without telling the other site where it came from.
 */
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((piece, i) =>
        piece.kind === "text" ? (
          <span key={i}>{piece.text}</span>
        ) : (
          <a key={i} href={piece.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={piece.url} className="break-all text-[var(--profile-accent-text,#c4b5fd)] underline hover:opacity-80">
            {piece.label}
          </a>
        )
      )}
    </>
  );
}
