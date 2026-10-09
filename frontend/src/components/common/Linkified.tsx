import { Link, useInRouterContext } from "react-router-dom";
import { splitLinks } from "../../lib/links";
import { splitMentions } from "../../lib/mentions";

const linkClass = "text-[var(--profile-accent-text,#c4b5fd)] underline hover:opacity-80";

/** An @name, as a link to that person's profile (a plain link where there is no router around, as in a few small pieces of the page). */
function Mention({ username, text, className }: { username: string; text: string; className?: string }) {
  const inRouter = useInRouterContext();
  const to = `/u/${encodeURIComponent(username)}`;
  return inRouter ? (
    <Link to={to} className={className ?? `${linkClass} no-underline hover:underline`}>
      {text}
    </Link>
  ) : (
    <a href={to} className={className ?? `${linkClass} no-underline hover:underline`}>
      {text}
    </a>
  );
}

/** A #hashtag, as a link to the posts and pieces about that topic on Explore. */
function Hashtag({ tag, text, className }: { tag: string; text: string; className?: string }) {
  const inRouter = useInRouterContext();
  const to = `/explore?tag=${encodeURIComponent(tag)}`;
  const classes = className ?? `${linkClass} no-underline hover:underline`;
  return inRouter ? (
    <Link to={to} className={classes}>
      {text}
    </Link>
  ) : (
    <a href={to} className={classes}>
      {text}
    </a>
  );
}

/**
 * Text with its web addresses made into links, its @names into links to those people's profiles and its #hashtags into links to Explore. Everything is drawn as text by React
 * (never as markup), a web link shows the address it goes to (shortened if long, the whole address in its title), and opens in a new tab
 * without telling the other site where it came from.
 */
export function Linkified({ text, linkClassName }: { text: string; linkClassName?: string }) {
  return (
    <>
      {splitLinks(text).map((piece, i) =>
        piece.kind === "text" ? (
          splitMentions(piece.text).map((part, j) =>
            part.kind === "text" ? (
              <span key={`${i}-${j}`}>{part.text}</span>
            ) : part.kind === "mention" ? (
              <Mention key={`${i}-${j}`} username={part.username} text={part.text} className={linkClassName} />
            ) : (
              <Hashtag key={`${i}-${j}`} tag={part.tag} text={part.text} className={linkClassName} />
            )
          )
        ) : (
          <a key={i} href={piece.url} target="_blank" rel="noopener noreferrer nofollow ugc" title={piece.url} className={`break-all ${linkClassName ?? linkClass}`}>
            {piece.label}
          </a>
        )
      )}
    </>
  );
}
