import { Fragment, type ReactNode } from "react";
import { t, type Key, type Params } from "./index";

/** What goes where a tag or a {name} stands: a function wraps the text between <name> and </name>; anything else replaces {name}. */
export type Slots = Record<string, ReactNode | ((children: ReactNode) => ReactNode)>;

const TOKEN = /<(\w+)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

/**
 * A sentence with a link, bold words or a picture inside it. The translated text holds the whole sentence, so each language can put the
 * pieces in its own order: "Already have an account? <login>Log in</login>" and {name} for a value or a part of the page. A tag or name with no
 * slot is shown as plain text, so a mistake in a translation can't break the page or put anything unexpected on it: the text is only
 * ever text, never markup.
 */
export function tRich(key: Key, slots: Slots = {}, params?: Params): ReactNode {
  const text = t(key, params);
  const out: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const [whole, tag, inner, name] = match;
    const slot = tag ? slots[tag] : slots[name];
    if (tag && typeof slot === "function") out.push(<Fragment key={index}>{slot(inner)}</Fragment>);
    else if (!tag && slot !== undefined && typeof slot !== "function") out.push(<Fragment key={index}>{slot}</Fragment>);
    else out.push(tag ? inner : whole);
    last = match.index + whole.length;
    index += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
