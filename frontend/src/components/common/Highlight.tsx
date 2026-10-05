const escapeRegex = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with the searched-for words marked. Drawn as text by React, never as markup; the words are matched as plain text. */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  const wanted = words.filter(Boolean).sort((a, b) => b.length - a.length);
  if (!wanted.length || !text) return <>{text}</>;
  // splitting on a group puts what matched at the odd positions
  const pieces = text.split(new RegExp(`(${wanted.map(escapeRegex).join("|")})`, "gi"));
  return (
    <>
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-violet-500/30 px-0.5 text-white">
            {piece}
          </mark>
        ) : (
          <span key={i}>{piece}</span>
        )
      )}
    </>
  );
}
